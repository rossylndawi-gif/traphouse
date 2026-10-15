-- Trap House Society — stock logic.
-- All stock changes happen here, inside one transaction per call, with the
-- affected variant rows locked (SELECT … FOR UPDATE, always in id order so two
-- calls can't deadlock). Every change to on_hand writes a stock_movements row.
--
-- Reserved  = qty in pending orders whose expires_at is still in the future.
-- Available = on_hand − reserved. Expired reservations stop counting on their
-- own, so nothing needs to run on a schedule.

-- ── Helpers ──────────────────────────────────────────────

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins a where a.user_id = auth.uid())
$$;

-- Raises unless the caller is an admin; returns their user id.
create function public.require_admin() returns uuid
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Only shop admins can do this' using errcode = '42501';
  end if;
  return auth.uid();
end $$;

-- Quantity held by live pending orders (optionally ignoring one order).
create function public.reserved_qty(p_variant_id uuid, p_exclude_order uuid default null) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(oi.qty), 0)::int
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where oi.variant_id = p_variant_id
    and o.status = 'pending'
    and o.expires_at > now()
    and (p_exclude_order is null or o.id <> p_exclude_order)
$$;

create function public.slugify(p text) returns text
language sql immutable set search_path = '' as $$
  select coalesce(nullif(btrim(regexp_replace(replace(lower(p), '&', ' '), '[^a-z0-9]+', '-', 'g'), '-'), ''), 'item')
$$;

-- Rwandan numbers: "0788 123 456", "+250788123456" → "250788123456".
create function public.normalize_phone(p text) returns text
language sql immutable set search_path = '' as $$
  select case
    when d ~ '^0[0-9]{9}$' then '250' || substr(d, 2)
    when d ~ '^7[0-9]{8}$' then '250' || d
    else d
  end
  from (select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') as d) x
$$;

-- ── Admin inventory view (one row per size/colour) ───────
-- security_invoker: the caller's RLS applies, so only admins see reservations.
create view public.inventory with (security_invoker = true) as
select
  v.id         as variant_id,
  p.id         as product_id,
  p.slug,
  p.name,
  p.category,
  p.price_rwf,
  p.main_photo,
  p.active     as product_active,
  v.size,
  v.colour,
  v.position,
  v.active,
  v.on_hand,
  coalesce(r.reserved, 0)                              as reserved,
  greatest(0, v.on_hand - coalesce(r.reserved, 0))     as available,
  coalesce(s.sold, 0)                                  as sold
from public.variants v
join public.products p on p.id = v.product_id
left join lateral (
  select sum(oi.qty)::int as reserved
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where oi.variant_id = v.id and o.status = 'pending' and o.expires_at > now()
) r on true
left join lateral (
  -- sales are negative, returns (cancelled confirmed orders) positive
  select (-sum(m.change))::int as sold
  from public.stock_movements m
  where m.variant_id = v.id and m.reason in ('sale', 'cancel')
) s on true;

-- ── Shop (public) ────────────────────────────────────────

-- Active products with their sizes and how many of each can still be ordered.
-- Never exposes on_hand, reservations or orders.
create function public.shop_catalog() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id,
      'slug', p.slug,
      'name', p.name,
      'category', p.category,
      'price_rwf', p.price_rwf,
      'colours', to_jsonb(p.colours),
      'colour_photos', to_jsonb(p.colour_photos),
      'main_photo', p.main_photo,
      'extra_photos', to_jsonb(p.extra_photos),
      'variants', coalesce((
        select jsonb_agg(jsonb_build_object(
            'id', v.id,
            'size', v.size,
            'colour', v.colour,
            'available', greatest(0, v.on_hand - public.reserved_qty(v.id))
          ) order by v.position, v.size, v.colour)
        from public.variants v
        where v.product_id = p.id and v.active
      ), '[]'::jsonb)
    ) order by p.created_at desc, p.name), '[]'::jsonb)
  from public.products p
  where p.active
