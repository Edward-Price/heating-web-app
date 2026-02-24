import { ChevronUp, Menu } from 'lucide-react';
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
  isScheduleDayExpanded,
  toggleScheduleDayExpanded,
  formatScheduleValue,
  formatHour,
  getTempScaleColor,
  SCHEDULE_COLORS,
  setSchedulePeriodValue,
  adjustScheduleTemp,
  removeSchedulePeriod,
  addSchedulePeriod,
  getDayPeriods,
  renderBottomNav,
  menuOpen,
  setMenuOpen,
  toggleTheme,
  theme,
  onLogout,
}) {
  return (
    <main className="mx-auto flex h-[var(--app-height)] max-w-5xl flex-col overflow-hidden px-4 pt-[calc(env(safe-area-inset-top)+1rem)] md:pt-8">
      <header className="sticky top-0 z-10 mb-3 shrink-0 pb-2">
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
      </header>

      <div ref={scheduleScrollerRef} className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain pb-4">
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
              : getZoneSchedule(scheduleZoneId).map((day, dayIdx) => (
              <Card key={day.day} className="border border-slate-200/90">
                <button
                  type="button"
                  className="flex w-full items-center justify-between"
                  onClick={() => toggleScheduleDayExpanded(scheduleZoneId, dayIdx)}
                  aria-expanded={isScheduleDayExpanded(scheduleZoneId, dayIdx)}
                >
                  <h3 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{day.day}</h3>
                  <ChevronUp
                    className={`h-5 w-5 text-slate-400 dark:text-slate-300 transition-transform ${
                      isScheduleDayExpanded(scheduleZoneId, dayIdx) ? 'rotate-0' : 'rotate-180'
                    }`}
                  />
                </button>

                {!isScheduleDayExpanded(scheduleZoneId, dayIdx) ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {day.periods
                      .slice()
                      .sort((a, b) => a.start - b.start)
                      .map((period, idx) => (
                        <div
                          key={idx}
                          className={scheduleIsBinary ? (Number(period.temp) >= 0.5 ? 'rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700' : 'rounded-full border border-slate-200 bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600') : 'rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600'}
                        >
                          {formatScheduleValue(period, scheduleIsBinary)} → {formatHour(period.end)}
                        </div>
                      ))}
                  </div>
                ) : null}

                {isScheduleDayExpanded(scheduleZoneId, dayIdx) ? (
                  <>
                    <div className="mt-3 grid gap-3">
                      {day.periods
                        .slice()
                        .sort((a, b) => a.start - b.start)
                        .map((period, idx) => {
                          const color = SCHEDULE_COLORS[period.colorIndex % SCHEDULE_COLORS.length];
                          const startPct = (period.start / 24) * 100;
                          const widthPct = ((period.end - period.start) / 24) * 100;
                          const endLabel = formatHour(period.end);
                          const labelCenterPct = startPct + widthPct / 2;
                          const clampedLabelCenterPct = Math.max(18, Math.min(82, labelCenterPct));
                          const barColor = scheduleIsBinary ? (Number(period.temp) >= 0.5 ? '#22c55e' : '#94a3b8') : getTempScaleColor(period.temp);
                          return (
                            <div key={idx}>
                              <div className="relative mb-1 h-7">
                                <div
                                  className={`absolute top-0 text-center text-sm font-semibold whitespace-nowrap ${color.text} dark:text-slate-200`}
                                  style={{ left: `${clampedLabelCenterPct}%`, transform: 'translateX(-50%)' }}
                                >
                                  {formatScheduleValue(period, scheduleIsBinary)} <span className="text-xs font-medium text-slate-500 dark:text-slate-300">→ {endLabel}</span>
                                </div>
                              </div>
                              <div className="h-3 rounded-full bg-slate-100">
                                <div
                                  className="h-3 rounded-full"
                                  style={{ backgroundColor: barColor, marginLeft: `${startPct}%`, width: `${widthPct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                    </div>

                    <button
                      type="button"
                      className="mt-4 w-full rounded-xl border border-slate-200 px-4 py-3 text-base font-semibold text-emerald-600"
                      onClick={() => setScheduleDayIndex(dayIdx)}
                    >
                      Edit day
                    </button>
                  </>
                ) : null}
              </Card>
            ))}
          </section>
        ) : (
          <section className="grid gap-3 pb-2">
            <Card className="py-3">
              <div className="mb-2 flex items-center justify-between text-sm text-muted">
                <span>{dayName}</span>
                <span>24h timeline</span>
              </div>

              <div className="mt-1">
                <div className="relative flex h-12 overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800/80">
                  {getDayPeriods(scheduleZoneId, scheduleDayIndex)
                    .slice()
                    .sort((a, b) => a.start - b.start)
                    .map((period, idx) => {
                      const barColor = scheduleIsBinary ? (Number(period.temp) >= 0.5 ? '#22c55e' : '#94a3b8') : getTempScaleColor(period.temp);
                      const widthPercent = ((period.end - period.start) / 24) * 100;
                      return (
                        <div
                          key={idx}
                          className="flex items-center justify-center text-sm font-bold text-white"
                          style={{ width: `${widthPercent}%`, backgroundColor: barColor }}
                        >
                          {formatScheduleValue(period, scheduleIsBinary)}
                        </div>
                      );
                    })}
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

            {getDayPeriods(scheduleZoneId, scheduleDayIndex)
              .slice()
              .sort((a, b) => a.start - b.start)
              .map((period, idx) => {
                const color = SCHEDULE_COLORS[period.colorIndex % SCHEDULE_COLORS.length];
                const barColor = scheduleIsBinary ? (Number(period.temp) >= 0.5 ? '#22c55e' : '#94a3b8') : getTempScaleColor(period.temp);
                return (
                  <Card key={`${period.start}-${period.end}-${idx}`} className={`${color.bg}`}>
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-1.5 rounded-full" style={{ backgroundColor: barColor }} />
                      <div className="min-w-[110px] text-base font-semibold text-slate-600 dark:text-slate-200">
                        {formatHour(period.start)} - {formatHour(period.end)}
                      </div>
                      <div className="ml-auto flex items-center gap-2">
                        {scheduleIsBinary ? (
                          <button
                            type="button"
                            className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-700"
                            onClick={() =>
                              setSchedulePeriodValue(scheduleZoneId, scheduleDayIndex, idx, Number(period.temp) >= 0.5 ? 0 : 1)
                            }
                          >
                            {Number(period.temp) >= 0.5 ? 'Set Off' : 'Set On'}
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="grid h-9 w-9 place-items-center rounded-full bg-white text-lg font-bold text-slate-500"
                              onClick={() => adjustScheduleTemp(scheduleZoneId, scheduleDayIndex, idx, -0.5)}
                            >
                              −
                            </button>
                            <div className={`min-w-[68px] text-center text-xl font-bold ${color.text}`}>
                              {formatScheduleValue(period, scheduleIsBinary)}
                            </div>
                            <button
                              type="button"
                              className="grid h-9 w-9 place-items-center rounded-full bg-white text-lg font-bold text-slate-500"
                              onClick={() => adjustScheduleTemp(scheduleZoneId, scheduleDayIndex, idx, 0.5)}
                            >
                              +
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          className="ml-1 grid h-9 w-9 place-items-center rounded-full bg-white text-base font-bold text-slate-400"
                          onClick={() => removeSchedulePeriod(scheduleZoneId, scheduleDayIndex, idx)}
                          aria-label="Delete period"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  </Card>
                );
              })}

            <Button variant="outline" onClick={() => addSchedulePeriod(scheduleZoneId, scheduleDayIndex)}>
              + Add period
            </Button>
          </section>
        )}
      </div>

      {renderBottomNav()}

      <AppMenuDrawer
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
        toggleTheme={toggleTheme}
        theme={theme}
        onLogout={onLogout}
      />
    </main>
  );
}
