"use client";

import { useState } from "react";
import { photo } from "@/lib/config";

/** Product photo from public/images; shows a grey box if the file is missing. */
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
  const [broken, setBroken] = useState<string | null>(null);
  if (broken === file) return <span role="img" aria-label={alt || undefined} className={`block bg-soft ${className}`} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={photo(file)}
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      draggable={false}
      onError={() => {
        console.warn(`[products] photo not found in images folder: ${file}`);
        setBroken(file);
      }}
      className={className}
    />
  );
}