$$;

-- Reserves stock for a website order for 24 hours.
-- p_items: [{"variant_id": uuid, "qty": int, "colour": text?}]
-- Returns {"code": "TH-1042", ...} or {"error": "...", "message": "...", "unavailable": [...]}.
create function public.place_order(
  p_items jsonb,
  p_name  text,
  p_phone text,
  p_note  text default null
) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_name   text := btrim(coalesce(p_name, ''));
  v_phone  text := public.normalize_phone(p_phone);
  v_note   text := left(nullif(btrim(coalesce(p_note, '')), ''), 500);
  v_raw    jsonb;
  v_lines  jsonb;
  v_short  jsonb;
  v_order  public.orders;
  v_total  int;
  v_max    int;
begin
  if v_name = '' or length(v_name) > 80 then
    return jsonb_build_object('error', 'name', 'message', 'Please enter your name.');
  end if;
  if length(v_phone) < 9 or length(v_phone) > 15 then
    return jsonb_build_object('error', 'phone', 'message', 'Please enter a valid phone number.');
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    return jsonb_build_object('error', 'empty', 'message', 'Your cart is empty.');
  end if;
  if jsonb_array_length(p_items) > 15 then
    return jsonb_build_object('error', 'limit', 'message', 'You can order at most 15 items at a time.');
  end if;

  -- Read the cart; anything malformed (bad id, qty 1.5, …) is rejected as a whole.
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'variant_id', r.variant_id, 'colour', coalesce(btrim(r.colour), ''), 'qty', r.qty)), '[]')
      into v_raw
    from jsonb_to_recordset(p_items) as r(variant_id uuid, colour text, qty int);
  exception when others then
    return jsonb_build_object('error', 'invalid', 'message', 'Your cart could not be read. Please refresh the page and try again.');
  end;

  -- One line per variant + colour. The colour is the variant's own colour,
  -- or (for "any colour" variants) the one picked if the product has it.
  select coalesce(jsonb_agg(to_jsonb(t)), '[]') into v_lines
  from (
    select r.variant_id,
           case when v.colour <> '' then v.colour
                when r.colour = any (p.colours) then r.colour
                else '' end as colour,
           sum(r.qty)::int as qty,
           min(r.qty)      as min_qty
    from jsonb_to_recordset(v_raw) as r(variant_id uuid, colour text, qty int)
    left join public.variants v on v.id = r.variant_id
    left join public.products p on p.id = v.product_id
    group by 1, 2
  ) t;

  if exists (select 1 from jsonb_to_recordset(v_lines) as l(variant_id uuid, min_qty int)
             where l.variant_id is null or l.min_qty is null or l.min_qty < 1) then
    return jsonb_build_object('error', 'invalid', 'message', 'Your cart could not be read. Please refresh the page and try again.');
  end if;

  select sum(l.qty), max(l.qty) into v_total, v_max
  from jsonb_to_recordset(v_lines) as l(qty int);
  if v_max > 5 then
    return jsonb_build_object('error', 'limit', 'message', 'You can order at most 5 of the same item.');
  end if;
  if v_total > 15 then
    return jsonb_build_object('error', 'limit', 'message', 'You can order at most 15 items at a time.');
  end if;

  if (select count(*) from public.orders o
      where o.customer_phone = v_phone and o.status = 'pending' and o.expires_at > now()) >= 3 then
    return jsonb_build_object('error', 'too_many', 'message',
      'You already have 3 orders waiting. Please message us on WhatsApp to finish those first.');
  end if;

  -- Lock the variants, then check what's left.
  perform 1 from public.variants v
  where v.id in (select l.variant_id from jsonb_to_recordset(v_lines) as l(variant_id uuid))
  order by v.id
  for update;

  select coalesce(jsonb_agg(jsonb_build_object(
           'variant_id', x.variant_id, 'product', x.name, 'size', x.size, 'colour', x.colour,
           'requested', x.qty, 'available', x.available)), '[]')
    into v_short
  from (
    select r.variant_id, r.qty, coalesce(p.name, 'An item') as name, coalesce(v.size, '') as size, r.colour,
           case when v.id is null or not v.active or not p.active then 0
                else greatest(0, v.on_hand - public.reserved_qty(v.id)) end as available
    from (select l.variant_id, sum(l.qty)::int as qty, max(l.colour) as colour
          from jsonb_to_recordset(v_lines) as l(variant_id uuid, colour text, qty int)
          group by l.variant_id) r
    left join public.variants v on v.id = r.variant_id
    left join public.products p on p.id = v.product_id
  ) x
  where x.qty > x.available;

  if jsonb_array_length(v_short) > 0 then
    return jsonb_build_object('error', 'unavailable',
      'message', 'Some items are no longer available.', 'unavailable', v_short);
  end if;

  insert into public.orders (status, source, customer_name, customer_phone, note, expires_at)
  values ('pending', 'website', v_name, v_phone, v_note, now() + interval '24 hours')
  returning * into v_order;

  insert into public.order_items (order_id, variant_id, product_id, product_name, size, colour, qty, unit_price)
  select v_order.id, v.id, p.id, p.name, v.size, l.colour, l.qty, p.price_rwf
  from jsonb_to_recordset(v_lines) as l(variant_id uuid, colour text, qty int)
  join public.variants v on v.id = l.variant_id
  join public.products p on p.id = v.product_id;

  update public.orders o
  set total_rwf = (select coalesce(sum(oi.qty * oi.unit_price), 0) from public.order_items oi where oi.order_id = o.id)
  where o.id = v_order.id
  returning * into v_order;

  return jsonb_build_object('code', v_order.code, 'total_rwf', v_order.total_rwf, 'expires_at', v_order.expires_at);
