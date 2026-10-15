"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useAdmin } from "@/components/admin/AdminShell";
import PhotoPicker from "@/components/admin/PhotoPicker";
import { ErrorBox, Field, Loading, PageHead, Stepper, btn, input } from "@/components/admin/ui";
import { CloseIcon } from "@/components/icons";
import { call, type InventoryRow } from "@/lib/admin-data";
import { CATEGORY_ORDER, asset } from "@/lib/config";
import { errorText, supabase } from "@/lib/supabase";

type SizeRow = {
  key: string;
  id?: string;
  size: string;
  colour: string;
  on_hand: number;
  /** on_hand when the form was opened (so a sale meanwhile isn't overwritten) */
  before?: number;
  reserved: number;
  sold: number;
};
type ColourRow = { key: string; name: string; photo: string };
type Form = {
  id?: string;
  slug?: string;
  name: string;
  category: string;
  price: string;
  colours: ColourRow[];
  main_photo: string;
  extra_photos: string[];
  active: boolean;
  sizes: SizeRow[];
};

const NEW_CATEGORY = "__new__";
const SIZE_SUGGESTIONS = ["XS", "S", "M", "L", "XL", "XXL", "One Size", "28", "30", "32", "34", "36"];
const key = () => Math.random().toString(36).slice(2);
const emptyForm = (): Form => ({
  name: "",
  category: "",
  price: "",
  colours: [],
  main_photo: "",
  extra_photos: [],
  active: true,
  sizes: [{ key: key(), size: "", colour: "", on_hand: 1, reserved: 0, sold: 0 }],
});

export default function ProductPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Editor />
    </Suspense>
  );
}

