-- save_product: only touch a size's stock if the admin changed that number.
-- The form sends each size's on_hand as it was when the form was opened
-- ("on_hand_before"). If it's unchanged, a sale or restock that happened while
-- the form was open is kept instead of being overwritten.

create or replace function public.save_product(p jsonb) returns jsonb
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
  v_new      int;
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
           e.value ->> 'on_hand' as on_hand,
           e.value ->> 'on_hand_before' as on_hand_before
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
      v_new := v_var.on_hand;
      -- unchanged in the form (or a hidden size coming back) → keep the live number
      if v_var.active and v_row.on_hand_before ~ '^\d{1,5}$' and v_row.on_hand_before::int = v_row.on_hand::int then
        v_new := v_var.on_hand;
      elsif v_row.on_hand::int <> v_var.on_hand then
        v_new := v_row.on_hand::int;
        v_reserved := public.reserved_qty(v_var.id);
        if v_new < v_reserved then
          raise exception 'Size % has % held by pending orders; confirm or cancel those first', v_row.size, v_reserved;
        end if;
        insert into public.stock_movements (variant_id, change, reason, admin_id, note)
        values (v_var.id, v_new - v_var.on_hand, 'adjustment', v_admin, 'edited quantity');
      end if;
      update public.variants v
      set size = v_row.size, colour = v_row.colour, on_hand = v_new, position = v_pos, active = true
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

revoke execute on function public.save_product(jsonb) from public, anon;
grant execute on function public.save_product(jsonb) to authenticated;
