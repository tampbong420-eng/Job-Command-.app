export async function compressPhoto(file: File): Promise<File> {
  const namedImage = /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name || "");
  const typedImage = file.type.startsWith("image/");
  if (!typedImage && !namedImage) return file;
  if ((file.type === "image/jpeg" || /\.jpe?g$/i.test(file.name || "")) && file.size > 0 && file.size < 450_000) {
    return file.type ? file : new File([file], file.name || "site.jpg", { type: "image/jpeg" });
  }
  try {
    const bitmap = await Promise.race([
      createImageBitmap(file),
      new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("bitmap timeout")), 2500)),
    ]);
    const max = 1600;
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await Promise.race([
      new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.72)),
      new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 2500)),
    ]);
    if (!blob) return file;
    return new File([blob], (file.name || "site.jpg").replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" });
  } catch {
    return file.type ? file : new File([file], file.name || "site.jpg", { type: "image/jpeg" });
  }
}