function Editor() {
  const params = useSearchParams();
  const id = params.get("id");
  const router = useRouter();
  const { toast } = useAdmin();

  const [form, setForm] = useState<Form | null>(id ? null : emptyForm());
  const [categories, setCategories] = useState<string[]>(CATEGORY_ORDER);
  const [newCategory, setNewCategory] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoadError("");
    const sb = supabase();
    const [cats, product, stock] = await Promise.all([
      sb.from("products").select("category"),
      id ? sb.from("products").select("*").eq("id", id).maybeSingle() : Promise.resolve({ data: null, error: null }),
      id ? sb.from("inventory").select("*").eq("product_id", id).eq("active", true).order("position") : Promise.resolve({ data: [], error: null }),
    ]);
    const err = cats.error || product.error || stock.error;
    if (err) return setLoadError(errorText(err));
    const present = [...new Set((cats.data ?? []).map((c: { category: string }) => c.category))];
    setCategories([...CATEGORY_ORDER, ...present.filter((c) => !CATEGORY_ORDER.includes(c)).sort()]);
    if (!id) return;
    const p = product.data;
    if (!p) return setLoadError("This product doesn't exist (any more).");
    setForm({
      id: p.id,
      slug: p.slug,
      name: p.name,
      category: p.category,
      price: p.price_rwf == null ? "" : String(p.price_rwf),
      colours: (p.colours as string[]).map((name, i) => ({ key: key(), name, photo: (p.colour_photos as string[])[i] ?? "" })),
      main_photo: p.main_photo,
      extra_photos: p.extra_photos,
      active: p.active,
      sizes: (stock.data as InventoryRow[]).map((v) => ({
        key: v.variant_id,
        id: v.variant_id,
        size: v.size,
        colour: v.colour,
        on_hand: v.on_hand,
        before: v.on_hand,
        reserved: v.reserved,
        sold: v.sold,
      })),
    });
  }, [id]);

  useEffect(() => {
    document.title = (id ? "Edit product" : "New product") + " — Shop admin";
    setForm(id ? null : emptyForm());
    setNewCategory(false);
    setError("");
    load();
  }, [id, load]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const colourNames = useMemo(() => (form?.colours ?? []).map((c) => c.name.trim()).filter(Boolean), [form?.colours]);

  if (loadError) return <ErrorBox onRetry={load}>{loadError}</ErrorBox>;
  if (!form) return <Loading />;

  /* colours */
  const renameColour = (i: number, name: string) => {
    const old = form.colours[i].name.trim();
    setForm({
      ...form,
      colours: form.colours.map((c, k) => (k === i ? { ...c, name } : c)),
      sizes: form.sizes.map((s) => (old && s.colour === old ? { ...s, colour: name.trim() } : s)),
    });
  };
  const removeColour = (i: number) => {
    const old = form.colours[i].name.trim();
    setForm({
      ...form,
      colours: form.colours.filter((_, k) => k !== i),
      sizes: form.sizes.map((s) => (s.colour === old ? { ...s, colour: "" } : s)),
    });
  };

  /* sizes */
  const setSize = (i: number, patch: Partial<SizeRow>) => set("sizes", form.sizes.map((s, k) => (k === i ? { ...s, ...patch } : s)));

  /* hide / unhide applies straight away for a saved product */
  const toggleActive = async () => {
    const active = !form.active;
    if (!form.id) return set("active", active);
    const { error } = await supabase().from("products").update({ active }).eq("id", form.id);
    if (error) return toast(errorText(error));
    set("active", active);
    toast(active ? "Visible in the shop again" : "Hidden from the shop");
  };

  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    const name = form.name.trim();
    if (!name) return setError("Enter a product name.");
    if (!form.category.trim()) return setError("Choose a category.");
    if (form.price.trim() && !/^\d+$/.test(form.price.replace(/[,\s]/g, ""))) return setError("The price must be a number, like 25000 (or leave it empty).");
    if (!form.sizes.length) return setError("Add at least one size.");
    if (form.sizes.some((s) => !s.size.trim())) return setError("Every size row needs a size (e.g. M, 32 or One Size).");

    const colours = form.colours.filter((c) => c.name.trim());
    setSaving(true);
    try {
      const r = await call<{ id: string; slug: string }>("save_product", {
        p: {
          id: form.id ?? null,
          name,
          category: form.category.trim(),
          price_rwf: form.price.replace(/[,\s]/g, "") || null,
          colours: colours.map((c) => c.name.trim()),
          colour_photos: colours.map((c) => c.photo),
          main_photo: form.main_photo || colours.find((c) => c.photo)?.photo || "",
          extra_photos: form.extra_photos,
          active: form.active,
          variants: form.sizes.map((s) => ({
            id: s.id ?? null,
            size: s.size.trim(),
            colour: colourNames.includes(s.colour) ? s.colour : "",
            on_hand: s.on_hand,
            on_hand_before: s.before ?? null,
          })),
        },
      });
      toast("Saved");
      if (!form.id) router.replace(`/admin/product/?id=${r.id}`);
      else await load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  };

  const totalStock = form.sizes.reduce((n, s) => n + s.on_hand, 0);

  return (
    <form onSubmit={save} noValidate className="pb-6">
      <PageHead
        title={form.id ? "Edit product" : "New product"}
        sub={
          form.slug && (
            <a href={asset(`product/${form.slug}/`)} target="_blank" rel="noopener" className="underline">
              View in shop
            </a>
          )
        }
        action={
          <Link href="/admin/inventory/" className="label grid min-h-11 place-items-center text-muted">
            Cancel
          </Link>
        }
      />

      {/* visibility */}
      <button
        type="button"
        role="switch"
        aria-checked={form.active}
        onClick={toggleActive}
        className={`mb-5 flex min-h-14 w-full items-center justify-between border px-4 text-left ${form.active ? "border-fg" : "border-alert bg-[#fff5f5]"}`}
      >
        <span>
          <span className="block font-semibold">{form.active ? "Visible in the shop" : "Hidden from the shop"}</span>
          <span className="block text-xs text-muted">{form.active ? "Tap to hide it (nothing is deleted)" : "Customers can't see or order it. Tap to show it again."}</span>
        </span>
        <span aria-hidden="true" className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${form.active ? "bg-fg" : "bg-line"}`}>
          <span className={`absolute top-1 size-5 rounded-full bg-white transition-all ${form.active ? "left-6" : "left-1"}`} />
        </span>
      </button>

      <section className="grid gap-4">
        <Field label="Name">
          <input value={form.name} onChange={(e) => set("name", e.target.value)} maxLength={120} autoCapitalize="words" className={input} />
        </Field>

        <Field label="Category">
          {newCategory ? (
            <div className="flex gap-2">
              <input value={form.category} onChange={(e) => set("category", e.target.value)} placeholder="New category name" maxLength={40} className={input} autoFocus />
              <button type="button" onClick={() => (setNewCategory(false), set("category", ""))} className={`${btn.line} shrink-0`}>
                List
              </button>
            </div>
          ) : (
            <select
              value={form.category}
              onChange={(e) => (e.target.value === NEW_CATEGORY ? (setNewCategory(true), set("category", "")) : set("category", e.target.value))}
              className={input}
            >
              <option value="">Choose…</option>
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
              <option value={NEW_CATEGORY}>+ New category…</option>
            </select>
          )}
        </Field>

        <Field label="Price (RWF)" hint="Leave empty to show “Price on request”.">
          <input value={form.price} onChange={(e) => set("price", e.target.value)} inputMode="numeric" placeholder="e.g. 25000" className={input} />
        </Field>
      </section>

      {/* photos */}
      <section className="mt-7">
        <h2 className="label mb-1">Photos</h2>
        <p className="mb-3 text-xs text-muted">Take a photo or choose one from your gallery. Photos are made smaller on your phone before uploading.</p>
        <div className="flex flex-wrap items-start gap-3">
          <div>
            <PhotoPicker value={form.main_photo} onChange={(p) => set("main_photo", p)} productName={form.name} label="Main photo" />
            <p className="mt-1 text-[11px] font-bold tracking-wide text-muted uppercase">Main</p>
          </div>
          {form.extra_photos.map((p, i) => (
            <PhotoPicker
              key={p + i}
              value={p}
              onChange={(v) => set("extra_photos", v ? form.extra_photos.map((x, k) => (k === i ? v : x)) : form.extra_photos.filter((_, k) => k !== i))}
              productName={form.name}
              label={`Photo ${i + 2}`}
              size="sm"
            />
          ))}
          <PhotoPicker
            value=""
            onChange={(p) => set("extra_photos", [...form.extra_photos, p])}
            onMany={(ps) => set("extra_photos", [...form.extra_photos, ...ps])}
            multiple
            productName={form.name}
            label="More photos"
            size="sm"
          />
        </div>
      </section>

      {/* colours */}
      <section className="mt-7">
        <h2 className="label mb-1">Colours</h2>
        <p className="mb-3 text-xs text-muted">Optional. Add a photo per colour to show it when the customer picks that colour.</p>
        <div className="grid gap-3">
          {form.colours.map((c, i) => (
            <div key={c.key} className="flex items-start gap-2.5">
              <PhotoPicker value={c.photo} onChange={(p) => set("colours", form.colours.map((x, k) => (k === i ? { ...x, photo: p } : x)))} productName={form.name} label="Photo" size="sm" />
              <input value={c.name} onChange={(e) => renameColour(i, e.target.value)} placeholder="e.g. black" maxLength={40} aria-label={`Colour ${i + 1}`} className={input} />
              <button type="button" onClick={() => removeColour(i)} aria-label={`Remove colour ${c.name}`} className="grid size-12 shrink-0 place-items-center border border-line">
                <CloseIcon size={16} />
              </button>
            </div>
          ))}
          <button type="button" onClick={() => set("colours", [...form.colours, { key: key(), name: "", photo: "" }])} className={`${btn.line} w-full`}>
            + Add colour
          </button>
        </div>
      </section>

      {/* sizes + stock */}
      <section className="mt-7">
        <h2 className="label mb-1">
          Sizes &amp; stock <span className="text-muted">({totalStock} in stock)</span>
        </h2>
        <p className="mb-3 text-xs text-muted">
          One row per size{colourNames.length > 1 ? " (and colour, if each colour has its own count)" : ""}. Changing a number here is logged as an adjustment; for new deliveries use Restock on the Stock page.
        </p>
        <datalist id="size-suggestions">
          {SIZE_SUGGESTIONS.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <div className="grid gap-2.5">
          {form.sizes.map((s, i) => (
            <div key={s.key} className="border border-line p-3">
              <div className="flex items-end gap-2">
                <Field label="Size">
                  <input value={s.size} onChange={(e) => setSize(i, { size: e.target.value })} list="size-suggestions" maxLength={40} placeholder="M" className={`${input} w-24`} />
                </Field>
                {colourNames.length > 1 && (
                  <Field label="Colour">
                    <select value={colourNames.includes(s.colour) ? s.colour : ""} onChange={(e) => setSize(i, { colour: e.target.value })} className={input}>
                      <option value="">Any colour</option>
                      {colourNames.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </Field>
                )}
                <button
                  type="button"
                  onClick={() => set("sizes", form.sizes.filter((_, k) => k !== i))}
                  disabled={s.reserved > 0}
                  aria-label={`Remove size ${s.size}`}
                  title={s.reserved > 0 ? "Held by a waiting order" : undefined}
                  className="ml-auto grid size-12 shrink-0 place-items-center border border-line disabled:opacity-30"
                >
                  <CloseIcon size={16} />
                </button>
              </div>
              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                <Stepper value={s.on_hand} onChange={(n) => setSize(i, { on_hand: n })} min={0} label={`stock for size ${s.size || i + 1}`} />
                {s.id && (
                  <p className="text-right text-xs text-muted tabular-nums">
                    {s.reserved > 0 && <span className="block font-semibold text-fg">{s.reserved} held by orders</span>}
                    {s.sold} sold
                    {s.before !== undefined && s.on_hand !== s.before && <span className="block font-semibold text-fg">was {s.before}</span>}
                  </p>
                )}
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => set("sizes", [...form.sizes, { key: key(), size: "", colour: "", on_hand: 1, reserved: 0, sold: 0 }])}
            className={`${btn.line} w-full`}
          >
            + Add size
          </button>
        </div>
      </section>

      {error && <ErrorBox>{error}</ErrorBox>}
      <div className="sticky bottom-[calc(61px+env(safe-area-inset-bottom,0px))] z-30 -mx-4 mt-6 border-t border-fg bg-white/95 px-4 py-3 backdrop-blur">
        <button type="submit" disabled={saving} className={`${btn.dark} w-full`}>
          {saving ? "Saving…" : form.id ? "Save changes" : "Add product"}
        </button>
      </div>
    </form>
  );
}
