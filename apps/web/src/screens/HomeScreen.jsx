import { useEffect, useState } from 'react';
import { BedDouble, CalendarClock, CalendarDays, ChevronRight, Droplet, Flame, Minus, Plus, Sofa, Thermometer } from 'lucide-react';
import AppMenuDrawer from '../components/layout/AppMenuDrawer';
import ScreenHeader from '../components/layout/ScreenHeader';
import { boostProgress, formatRefreshAge } from '../lib/refreshStatus';
import { IconBadge, SectionCard } from '../components/ui/surface';
import { formatHour, formatScheduleChangeDay, getNextScheduleChange } from '../lib/scheduleUtils';

const MIN_TEMP = 5;
const MAX_TEMP = 35;
const DIAL_SIZE = 280;
const DIAL_START_ANGLE = 135;
const DIAL_SWEEP = 270;

function clampTemp(value) {
  return Math.max(MIN_TEMP, Math.min(MAX_TEMP, Math.round(value * 2) / 2));
}

function pickZoneIcon(zone) {
  const name = String(zone && zone.name ? zone.name : '').toLowerCase();
  if (name.includes('upstairs') || name.includes('up stair') || name.includes('first floor') || name.includes('bed')) return BedDouble;
  if (name.includes('downstairs') || name.includes('down stair') || name.includes('ground floor') || name.includes('living')) return Sofa;
  return Thermometer;
}

