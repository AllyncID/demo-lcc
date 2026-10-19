import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarDays, shiftMonth } from '../src/admin-calendar.ts';

test('calendar starts on Monday and includes leap day and neighboring months', () => {
  const days = calendarDays('2028-02');
  assert.equal(days.length, 42);
  assert.equal(days[0], '2028-01-31');
  assert.equal(days[29], '2028-02-29');
  assert.equal(days[41], '2028-03-12');
  assert.equal(calendarDays('2026-06')[0], '2026-06-01');
});

test('month navigation crosses years without changing the selected day', () => {
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
});
