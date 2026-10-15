"use client";

import { useRef, useState } from "react";
import { compressImage } from "@/lib/image";
import { slugify } from "@/lib/products";
import { errorText, supabase } from "@/lib/supabase";
import Photo from "../Photo";
import { CloseIcon } from "../icons";

/** Compresses a photo on the phone and uploads it to the "products" bucket. Returns its Storage path. */
export async function uploadPhoto(file: File, productName: string): Promise<string> {
  const blob = await compressImage(file);
  const folder = slugify(productName) || "product";
  const path = `${folder}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}.jpg`;
  const { error } = await supabase().storage.from("products").upload(path, blob, {
    contentType: "image/jpeg",
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) throw error;
  return path;
}

/**
 * One photo slot. Empty: an "Add photo" tile (camera or gallery on phones).
 * Filled: the photo with Replace / Remove.
 */
export default function PhotoPicker({
  value,
  onChange,
  productName,
  label,
  size = "lg",
  multiple,
  onMany,
}: {
  value: string;
  onChange: (path: string) => void;
  productName: string;
  label: string;
  size?: "lg" | "sm";
  /** Empty tile only: pick several photos at once, each passed to onMany. */
  multiple?: boolean;
  onMany?: (paths: string[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const box = size === "lg" ? "h-[150px] w-[120px]" : "h-[88px] w-[70px]";

  const pick = async (files: FileList | null) => {
    if (!files?.length) return;
    setError("");
    const list = [...files];
    const done: string[] = [];
    try {
      for (const [i, f] of list.entries()) {
        setBusy(list.length > 1 ? `${i + 1}/${list.length}` : "…");
        done.push(await uploadPhoto(f, productName));
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy("");
      if (inputRef.current) inputRef.current.value = "";
    }
    if (!done.length) return;
    if (multiple && onMany) onMany(done);
    else onChange(done[done.length - 1]);
  };

  return (
    <div className="grid justify-items-start gap-1">
      <div className={`relative ${box} shrink-0 border ${value ? "border-line" : "border-dashed border-fg"} bg-white`}>
        {value ? (
          <Photo file={value} alt={label} eager className="size-full object-contain" />
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={!!busy}
            className="grid size-full place-items-center px-1 text-center text-[11px] font-bold tracking-wide uppercase"
          >
            {busy ? `Uploading ${busy}` : <>+ {label}</>}
          </button>
        )}
        {value && (
          <>
            <button
              type="button"
              onClick={() => onChange("")}
              aria-label={`Remove ${label}`}
              className="absolute -top-px -right-px grid size-9 place-items-center bg-fg text-white"
            >
              <CloseIcon size={14} />
            </button>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={!!busy}
              className="absolute inset-x-0 bottom-0 min-h-9 bg-white/90 text-[10px] font-bold tracking-wide uppercase"
            >
              {busy ? `Uploading ${busy}` : "Replace"}
            </button>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple={multiple && !value}
          hidden
          onChange={(e) => pick(e.target.files)}
        />
      </div>
      {error && <p className="max-w-[160px] text-xs text-alert">{error}</p>}
    </div>
  );
}
