import assert from 'node:assert/strict';
import test from 'node:test';
import { getThreeStaffDailyRate, getThreeStaffShiftsForDate } from './threeStaffSchedule.js';

const staff = ['Janice', 'Berlyn', 'New'];
const shiftsOn = (day) => getThreeStaffShiftsForDate(new Date(2026, 10, 29 + day), staff);

test('each of six weeks has two workers daily, 5/5/4 workdays, and two full shifts each', () => {
  for (let week = 0; week < 6; week++) {
    const days = new Map(staff.map((name) => [name, 0]));
    const full = new Map(staff.map((name) => [name, 0]));
    const fullTypes = { 'FT-M': 0, 'FT-E': 0 };
    let pay = 0;
    for (let day = 0; day < 7; day++) {
      const shifts = shiftsOn(week * 7 + day);
      assert.equal(shifts.length, 2);
      assert.equal(new Set(shifts.map(({ employee }) => employee)).size, 2);
      assert.equal(shifts.filter(({ start }) => start === '06:00').length, 1);
      assert.equal(shifts.filter(({ start }) => start !== '06:00').length, 1);
      for (const shift of shifts) {
        days.set(shift.employee, days.get(shift.employee) + 1);
        if (shift.hours === 9) full.set(shift.employee, full.get(shift.employee) + 1);
        if (shift.type in fullTypes) fullTypes[shift.type]++;
        pay += shift.rate;
      }
    }
    assert.deepEqual([...days.values()], [5, 5, 4]);
    assert.deepEqual([...full.values()], [2, 2, 2]);
    assert.deepEqual(fullTypes, { 'FT-M': 3, 'FT-E': 3 });
    assert.equal(pay, 7900);
  }
});

test('weekend shifts are shared 8/9/7 across the six-week cycle', () => {
  const weekends = new Map(staff.map((name) => [name, 0]));
  for (let week = 0; week < 6; week++) {
    for (const day of [0, 6]) {
      for (const { employee } of shiftsOn(week * 7 + day)) {
        weekends.set(employee, weekends.get(employee) + 1);
      }
    }
  }
  assert.deepEqual([...weekends.values()], [9, 8, 7]);
});

test('New works four days weekly in one time band', () => {
  const expectedDays = [[1, 2, 3, 6], [0, 1, 2, 3], [0, 1, 5, 6], [0, 4, 5, 6], [1, 2, 4, 5], [3, 4, 5, 6]];
  const morningWeeks = [false, false, true, true, false, true];
  for (let week = 0; week < 6; week++) {
    const days = [];
    for (let day = 0; day < 7; day++) {
      const shift = shiftsOn(week * 7 + day).find(({ employee }) => employee === 'New');
      if (!shift) continue;
      days.push(day);
      assert.equal(shift.start === '06:00', morningWeeks[week]);
    }
    assert.deepEqual(days, expectedDays[week]);
  }
});

test('Monday inventory pairs rotate through all three combinations with two full shifts', () => {
  const expected = [['Janice', 'New'], ['Janice', 'New'], ['Berlyn', 'New'], ['Janice', 'Berlyn'], ['Berlyn', 'New'], ['Janice', 'Berlyn']];
  for (let week = 0; week < 6; week++) {
    const monday = shiftsOn(week * 7 + 1);
    assert.deepEqual(monday.map(({ employee }) => employee).sort(), [...expected[week]].sort());
    assert.deepEqual(monday.map(({ hours }) => hours), [9, 9]);
  }
});

test('no worker changes between morning and evening on adjacent workdays, including the cycle boundary', () => {
  for (let day = 0; day < 42; day++) {
    const today = shiftsOn(day);
    const tomorrow = shiftsOn(day + 1);
    for (const shift of today) {
      const next = tomorrow.find(({ employee }) => employee === shift.employee);
      if (next) assert.equal(shift.start === '06:00', next.start === '06:00');
    }
  }
});

test('all workers stay within five consecutive days across the repeating cycle boundary', () => {
  const streaks = new Map(staff.map((name) => [name, 0]));
  for (let day = -42; day < 126; day++) {
    const working = new Set(shiftsOn(day).map(({ employee }) => employee));
    for (const name of staff) {
      const streak = working.has(name) ? streaks.get(name) + 1 : 0;
      assert.ok(streak <= 5, `${name} works ${streak} consecutive days through day ${day}`);
      streaks.set(name, streak);
    }
  }
});

test('six-week pattern repeats across month and year boundaries', () => {
  for (const day of [-42, -1, 0, 1, 6, 20, 21, 41, 42, 84]) {
    assert.deepEqual(shiftsOn(day), shiftsOn(day + 42));
  }
});

test('daily pay uses actual hours for automatic and manual schedules', () => {
  for (const hours of [4.5, 5, 5.5, 6, 6.5, 7, 7.99]) assert.equal(getThreeStaffDailyRate(hours), 500);
  for (const hours of [8, 8.5, 9, 9.5]) assert.equal(getThreeStaffDailyRate(hours), 650);
  for (const hours of [10, 10.5, 11]) assert.equal(getThreeStaffDailyRate(hours), 750);
  for (const hours of [0, -1, NaN, Infinity]) assert.equal(getThreeStaffDailyRate(hours), null);
});
