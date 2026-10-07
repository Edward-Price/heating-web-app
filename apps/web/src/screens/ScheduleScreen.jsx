import { useEffect, useMemo, useState } from 'react';
import { Copy, Minus, Plus, Trash2, X } from 'lucide-react';
import AppMenuDrawer from '../components/layout/AppMenuDrawer';
import ScreenHeader from '../components/layout/ScreenHeader';
import { SectionCard, Segmented } from '../components/ui/surface';
import { WEEK_DAYS, formatHour, formatScheduleValue, getScheduleValueColor } from '../lib/scheduleUtils';

const STEP_HOURS = 10 / 60;
const MIN_TEMP = 5;
const MAX_TEMP = 35;
const AXIS_HOURS = [0, 6, 12, 18, 24];
const COPY_PRESETS = [
  { label: 'Weekdays', days: [0, 1, 2, 3, 4] },
  { label: 'Weekend', days: [5, 6] },
  { label: 'All days', days: [0, 1, 2, 3, 4, 5, 6] },
];

function sortWithIndex(periods) {
  return (Array.isArray(periods) ? periods : [])
    .map((period, originalIndex) => ({ period, originalIndex }))
    .sort((a, b) => a.period.start - b.period.start);
}

function parseTimeInput(value) {
  const [h, m] = String(value || '').split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return Math.round((h * 60 + m) / 10) * 10 / 60;
}

function nowHour() {
  const now = new Date();
  return now.getHours() + now.getMinutes() / 60;
}

function DayBar({ periods, binaryMode, marker = null, className = 'h-7' }) {
  return (
    <div className={`relative w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800 ${className}`}>
      {periods.map(({ period, originalIndex }) => (
        <span
          key={`${originalIndex}-${period.start}`}
          className="absolute inset-y-0 border-r border-white/70 last:border-r-0 dark:border-slate-900/60"
          style={{
            left: `${(period.start / 24) * 100}%`,
            width: `${((period.end - period.start) / 24) * 100}%`,
            backgroundColor: getScheduleValueColor(period.temp, binaryMode) || undefined,
          }}
        />
      ))}
      {marker !== null ? (
        <span className="absolute inset-y-0 w-0.5 bg-slate-900 dark:bg-white" style={{ left: `${(marker / 24) * 100}%` }} />
      ) : null}
    </div>
  );
}

function TimeAxis() {
  return (
    <div className="flex justify-between text-[11px] font-medium text-slate-400 dark:text-slate-500">
      {AXIS_HOURS.map((hour) => (
        <span key={hour}>{String(hour).padStart(2, '0')}</span>
      ))}
    </div>
  );
}