function TemperatureDial({ zoneName, targetDraft, setTargetDraft, currentTemp, heatingOn, dialPointerIdRef, formatTemperature, isLoading = false }) {
  const center = DIAL_SIZE / 2;
  const radius = DIAL_SIZE * 0.4;
  const trackStroke = 14;
  const ringTouchTolerance = 22;
  const ratio = Math.min(1, Math.max(0, (targetDraft - MIN_TEMP) / (MAX_TEMP - MIN_TEMP)));
  const dialAngle = DIAL_START_ANGLE + ratio * DIAL_SWEEP;
  const toPoint = (angleDeg) => {
    const angle = (angleDeg * Math.PI) / 180;
    return { x: center + radius * Math.cos(angle), y: center + radius * Math.sin(angle) };
  };
  const start = toPoint(DIAL_START_ANGLE);
  const end = toPoint(DIAL_START_ANGLE + DIAL_SWEEP);
  const knob = toPoint(dialAngle);
  const largeArc = dialAngle - DIAL_START_ANGLE > 180 ? 1 : 0;
  const basePath = `M ${start.x} ${start.y} A ${radius} ${radius} 0 1 1 ${end.x} ${end.y}`;
  const activePath = `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${knob.x} ${knob.y}`;

  // The SVG is scaled with CSS on narrow screens, so convert pointer positions back into viewBox units.
  const resolvePoint = (event, element) => {
    const rect = element.getBoundingClientRect();
    const scale = rect.width > 0 ? DIAL_SIZE / rect.width : 1;
    const dx = (event.clientX - rect.left) * scale - center;
    const dy = (event.clientY - rect.top) * scale - center;
    return {
      distanceFromCenter: Math.sqrt(dx * dx + dy * dy),
      angleDeg: ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360,
    };
  };

  const updateDialFromPointer = (event, element) => {
    const { angleDeg } = resolvePoint(event, element);
    const startA = ((DIAL_START_ANGLE % 360) + 360) % 360;
    const clockwiseDelta = (angleDeg - startA + 360) % 360;
    const clampedDelta = Math.min(DIAL_SWEEP, Math.max(0, clockwiseDelta));
    setTargetDraft(clampTemp(MIN_TEMP + (clampedDelta / DIAL_SWEEP) * (MAX_TEMP - MIN_TEMP)));
  };

  const stepTarget = (delta) => setTargetDraft((prev) => clampTemp(prev + delta));
  const stepButtonClass =
    'grid h-14 w-14 place-items-center rounded-full bg-white text-orange-500 shadow-[0_8px_24px_rgba(249,115,22,0.18)] transition active:scale-95 dark:bg-slate-800';

  return (
    <div className="relative mx-auto flex w-full max-w-sm items-center justify-center">
      <button type="button" disabled={isLoading} className={`${stepButtonClass} disabled:opacity-40 absolute left-0 top-1/2 z-10 -translate-y-1/2`} onClick={() => stepTarget(-0.5)} aria-label="Decrease target temperature">
        <Minus className="h-6 w-6" strokeWidth={2.5} />
      </button>

      <div className="relative aspect-square w-[min(280px,68vw)] select-none" data-no-pull-refresh>
        <svg
          viewBox={`0 0 ${DIAL_SIZE} ${DIAL_SIZE}`}
          className="absolute inset-0 h-full w-full"
          style={{ touchAction: 'none' }}
          onPointerDown={(event) => {
            if (isLoading) return;
            const element = event.currentTarget;
            const { distanceFromCenter } = resolvePoint(event, element);
            if (Math.abs(distanceFromCenter - radius) > trackStroke + ringTouchTolerance) return;
            dialPointerIdRef.current = event.pointerId;
            updateDialFromPointer(event, element);
            element.setPointerCapture?.(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (isLoading || dialPointerIdRef.current !== event.pointerId) return;
            updateDialFromPointer(event, event.currentTarget);
          }}
          onPointerUp={(event) => {
            if (dialPointerIdRef.current !== event.pointerId) return;
            dialPointerIdRef.current = null;
            event.currentTarget.releasePointerCapture?.(event.pointerId);
          }}
          onPointerCancel={(event) => {
            if (dialPointerIdRef.current !== event.pointerId) return;
            dialPointerIdRef.current = null;
            event.currentTarget.releasePointerCapture?.(event.pointerId);
          }}
        >
          <defs>
            <linearGradient id="homeDialGradient" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#FB923C" />
              <stop offset="100%" stopColor="#EA580C" />
            </linearGradient>
            <radialGradient id="homeDialGlow" cx="50%" cy="50%" r="50%">
              <stop offset="60%" stopColor="#FFEDD5" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#FFEDD5" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx={center} cy={center} r={radius + 26} fill="url(#homeDialGlow)" className="dark:opacity-10" />
          <path d={basePath} fill="none" className="stroke-slate-200 dark:stroke-slate-700" strokeWidth={trackStroke} strokeLinecap="round" />
          {!isLoading ? (
            <>
              <path d={activePath} fill="none" stroke="url(#homeDialGradient)" strokeWidth={trackStroke} strokeLinecap="round" />
              <circle cx={knob.x} cy={knob.y} r={13} fill="#ffffff" stroke="#F97316" strokeWidth="5" />
            </>
          ) : null}
        </svg>

        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="grid place-items-center text-center">
            <span className="text-sm font-medium text-muted">{zoneName}</span>
            <span className="mt-1 text-6xl font-bold tracking-tight text-foreground">{isLoading ? '--.-' : targetDraft.toFixed(1)}°</span>
            <span className={`mt-2 flex items-center gap-1.5 text-base font-semibold ${heatingOn ? 'text-orange-500' : 'text-muted'}`}>
              {!isLoading && heatingOn ? <Flame className="h-4 w-4" fill="currentColor" /> : null}
              {isLoading ? 'Loading…' : heatingOn ? 'Heating On' : 'Idle'}
            </span>
            <span className="mt-0.5 text-sm text-muted">Currently {formatTemperature(currentTemp)}</span>
          </div>
        </div>
      </div>

      <button type="button" disabled={isLoading} className={`${stepButtonClass} disabled:opacity-40 absolute right-0 top-1/2 z-10 -translate-y-1/2`} onClick={() => stepTarget(0.5)} aria-label="Increase target temperature">
        <Plus className="h-6 w-6" strokeWidth={2.5} />
      </button>
    </div>
  );
}

export default function HomeScreen({
  selectedZone,
  systemName,
  scheduleWeekByZone,
  zoneState,
  stateByDeviceId,
  targetDraft,
  setTargetDraft,
  setSelectedZoneId,
  status,
  writeTarget,
  renderBottomNav,
  dialPointerIdRef,
  connection,
  menuOpen,
  setMenuOpen,
  toggleTheme,
  debugLayoutEnabled,
  toggleDebugLayout,
  theme,
  onLogout,
  onChangeSystem,
  contentRef,
  onContentTouchStart,
  onContentTouchMove,
  onContentTouchEnd,
  pullDistance,
  isRefreshing,
  ringRadius,
  ringCircumference,
  ringDashOffset,
  isErrorStatus,
  isDashboardLoading,
  onRetryLoad,
  zones,
  formatTemperature,
  hotWater,
  writeHotWater,
  lastRefreshedAt,
  hotWaterBoost,
  onOpenZoneSchedule,
}) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const update = () => setNow(Date.now());
    const timer = window.setInterval(update, 15000);
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  const waterProgress = boostProgress(hotWaterBoost, Math.max(now, hotWaterBoost?.startedAt || 0));
  const dialZone = selectedZone || zones[0] || null;
  const dialState = dialZone ? zoneState(stateByDeviceId, dialZone.id) : {};
  const dialTarget = typeof dialState.targetTemp === 'number' ? dialState.targetTemp : null;

  // Keep the dial in step with the zone's real target whenever the zone changes or fresh state arrives.
  useEffect(() => {
    if (dialTarget !== null) setTargetDraft(dialTarget);
  }, [dialZone?.id, dialTarget, setTargetDraft]);

  const hasChange = dialTarget !== null && Math.abs(targetDraft - dialTarget) >= 0.01;
  const isSetting = status.toLowerCase().includes('setting');
  const anyHeating = zones.some((zone) => Boolean(zoneState(stateByDeviceId, zone.id).heatingOn));
  const hotWaterOn = hotWater ? Boolean(zoneState(stateByDeviceId, hotWater.id).hotWaterOn) : false;
  const nextChange = dialZone ? getNextScheduleChange(scheduleWeekByZone[String(dialZone.id)]) : null;
  const scheduleLoaded = dialZone ? Boolean(scheduleWeekByZone[String(dialZone.id)]) : false;
  const zoneCountLabel = `${zones.length} ${zones.length === 1 ? 'zone' : 'zones'}`;

  return (
    <main className="mx-auto flex h-[100lvh] max-w-5xl flex-col overflow-hidden px-4 md:px-8">
      <div
        ref={contentRef}
        className="-mx-4 min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain px-4 pb-40 pt-[calc(env(safe-area-inset-top)+1rem)] md:mx-0 md:px-0"
        onTouchStart={(event) => {
          // Dragging the dial ring shouldn't double as pull-to-refresh.
          if (event.target.closest?.('[data-no-pull-refresh]')) return;
          onContentTouchStart(event);
        }}
        onTouchMove={onContentTouchMove}
        onTouchEnd={onContentTouchEnd}
        onTouchCancel={onContentTouchEnd}
      >
        {pullDistance > 0 || isRefreshing ? (
          <div className="flex justify-center" style={{ height: 36 }}>
            <div className="mt-1.5 h-6 w-6">
              <svg viewBox="0 0 24 24" className={isRefreshing ? 'h-6 w-6 animate-spin' : 'h-6 w-6'} aria-hidden="true">
                <circle cx="12" cy="12" r={ringRadius} fill="none" stroke="#fed7aa" strokeWidth="2" />
                <circle
                  cx="12"
                  cy="12"
                  r={ringRadius}
                  fill="none"
                  stroke="#f97316"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  transform="rotate(-90 12 12)"
                  strokeDasharray={ringCircumference}
                  strokeDashoffset={isRefreshing ? ringCircumference * 0.2 : ringDashOffset}
                  style={{ transition: isRefreshing ? 'none' : 'stroke-dashoffset 80ms linear' }}
                />
              </svg>
            </div>
          </div>
        ) : null}

        <div
          className="mx-auto grid max-w-xl gap-3"
          style={{ transform: `translateY(${pullDistance}px)`, transition: pullDistance === 0 ? 'transform 140ms ease' : 'none' }}
        >
          <ScreenHeader
            title={systemName}
            subtitle={isDashboardLoading ? 'Loading…' : `${zoneCountLabel} · ${anyHeating ? 'Heating active' : 'Idle'}`}
            onOpenMenu={() => setMenuOpen(true)}
            right={
              <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/80 px-3 py-1.5 text-xs font-medium text-muted shadow-sm dark:bg-slate-800">
                <span className={`h-2 w-2 rounded-full ${connection.dotClass}`} />
                <span>{connection.label}</span>
              </div>
            }
          />

          <p className="-mt-1 text-xs text-muted" title={lastRefreshedAt ? new Date(lastRefreshedAt).toLocaleString() : undefined}>
            {formatRefreshAge(lastRefreshedAt, now)}
          </p>

          {status ? (
            <div className="grid justify-items-start gap-2">
              <p role={isErrorStatus ? 'alert' : 'status'} className={`text-sm ${isErrorStatus ? 'text-rose-600' : 'text-muted'}`}>{status}</p>
              {isErrorStatus ? (
                <button type="button" onClick={onRetryLoad} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold dark:border-slate-600">Try again</button>
              ) : null}
            </div>
          ) : null}

          <section className="py-2">
            <TemperatureDial
              zoneName={dialZone?.name || 'Temperature'}
              targetDraft={targetDraft}
              setTargetDraft={setTargetDraft}
              currentTemp={dialState.currentTemp}
              heatingOn={Boolean(dialState.heatingOn)}
              dialPointerIdRef={dialPointerIdRef}
              formatTemperature={formatTemperature}
              isLoading={dialTarget === null}
            />
            {dialZone && (hasChange || isSetting) ? (
            <div className="mt-2 flex justify-center gap-2">
              <button
                type="button"
                onClick={() => setTargetDraft(dialTarget)}
                disabled={isSetting}
                className="h-11 rounded-full px-5 text-sm font-semibold text-muted disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => writeTarget(dialZone.id, targetDraft)}
                disabled={!hasChange || isSetting}
                className="h-11 rounded-full bg-gradient-to-r from-orange-400 to-orange-600 px-6 text-sm font-bold text-white shadow-md shadow-orange-500/25 disabled:opacity-60"
              >
                {isSetting ? 'Setting…' : `Set to ${targetDraft.toFixed(1)}°`}
              </button>
            </div>
            ) : null}
          </section>

          {isDashboardLoading ? (
            <section className="grid gap-3">
              <div className="grid grid-cols-3 gap-3">
                {[1, 2, 3].map((idx) => (
                  <div key={`zone-loading-${idx}`} className="h-28 animate-pulse rounded-2xl bg-slate-200/70 dark:bg-slate-800" />
                ))}
              </div>
              <p className="text-center text-sm text-muted">Loading zones…</p>
            </section>
          ) : (
            <>
              <section className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
                {zones.map((zone) => {
                  const state = zoneState(stateByDeviceId, zone.id);
                  const heatingOn = Boolean(state.heatingOn);
                  const selected = dialZone && Number(dialZone.id) === Number(zone.id);
                  const ZoneIcon = pickZoneIcon(zone);
                  return (
                    <button
                      key={zone.id}
                      type="button"
                      onClick={() => setSelectedZoneId(zone.id)}
                      aria-pressed={selected}
                      className={`min-w-[calc((100%-1.5rem)/3)] flex-1 shrink-0 snap-start rounded-2xl border p-3 text-left transition ${
                        selected
                          ? 'border-orange-400 bg-orange-50/80 dark:border-orange-500 dark:bg-orange-500/10'
                          : 'border-white/70 bg-white/90 shadow-[0_6px_20px_rgba(10,37,64,0.05)] dark:border-slate-700 dark:bg-slate-900'
                      }`}
                    >
                      <div className="grid gap-2">
                        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${selected ? 'bg-orange-100 text-orange-500 dark:bg-orange-500/20' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                          <ZoneIcon className="h-4 w-4" />
                        </span>
                        <span className="block truncate text-sm font-medium text-foreground">{zone.name}</span>
                      </div>
                      <div className="mt-2 text-2xl font-bold tracking-tight text-foreground">{formatTemperature(state.currentTemp)}</div>
                      <div className={`mt-1 flex items-center gap-1 text-sm font-medium ${heatingOn ? 'text-orange-500' : 'text-muted'}`}>
                        {heatingOn ? <Flame className="h-3.5 w-3.5" fill="currentColor" /> : null}
                        <span className="truncate">{heatingOn ? 'Heating' : `Set ${formatTemperature(state.targetTemp)}`}</span>
                      </div>
                    </button>
                  );
                })}

                {hotWater ? (
                  <div className="min-w-[calc((100%-1.5rem)/3)] flex-1 shrink-0 snap-start rounded-2xl border border-white/70 bg-white/90 p-3 shadow-[0_6px_20px_rgba(10,37,64,0.05)] dark:border-slate-700 dark:bg-slate-900">
                    <div className="grid gap-2">
                      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${hotWaterOn ? 'bg-orange-100 text-orange-500 dark:bg-orange-500/20' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                        <Droplet className="h-4 w-4" />
                      </span>
                      <span className="block truncate text-sm font-medium text-foreground">{hotWater.name || 'Hot Water'}</span>
                    </div>
                    <div className="mt-2 text-2xl font-bold tracking-tight text-foreground">{hotWaterOn ? 'On' : 'Off'}</div>
                    <div className={`mt-1 text-sm font-medium ${hotWaterOn ? 'text-orange-500' : 'text-muted'}`}>
                      {hotWaterOn ? 'Heating' : 'Idle'}
                    </div>
                  </div>
                ) : null}
              </section>

              {dialZone ? (
                <SectionCard
                  className="flex cursor-pointer items-center gap-3 py-3"
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpenZoneSchedule(dialZone.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') onOpenZoneSchedule(dialZone.id);
                  }}
                >
                  <IconBadge icon={CalendarDays} tone="slate" />
                  <span className="flex-1 text-base font-semibold text-foreground">{dialZone.name} schedule</span>
                  <ChevronRight className="h-5 w-5 text-muted" />
                </SectionCard>
              ) : null}

              {hotWater ? (
                <SectionCard className="grid gap-3">
                  <div className="flex items-center gap-3">
                    <IconBadge icon={Droplet} />
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-semibold text-foreground">Hot Water Boost</h3>
                      <p className="text-sm text-muted">{hotWaterOn ? 'Hot water is on' : 'Quickly heat your hot water'}</p>
                      {hotWaterOn && waterProgress && waterProgress.remainingMinutes > 0 ? (
                        <p className="mt-1 text-sm font-medium text-orange-600 dark:text-orange-400">
                          About {waterProgress.remainingMinutes} min left · {waterProgress.elapsedMinutes} min elapsed
                          <span className="mt-0.5 block text-xs font-normal text-muted">Based on the boost started in this browser</span>
                        </p>
                      ) : hotWaterOn ? (
                        <p className="mt-1 text-xs text-muted">Boost time remaining unavailable</p>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex gap-2 [&>button]:flex-1">
                    {hotWaterOn ? (
                      <button
                        type="button"
                        onClick={() => writeHotWater(hotWater.id, 0)}
                        className="h-10 rounded-full border border-slate-300 px-4 text-sm font-semibold text-foreground dark:border-slate-600"
                      >
                        Off
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => writeHotWater(hotWater.id, 60)}
                      className="h-10 rounded-full border-2 border-orange-400 px-4 text-sm font-semibold text-orange-600 dark:text-orange-400"
                    >
                      1 hr
                    </button>
                    <button
                      type="button"
                      onClick={() => writeHotWater(hotWater.id, 120)}
                      className="h-10 rounded-full bg-orange-50 px-4 text-sm font-semibold text-orange-600 dark:bg-orange-500/15 dark:text-orange-400"
                    >
                      2 hr
                    </button>
                  </div>
                </SectionCard>
              ) : null}

              {dialZone && (nextChange || !scheduleLoaded) ? (
                <SectionCard className="flex items-center gap-3">
                  <IconBadge icon={CalendarClock} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-muted">Next scheduled change</p>
                    {nextChange ? (
                      <>
                        <p className="text-xl font-bold tracking-tight text-foreground">
                          {formatScheduleChangeDay(nextChange)} at {formatHour(nextChange.hour)}
                        </p>
                        <p className="truncate text-sm text-muted">
                          {dialZone.name} → {formatTemperature(nextChange.temp)}
                        </p>
                      </>
                    ) : (
                      <div className="mt-1 h-6 w-40 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenZoneSchedule(dialZone.id)}
                    className="flex shrink-0 items-center gap-0.5 rounded-full bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-600 dark:bg-orange-500/15 dark:text-orange-400"
                  >
                    View
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </SectionCard>
              ) : null}
            </>
          )}
        </div>
      </div>

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
