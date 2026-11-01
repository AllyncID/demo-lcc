import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareUpload } from '../src/upload-image.ts';

function browser(t, decode, createElement) {
  const saved = ['createImageBitmap', 'document'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  globalThis.createImageBitmap = decode;
  globalThis.document = { createElement };
  t.after(() => { for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
}

test('image selection accepts exactly 5 MB and rejects larger or unsupported files before decoding', async t => {
  let decoded = 0, closed = 0;
  browser(t, async () => { decoded++; return { width: 400, height: 600, close() { closed++; } }; },
    () => ({ getContext: () => ({ drawImage() {} }), toDataURL: () => 'data:image/webp;base64,UklGRg==' }));
  const maximum = 5 * 1024 * 1024;
  for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
    assert.match(await prepareUpload(new File([new Uint8Array(maximum)], 'photo', { type })), /^data:image\/webp;base64,/);
  }
  assert.equal(decoded, 3); assert.equal(closed, 3);
  await assert.rejects(prepareUpload(new File([new Uint8Array(maximum + 1)], 'large.jpg', { type: 'image/jpeg' })), /maksimal 5 MB/);
  await assert.rejects(prepareUpload(new File(['<svg/>'], 'photo.svg', { type: 'image/svg+xml' })), /JPG, PNG, atau WebP/);
  assert.equal(decoded, 3, 'invalid input must be rejected before image decoding');
});

test('profile and receipt outputs retain Vercel-safe request budgets and close decoded images on failure', async t => {
  let closed = 0;
  const sizes = [];
  browser(t, async () => ({ width: 1600, height: 4000, close() { closed++; } }), () => {
    const canvas = { width: 0, height: 0, getContext: () => ({ drawImage() {} }), toDataURL: () => { sizes.push([canvas.width, canvas.height]); return 'data:image/webp;base64,' + 'A'.repeat(1_000_000); } };
    return canvas;
  });
  const file = new File(['image'], 'receipt.png', { type: 'image/png' });
  await assert.rejects(prepareUpload(file), /Gambar masih terlalu besar/);
  const receipt = await prepareUpload(file, true);
  assert.ok(receipt.length < 2_790_000);
  assert.deepEqual(sizes, [[400, 1000], [400, 1000], [1600, 4000]]);
  assert.equal(closed, 2);
});
