// Keep a registration with two images below Vercel's request body limit.
export async function prepareUpload(file: File, receipt = false): Promise<string> {
  const image = await createImageBitmap(file);
  try {
    if (image.width * image.height > 25_000_000) throw new Error('Resolusi gambar terlalu besar. Gunakan gambar maksimal 25 megapiksel.');
    const scale = Math.min(1, (receipt ? 1600 : 800) / image.width, (receipt ? 6000 : 1000) / image.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Gambar gagal diproses. Coba browser terbaru.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const limit = receipt ? 2_790_000 : 900_000;
    let output = canvas.toDataURL('image/webp', receipt ? 0.92 : 0.85);
    if (output.length > limit) output = canvas.toDataURL('image/webp', receipt ? 0.85 : 0.75);
    if (output.length > limit) throw new Error('Gambar masih terlalu besar. Pilih gambar dengan resolusi lebih kecil.');
    return output;
  } finally { image.close(); }
}
