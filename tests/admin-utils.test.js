import test from 'node:test';
import assert from 'node:assert/strict';
import { campaignState, dateInput, dateOutput, exportCreators } from '../src/admin-utils.ts';

test('campaign states respect disabled, scheduled, open and exclusive closing times', () => {
  const settings = { votingActive: true, votingStartsAt: '2026-10-15T00:00:00.000Z', votingEndsAt: '2026-10-16T00:00:00.000Z' };
  assert.equal(campaignState(settings, 'voting', Date.parse('2026-10-14T23:59:59Z')).label, 'Terjadwal');
  assert.equal(campaignState(settings, 'voting', Date.parse(settings.votingStartsAt)).open, true);
  assert.equal(campaignState(settings, 'voting', Date.parse(settings.votingEndsAt)).label, 'Selesai');
  assert.equal(campaignState({ ...settings, votingActive: false }, 'voting').label, 'Dinonaktifkan');
  assert.equal(dateInput('2026-10-15T00:30:00.000Z'), '2026-10-15T08:30');
  assert.equal(dateOutput('2026-10-15T08:30'), '2026-10-15T00:30:00.000Z');
});

test('filtered CSV contains notes and historic answers and neutralizes spreadsheet formulas', async t => {
  let blob, downloaded;
  t.mock.method(URL, 'createObjectURL', value => { blob = value; return 'blob:test'; });
  t.mock.method(URL, 'revokeObjectURL', () => {});
  t.mock.method(globalThis, 'setTimeout', fn => { fn(); });
  const oldDocument = globalThis.document;
  globalThis.document = { createElement: () => ({ click() { downloaded = this.download; } }) };
  try {
    const creators = [{ id: 1, name: '  =HYPERLINK("bad")', email: 'a@example.com', phone: '081234567890', handle: '@creator', category: 'Kuliner', status: 'pending', visible: 0, photo: null, review_note: 'Catatan internal', created_at: '2026-10-15', answers: { city: 'Mataram' }, fieldSnapshot: [{ id: 'city', label: 'Domisili lama' }], votes: 1 }];
    exportCreators(creators, 'creators');
    const csv = await blob.text();
    assert.match(downloaded, /^lcc-creators-/); assert.ok(csv.includes('Catatan internal')); assert.ok(csv.includes('Domisili lama')); assert.ok(csv.includes('Mataram'));
    assert.ok(csv.includes("'  =HYPERLINK")); assert.ok(csv.includes("'@creator")); assert.equal(csv.split('\r\n').length, 2);
    exportCreators(creators, 'votes');
    const results = await blob.text(); assert.ok(!results.includes('a@example.com')); assert.ok(!results.includes('Catatan internal'));
  } finally { if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument; }
});
