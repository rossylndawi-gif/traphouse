-- "NEW" badge: the shop marks products added in the last few days.
-- 1. The catalogue now includes each product's created_at.
-- 2. The products imported from the Google Sheet (all created by the import
--    on 15 Oct 2026 before 18:00 UTC) aren't new, so their date moves back
--    30 days. Their order in the shop stays the same.

update public.products
set created_at = created_at - interval '30 days'
where created_at < '2026-10-15 18:00:00+00'
  and created_at > '2026-10-15 17:00:00+00';

create or replace function public.shop_catalog() returns jsonb
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
      'created_at', p.created_at,
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