end $$;

-- ── Admin: orders ────────────────────────────────────────

-- Pending → confirmed: the reserved stock becomes a sale (on_hand goes down).
-- Works on expired orders too, if the stock is still free.
create function public.confirm_order(p_order_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_admin uuid := public.require_admin();
  v_order public.orders;
  v_short text;
begin
  select * into v_order from public.orders o where o.id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.status <> 'pending' then
    raise exception 'Order % is already %', v_order.code, v_order.status;
  end if;

  perform 1 from public.variants v
  where v.id in (select oi.variant_id from public.order_items oi where oi.order_id = v_order.id)
  order by v.id
  for update;

  select string_agg(format('%s%s: %s left', x.name, case when x.size <> '' then ' (' || x.size || ')' else '' end,
                           greatest(0, v.on_hand - public.reserved_qty(v.id, v_order.id))), '; ')
    into v_short
  from (select oi.variant_id, sum(oi.qty)::int as qty, min(oi.product_name) as name, min(oi.size) as size
        from public.order_items oi where oi.order_id = v_order.id group by oi.variant_id) x
  join public.variants v on v.id = x.variant_id
  where v.on_hand - public.reserved_qty(v.id, v_order.id) < x.qty;

  if v_short is not null then
    raise exception 'Not enough stock to confirm %: %', v_order.code, v_short;
  end if;

  update public.variants v set on_hand = v.on_hand - x.qty
  from (select oi.variant_id, sum(oi.qty)::int as qty
        from public.order_items oi where oi.order_id = v_order.id group by oi.variant_id) x
  where v.id = x.variant_id;

  insert into public.stock_movements (variant_id, change, reason, order_id, admin_id)
  select oi.variant_id, -sum(oi.qty)::int, 'sale', v_order.id, v_admin
  from public.order_items oi where oi.order_id = v_order.id
  group by oi.variant_id;

  update public.orders o set status = 'confirmed', confirmed_at = now(), admin_id = v_admin
  where o.id = v_order.id
  returning * into v_order;

  return jsonb_build_object('code', v_order.code, 'status', v_order.status);
end $$;

-- Pending → cancelled: the reservation is simply released (on_hand never changed).
-- Confirmed → cancelled (a return): the stock goes back, logged as "cancel".
create function public.cancel_order(p_order_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_admin uuid := public.require_admin();
  v_order public.orders;
begin
  select * into v_order from public.orders o where o.id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.status = 'cancelled' then
    raise exception 'Order % is already cancelled', v_order.code;
  end if;

  if v_order.status = 'confirmed' then
    perform 1 from public.variants v
    where v.id in (select oi.variant_id from public.order_items oi where oi.order_id = v_order.id)
    order by v.id
    for update;

    update public.variants v set on_hand = v.on_hand + x.qty
    from (select oi.variant_id, sum(oi.qty)::int as qty
          from public.order_items oi where oi.order_id = v_order.id group by oi.variant_id) x
    where v.id = x.variant_id;

    insert into public.stock_movements (variant_id, change, reason, order_id, admin_id)
    select oi.variant_id, sum(oi.qty)::int, 'cancel', v_order.id, v_admin
    from public.order_items oi where oi.order_id = v_order.id
    group by oi.variant_id;
  end if;

  update public.orders o set status = 'cancelled', cancelled_at = now(), admin_id = v_admin
  where o.id = v_order.id
  returning * into v_order;

  return jsonb_build_object('code', v_order.code, 'status', v_order.status);
end $$;

-- A sale that didn't come through the website (WhatsApp, in the shop).
-- p_items: [{"variant_id": uuid, "qty": int, "unit_price": int|null, "colour": text?}]
create function public.record_sale(
  p_items jsonb,
  p_name  text default null,
  p_phone text default null,
  p_note  text default null
) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_admin uuid := public.require_admin();
  v_lines jsonb;
  v_short text;
  v_order public.orders;
begin
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one item';
  end if;

  begin
    select jsonb_agg(jsonb_build_object(
             'variant_id', r.variant_id, 'colour', coalesce(btrim(r.colour), ''),
             'qty', r.qty, 'unit_price', r.unit_price))
      into v_lines
    from jsonb_to_recordset(p_items) as r(variant_id uuid, colour text, qty int, unit_price int);
  exception when others then
    raise exception 'Check the quantities and prices: they must be whole numbers';
  end;

  if exists (select 1 from jsonb_to_recordset(v_lines) as l(variant_id uuid, qty int, unit_price int)
             where l.variant_id is null or l.qty is null or l.qty < 1 or l.unit_price < 0) then
    raise exception 'Each item needs a size, a quantity of at least 1 and a price of 0 or more';
  end if;

  perform 1 from public.variants v
  where v.id in (select l.variant_id from jsonb_to_recordset(v_lines) as l(variant_id uuid))
  order by v.id
  for update;

  select string_agg(format('%s%s: %s available%s', p.name,
                           case when v.size <> '' then ' (' || v.size || ')' else '' end,
                           greatest(0, v.on_hand - public.reserved_qty(v.id)),
                           case when public.reserved_qty(v.id) > 0
                                then format(', %s held by pending orders', public.reserved_qty(v.id)) else '' end), '; ')
    into v_short
  from (select l.variant_id, sum(l.qty)::int as qty
        from jsonb_to_recordset(v_lines) as l(variant_id uuid, qty int) group by l.variant_id) x
  join public.variants v on v.id = x.variant_id
  join public.products p on p.id = v.product_id
  where v.on_hand - public.reserved_qty(v.id) < x.qty;

  if v_short is not null then
    raise exception 'Not enough stock: %', v_short;
  end if;
  if exists (select 1 from jsonb_to_recordset(v_lines) as l(variant_id uuid)
             left join public.variants v on v.id = l.variant_id where v.id is null) then
    raise exception 'One of the sizes no longer exists. Refresh the page and try again';
  end if;

  insert into public.orders (status, source, customer_name, customer_phone, note, confirmed_at, admin_id)
  values ('confirmed', 'manual', nullif(btrim(coalesce(p_name, '')), ''),
          nullif(public.normalize_phone(p_phone), ''), nullif(btrim(coalesce(p_note, '')), ''), now(), v_admin)
  returning * into v_order;

  insert into public.order_items (order_id, variant_id, product_id, product_name, size, colour, qty, unit_price)
  select v_order.id, v.id, p.id, p.name, v.size,
         case when v.colour <> '' then v.colour else l.colour end,
         l.qty, l.unit_price
  from jsonb_to_recordset(v_lines) as l(variant_id uuid, colour text, qty int, unit_price int)
  join public.variants v on v.id = l.variant_id
  join public.products p on p.id = v.product_id;

  update public.variants v set on_hand = v.on_hand - x.qty
  from (select l.variant_id, sum(l.qty)::int as qty
        from jsonb_to_recordset(v_lines) as l(variant_id uuid, qty int) group by l.variant_id) x
  where v.id = x.variant_id;

  insert into public.stock_movements (variant_id, change, reason, order_id, admin_id)
  select l.variant_id, -sum(l.qty)::int, 'sale', v_order.id, v_admin
  from jsonb_to_recordset(v_lines) as l(variant_id uuid, qty int)
  group by l.variant_id;

  update public.orders o
  set total_rwf = (select coalesce(sum(oi.qty * oi.unit_price), 0) from public.order_items oi where oi.order_id = o.id)
  where o.id = v_order.id
  returning * into v_order;

  return jsonb_build_object('code', v_order.code, 'total_rwf', v_order.total_rwf);
end $$;

-- ── Admin: stock ─────────────────────────────────────────

create function public.restock(p_variant_id uuid, p_qty integer, p_note text default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_admin   uuid := public.require_admin();
  v_on_hand int;
begin
  if p_qty is null or p_qty < 1 or p_qty > 10000 then
    raise exception 'Enter a quantity between 1 and 10000';
  end if;

  update public.variants v set on_hand = v.on_hand + p_qty
  where v.id = p_variant_id
  returning v.on_hand into v_on_hand;
  if not found then raise exception 'Size not found'; end if;

  insert into public.stock_movements (variant_id, change, reason, admin_id, note)
  values (p_variant_id, p_qty, 'restock', v_admin, nullif(btrim(coalesce(p_note, '')), ''));

  return jsonb_build_object('variant_id', p_variant_id, 'on_hand', v_on_hand);
end $$;

-- Creates or updates a product and its full list of sizes in one go.
-- p: {"id"?, "name", "category", "price_rwf", "colours", "colour_photos",
--     "main_photo", "extra_photos", "active",
--     "variants": [{"id"?, "size", "colour", "on_hand"}]}
-- A changed quantity is logged as an "adjustment". Sizes left out of the
-- list are hidden (their stock set to 0) rather than deleted.
create function public.save_product(p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_admin    uuid := public.require_admin();
  v_id       uuid;
  v_slug     text;
  v_name     text := btrim(coalesce(p ->> 'name', ''));
  v_category text := btrim(coalesce(p ->> 'category', ''));
  v_price    int;
  v_colours  text[];
  v_cphotos  text[];
  v_extra    text[];
  v_keep     uuid[] := '{}';
  v_row      record;
  v_var      public.variants;
  v_pos      int := 0;
  v_reserved int;
  n          int := 1;
begin
  if v_name = '' then raise exception 'Enter a product name'; end if;
  if v_category = '' then raise exception 'Choose a category'; end if;

  begin
    v_id := nullif(p ->> 'id', '')::uuid;
    v_price := nullif(p ->> 'price_rwf', '')::int;
  exception when others then
    raise exception 'The price must be a whole number (or empty for "price on request")';
  end;
  if v_price < 0 then raise exception 'The price can''t be negative'; end if;

  select coalesce(array_agg(btrim(c.value) order by c.ordinality), '{}'),
         coalesce(array_agg(btrim(coalesce(p -> 'colour_photos' ->> (c.ordinality::int - 1), '')) order by c.ordinality), '{}')
    into v_colours, v_cphotos
  from jsonb_array_elements_text(coalesce(p -> 'colours', '[]')) with ordinality c
  where btrim(c.value) <> '';
  if array_length(v_colours, 1) <> (select count(distinct lower(x)) from unnest(v_colours) x) then
    raise exception 'Each colour can only be listed once';
  end if;
  if not exists (select 1 from unnest(v_cphotos) x where x <> '') then v_cphotos := '{}'; end if;

  select coalesce(array_agg(btrim(e.value) order by e.ordinality), '{}') into v_extra
  from jsonb_array_elements_text(coalesce(p -> 'extra_photos', '[]')) with ordinality e
  where btrim(e.value) <> '';

  if jsonb_typeof(p -> 'variants') is distinct from 'array' or jsonb_array_length(p -> 'variants') = 0 then
    raise exception 'Add at least one size';
  end if;

  if v_id is null then
    v_slug := public.slugify(v_name);
    while exists (select 1 from public.products x where x.slug = v_slug) loop
      n := n + 1;
      v_slug := public.slugify(v_name) || '-' || n;
    end loop;
    insert into public.products (slug, name, category, price_rwf, colours, colour_photos, main_photo, extra_photos, active)
    values (v_slug, v_name, v_category, v_price, v_colours, v_cphotos,
            btrim(coalesce(p ->> 'main_photo', '')), v_extra, coalesce((p ->> 'active')::boolean, true))
    returning id into v_id;
  else
    -- the slug is kept so shared links keep working
    update public.products x
    set name = v_name, category = v_category, price_rwf = v_price, colours = v_colours,
        colour_photos = v_cphotos, main_photo = btrim(coalesce(p ->> 'main_photo', '')),
        extra_photos = v_extra, active = coalesce((p ->> 'active')::boolean, x.active)
    where x.id = v_id
    returning x.slug into v_slug;
    if not found then raise exception 'Product not found'; end if;
  end if;

  -- lock this product's sizes for the rest of the transaction
  perform 1 from public.variants v where v.product_id = v_id order by v.id for update;

  for v_row in
    select nullif(e.value ->> 'id', '') as id,
           btrim(coalesce(e.value ->> 'size', '')) as size,
           btrim(coalesce(e.value ->> 'colour', '')) as colour,
           e.value ->> 'on_hand' as on_hand
    from jsonb_array_elements(p -> 'variants') e
  loop
    v_pos := v_pos + 1;
    if v_row.size = '' then raise exception 'Every row needs a size (use "One Size" if there is only one)'; end if;
    if v_row.colour <> '' and not (v_row.colour = any (v_colours)) then
      raise exception 'Size % uses colour "%", which isn''t in the colour list', v_row.size, v_row.colour;
    end if;
    if v_row.on_hand !~ '^\d{1,5}$' then
      raise exception 'Quantity for size % must be a whole number of 0 or more', v_row.size;
    end if;

    v_var := null;
    if v_row.id is not null then
      select * into v_var from public.variants v where v.id = v_row.id::uuid and v.product_id = v_id;
    end if;
    if v_var.id is null then
      select * into v_var from public.variants v
      where v.product_id = v_id and v.size = v_row.size and v.colour = v_row.colour;
    end if;
    if v_var.id = any (v_keep) or exists (
         select 1 from public.variants v
         where v.product_id = v_id and v.size = v_row.size and v.colour = v_row.colour
           and v.id = any (v_keep)) then
      raise exception 'Size % % is listed twice', v_row.size, v_row.colour;
    end if;

    if v_var.id is null then
      insert into public.variants (product_id, size, colour, on_hand, position)
      values (v_id, v_row.size, v_row.colour, v_row.on_hand::int, v_pos)
      returning * into v_var;
      if v_var.on_hand > 0 then
        insert into public.stock_movements (variant_id, change, reason, admin_id, note)
        values (v_var.id, v_var.on_hand, 'adjustment', v_admin, 'new size');
      end if;
    else
      if v_row.on_hand::int <> v_var.on_hand then
        v_reserved := public.reserved_qty(v_var.id);
        if v_row.on_hand::int < v_reserved then
          raise exception 'Size % has % held by pending orders; confirm or cancel those first', v_row.size, v_reserved;
        end if;
        insert into public.stock_movements (variant_id, change, reason, admin_id, note)
        values (v_var.id, v_row.on_hand::int - v_var.on_hand, 'adjustment', v_admin, 'edited quantity');
      end if;
      update public.variants v
      set size = v_row.size, colour = v_row.colour, on_hand = v_row.on_hand::int, position = v_pos, active = true
      where v.id = v_var.id;
    end if;
    v_keep := v_keep || v_var.id;
  end loop;

  -- sizes that were removed from the list
  for v_var in
    select * from public.variants v where v.product_id = v_id and v.active and not (v.id = any (v_keep))
  loop
    v_reserved := public.reserved_qty(v_var.id);
    if v_reserved > 0 then
      raise exception 'Size % has % held by pending orders; confirm or cancel those before removing it', v_var.size, v_reserved;
    end if;
    if v_var.on_hand > 0 then
      insert into public.stock_movements (variant_id, change, reason, admin_id, note)
      values (v_var.id, -v_var.on_hand, 'adjustment', v_admin, 'size removed');
    end if;
    update public.variants v set on_hand = 0, active = false where v.id = v_var.id;
  end loop;

  return jsonb_build_object('id', v_id, 'slug', v_slug);
end $$;

-- ── Admin: dashboard ─────────────────────────────────────

create function public.admin_stats(p_tz text default 'Africa/Kigali') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_day   timestamptz;
  v_week  timestamptz;
  v_month timestamptz;
  v_res   jsonb;
begin
  perform public.require_admin();
  v_day   := date_trunc('day',   now() at time zone p_tz) at time zone p_tz;
  v_week  := date_trunc('week',  now() at time zone p_tz) at time zone p_tz;  -- Monday
  v_month := date_trunc('month', now() at time zone p_tz) at time zone p_tz;

  with sales as (
    select o.confirmed_at as at, oi.qty, oi.qty * coalesce(oi.unit_price, 0) as amount
    from public.orders o join public.order_items oi on oi.order_id = o.id
    where o.status = 'confirmed' and o.confirmed_at >= least(v_week, v_month)
  )
  select jsonb_build_object(
    'in_stock',  (select coalesce(sum(v.on_hand), 0) from public.variants v),
    'reserved',  (select coalesce(sum(oi.qty), 0) from public.order_items oi join public.orders o on o.id = oi.order_id
                  where o.status = 'pending' and o.expires_at > now()),
    'pending',   (select count(*) from public.orders o where o.status = 'pending' and o.expires_at > now()),
    'expired',   (select count(*) from public.orders o where o.status = 'pending' and o.expires_at <= now()),
    'today',     (select jsonb_build_object('items', coalesce(sum(qty), 0), 'revenue', coalesce(sum(amount), 0)) from sales where at >= v_day),
    'week',      (select jsonb_build_object('items', coalesce(sum(qty), 0), 'revenue', coalesce(sum(amount), 0)) from sales where at >= v_week),
    'month',     (select jsonb_build_object('items', coalesce(sum(qty), 0), 'revenue', coalesce(sum(amount), 0)) from sales where at >= v_month),
    'low_stock', (select coalesce(jsonb_agg(to_jsonb(i) order by i.available, i.name, i.position), '[]')
                  from (select variant_id, product_id, name, size, colour, position, on_hand, reserved, available
                        from public.inventory
                        where active and product_active and available <= 2
                        limit 100) i)
  ) into v_res;
  return v_res;
end $$;
