import { useEffect, useMemo, useState } from 'react';
import { Menu } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import AppMenuDrawer from '../components/layout/AppMenuDrawer';

export default function ScheduleScreen({
  scheduleZone,
  scheduleIsBinary,
  isScheduleZoneLoading,
  dayName,
  scheduleZoneId,
  setScheduleZoneId,
  scheduleDayIndex,
  setScheduleDayIndex,
  scheduleScrollerRef,
  scheduleDevices,
  openScheduleZone,
  WEEK_DAYS,
  getZoneSchedule,
  formatScheduleValue,
  formatHour,
  setSchedulePeriodValue,
  removeSchedulePeriod,
  addSchedulePeriod,
  setSchedulePeriodStart,
  saveScheduleDay,
  saveScheduleWeek,
  copyScheduleDayPattern,
  resetScheduleDay,
  resetScheduleWeek,
  isScheduleSaving,
  hasUnsavedScheduleChanges,
  hasUnsavedWeekChanges,
  hasUnsavedCurrentDayChanges,
  scheduleNotice,
  dismissScheduleNotice,
  savedDayPeriods,
  getDayPeriods,
  renderBottomNav,
  menuOpen,
  setMenuOpen,
  toggleTheme,
  debugLayoutEnabled,
  toggleDebugLayout,
  theme,
  onLogout,
}) {
  const TIME_STEPS = Array.from({ length: 145 }, (_v, idx) => idx / 6);
  const TEMP_STEPS = Array.from({ length: 43 }, (_v, idx) => 5 + idx * 0.5);
  const toTimeOptions = (minValue, maxValue) =>
    TIME_STEPS.filter((value) => value >= minValue - 0.001 && value <= maxValue + 0.001);
  const [newPeriodStart, setNewPeriodStart] = useState(null);
  const [moreActionsOpen, setMoreActionsOpen] = useState(false);
  const [copyTargetPickerOpen, setCopyTargetPickerOpen] = useState(false);
  const timeGuides = [0, 6, 12, 18, 24];
  const getTrendIndicator = (currentTemp, previousTemp) => {
    if (scheduleIsBinary) return '';
    const current = Number(currentTemp);
    const previous = Number(previousTemp);
    if (!Number.isFinite(current) || !Number.isFinite(previous)) return '';
    if (current > previous) return '↑';
    if (current < previous) return '↓';
    return '→';
  };
  const sortedDayPeriods = useMemo(() => {
    if (scheduleZoneId === null || scheduleDayIndex === null) return [];
    return getDayPeriods(scheduleZoneId, scheduleDayIndex)
      .map((period, originalIndex) => ({ period, originalIndex }))
      .sort((a, b) => a.period.start - b.period.start);
  }, [getDayPeriods, scheduleDayIndex, scheduleZoneId]);
  const sortedSavedDayPeriods = useMemo(
    () => (Array.isArray(savedDayPeriods) ? savedDayPeriods.slice().sort((a, b) => a.start - b.start) : []),
    [savedDayPeriods]
  );

  useEffect(() => {
    setNewPeriodStart(null);
    setMoreActionsOpen(false);
    setCopyTargetPickerOpen(false);
  }, [scheduleZoneId, scheduleDayIndex]);

  useEffect(() => {
    if (newPeriodStart === null) return;
    const exists = sortedDayPeriods.some(({ period }) => Math.abs(period.start - newPeriodStart) < 0.001);
    if (!exists) {
      setNewPeriodStart(null);
    }
  }, [newPeriodStart, sortedDayPeriods]);

  const weekSchedule = useMemo(() => {
    if (scheduleZoneId === null) return [];
    return getZoneSchedule(scheduleZoneId);
  }, [getZoneSchedule, scheduleZoneId]);
  const bannerState = useMemo(() => {
    const matchesCurrentContext =
      scheduleZoneId !== null
      && scheduleDayIndex !== null
      && Number(scheduleNotice.zoneId) === Number(scheduleZoneId)
      && Number(scheduleNotice.dayIndex) === Number(scheduleDayIndex);
    const activeNotice = matchesCurrentContext ? scheduleNotice : { kind: 'neutral', text: '' };
    if (activeNotice.kind === 'error' || activeNotice.kind === 'saving') {
      return activeNotice;
    }
    if (activeNotice.kind === 'saved' || activeNotice.kind === 'copied') {
      return activeNotice;
    }
    if (hasUnsavedScheduleChanges) {
      return { kind: 'dirty', text: 'Unsaved changes' };
    }
    return { kind: 'neutral', text: 'All changes saved' };
  }, [hasUnsavedScheduleChanges, scheduleDayIndex, scheduleNotice, scheduleZoneId]);
  const bannerClassesByKind = {
    neutral: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200',
    dirty: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300',
    saving: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-300',
    saved: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300',
    copied: 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900/60 dark:bg-indigo-950/40 dark:text-indigo-300',
    error: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300',
  };
  const canDismissBanner = ['saved', 'copied', 'error'].includes(bannerState.kind);
  const addPeriodFromCurrentDay = () => {
    const current = sortedDayPeriods;
    const lastPeriod = current[current.length - 1]?.period || null;
    const expectedStart = lastPeriod
      ? (lastPeriod.end < 24 ? lastPeriod.end : Math.max(lastPeriod.start + 0.5, 23))
      : 23;
    setNewPeriodStart(Math.round(expectedStart * 2) / 2);
    addSchedulePeriod(scheduleZoneId, scheduleDayIndex);
  };
  const getGuideLabelClass = (hour) => {
    if (hour === 0) return 'absolute text-[10px] font-medium text-slate-400 dark:text-slate-500';
    if (hour === 24) return 'absolute -translate-y-full text-[10px] font-medium text-slate-400 dark:text-slate-500';
    return 'absolute -translate-y-1/2 text-[10px] font-medium text-slate-400 dark:text-slate-500';
  };

  return (
    <main className="mx-auto flex h-[100lvh] max-w-5xl flex-col overflow-hidden px-4 md:px-8">
      <header className="fixed inset-x-0 top-0 z-30">
        <div className="mx-auto max-w-5xl px-4 pb-2 pt-[calc(env(safe-area-inset-top)+0.75rem)] md:px-8">
          <div className="mb-1 flex items-center justify-between">
            <Button
              size="icon"
              variant="outline"
              onClick={() => {
                if (scheduleDayIndex !== null) {
                  setScheduleDayIndex(null);
                } else if (scheduleZoneId !== null) {
                  setScheduleZoneId(null);
                } else {
                  setMenuOpen(true);
                }
              }}
            >
              {scheduleZoneId !== null ? '‹' : <Menu className="h-5 w-5" />}
            </Button>
            <div className="text-sm font-medium text-slate-500 dark:text-slate-300">
              {scheduleDayIndex !== null ? dayName : scheduleZone ? scheduleZone.name : 'Select a zone'}
            </div>
          </div>
        </div>
      </header>

      <div
        ref={scheduleScrollerRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain pb-40 pt-[calc(env(safe-area-inset-top)+4.75rem)]"
      >
        {scheduleZoneId === null ? (
          <section className="grid gap-3">
            {scheduleDevices.map((zone) => (
              <Card
                key={zone.id}
                className="cursor-pointer"
                onClick={() => {
                  void openScheduleZone(zone.id);
                }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">{zone.name}</h3>
                    <p className="text-sm text-muted">Tap to edit weekly program</p>
                  </div>
                  <span className="text-2xl text-slate-400">›</span>
                </div>
              </Card>
            ))}
          </section>
        ) : scheduleDayIndex === null ? (
          <section className="grid gap-3">
            {isScheduleZoneLoading
              ? WEEK_DAYS.map((day) => (
                  <Card key={`schedule-loading-${day}`} className="animate-pulse border border-slate-200/90">
                    <div className="flex items-center justify-between">
                      <div className="h-7 w-36 rounded bg-slate-200 dark:bg-slate-700" />
                      <div className="h-5 w-5 rounded bg-slate-200 dark:bg-slate-700" />
                    </div>
                    <div className="mt-3 grid gap-2">
                      <div className="h-3 rounded bg-slate-200 dark:bg-slate-700" />
                      <div className="h-3 rounded bg-slate-200 dark:bg-slate-700" />
                      <div className="h-3 rounded bg-slate-200 dark:bg-slate-700" />
                    </div>
                  </Card>
                ))
              : (
                <>
                  <Card className="border border-slate-200/90 bg-white dark:border-slate-700 dark:bg-slate-900">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-base font-semibold text-foreground">Week overview</h3>
                      <p className="text-xs text-muted">Tap a day to edit</p>
                    </div>
                    <div className="overflow-x-auto pb-1">
                      <div className="grid min-w-[860px] grid-cols-[42px_repeat(7,minmax(110px,1fr))] gap-2">
                        <div className="grid gap-1">
                          <div className="h-[34px]" />
                          <div className="relative h-[360px]">
                            {timeGuides.map((hour) => (
                              <span
                                key={`guide-${hour}`}
                                className={getGuideLabelClass(hour)}
                                style={{ top: `${(hour / 24) * 100}%` }}
                              >
                                {hour}
                              </span>
                            ))}
                          </div>
                        </div>
                        {weekSchedule.map((day, dayIdx) => (
                          <div key={day.day} className="grid gap-1">
                            <button
                              type="button"
                              className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-sm font-semibold text-foreground hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
                              onClick={() => setScheduleDayIndex(dayIdx)}
                            >
                              {day.day.slice(0, 3)}
                            </button>
                            <button
                              type="button"
                              className="relative h-[360px] overflow-hidden rounded-md border border-slate-200 bg-white text-left dark:border-slate-700 dark:bg-slate-900"
                              onClick={() => setScheduleDayIndex(dayIdx)}
                            >
                              {timeGuides.map((hour) => (
                                <span
                                  key={`${day.day}-line-${hour}`}
                                  className="absolute inset-x-0 border-t border-slate-100 dark:border-slate-800"
                                  style={{ top: `${(hour / 24) * 100}%` }}
                                />
                              ))}
                              {day.periods
                                .slice()
                                .sort((a, b) => a.start - b.start)
                                .map((period, idx, periods) => (
                                  <span
                                    key={`${day.day}-period-${idx}`}
                                    className={`absolute inset-x-1 rounded px-1 py-0.5 text-[10px] font-semibold ${
                                      idx % 2 === 0
                                        ? 'bg-slate-100 text-foreground dark:bg-slate-800'
                                        : 'bg-slate-200/70 text-foreground dark:bg-slate-700'
                                    }`}
                                    style={{
                                      top: `calc(${(period.start / 24) * 100}% + 2px)`,
                                      height: `calc(${((period.end - period.start) / 24) * 100}% - 4px)`,
                                      minHeight: '18px',
                                    }}
                                  >
                                    {scheduleIsBinary ? '' : `${getTrendIndicator(period.temp, periods[idx - 1]?.temp)} `}
                                    {formatScheduleValue(period, scheduleIsBinary)}
                                  </span>
                                ))}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </Card>

                  <div className="grid gap-2">
                    <p className={`text-xs font-medium ${hasUnsavedWeekChanges ? 'text-amber-600 dark:text-amber-400' : 'text-muted'}`}>
                      {hasUnsavedWeekChanges ? 'Unsaved week changes' : 'All week changes saved'}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          if (!window.confirm('Discard all unsaved changes for this week?')) return;
                          resetScheduleWeek(scheduleZoneId);
                        }}
                        disabled={Boolean(isScheduleSaving) || !hasUnsavedWeekChanges}
                      >
                        Reset week
                      </Button>
                      <Button
                        onClick={() => saveScheduleWeek(scheduleZoneId)}
                        disabled={Boolean(isScheduleSaving) || !hasUnsavedWeekChanges}
                      >
                        {isScheduleSaving ? 'Saving...' : 'Save week'}
                      </Button>
                    </div>
                  </div>
                </>
              )}
          </section>
        ) : (
          <section className="grid gap-3 pb-2">
            <Card className="py-3">
              <div className="mb-2 flex items-center justify-between text-sm text-muted">
                <span>{dayName}</span>
                <span>24h overview</span>
              </div>

              <div className="mt-1">
                <div className="relative">
                  <div className="relative h-10 overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                    {sortedDayPeriods.map(({ period, originalIndex }, idx) => (
                      <div
                        key={`timeline-segment-${originalIndex}`}
                        className={`absolute top-0 h-full border-r border-slate-200 last:border-r-0 dark:border-slate-700 ${
                          idx % 2 === 0 ? 'bg-slate-100 dark:bg-slate-800' : 'bg-slate-200/80 dark:bg-slate-700/80'
                        }`}
                        style={{
                          left: `${(period.start / 24) * 100}%`,
                          width: `${((period.end - period.start) / 24) * 100}%`,
                        }}
                      />
                    ))}
                  </div>
                </div>

                <div className="mt-2 grid grid-cols-5 px-0.5 text-xs text-slate-400 dark:text-slate-500">
                  <span className="text-left">0:00</span>
                  <span className="text-center">6:00</span>
                  <span className="text-center">12:00</span>
                  <span className="text-center">18:00</span>
                  <span className="text-right">24:00</span>
                </div>
              </div>
            </Card>

            <Card className="border border-slate-200/90 bg-white dark:border-slate-700 dark:bg-slate-900">
              <div className="divide-y divide-slate-200 dark:divide-slate-700">
                {sortedDayPeriods.map(({ period, originalIndex }, sortedIndex, sortedPeriods) => {
                  const previousEnd = sortedIndex === 0 ? 0 : sortedPeriods[sortedIndex - 1].period.end;
                  const startOptions = toTimeOptions(previousEnd, period.end - (10 / 60));
                  const isNewPeriod = newPeriodStart !== null && Math.abs(period.start - newPeriodStart) < 0.001;
                  const trendIndicator = getTrendIndicator(period.temp, sortedPeriods[sortedIndex - 1]?.period?.temp);
                  const savedPeriod = sortedSavedDayPeriods[sortedIndex];
                  const isEdited =
                    !savedPeriod ||
                    Math.abs(Number(savedPeriod.start) - Number(period.start)) > 0.001 ||
                    Math.abs(Number(savedPeriod.temp) - Number(period.temp)) > 0.001;
                  return (
                    <div
                      key={`${period.start}-${period.end}-${originalIndex}`}
                      className={`py-3 ${isNewPeriod ? 'bg-emerald-50/40 dark:bg-emerald-900/10' : ''} ${!isNewPeriod && isEdited ? 'bg-amber-50/40 dark:bg-amber-900/10' : ''}`}
                    >
                      <div className="grid gap-3">
                        {isNewPeriod ? (
                          <div className="text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                            New period
                          </div>
                        ) : null}
                        {!isNewPeriod && isEdited ? (
                          <div className="text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                            Edited
                          </div>
                        ) : null}
                        <div className="flex flex-wrap items-end gap-2">
                          <select
                            className="h-10 min-w-[104px] rounded-md border border-border bg-white px-3 text-sm text-foreground disabled:opacity-70 dark:bg-slate-800"
                            value={String(period.start)}
                            onChange={(event) => setSchedulePeriodStart(scheduleZoneId, scheduleDayIndex, originalIndex, Number(event.target.value))}
                          >
                            {startOptions.map((value) => (
                              <option key={`start-${originalIndex}-${value}`} value={value}>
                                {formatHour(value)}
                              </option>
                            ))}
                          </select>
                          {scheduleIsBinary ? (
                            <select
                              className="h-10 min-w-[110px] rounded-md border border-border bg-white px-3 text-sm text-foreground dark:bg-slate-800"
                              value={Number(period.temp) >= 0.5 ? '1' : '0'}
                              onChange={(event) => setSchedulePeriodValue(scheduleZoneId, scheduleDayIndex, originalIndex, Number(event.target.value))}
                            >
                              <option value="1">On</option>
                              <option value="0">Off</option>
                            </select>
                          ) : (
                            <>
                              <span className="min-w-[20px] text-center text-sm font-semibold text-slate-500 dark:text-slate-300">
                                {trendIndicator}
                              </span>
                              <select
                                className="h-10 min-w-[110px] rounded-md border border-border bg-white px-3 text-sm text-foreground dark:bg-slate-800"
                                value={String(Number(period.temp))}
                                onChange={(event) => setSchedulePeriodValue(scheduleZoneId, scheduleDayIndex, originalIndex, Number(event.target.value))}
                              >
                                {TEMP_STEPS.map((value) => (
                                  <option key={`temp-${originalIndex}-${value}`} value={value}>
                                    {value.toFixed(1)}°
                                  </option>
                                ))}
                              </select>
                            </>
                          )}
                          <button
                            type="button"
                            className="ml-auto grid h-9 w-9 place-items-center rounded-full border border-slate-200 bg-white text-base font-bold text-slate-400 dark:border-slate-700 dark:bg-slate-800"
                            onClick={() => removeSchedulePeriod(scheduleZoneId, scheduleDayIndex, originalIndex)}
                            aria-label="Delete period"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            <div className="grid gap-2">
              <div className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-medium ${bannerClassesByKind[bannerState.kind]}`}>
                <span className="flex-1">{bannerState.text}</span>
                {canDismissBanner ? (
                  <button
                    type="button"
                    className="rounded px-1 text-[11px] font-semibold opacity-80 hover:opacity-100"
                    onClick={dismissScheduleNotice}
                  >
                    Dismiss
                  </button>
                ) : null}
              </div>
            </div>
          </section>
        )}
      </div>

      {scheduleDayIndex !== null ? (
        <>
          <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5rem)] z-40">
            <div className="pointer-events-auto mx-auto max-w-5xl px-4 md:px-8">
              <div className="grid grid-cols-[1fr_1fr_auto] gap-2 rounded-xl border border-slate-200/80 bg-white/95 p-2 shadow-lg backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
                <Button
                  variant="outline"
                  onClick={addPeriodFromCurrentDay}
                  disabled={Boolean(isScheduleSaving)}
                >
                  + Add period
                </Button>
                <Button
                  onClick={() => saveScheduleDay(scheduleZoneId, scheduleDayIndex)}
                  disabled={Boolean(isScheduleSaving) || !hasUnsavedScheduleChanges}
                >
                  {isScheduleSaving ? 'Saving...' : 'Save schedule'}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setCopyTargetPickerOpen(false);
                    setMoreActionsOpen(true);
                  }}
                >
                  More
                </Button>
              </div>
            </div>
          </div>

          {moreActionsOpen ? (
            <div className="fixed inset-0 z-50">
              <button
                type="button"
                aria-label="Close actions"
                className="absolute inset-0 bg-slate-900/40"
                onClick={() => {
                  setMoreActionsOpen(false);
                  setCopyTargetPickerOpen(false);
                }}
              />
              <div className="absolute inset-x-0 bottom-0">
                <div className="mx-auto max-w-5xl px-4 pb-[calc(env(safe-area-inset-bottom)+5rem)] md:px-8">
                  <div className="rounded-t-2xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-foreground">More actions</h3>
                      <button
                        type="button"
                        className="rounded px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                        onClick={() => {
                          setMoreActionsOpen(false);
                          setCopyTargetPickerOpen(false);
                        }}
                      >
                        Close
                      </button>
                    </div>

                    <div className="grid gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setCopyTargetPickerOpen((prev) => !prev)}
                        disabled={Boolean(isScheduleSaving)}
                      >
                        Copy day to...
                      </Button>

                      {copyTargetPickerOpen ? (
                        <div className="grid grid-cols-2 gap-2 rounded-md border border-slate-200 p-2 dark:border-slate-700">
                          <Button
                            variant="outline"
                            onClick={() => {
                              copyScheduleDayPattern(scheduleZoneId, scheduleDayIndex, [0, 1, 2, 3, 4]);
                              setMoreActionsOpen(false);
                              setCopyTargetPickerOpen(false);
                            }}
                          >
                            Weekdays
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => {
                              copyScheduleDayPattern(scheduleZoneId, scheduleDayIndex, [0, 1, 2, 3, 4, 5, 6]);
                              setMoreActionsOpen(false);
                              setCopyTargetPickerOpen(false);
                            }}
                          >
                            All days
                          </Button>
                        </div>
                      ) : null}

                      <Button
                        variant="outline"
                        onClick={() => {
                          resetScheduleDay(scheduleZoneId, scheduleDayIndex);
                          setMoreActionsOpen(false);
                          setCopyTargetPickerOpen(false);
                        }}
                        disabled={Boolean(isScheduleSaving) || !hasUnsavedCurrentDayChanges}
                      >
                        Reset day
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          if (!window.confirm('Discard all unsaved changes for this week?')) return;
                          resetScheduleWeek(scheduleZoneId);
                          setMoreActionsOpen(false);
                          setCopyTargetPickerOpen(false);
                        }}
                        disabled={Boolean(isScheduleSaving) || !hasUnsavedScheduleChanges}
                      >
                        Reset week
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </>
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
      />
    </main>
  );
}
