-- Trap House Society — inventory schema.
-- Stock lives on variants (one row per size + colour). Every change to
-- variants.on_hand goes through the functions in the next migration, which
-- also write a stock_movements row.

-- ── Admins ───────────────────────────────────────────────
create table public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ── Products ─────────────────────────────────────────────
create table public.products (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name          text not null check (btrim(name) <> ''),
  category      text not null check (btrim(category) <> ''),
  -- whole Rwandan francs; null = "price on request"
  price_rwf     integer check (price_rwf >= 0),
  colours       text[] not null default '{}',
  -- one photo per colour (same order as colours), or empty
  colour_photos text[] not null default '{}',
  -- Storage paths in the "products" bucket, e.g. "hellstar-logo-tee/front.jpg"
  main_photo    text not null default '',
  extra_photos  text[] not null default '{}',
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (cardinality(colour_photos) = 0 or cardinality(colour_photos) = cardinality(colours))
);

-- ── Variants: one row per size (+ colour, '' = any colour) ─
create table public.variants (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id),
  size       text not null default '',
  colour     text not null default '',
  on_hand    integer not null default 0 check (on_hand >= 0),
  position   integer not null default 0,
  -- removed sizes are hidden, not deleted, so order history keeps working
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  unique (product_id, size, colour)
);
create index variants_product_idx on public.variants (product_id);

-- ── Orders ───────────────────────────────────────────────
create sequence public.order_code_seq start 1001;

create table public.orders (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique default ('TH-' || nextval('public.order_code_seq')),
  status         text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled')),
  source         text not null default 'website' check (source in ('website', 'manual')),
  customer_name  text,
  customer_phone text,
  note           text,
  -- sum of qty × unit_price (items with price on request count as 0)
  total_rwf      integer not null default 0,
  created_at     timestamptz not null default now(),
  -- pending website orders hold stock until this time
  expires_at     timestamptz,
  confirmed_at   timestamptz,
  cancelled_at   timestamptz,
  -- admin who confirmed, cancelled or recorded the order
  admin_id       uuid references auth.users (id)
);
create index orders_status_idx on public.orders (status, expires_at);
create index orders_phone_idx on public.orders (customer_phone) where status = 'pending';
create index orders_confirmed_idx on public.orders (confirmed_at) where status = 'confirmed';

-- Values are copied at order time, so later edits to the product don't change old orders.
create table public.order_items (
  id           bigint generated always as identity primary key,
  order_id     uuid not null references public.orders (id) on delete cascade,
  variant_id   uuid not null references public.variants (id),
  product_id   uuid not null references public.products (id),
  product_name text not null,
  size         text not null default '',
  colour       text not null default '',
  qty          integer not null check (qty > 0),
  -- null = price on request
  unit_price   integer check (unit_price >= 0)
);
create index order_items_order_idx on public.order_items (order_id);
create index order_items_variant_idx on public.order_items (variant_id);

-- ── Audit log of every stock change ──────────────────────
create table public.stock_movements (
  id         bigint generated always as identity primary key,
  variant_id uuid not null references public.variants (id),
  change     integer not null check (change <> 0),
  reason     text not null check (reason in ('restock', 'sale', 'adjustment', 'cancel')),
  order_id   uuid references public.orders (id),
  admin_id   uuid references auth.users (id),
  note       text,
  created_at timestamptz not null default now()
);
create index stock_movements_variant_idx on public.stock_movements (variant_id);
create index stock_movements_created_idx on public.stock_movements (created_at);

-- ── updated_at ───────────────────────────────────────────
create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger products_touch before update on public.products
  for each row execute function public.touch_updated_at();
