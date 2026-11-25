const ANCHOR_SUNDAY_UTC = Date.UTC(2026, 10, 29);
const MS_PER_DAY = 86_400_000;

const SHIFT_CONFIG = {
  'FT-M': { start: '06:00', hours: 9, rate: 650 },
  'FT-E': { start: '08:00', hours: 9, rate: 650 },
  M: { start: '06:00', hours: 6, rate: 500 },
  E: { start: '11:00', hours: 6, rate: 500 },
};

const WEEK_A = [
  [{ idx: 0, type: 'M' }, { idx: 1, type: 'FT-E' }],
  [{ idx: 0, type: 'FT-M' }, { idx: 2, type: 'FT-E' }],
  [{ idx: 0, type: 'FT-M' }, { idx: 2, type: 'E' }],
  [{ idx: 1, type: 'M' }, { idx: 2, type: 'E' }],
  [{ idx: 1, type: 'M' }, { idx: 0, type: 'E' }],
  [{ idx: 1, type: 'FT-M' }, { idx: 0, type: 'E' }],
  [{ idx: 1, type: 'M' }, { idx: 2, type: 'FT-E' }],
];

const WEEK_B = [
  [{ idx: 0, type: 'M' }, { idx: 2, type: 'FT-E' }],
  [{ idx: 0, type: 'FT-M' }, { idx: 2, type: 'FT-E' }],
  [{ idx: 1, type: 'FT-M' }, { idx: 2, type: 'E' }],
  [{ idx: 1, type: 'M' }, { idx: 2, type: 'E' }],
  [{ idx: 1, type: 'M' }, { idx: 0, type: 'E' }],
  [{ idx: 1, type: 'M' }, { idx: 0, type: 'FT-E' }],
  [{ idx: 1, type: 'FT-M' }, { idx: 0, type: 'E' }],
];

const WEEK_C = [
  [{ idx: 2, type: 'M' }, { idx: 0, type: 'FT-E' }],
  [{ idx: 2, type: 'FT-M' }, { idx: 1, type: 'FT-E' }],
  [{ idx: 0, type: 'FT-M' }, { idx: 1, type: 'E' }],
  [{ idx: 0, type: 'M' }, { idx: 1, type: 'E' }],
  [{ idx: 0, type: 'M' }, { idx: 1, type: 'E' }],
  [{ idx: 2, type: 'M' }, { idx: 1, type: 'FT-E' }],
  [{ idx: 2, type: 'FT-M' }, { idx: 0, type: 'E' }],
];

const WEEK_D = [
  [{ idx: 2, type: 'FT-M' }, { idx: 1, type: 'E' }],
  [{ idx: 0, type: 'FT-M' }, { idx: 1, type: 'FT-E' }],
  [{ idx: 0, type: 'M' }, { idx: 1, type: 'FT-E' }],
  [{ idx: 0, type: 'M' }, { idx: 1, type: 'E' }],
  [{ idx: 2, type: 'M' }, { idx: 1, type: 'E' }],
  [{ idx: 2, type: 'M' }, { idx: 0, type: 'FT-E' }],
  [{ idx: 2, type: 'FT-M' }, { idx: 0, type: 'E' }],
];

const WEEK_E = [
  [{ idx: 1, type: 'M' }, { idx: 0, type: 'FT-E' }],
  [{ idx: 1, type: 'FT-M' }, { idx: 2, type: 'FT-E' }],
  [{ idx: 0, type: 'FT-M' }, { idx: 2, type: 'E' }],
  [{ idx: 0, type: 'M' }, { idx: 1, type: 'E' }],
  [{ idx: 0, type: 'M' }, { idx: 2, type: 'E' }],
  [{ idx: 1, type: 'M' }, { idx: 2, type: 'FT-E' }],
  [{ idx: 1, type: 'FT-M' }, { idx: 0, type: 'E' }],
];

const WEEK_F = [
  [{ idx: 1, type: 'M' }, { idx: 0, type: 'FT-E' }],
  [{ idx: 1, type: 'FT-M' }, { idx: 0, type: 'FT-E' }],
  [{ idx: 1, type: 'M' }, { idx: 0, type: 'E' }],
  [{ idx: 2, type: 'M' }, { idx: 0, type: 'E' }],
  [{ idx: 2, type: 'M' }, { idx: 1, type: 'FT-E' }],
  [{ idx: 2, type: 'FT-M' }, { idx: 0, type: 'E' }],
  [{ idx: 2, type: 'FT-M' }, { idx: 1, type: 'E' }],
];

const SIX_WEEK_CYCLE = [WEEK_A, WEEK_B, WEEK_C, WEEK_D, WEEK_E, WEEK_F];

export function getThreeStaffShiftsForDate(date, staff) {
  const targetUtc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor((targetUtc - ANCHOR_SUNDAY_UTC) / MS_PER_DAY);
  const cycleDay = ((diffDays % 42) + 42) % 42;
  const dayOfWeek = new Date(targetUtc).getUTCDay();
  const schedule = SIX_WEEK_CYCLE[Math.floor(cycleDay / 7)];
  return schedule[dayOfWeek].map(({ idx, type }) => ({
    employee: staff[idx],
    type,
    ...SHIFT_CONFIG[type],
  }));
}

export function getThreeStaffDailyRate(hours) {
  if (!Number.isFinite(hours) || hours <= 0) return null;
  return hours < 8 ? 500 : 650;
}
