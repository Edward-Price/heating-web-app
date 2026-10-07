import { ChevronLeft, ChevronRight } from 'lucide-react';
import AppMenuDrawer from '../components/layout/AppMenuDrawer';
import ScreenHeader from '../components/layout/ScreenHeader';
import { SectionCard, Segmented } from '../components/ui/surface';

function formatPeriodLabel(config, createStatsConfig) {
  if (config.range === 'month') {
    const [y, m] = String(config.anchor).split('-').map(Number);
    return new Date(y, (m || 1) - 1, 1).toLocaleDateString([], { month: 'long', year: 'numeric' });
  }
  const today = createStatsConfig('day').anchor;
  if (config.anchor === today) return 'Today';
  const date = new Date(`${config.anchor}T12:00:00`);
  const yesterday = new Date(`${today}T12:00:00`);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
}

function StatTile({ label, value }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
      <div className="text-xs text-muted">{label}</div>
      <div className="text-lg font-bold tabular-nums text-foreground">{value}</div>
    </div>
  );
}

export default function StatsScreen({
  zones,
  statsPullDistance,
  isStatsRefreshing,
  statsContentRef,
  onStatsTouchStart,
  onStatsTouchMove,
  onStatsTouchEnd,
  menuOpen,
  setMenuOpen,
  renderBottomNav,
  statsConfigByZone,
  createStatsConfig,
  statsSeriesByZone,
  statsLoadingByZone,
  getStatsDomainBounds,
  buildSeriesPath,
  buildSeriesCoordinates,
  buildSeriesAreaPath,
  statsHoverByZone,
  setZoneStatsRange,
  shiftZoneStats,
  setStatsHoverFromClientX,
  clearStatsHover,
  formatStatsAxisLabel,
  formatStatsTimestamp,
  toggleTheme,
  debugLayoutEnabled,
  toggleDebugLayout,
  theme,
  onLogout,
  onChangeSystem,
}) {
  const statsPullProgress = Math.min(1, statsPullDistance / 56);
  const statsRingRadius = 10;
  const statsRingCircumference = 2 * Math.PI * statsRingRadius;
  const statsRingDashOffset = statsRingCircumference * (1 - statsPullProgress);

  return (
    <main className="mx-auto flex h-[100lvh] max-w-5xl flex-col overflow-hidden px-4 md:px-8">

      <div
        ref={statsContentRef}
        className="-mx-4 min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain px-4 pb-40 pt-[calc(env(safe-area-inset-top)+1rem)] md:mx-0 md:px-0"
        onTouchStart={onStatsTouchStart}
        onTouchMove={onStatsTouchMove}
        onTouchEnd={onStatsTouchEnd}
        onTouchCancel={onStatsTouchEnd}
      >
        {statsPullDistance > 0 || isStatsRefreshing ? (
          <div className="flex justify-center" style={{ height: 36 }}>
            <div className="mt-1.5 h-6 w-6">
              <svg
                viewBox="0 0 24 24"
                className={isStatsRefreshing ? 'h-6 w-6 animate-spin' : 'h-6 w-6'}
                aria-hidden="true"
              >
                <circle
                  cx="12"
                  cy="12"
                  r={statsRingRadius}
                  fill="none"
                  stroke="#fed7aa"
                  strokeWidth="2"
                />
                <circle
                  cx="12"
                  cy="12"
                  r={statsRingRadius}
                  fill="none"
                  stroke="#f97316"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  transform="rotate(-90 12 12)"
                  strokeDasharray={statsRingCircumference}
                  strokeDashoffset={isStatsRefreshing ? statsRingCircumference * 0.2 : statsRingDashOffset}
                  style={{ transition: isStatsRefreshing ? 'none' : 'stroke-dashoffset 80ms linear' }}
                />
              </svg>
            </div>
          </div>
        ) : null}

        <section
          className="mx-auto grid max-w-xl gap-3 pb-2"
          style={{ transform: `translateY(${statsPullDistance}px)`, transition: statsPullDistance === 0 ? 'transform 140ms ease' : 'none' }}
        >
          <ScreenHeader title="Stats" subtitle="Room temperature history" onOpenMenu={() => setMenuOpen(true)} />

          {zones.map((zone) => {
            const key = String(zone.id);
            const config = statsConfigByZone[key] || createStatsConfig('day');
            const series = statsSeriesByZone[key] || { points: [] };
            const isLoading = Boolean(statsLoadingByZone[key]);
            const points = Array.isArray(series.points)
              ? series.points
                  .map((p) => ({
                    ...p,
                    ts: Number(p.ts || Date.parse(p.timestamp || '')),
                    currentTemp: Number.isFinite(Number(p.currentTemp)) ? Number(p.currentTemp) : null,
                    targetTemp: Number.isFinite(Number(p.targetTemp)) ? Number(p.targetTemp) : null,
                  }))
                  .filter((p) => Number.isFinite(p.ts))
                  .sort((a, b) => a.ts - b.ts)
              : [];

            const values = points
              .flatMap((p) => [p.currentTemp, p.targetTemp])
              .filter((n) => Number.isFinite(n));
            const saneValues = values.filter((v) => v >= 5 && v <= 35);
            const chartValues = saneValues.length ? saneValues : values;
            const valueMin = chartValues.length ? Math.min(...chartValues) : 18;
            const valueMax = chartValues.length ? Math.max(...chartValues) : 22;
            const span = valueMax - valueMin;
            const minVal = span < 0.05 ? valueMin - 0.1 : valueMin;
            const maxVal = span < 0.05 ? valueMax + 0.1 : valueMax;
            const center = (minVal + maxVal) / 2;
            const snapToHalf = (value) => Math.round(Number(value) * 2) / 2;
            const axisTopLabel = snapToHalf(maxVal).toFixed(1);
            const axisMidLabel = snapToHalf(center).toFixed(1);
            const axisBottomLabel = snapToHalf(minVal).toFixed(1);
            const graphW = 720;
            const graphH = 320;
            const graphGridTopY = 2;
            const graphGridMidY = Math.round(graphH / 2);
            const graphGridBottomY = graphH - 2;
            const graphCrosshairTopY = 2;
            const graphCrosshairBottomY = graphH - 2;
            const graphAreaBaselineY = graphH - 2;
            const { startTs: domainStartTs, endTs: domainEndTs } = getStatsDomainBounds(config, points);
            const currentPath = buildSeriesPath(
              points,
              graphW,
              graphH,
              (p) => p.currentTemp,
              minVal,
              maxVal,
              domainStartTs,
              domainEndTs
            );
            const targetPath = buildSeriesPath(
              points,
              graphW,
              graphH,
              (p) => p.targetTemp,
              minVal,
              maxVal,
              domainStartTs,
              domainEndTs
            );
            const currentCoords = buildSeriesCoordinates(
              points,
              graphW,
              graphH,
              (p) => p.currentTemp,
              minVal,
              maxVal,
              domainStartTs,
              domainEndTs
            );
            const targetCoords = buildSeriesCoordinates(
              points,
              graphW,
              graphH,
              (p) => p.targetTemp,
              minVal,
              maxVal,
              domainStartTs,
              domainEndTs
            );
            const currentAreaPath = buildSeriesAreaPath(currentCoords, graphAreaBaselineY);
            const currentValues = points.map((p) => p.currentTemp).filter((n) => Number.isFinite(n) && n >= 5 && n <= 35);
            const avgCurrent = currentValues.length ? currentValues.reduce((sum, n) => sum + n, 0) / currentValues.length : null;
            const minCurrent = currentValues.length ? Math.min(...currentValues) : null;
            const maxCurrent = currentValues.length ? Math.max(...currentValues) : null;
            const fmt = (n) => (Number.isFinite(n) ? `${n.toFixed(1)}°` : '--.-°');
            const isLatestPeriod = config.anchor === createStatsConfig(config.range).anchor;
            const gradientId = `stats-current-${key}`;
            const hoverIdxRaw = statsHoverByZone[key];
            const hoverIdx = Number.isInteger(hoverIdxRaw) ? hoverIdxRaw : null;
            const hoveredPoint = hoverIdx !== null && hoverIdx >= 0 && hoverIdx < points.length ? points[hoverIdx] : null;
            const graphLeftPad = 12;
            const graphInnerWidth = graphW - 24;
            const firstTs = domainStartTs;
            const lastTs = domainEndTs;
            const midTs = firstTs + Math.max(0, lastTs - firstTs) / 2;
            const tsSpan = Math.max(1, lastTs - firstTs);
            const hoverX = hoveredPoint && Number.isFinite(hoveredPoint.ts)
              ? graphLeftPad + ((hoveredPoint.ts - firstTs) / tsSpan) * graphInnerWidth
              : null;

            return (
              <SectionCard key={zone.id} className="overflow-hidden">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="truncate text-lg font-semibold text-foreground">{zone.name}</h3>
                  <Segmented
                    options={[{ value: 'day', label: 'Day' }, { value: 'month', label: 'Month' }]}
                    value={config.range}
                    onChange={(range) => setZoneStatsRange(zone.id, range)}
                  />
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => shiftZoneStats(zone.id, -1)}
                    aria-label="Previous period"
                    className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="text-sm font-semibold text-foreground">{formatPeriodLabel(config, createStatsConfig)}</span>
                  <button
                    type="button"
                    onClick={() => shiftZoneStats(zone.id, 1)}
                    disabled={isLatestPeriod}
                    aria-label="Next period"
                    className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-600 disabled:opacity-30 dark:bg-slate-800 dark:text-slate-300"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2">
                  <StatTile label="Average" value={fmt(avgCurrent)} />
                  <StatTile label="Lowest" value={fmt(minCurrent)} />
                  <StatTile label="Highest" value={fmt(maxCurrent)} />
                </div>

                <div className="mt-3">
                  <div className="grid grid-cols-[auto,1fr] items-stretch gap-x-2">
                    <div className="flex h-full flex-col items-end justify-between py-1 text-[11px] text-slate-500 dark:text-slate-400">
                      <span>{`${axisTopLabel}°`}</span>
                      <span>{`${axisMidLabel}°`}</span>
                      <span>{`${axisBottomLabel}°`}</span>
                    </div>
                    <div>
                      <div
                      className="relative w-full"
                      style={{ aspectRatio: `${graphW} / ${graphH}` }}
                      onMouseMove={(event) => {
                        setStatsHoverFromClientX(
                          zone.id,
                          points,
                          event.clientX,
                          event.currentTarget.getBoundingClientRect(),
                          domainStartTs,
                          domainEndTs
                        );
                      }}
                      onMouseLeave={() => clearStatsHover(zone.id)}
                      onTouchStart={(event) => {
                        event.stopPropagation();
                        const touch = event.touches[0];
                        if (!touch) return;
                        setStatsHoverFromClientX(
                          zone.id,
                          points,
                          touch.clientX,
                          event.currentTarget.getBoundingClientRect(),
                          domainStartTs,
                          domainEndTs
                        );
                      }}
                      onTouchMove={(event) => {
                        event.stopPropagation();
                        const touch = event.touches[0];
                        if (!touch) return;
                        setStatsHoverFromClientX(
                          zone.id,
                          points,
                          touch.clientX,
                          event.currentTarget.getBoundingClientRect(),
                          domainStartTs,
                          domainEndTs
                        );
                      }}
                      onTouchEnd={() => clearStatsHover(zone.id)}
                      onTouchCancel={() => clearStatsHover(zone.id)}
                    >
                      <svg viewBox={`0 0 ${graphW} ${graphH}`} className="h-full w-full text-slate-700 dark:text-slate-200">
                        <line x1="12" y1={graphGridTopY} x2="708" y2={graphGridTopY} stroke="rgba(148,163,184,0.25)" strokeWidth="1" />
                        <line x1="12" y1={graphGridMidY} x2="708" y2={graphGridMidY} stroke="rgba(148,163,184,0.2)" strokeWidth="1" />
                        <line x1="12" y1={graphGridBottomY} x2="708" y2={graphGridBottomY} stroke="rgba(148,163,184,0.25)" strokeWidth="1" />
                        <defs>
                          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#F97316" stopOpacity="0.28" />
                            <stop offset="100%" stopColor="#F97316" stopOpacity="0" />
                          </linearGradient>
                        </defs>
                        {currentAreaPath ? <path d={currentAreaPath} fill={`url(#${gradientId})`} stroke="none" /> : null}
                        {targetPath ? <path d={targetPath} fill="none" stroke="#94A3B8" strokeWidth="2.5" strokeDasharray="8 6" strokeLinejoin="round" /> : null}
                        {currentPath ? <path d={currentPath} fill="none" stroke="#F97316" strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round" /> : null}
                        {hoverX !== null ? (
                          <line
                            x1={hoverX}
                            y1={graphCrosshairTopY}
                            x2={hoverX}
                            y2={graphCrosshairBottomY}
                            stroke="rgba(100,116,139,0.8)"
                            strokeWidth="1.5"
                            strokeDasharray="3 3"
                          />
                        ) : null}
                        {hoveredPoint && Number.isFinite(hoveredPoint.targetTemp) ? (
                          <circle
                            cx={hoverX}
                            cy={2 + (1 - (hoveredPoint.targetTemp - minVal) / Math.max(0.01, maxVal - minVal)) * (graphH - 4)}
                            r="4.5"
                            fill="#94A3B8"
                            stroke="white"
                            strokeWidth="1.5"
                          />
                        ) : null}
                        {hoveredPoint && Number.isFinite(hoveredPoint.currentTemp) ? (
                          <circle
                            cx={hoverX}
                            cy={2 + (1 - (hoveredPoint.currentTemp - minVal) / Math.max(0.01, maxVal - minVal)) * (graphH - 4)}
                            r="4.5"
                            fill="#F97316"
                            stroke="white"
                            strokeWidth="1.5"
                          />
                        ) : null}
                      </svg>
                      {!isLoading && currentValues.length === 0 ? (
                        <p className="absolute inset-0 grid place-items-center text-sm text-muted">No readings recorded for this period</p>
                      ) : null}
                    </div>
                      <div className="mt-1 flex items-center justify-between px-1 text-[11px] text-slate-500 dark:text-slate-400">
                        <span>{formatStatsAxisLabel(firstTs, config.range)}</span>
                        <span>{formatStatsAxisLabel(midTs, config.range)}</span>
                        <span>{formatStatsAxisLabel(lastTs, config.range)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-4 text-xs">
                  <div className="flex items-center gap-4 text-xs">
                    <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300">
                      <span className="h-1 w-4 rounded-full bg-orange-500" />
                      Current
                    </span>
                    <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300">
                      <span className="h-0 w-4 border-t-2 border-dashed border-slate-400" />
                      Target
                    </span>
                  </div>
                </div>

                <div className="mt-1 min-h-[1rem] w-full text-xs text-muted">
                  {hoveredPoint
                    ? `${formatStatsTimestamp(hoveredPoint.ts, config.range)} • Current ${
                        Number.isFinite(hoveredPoint.currentTemp) ? `${hoveredPoint.currentTemp.toFixed(1)}°` : '--.-°'
                      } • Target ${
                        Number.isFinite(hoveredPoint.targetTemp) ? `${hoveredPoint.targetTemp.toFixed(1)}°` : '--.-°'
                      }`
                    : ''}
                </div>

                {isLoading ? <p className="mt-1 text-xs text-muted">Loading readings…</p> : null}
              </SectionCard>
            );
          })}
        </section>
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
