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

export function getTempScaleColor(temp) {
  const n = Number(temp);
  const clamped = Math.max(10, Math.min(26, Number.isFinite(n) ? n : 18));
  const ratio = (clamped - 10) / (26 - 10);
  const hue = 205 - ratio * (205 - 8);
  return `hsl(${hue} 72% 58%)`;
}
