import test from 'node:test';
import assert from 'node:assert/strict';
import { getPollingCreators, getVotingUnavailable } from '../src/polling-utils.ts';

const creators = [
  { id: 3, name: 'Dara', handle: '@dara', categoryId: 1 },
  { id: 2, name: 'Rani', handle: '@cerita.rani', categoryId: 2 },
  { id: 4, name: 'Arif', handle: '@arif', categoryId: 1 },
  { id: 1, name: 'Nara', handle: '@nara', categoryId: 1 }
];

test('polling preserves the server popularity order without receiving counts', () => {
  assert.deepEqual(getPollingCreators(creators, 0, '').map(c => c.id), [3, 2, 4, 1]);
  assert.deepEqual(creators.map(c => c.id), [3, 2, 4, 1]);
  assert.ok(creators.every(c => !('votes' in c)));
});

test('category and name or handle searches preserve the vote order', () => {
  assert.deepEqual(getPollingCreators(creators, 1, 'ar').map(c => c.id), [3, 4, 1]);
  assert.deepEqual(getPollingCreators(creators, 2, '  CERITA.RANI ').map(c => c.id), [2]);
  assert.deepEqual(getPollingCreators(creators, 1, 'unknown'), []);
  assert.deepEqual(getPollingCreators([], 0, ''), []);
});

test('unavailable voting distinguishes scheduled, paused and finished periods using server availability', () => {
  const settings = { votingActive: true, votingStartsAt: '2026-11-01T00:00:00Z', votingEndsAt: '2026-11-30T00:00:00Z' };
  const now = Date.parse('2026-10-27T00:00:00Z');
  assert.equal(getVotingUnavailable({ settings, votingOpen: true }, now), null);
  const scheduled = getVotingUnavailable({ settings, votingOpen: false }, now);
  assert.equal(scheduled.title, 'Voting belum dibuka.');
  assert.equal(scheduled.opensAt, settings.votingStartsAt);
  const paused = getVotingUnavailable({ settings: { ...settings, votingActive: false }, votingOpen: false }, now);
  assert.equal(paused.title, 'Voting belum tersedia.');
  assert.equal(paused.opensAt, null);
  const ended = getVotingUnavailable({ settings, votingOpen: false }, Date.parse(settings.votingEndsAt));
  assert.equal(ended.title, 'Voting telah berakhir.');
  assert.equal(ended.opensAt, null);
  assert.equal(getVotingUnavailable({ settings: { ...settings, votingStartsAt: null, votingEndsAt: null }, votingOpen: false }, now).title, 'Voting belum tersedia.');
  assert.equal(getVotingUnavailable({ settings, votingOpen: false }, Date.parse(settings.votingStartsAt)).title, 'Voting belum tersedia.');
});
