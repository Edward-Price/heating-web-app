export const WEEK_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function createDefaultDayPeriods() {
  return [
    { start: 0, end: 4, temp: 16, colorIndex: 0 },
    { start: 4, end: 7, temp: 18, colorIndex: 1 },
    { start: 7, end: 10, temp: 20.5, colorIndex: 2 },
    { start: 10, end: 15, temp: 21.5, colorIndex: 3 },
    { start: 15, end: 20, temp: 19, colorIndex: 1 },
    { start: 20, end: 24, temp: 17, colorIndex: 0 },
  ];
}

export function createDefaultWeekSchedule() {
  return WEEK_DAYS.map((day) => ({ day, periods: createDefaultDayPeriods() }));
}

export function createEmptyWeekSchedule() {
  return WEEK_DAYS.map((day) => ({ day, periods: [] }));
}

export function formatHour(hour) {
  const safe = Math.max(0, Math.min(24, Number(hour) || 0));
  const totalMinutes = Math.round(safe * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function isBinaryScheduleDevice(device) {
  return device && device.type === 'hotWater';
}

export function formatScheduleValue(period, binaryMode) {
  if (binaryMode) {
    return Number(period.temp) >= 0.5 ? 'On' : 'Off';
  }
  const value = Number(period.temp);
  return Number.isFinite(value) ? `${value.toFixed(1)}°` : '--.-°';
}

const TEMP_COLOR_STOPS = [
  [12, [147, 197, 253]],
  [16, [203, 213, 225]],
  [18, [254, 215, 170]],
  [20, [251, 146, 60]],
  [23, [234, 88, 12]],
];

// Cool blue for setback temperatures through to deep orange for comfort temperatures.
export function getTempScaleColor(temp) {
  const n = Number(temp);
  const value = Number.isFinite(n) ? n : 18;
  if (value <= TEMP_COLOR_STOPS[0][0]) return `rgb(${TEMP_COLOR_STOPS[0][1].join(',')})`;
  for (let i = 1; i < TEMP_COLOR_STOPS.length; i += 1) {
    const [hi, hiRgb] = TEMP_COLOR_STOPS[i];
    if (value <= hi) {
      const [lo, loRgb] = TEMP_COLOR_STOPS[i - 1];
      const ratio = (value - lo) / (hi - lo);
      const rgb = loRgb.map((c, idx) => Math.round(c + (hiRgb[idx] - c) * ratio));
      return `rgb(${rgb.join(',')})`;
    }
  }
  return `rgb(${TEMP_COLOR_STOPS[TEMP_COLOR_STOPS.length - 1][1].join(',')})`;
}

export function getScheduleValueColor(value, binaryMode) {
  // Off periods return null so they fall back to the (theme-aware) track colour.
  if (binaryMode) return Number(value) >= 0.5 ? '#F97316' : null;
  return getTempScaleColor(value);
}

function sortedPeriods(day) {
  return (Array.isArray(day && day.periods) ? day.periods : [])
    .filter((period) => Number.isFinite(Number(period.start)) && Number.isFinite(Number(period.temp)))
    .slice()
    .sort((a, b) => a.start - b.start);
}

// Finds the next point where the scheduled temperature changes, looking up to a week ahead.
// `week` is indexed Monday (0) to Sunday (6), with period start/end in hours.
export function getNextScheduleChange(week, now = new Date()) {
  if (!Array.isArray(week) || week.length !== 7) return null;
  const todayIndex = (now.getDay() + 6) % 7;
  const nowHour = now.getHours() + now.getMinutes() / 60;
  const todayPeriods = sortedPeriods(week[todayIndex]);
  const activePeriod = todayPeriods.find((period) => period.start <= nowHour && nowHour < period.end);
  if (!activePeriod) return null;

  let previousTemp = Number(activePeriod.temp);
  for (let dayOffset = 0; dayOffset <= 7; dayOffset += 1) {
    const dayIndex = (todayIndex + dayOffset) % 7;
    for (const period of sortedPeriods(week[dayIndex])) {
      if (dayOffset === 0 && period.start <= nowHour) continue;
      const temp = Number(period.temp);
      if (Math.abs(temp - previousTemp) >= 0.01) {
        return { dayOffset, dayIndex, hour: Number(period.start), temp, fromTemp: Number(activePeriod.temp) };
      }
      previousTemp = temp;
    }
  }
  return null;
}

export function formatScheduleChangeDay(change) {
  if (!change) return '';
  if (change.dayOffset === 0) return 'Today';
  if (change.dayOffset === 1) return 'Tomorrow';
  return WEEK_DAYS[change.dayIndex] || '';
}