export default function ScheduleScreen({
  scheduleDevices,
  scheduleZone,
  scheduleZoneId,
  scheduleIsBinary,
  isScheduleZoneLoading,
  openScheduleZone,
  scheduleDayIndex,
  setScheduleDayIndex,
  scheduleScrollerRef,
  getZoneSchedule,
  setSchedulePeriodValue,
  setSchedulePeriodStart,
  removeSchedulePeriod,
  insertSchedulePeriod,
  copyScheduleDayPattern,
  saveScheduleWeek,
  resetScheduleWeek,
  isScheduleSaving,
  hasUnsavedWeekChanges,
  isZoneScheduleDirty,
  scheduleNotice,
  dismissScheduleNotice,
  renderBottomNav,
  menuOpen,
  setMenuOpen,
  toggleTheme,
  debugLayoutEnabled,
  toggleDebugLayout,
  theme,
  onLogout,
  onChangeSystem,
}) {
  const [copySheetOpen, setCopySheetOpen] = useState(false);
  const [copyTargets, setCopyTargets] = useState([]);
  const [highlightStart, setHighlightStart] = useState(null);
  const todayIndex = (new Date().getDay() + 6) % 7;
  const dayIndex = Number.isInteger(scheduleDayIndex) ? scheduleDayIndex : todayIndex;
  const dayName = WEEK_DAYS[dayIndex];

  const week = scheduleZoneId !== null ? getZoneSchedule(scheduleZoneId) : [];
  const sortedWeek = useMemo(() => week.map((day) => sortWithIndex(day.periods)), [week]);
  const dayPeriods = sortedWeek[dayIndex] || [];

  useEffect(() => {
    setHighlightStart(null);
    setCopySheetOpen(false);
  }, [scheduleZoneId, dayIndex]);

  const notice = scheduleNotice && Number(scheduleNotice.zoneId) === Number(scheduleZoneId) ? scheduleNotice : null;
  const showSaveBar = hasUnsavedWeekChanges || isScheduleSaving || (notice && notice.text);

  // New change points go in the middle of the longest block, which is nearly always where people want them.
  const longest = dayPeriods.reduce(
    (best, entry) => (!best || entry.period.end - entry.period.start > best.period.end - best.period.start ? entry : best),
    null
  );
  const splitAt = longest
    ? Math.round(((longest.period.start + longest.period.end) / 2) * 2) / 2
    : null;
  const canAdd = longest && splitAt - longest.period.start >= STEP_HOURS && longest.period.end - splitAt >= STEP_HOURS;

  const addChange = () => {
    if (!canAdd) return;
    insertSchedulePeriod(scheduleZoneId, dayIndex, splitAt);
    setHighlightStart(splitAt);
  };

  const openCopySheet = () => {
    setCopyTargets([]);
    setCopySheetOpen(true);
  };

  const toggleCopyTarget = (idx) => {
    setCopyTargets((prev) => (prev.includes(idx) ? prev.filter((d) => d !== idx) : [...prev, idx]));
  };

  const zoneOptions = scheduleDevices.map((device) => ({
    value: device.id,
    label: device.name,
    badge: isZoneScheduleDirty(device.id),
  }));

  return (
    <main className="mx-auto flex h-[100lvh] max-w-5xl flex-col overflow-hidden px-4 md:px-8">
      <div
        ref={scheduleScrollerRef}
        className={`-mx-4 min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain px-4 pt-[calc(env(safe-area-inset-top)+1rem)] md:mx-0 md:px-0 ${showSaveBar ? 'pb-60' : 'pb-40'}`}
      >
        <div className="mx-auto grid max-w-xl gap-3">
          <ScreenHeader
            title="Schedule"
            subtitle={scheduleZone ? `${scheduleZone.name} · weekly program` : 'Weekly program'}
            onOpenMenu={() => setMenuOpen(true)}
          />

          {zoneOptions.length > 1 ? (
            <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
              <Segmented options={zoneOptions} value={scheduleZoneId} onChange={(id) => openScheduleZone(Number(id))} />
            </div>
          ) : null}

          {isScheduleZoneLoading || scheduleZoneId === null ? (
            <SectionCard className="grid animate-pulse gap-3">
              {WEEK_DAYS.map((day) => (
                <div key={day} className="flex items-center gap-3">
                  <div className="h-4 w-8 rounded bg-slate-200 dark:bg-slate-700" />
                  <div className="h-7 flex-1 rounded-full bg-slate-200 dark:bg-slate-700" />
                </div>
              ))}
            </SectionCard>
          ) : (
            <>
              <SectionCard className="grid gap-2 px-3">
                <div className="mb-1 flex items-center justify-between px-1">
                  <h2 className="text-base font-semibold text-foreground">This week</h2>
                  <span className="text-xs text-muted">Tap a day to edit</span>
                </div>
                {WEEK_DAYS.map((day, idx) => {
                  const selected = idx === dayIndex;
                  const isToday = idx === todayIndex;
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => setScheduleDayIndex(idx)}
                      aria-pressed={selected}
                      className={`flex items-center gap-3 rounded-xl px-1 py-1 text-left transition ${selected ? 'bg-orange-50 ring-1 ring-orange-300 dark:bg-orange-500/10 dark:ring-orange-500/50' : ''}`}
                    >
                      <span className={`w-9 shrink-0 text-sm font-semibold ${isToday ? 'text-orange-500' : 'text-foreground'}`}>
                        {day.slice(0, 3)}
                      </span>
                      <DayBar periods={sortedWeek[idx] || []} binaryMode={scheduleIsBinary} marker={isToday ? nowHour() : null} />
                    </button>
                  );
                })}
                <div className="flex gap-3 px-1">
                  <span className="w-9 shrink-0" />
                  <div className="flex-1"><TimeAxis /></div>
                </div>
              </SectionCard>

              <SectionCard className="grid gap-1">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div>
                    <h2 className="text-xl font-bold tracking-tight text-foreground">{dayName}</h2>
                    <p className="text-sm text-muted">{dayIndex === todayIndex ? 'Today' : `${dayPeriods.length} ${dayPeriods.length === 1 ? 'setting' : 'settings'}`}</p>
                  </div>
                  <button
                    type="button"
                    onClick={openCopySheet}
                    className="flex items-center gap-1.5 rounded-full bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-600 dark:bg-orange-500/15 dark:text-orange-400"
                  >
                    <Copy className="h-4 w-4" />
                    Copy to…
                  </button>
                </div>

                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {dayPeriods.map(({ period, originalIndex }, sortedIndex) => {
                    const isFirst = sortedIndex === 0;
                    const isHighlighted = highlightStart !== null && Math.abs(period.start - highlightStart) < 0.001;
                    const binaryOn = Number(period.temp) >= 0.5;
                    return (
                      <div
                        key={`${originalIndex}-${period.start}`}
                        className={`flex items-center gap-3 py-3 ${isHighlighted ? '-mx-2 rounded-xl bg-orange-50/70 px-2 dark:bg-orange-500/10' : ''}`}
                      >
                        <span className="h-10 w-1.5 shrink-0 rounded-full bg-slate-200 dark:bg-slate-700" style={{ backgroundColor: getScheduleValueColor(period.temp, scheduleIsBinary) || undefined }} />
                        <div className="min-w-0">
                          {isFirst ? (
                            <div className="flex h-9 items-center px-1 text-base font-semibold text-foreground">00:00</div>
                          ) : (
                            <input
                              type="time"
                              step={600}
                              value={formatHour(period.start)}
                              onChange={(event) => {
                                const next = parseTimeInput(event.target.value);
                                if (next !== null) setSchedulePeriodStart(scheduleZoneId, dayIndex, originalIndex, next);
                              }}
                              className="h-9 rounded-lg bg-slate-100 px-2 text-base font-semibold text-foreground outline-none focus:ring-2 focus:ring-orange-400 dark:bg-slate-800 dark:[color-scheme:dark]"
                              aria-label={`Start time for setting ${sortedIndex + 1}`}
                            />
                          )}
                          <div className="px-1 text-xs text-muted">until {formatHour(period.end)}</div>
                        </div>

                        <div className="ml-auto flex items-center gap-1.5">
                          {scheduleIsBinary ? (
                            <Segmented
                              options={[{ value: 1, label: 'On' }, { value: 0, label: 'Off' }]}
                              value={binaryOn ? 1 : 0}
                              onChange={(v) => setSchedulePeriodValue(scheduleZoneId, dayIndex, originalIndex, Number(v))}
                            />
                          ) : (
                            <>
                              <button
                                type="button"
                                aria-label="Lower temperature"
                                onClick={() => setSchedulePeriodValue(scheduleZoneId, dayIndex, originalIndex, Math.max(MIN_TEMP, Number(period.temp) - 0.5))}
                                className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-600 active:scale-95 dark:bg-slate-800 dark:text-slate-300"
                              >
                                <Minus className="h-4 w-4" />
                              </button>
                              <span className="w-14 text-center text-lg font-bold tabular-nums text-foreground">
                                {formatScheduleValue(period, false)}
                              </span>
                              <button
                                type="button"
                                aria-label="Raise temperature"
                                onClick={() => setSchedulePeriodValue(scheduleZoneId, dayIndex, originalIndex, Math.min(MAX_TEMP, Number(period.temp) + 0.5))}
                                className="grid h-9 w-9 place-items-center rounded-full bg-orange-50 text-orange-600 active:scale-95 dark:bg-orange-500/15 dark:text-orange-400"
                              >
                                <Plus className="h-4 w-4" />
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            aria-label="Remove setting"
                            disabled={isFirst}
                            onClick={() => removeSchedulePeriod(scheduleZoneId, dayIndex, originalIndex)}
                            className="ml-1 grid h-9 w-9 place-items-center rounded-full text-slate-400 hover:text-rose-500 disabled:invisible"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={addChange}
                  disabled={!canAdd}
                  className="mt-1 flex h-11 items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-slate-200 text-sm font-semibold text-muted transition hover:border-orange-300 hover:text-orange-600 disabled:opacity-50 dark:border-slate-700"
                >
                  <Plus className="h-4 w-4" />
                  Add a change
                </button>
              </SectionCard>
            </>
          )}
        </div>
      </div>

      {showSaveBar ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5.25rem)] z-40">
          <div className="pointer-events-auto mx-auto max-w-xl px-4">
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200/80 bg-white/95 p-2 pl-4 shadow-lg backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
              {notice && notice.text && !hasUnsavedWeekChanges ? (
                <>
                  <span className={`flex-1 text-sm font-medium ${notice.kind === 'error' ? 'text-rose-600' : 'text-emerald-600 dark:text-emerald-400'}`}>
                    {notice.text}
                  </span>
                  <button type="button" onClick={dismissScheduleNotice} aria-label="Dismiss" className="grid h-9 w-9 place-items-center rounded-full text-muted">
                    <X className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm font-medium text-foreground">
                    {isScheduleSaving ? 'Saving…' : notice && notice.kind === 'error' ? <span className="text-rose-600">{notice.text}</span> : 'Unsaved changes'}
                  </span>
                  <button
                    type="button"
                    disabled={isScheduleSaving}
                    onClick={() => {
                      if (!window.confirm(`Discard unsaved changes to the ${scheduleZone ? scheduleZone.name : ''} schedule?`)) return;
                      resetScheduleWeek(scheduleZoneId);
                      dismissScheduleNotice();
                    }}
                    className="h-10 rounded-full px-4 text-sm font-semibold text-muted disabled:opacity-50"
                  >
                    Discard
                  </button>
                  <button
                    type="button"
                    disabled={isScheduleSaving || !hasUnsavedWeekChanges}
                    onClick={() => saveScheduleWeek(scheduleZoneId)}
                    className="h-10 rounded-full bg-gradient-to-r from-orange-400 to-orange-600 px-5 text-sm font-bold text-white shadow-md shadow-orange-500/25 disabled:opacity-60"
                  >
                    {isScheduleSaving ? 'Saving…' : 'Save'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {copySheetOpen ? (
        <div className="fixed inset-0 z-[60]">
          <button type="button" aria-label="Close" className="absolute inset-0 bg-slate-900/40" onClick={() => setCopySheetOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 mx-auto max-w-xl rounded-t-3xl bg-white p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-2xl dark:bg-slate-900">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-foreground">Copy {dayName} to…</h3>
              <button type="button" onClick={() => setCopySheetOpen(false)} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-muted dark:bg-slate-800">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mb-3 flex flex-wrap gap-2">
              {COPY_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setCopyTargets(preset.days.filter((d) => d !== dayIndex))}
                  className="rounded-full border border-slate-200 px-3 py-1.5 text-sm font-semibold text-foreground dark:border-slate-700"
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="mb-5 grid grid-cols-7 gap-1.5">
              {WEEK_DAYS.map((day, idx) => {
                const isSource = idx === dayIndex;
                const checked = copyTargets.includes(idx);
                return (
                  <button
                    key={day}
                    type="button"
                    disabled={isSource}
                    onClick={() => toggleCopyTarget(idx)}
                    aria-pressed={checked}
                    className={`h-12 rounded-xl text-sm font-semibold transition disabled:opacity-40 ${
                      checked
                        ? 'bg-orange-500 text-white'
                        : 'bg-slate-100 text-foreground dark:bg-slate-800'
                    }`}
                  >
                    {day.slice(0, 2)}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              disabled={copyTargets.length === 0}
              onClick={() => {
                copyScheduleDayPattern(scheduleZoneId, dayIndex, copyTargets);
                setCopySheetOpen(false);
              }}
              className="h-12 w-full rounded-full bg-gradient-to-r from-orange-400 to-orange-600 text-base font-bold text-white disabled:opacity-50"
            >
              {copyTargets.length ? `Copy to ${copyTargets.length} ${copyTargets.length === 1 ? 'day' : 'days'}` : 'Choose days'}
            </button>
          </div>
        </div>
      ) : null}

      {renderBottomNav()}

      <AppMenuDrawer
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
        toggleTheme={toggleTheme}
        debugLayoutEnabled={debugLayoutEnabled}
        toggleDebugLayout={toggleDebugLayout}
        theme={theme}
        onLogout={onLogout}
        onChangeSystem={onChangeSystem}
      />
    </main>
  );
}
