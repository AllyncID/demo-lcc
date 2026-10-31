import { get, put, del } from '@vercel/blob';

const validPath = path => /^\/(?:uploads|receipts)\/[a-f0-9]{48}\.webp$/.test(path);
export function blobFiles() {
  const key = path => {
    if (!validPath(path)) throw new Error('Invalid image path');
    return `production${path}`;
  };
  return {
    async write(path, body) {
      await put(key(path), body, { access: 'private', addRandomSuffix: false, contentType: 'image/webp', cacheControlMaxAge: 31536000 });
    },
    async read(path) {
      const blob = await get(key(path), { access: 'private', useCache: true });
      return blob ? Buffer.from(await new Response(blob.stream).arrayBuffer()) : null;
    },
    async remove(path) {
      // Cleanup must never turn an already-committed record into a failed upload.
      try { await del(key(path)); } catch (error) { console.error('Blob cleanup failed:', error.name); }
    }
  };
}
