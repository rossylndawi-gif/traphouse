-- Trap House Society — who can see and do what.
--
-- Public (anon key):   read active products + sizes, call shop_catalog() and place_order().
-- Admins (logged in and listed in public.admins): read everything, edit
--   product details directly; every stock change goes through the functions.
-- Nobody writes orders, order_items, stock_movements or variants.on_hand directly.

alter table public.admins          enable row level security;
alter table public.products        enable row level security;
alter table public.variants        enable row level security;
alter table public.orders          enable row level security;
alter table public.order_items     enable row level security;
alter table public.stock_movements enable row level security;

-- ── Table privileges (RLS then filters the rows) ─────────
revoke all on public.admins, public.products, public.variants, public.orders,
              public.order_items, public.stock_movements, public.inventory
  from anon, authenticated;
revoke all on sequence public.order_code_seq from anon, authenticated;

grant select on public.products, public.variants to anon, authenticated;
grant select on public.admins, public.orders, public.order_items, public.stock_movements, public.inventory
  to authenticated;
-- product details (not stock) can be edited directly, e.g. the hide/unhide toggle
grant update (name, category, price_rwf, colours, colour_photos, main_photo, extra_photos, active)
  on public.products to authenticated;

-- ── Row policies ─────────────────────────────────────────
create policy "admins see the admin list" on public.admins
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

create policy "anyone sees active products" on public.products
  for select to anon, authenticated
  using (active or (select public.is_admin()));

create policy "admins edit products" on public.products
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "anyone sees sizes of active products" on public.variants
  for select to anon, authenticated
  using (
    (active and exists (select 1 from public.products p where p.id = product_id and p.active))
    or (select public.is_admin())
  );

create policy "admins see orders" on public.orders
  for select to authenticated using ((select public.is_admin()));

create policy "admins see order items" on public.order_items
  for select to authenticated using ((select public.is_admin()));

create policy "admins see stock movements" on public.stock_movements
  for select to authenticated using ((select public.is_admin()));

-- ── Functions ────────────────────────────────────────────
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.shop_catalog() to anon, authenticated;
grant execute on function public.place_order(jsonb, text, text, text) to anon, authenticated;

-- used by the row policies above, so every role needs it (returns false for visitors)
grant execute on function public.is_admin() to anon, authenticated;

-- these check is_admin() themselves
grant execute on function public.admin_stats(text) to authenticated;
grant execute on function public.confirm_order(uuid) to authenticated;
grant execute on function public.cancel_order(uuid) to authenticated;
grant execute on function public.record_sale(jsonb, text, text, text) to authenticated;
grant execute on function public.restock(uuid, integer, text) to authenticated;
grant execute on function public.save_product(jsonb) to authenticated;

-- ── Photo storage ────────────────────────────────────────
-- Public bucket: anyone can view photos by URL; only admins can add or remove them.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('products', 'products', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "admins list product photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'products' and (select public.is_admin()));

create policy "admins upload product photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'products' and (select public.is_admin()));

create policy "admins replace product photos" on storage.objects
  for update to authenticated
  using (bucket_id = 'products' and (select public.is_admin()))
  with check (bucket_id = 'products' and (select public.is_admin()));

create policy "admins delete product photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'products' and (select public.is_admin()));
