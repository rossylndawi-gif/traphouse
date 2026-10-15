-- Deleting a login (e.g. a staff member who left, or to reset a password)
-- must not be blocked by the orders and stock changes they made. Their
-- history stays; only the "done by" link is cleared.

alter table public.orders
  drop constraint orders_admin_id_fkey,
  add constraint orders_admin_id_fkey foreign key (admin_id) references auth.users (id) on delete set null;

alter table public.stock_movements
  drop constraint stock_movements_admin_id_fkey,
  add constraint stock_movements_admin_id_fkey foreign key (admin_id) references auth.users (id) on delete set null;
