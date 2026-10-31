import sharp from 'sharp';
import { randomBytes } from 'node:crypto';
import { unlinkSync } from 'node:fs';
import { join } from 'node:path';

export class PhotoError extends Error {}

export function removePhoto(photo, uploadDir) {
  if (!/^\/(?:uploads|receipts)\/[a-f0-9]{48}\.webp$/.test(photo || '')) return;
  if (typeof uploadDir === 'object') return uploadDir.remove(photo);
  try { unlinkSync(join(uploadDir, photo.split('/').at(-1))); } catch {}
}

export async function savePhoto(data, uploadDir, { receipt = false } = {}) {
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(data);
  if (!match) throw new PhotoError('Foto harus berupa JPG, PNG, atau WebP.');
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > 2 * 1024 * 1024) throw new PhotoError('Ukuran foto maksimal 2 MB.');
  const photo = `/${receipt ? 'receipts' : 'uploads'}/${randomBytes(24).toString('hex')}.webp`;
  try {
    const image = sharp(buffer, { limitInputPixels: 25000000, failOn: 'error' });
    const metadata = await image.metadata();
    if (!['jpeg', 'png', 'webp'].includes(metadata.format) || (metadata.pages ?? 1) !== 1) throw new PhotoError('Gunakan foto raster yang tidak bergerak.');
    const encoded = image.rotate().resize(receipt ? 1600 : 800, receipt ? 6000 : 1000, { fit: receipt ? 'inside' : 'cover', withoutEnlargement: true }).webp({ quality: receipt ? 92 : 85 });
    if (typeof uploadDir === 'object') await uploadDir.write(photo, await encoded.toBuffer());
    else await encoded.toFile(join(uploadDir, photo.split('/').at(-1)));
    return photo;
  } catch (error) {
    await removePhoto(photo, uploadDir);
    if (error instanceof PhotoError || error.code) throw error;
    if (/image|jpeg|png|webp|pixel|unsupported|corrupt|buffer/i.test(error.message)) throw new PhotoError('Foto tidak dapat dibaca. Gunakan JPG, PNG, atau WebP yang valid.');
    throw error;
  }
}
