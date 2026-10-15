"use client";

import { useState } from "react";
import { localPhoto, photo } from "@/lib/config";

/**
 * Product photo from Supabase Storage. If that fails, tries the copy in
 * public/images (photos imported from the old site), then shows a grey box.
 */
export default function Photo({
  file,
  alt,
  className = "",
  eager,
}: {
  file: string;
  alt: string;
  className?: string;
  eager?: boolean;
}) {
  const [failed, setFailed] = useState<{ file: string; tries: number }>({ file: "", tries: 0 });
  const tries = failed.file === file ? failed.tries : 0;
  const src = [photo(file), localPhoto(file)].filter(Boolean)[tries] as string | undefined;
  if (!file || !src) return <span role="img" aria-label={alt || undefined} className={`block bg-soft ${className}`} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={src}
      src={src}
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      draggable={false}
      onError={() => {
        if (tries) console.warn(`[products] photo not found: ${file}`);
        setFailed({ file, tries: tries + 1 });
      }}
      className={className}
    />
  );
}
