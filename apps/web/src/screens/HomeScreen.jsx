import { Flame, Menu, Snowflake } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import HeatingSystemOverview from '../components/heating/HeatingSystemOverview';
import AppMenuDrawer from '../components/layout/AppMenuDrawer';

export default function HomeScreen({
  selectedZone,
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
  theme,
  onLogout,
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
  zones,
  formatTemperature,
  hotWater,
  writeHotWater,
}) {
  if (selectedZone) {
    const zone = selectedZone;
    const state = zoneState(stateByDeviceId, zone.id);
    const current = typeof state.currentTemp === 'number' ? `${state.currentTemp.toFixed(1)}°` : '--.-°';
    const heating = state.heatingOn;
    const hasChange = typeof state.targetTemp === 'number' ? Math.abs(targetDraft - state.targetTemp) >= 0.01 : true;
    const minTemp = 5;
    const maxTemp = 35;
    const dialSize = 320;
    const center = dialSize / 2;
    const radius = dialSize * 0.36;
    const knobRadius = 12;
    const trackStroke = 12;
    const ringTouchTolerance = 22;
    const startAngle = 135;
    const sweepAngle = 270;
    const ratio = Math.min(1, Math.max(0, (targetDraft - minTemp) / (maxTemp - minTemp)));
    const dialAngle = startAngle + ratio * sweepAngle;
    const toPoint = (angleDeg) => {
      const angle = (angleDeg * Math.PI) / 180;
      return {
        x: center + radius * Math.cos(angle),
        y: center + radius * Math.sin(angle),
      };
    };
    const start = toPoint(startAngle);
    const end = toPoint(startAngle + sweepAngle);
    const knob = toPoint(dialAngle);
    const largeArc = dialAngle - startAngle > 180 ? 1 : 0;
    const basePath = `M ${start.x} ${start.y} A ${radius} ${radius} 0 1 1 ${end.x} ${end.y}`;
    const activePath = `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${knob.x} ${knob.y}`;
    const stepTarget = (delta) => {
      setTargetDraft((prev) => {
        const next = Math.round((prev + delta) * 2) / 2;
        return Math.max(minTemp, Math.min(maxTemp, next));
      });
    };

    const resolvePoint = (event, element) => {
      const rect = element.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const dx = x - center;
      const dy = y - center;
      const distanceFromCenter = Math.sqrt(dx * dx + dy * dy);
      const angleDeg = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
      return { distanceFromCenter, angleDeg };
    };

    const shouldStartDialDrag = (event, element) => {
      const { distanceFromCenter } = resolvePoint(event, element);
      return Math.abs(distanceFromCenter - radius) <= trackStroke + ringTouchTolerance;
    };

    const updateDialFromPointer = (event, element) => {
      const { angleDeg } = resolvePoint(event, element);
      const startA = ((startAngle % 360) + 360) % 360;
      const clockwiseDelta = (angleDeg - startA + 360) % 360;
      const clampedDelta = Math.min(sweepAngle, Math.max(0, clockwiseDelta));
      const ratioV = clampedDelta / sweepAngle;
      const next = minTemp + ratioV * (maxTemp - minTemp);
      const snapped = Math.round(next * 2) / 2;
      setTargetDraft(Math.max(minTemp, Math.min(maxTemp, snapped)));
    };

    return (
      <main className="mx-auto flex h-[100svh] max-w-5xl flex-col overflow-hidden px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-[calc(env(safe-area-inset-top)+1rem)] md:p-8">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mb-3">
            <div className="mb-2 flex items-center gap-2">
              <Button size="icon" variant="outline" onClick={() => setSelectedZoneId(null)} aria-label="Go back">‹</Button>
              <h2 className="text-3xl font-bold tracking-tight text-foreground">{zone.name}</h2>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Card className="py-3">
                <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                  <span>🌡️</span>
                  <span>Current</span>
                </div>
                <div className="text-4xl font-bold tracking-tight text-foreground">{current}</div>
              </Card>
              <Card className="py-3">
                <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                  <span>🎯</span>
                  <span>Target</span>
                </div>
                <div className="text-4xl font-bold tracking-tight text-foreground">{formatTemperature(state.targetTemp)}</div>
              </Card>
            </div>
          </div>

          <Card className="grid gap-4">
            <div className="flex flex-col items-center justify-center gap-3 py-2">
              <div className="relative grid place-items-center select-none" style={{ width: dialSize, height: dialSize }}>
                <svg
                  width={dialSize}
                  height={dialSize}
                  style={{ position: 'absolute', inset: 0, touchAction: 'none' }}
                  onPointerDown={(event) => {
                    const element = event.currentTarget;
                    if (!shouldStartDialDrag(event, element)) return;
                    dialPointerIdRef.current = event.pointerId;
                    updateDialFromPointer(event, element);
                    element.setPointerCapture?.(event.pointerId);
                  }}
                  onPointerMove={(event) => {
                    if (dialPointerIdRef.current !== event.pointerId) return;
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
                    <linearGradient id="tempDialGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#F6D365" />
                      <stop offset="55%" stopColor="#F39C12" />
                      <stop offset="100%" stopColor="#E74C3C" />
                    </linearGradient>
                  </defs>
                  <path d={basePath} fill="none" stroke="#e6ebf1" strokeWidth={trackStroke} strokeLinecap="round" />
                  <path d={activePath} fill="none" stroke="url(#tempDialGradient)" strokeWidth={trackStroke} strokeLinecap="round" />
                  <circle cx={knob.x} cy={knob.y} r={knobRadius} fill="#ffffff" stroke="#635bff" strokeWidth="3" />
                </svg>
                <div className="pointer-events-none absolute inset-0 grid place-items-center">
                  <div className="grid place-items-center gap-3 text-center">
                    <button
                      type="button"
                      className="pointer-events-auto grid h-11 w-11 place-items-center rounded-full border border-border bg-white text-2xl font-semibold leading-none text-foreground"
                      onClick={() => stepTarget(0.5)}
                      aria-label="Increase target temperature"
                    >
                      +
                    </button>
                    <div className="text-5xl font-bold tracking-tight text-foreground">{targetDraft.toFixed(1)}°</div>
                    <button
                      type="button"
                      className="pointer-events-auto grid h-11 w-11 place-items-center rounded-full border border-border bg-white text-2xl font-semibold leading-none text-foreground"
                      onClick={() => stepTarget(-0.5)}
                      aria-label="Decrease target temperature"
                    >
                      −
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-center">
              <div className="flex items-center gap-2 rounded-full border border-border bg-white px-4 py-2 text-sm font-semibold text-foreground dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100">
                {heating ? <Flame className="h-4 w-4 text-rose-500" /> : <Snowflake className="h-4 w-4 text-sky-500" />}
                {heating ? 'Heating' : 'Idle'}
              </div>
            </div>
          </Card>

          <div className="mt-4">
            <button
              type="button"
              onClick={() => writeTarget(zone.id, targetDraft)}
              disabled={!hasChange}
              className="h-12 w-full rounded-md bg-gradient-to-r from-[#6D5BFF] to-[#9B6BFF] text-base font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {status.toLowerCase().includes('setting') ? 'Setting...' : 'Set temperature'}
            </button>
          </div>
          <p className="mt-3 text-sm text-muted">{status}</p>
        </div>

        {renderBottomNav()}
      </main>
    );
  }

  return (
    <main className="mx-auto flex h-[100svh] max-w-5xl flex-col overflow-hidden px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-[calc(env(safe-area-inset-top)+1rem)] md:p-8">
      <header className="sticky top-0 z-10 mb-3 shrink-0 pb-2">
        <div className="mb-1 flex items-center justify-between">
          <Button size="icon" variant="outline" onClick={() => setMenuOpen(true)}><Menu className="h-5 w-5" /></Button>
          <div className="flex items-center gap-2 text-sm text-muted">
            <span className={`h-2 w-2 rounded-full ${connection.dotClass}`} />
            <span>{connection.label}</span>
          </div>
        </div>
      </header>

      <div
        ref={contentRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain"
        onTouchStart={onContentTouchStart}
        onTouchMove={onContentTouchMove}
        onTouchEnd={onContentTouchEnd}
        onTouchCancel={onContentTouchEnd}
      >
        {pullDistance > 0 || isRefreshing ? (
          <div className="flex justify-center" style={{ height: 36 }}>
            <div className="mt-1.5 h-6 w-6">
              <svg viewBox="0 0 24 24" className={isRefreshing ? 'h-6 w-6 animate-spin' : 'h-6 w-6'} aria-hidden="true">
                <circle cx="12" cy="12" r={ringRadius} fill="none" stroke="#cbd5e1" strokeWidth="2" />
                <circle
                  cx="12"
                  cy="12"
                  r={ringRadius}
                  fill="none"
                  stroke="#475569"
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

        <div style={{ transform: `translateY(${pullDistance}px)`, transition: pullDistance === 0 ? 'transform 140ms ease' : 'none' }}>
          {status ? (
            <p className={`mb-3 text-sm ${isErrorStatus ? 'text-rose-600' : 'text-muted'}`}>{status}</p>
          ) : null}

          {isDashboardLoading ? (
            <section className="mb-3 grid gap-3 md:grid-cols-2">
              {[1, 2, 3].map((idx) => (
                <Card key={`zone-loading-${idx}`} className="animate-pulse">
                  <div className="flex items-center justify-between gap-3">
                    <div className="h-6 w-36 rounded bg-slate-200 dark:bg-slate-700" />
                    <div className="h-10 w-20 rounded bg-slate-200 dark:bg-slate-700" />
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <div className="h-7 w-24 rounded-full bg-slate-200 dark:bg-slate-700" />
                    <div className="h-5 w-20 rounded bg-slate-200 dark:bg-slate-700" />
                  </div>
                  <div className="mt-2 h-4 w-40 rounded bg-slate-200 dark:bg-slate-700" />
                </Card>
              ))}
              <p className="col-span-full text-center text-sm text-muted">Loading zones…</p>
            </section>
          ) : (
            <>
              <HeatingSystemOverview zones={zones} hotWater={hotWater} stateByDeviceId={stateByDeviceId} />
              <section className="mb-3 grid gap-3 md:grid-cols-2">
                {zones.map((zone) => {
                  const state = zoneState(stateByDeviceId, zone.id);
                  const heatingOn = Boolean(state.heatingOn);
                  const showLoading = !state || typeof state.currentTemp !== 'number' || typeof state.targetTemp !== 'number';
                  return (
                    <Card
                      key={zone.id}
                      className="cursor-pointer"
                      onClick={() => {
                        setSelectedZoneId(zone.id);
                        setTargetDraft(typeof state.targetTemp === 'number' ? state.targetTemp : 20);
                      }}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-lg font-semibold text-foreground">{zone.name}</h3>
                        <div className="text-4xl font-bold tracking-tight text-foreground">
                          {showLoading ? '--.-°' : formatTemperature(state.currentTemp)}
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-2">
                        <div className="rounded-md bg-gradient-to-r from-[#6D5BFF] to-[#9B6BFF] px-3 py-1.5 text-xs font-bold text-white">
                          {showLoading ? 'Target --.-°' : `Target ${formatTemperature(state.targetTemp)}`}
                        </div>
                        <div className="flex items-center gap-1.5 text-sm text-muted">
                          {heatingOn ? <Flame className="h-4 w-4 text-rose-500" /> : <Snowflake className="h-4 w-4 text-sky-500" />}
                          <span>{showLoading ? 'Loading…' : heatingOn ? 'Heating' : 'Idle'}</span>
                        </div>
                      </div>

                      {showLoading ? (
                        <p className="mt-2 text-xs font-semibold text-muted">Fetching latest zone state…</p>
                      ) : null}
                    </Card>
                  );
                })}
              </section>
            </>
          )}

          {hotWater && (
            <Card>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-lg font-semibold text-foreground">{hotWater.name || 'Hot Water'}</h3>
                <div className="flex items-center gap-1.5 text-sm text-muted">
                  <span className={`h-2 w-2 rounded-full ${zoneState(stateByDeviceId, hotWater.id).hotWaterOn ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                  <span>{zoneState(stateByDeviceId, hotWater.id).hotWaterOn ? 'On' : 'Off'}</span>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <Button
                  onClick={() => writeHotWater(hotWater.id, 60)}
                  className="bg-gradient-to-r from-[#FF8F1F] to-[#FF6A3D] text-white shadow-sm hover:brightness-110 hover:shadow-md"
                >
                  Boost 1h
                </Button>
                <Button
                  onClick={() => writeHotWater(hotWater.id, 120)}
                  className="bg-gradient-to-r from-[#FF8F1F] to-[#FF6A3D] text-white shadow-sm hover:brightness-110 hover:shadow-md"
                >
                  Boost 2h
                </Button>
                <Button variant="outline" onClick={() => writeHotWater(hotWater.id, 0)}>Off</Button>
              </div>
            </Card>
          )}
        </div>
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
