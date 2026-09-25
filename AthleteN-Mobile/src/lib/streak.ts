export type TrainingRow = { session_date: string | null; minutes?: number | null };

export type StreakSummary = {
  current: number;
  longest: number;
  activeDates: string[];
  todayActive: boolean;
  lastActiveDate: string | null;
};

function dayKey(value: Date) {
  return [value.getFullYear(), String(value.getMonth() + 1).padStart(2, '0'), String(value.getDate()).padStart(2, '0')].join('-');
}

export function todayKey() { return dayKey(new Date()); }

export function calculateStreak(rows: TrainingRow[], today = new Date()): StreakSummary {
  const active = [...new Set(rows.filter(row => Number(row.minutes) > 0 && row.session_date).map(row => String(row.session_date).slice(0, 10)))].sort();
  const activeSet = new Set(active);
  let longest = 0;
  let run = 0;
  let previous: Date | null = null;
  for (const value of active) {
    const date = new Date(`${value}T12:00:00`);
    if (previous && Math.round((date.getTime() - previous.getTime()) / 86400000) === 1) run += 1;
    else run = 1;
    longest = Math.max(longest, run);
    previous = date;
  }
  let cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (!activeSet.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let current = 0;
  while (activeSet.has(dayKey(cursor))) { current += 1; cursor.setDate(cursor.getDate() - 1); }
  return { current, longest, activeDates: active, todayActive: activeSet.has(dayKey(today)), lastActiveDate: active.at(-1) || null };
}
