import test from 'node:test';
import assert from 'node:assert/strict';
import { announcementSchema, activeAnnouncement } from '../server/validation.js';

const announcement = { enabled: true, dressCode: 'Hitam dan gold\nBatik Sasak diperbolehkan.', eventAt: '2026-12-20T11:00:00.000Z', startsAt: '2026-12-01T00:00:00.000Z', endsAt: '2026-12-21T00:00:00.000Z' };

test('announcement requires complete content and a valid display window only when enabled', () => {
  assert.equal(announcementSchema.safeParse(announcement).success, true);
  for (const patch of [{ dressCode: ' ' }, { eventAt: null }, { startsAt: null }, { endsAt: null }, { endsAt: announcement.startsAt }, { endsAt: '2026-11-30T00:00:00.000Z' }]) assert.equal(announcementSchema.safeParse({ ...announcement, ...patch }).success, false);
  assert.equal(announcementSchema.safeParse({ enabled: false, dressCode: '', eventAt: null, startsAt: null, endsAt: null }).success, true);
  assert.equal(announcementSchema.safeParse({ ...announcement, dressCode: 'x'.repeat(1201) }).success, false);
});

test('public announcement is absent before start, at the exclusive end, or when disabled', () => {
  assert.equal(activeAnnouncement(undefined), null);
  assert.equal(activeAnnouncement(announcement, Date.parse(announcement.startsAt) - 1), null);
  assert.deepEqual(activeAnnouncement(announcement, Date.parse(announcement.startsAt)), { dressCode: announcement.dressCode, eventAt: announcement.eventAt });
  assert.equal(activeAnnouncement(announcement, Date.parse(announcement.endsAt)), null);
  assert.equal(activeAnnouncement({ ...announcement, enabled: false }, Date.parse(announcement.startsAt)), null);
});
