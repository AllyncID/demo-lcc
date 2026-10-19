import test from 'node:test';
import assert from 'node:assert/strict';
import { getPollingCreators } from '../src/polling-utils.ts';

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
