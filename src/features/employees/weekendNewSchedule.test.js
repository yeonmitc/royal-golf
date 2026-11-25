import assert from 'node:assert/strict';
import test from 'node:test';
import { getWeekendNewShiftsForDate } from './threeStaffSchedule.js';

const staff = ['Janice', 'Berlyn', 'New'];
const expected = [
  [['New', 'FT-M'], ['Janice', 'E']],
  [['Berlyn', 'FT-M'], ['Janice', 'FT-E']],
  [['Berlyn', 'M'], ['Janice', 'E']],
  [['Janice', 'M'], ['Berlyn', 'E']],
  [['Janice', 'M'], ['Berlyn', 'E']],
  [['Janice', 'FT-M'], ['Berlyn', 'E']],
  [['New', 'FT-M'], ['Berlyn', 'FT-E']],
];

test('weekend New pattern repeats across month boundaries and meets weekly limits', () => {
  const workdays = new Map(staff.map((name) => [name, 0]));
  const fullDays = new Map(staff.map((name) => [name, 0]));
  const streaks = new Map(staff.map((name) => [name, 0]));

  for (let offset = 0; offset < 21; offset++) {
    const date = new Date(2026, 10, 29 + offset);
    const shifts = getWeekendNewShiftsForDate(date, staff);
    assert.deepEqual(shifts.map(({ employee, type }) => [employee, type]), expected[offset % 7]);
    assert.deepEqual(shifts.map(({ start, hours }) => [start, hours]),
      expected[offset % 7].map(([, type]) => ({
        'FT-M': ['06:00', 9], 'FT-E': ['08:00', 9], M: ['06:00', 6], E: ['11:00', 6],
      })[type]));

    const working = new Set(shifts.map(({ employee }) => employee));
    for (const name of staff) {
      streaks.set(name, working.has(name) ? streaks.get(name) + 1 : 0);
      assert.ok(streaks.get(name) <= 6, `${name} works too many consecutive days`);
      if (offset < 7 && working.has(name)) workdays.set(name, workdays.get(name) + 1);
    }
    if (offset < 7) {
      for (const { employee, type } of shifts) {
        if (type.startsWith('FT-')) fullDays.set(employee, fullDays.get(employee) + 1);
      }
    }
  }

  assert.deepEqual([...workdays.values()], [6, 6, 2]);
  assert.deepEqual([...fullDays.values()], [2, 2, 2]);
});
