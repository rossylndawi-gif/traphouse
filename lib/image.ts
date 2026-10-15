/**
 * Shrinks a phone photo in the browser before upload:
 * longest side at most 1600px, JPEG, under ~400 KB.
 */

const MAX_SIDE = 1600;
const MAX_BYTES = 400 * 1024;

const toBlob = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not compress the photo"))), "image/jpeg", quality),
  );

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  try {
    // respects the camera's rotation (EXIF) on current browsers
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } catch {
      throw new Error("This photo type can't be read here. Please choose a JPEG or PNG photo.");
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

export async function compressImage(file: File): Promise<Blob> {
  const img = await decode(file);
  let scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
  for (;;) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext("2d")!;
    // white behind transparent PNGs, like the shop's photos
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const q of [0.85, 0.78, 0.7, 0.62, 0.55]) {
      const blob = await toBlob(canvas, q);
      if (blob.size <= MAX_BYTES) return blob;
    }
    if (scale < 0.3) return toBlob(canvas, 0.5);
    scale *= 0.8;
  }
}
