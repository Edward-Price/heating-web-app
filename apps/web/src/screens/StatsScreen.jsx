import { Menu } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import AppMenuDrawer from '../components/layout/AppMenuDrawer';

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
}) {
  const statsPullProgress = Math.min(1, statsPullDistance / 56);
  const statsRingRadius = 10;
  const statsRingCircumference = 2 * Math.PI * statsRingRadius;
  const statsRingDashOffset = statsRingCircumference * (1 - statsPullProgress);

  return (
    <main className="mx-auto flex h-full min-h-[100svh] max-w-5xl flex-col overflow-hidden p-4 md:p-8">
      <header className="sticky top-0 z-10 mb-3 shrink-0 pb-2">
        <div className="mb-1 flex items-center justify-between">
          <Button size="icon" variant="outline" onClick={() => setMenuOpen(true)}><Menu className="h-5 w-5" /></Button>
        </div>
      </header>

      <div
        ref={statsContentRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain pb-4"
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
                  stroke="#cbd5e1"
                  strokeWidth="2"
                />
                <circle
                  cx="12"
                  cy="12"
                  r={statsRingRadius}
                  fill="none"
                  stroke="#475569"
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
          className="grid gap-3 pb-2"
          style={{ transform: `translateY(${statsPullDistance}px)`, transition: statsPullDistance === 0 ? 'transform 140ms ease' : 'none' }}
        >
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
            const targetAreaPath = buildSeriesAreaPath(targetCoords, graphAreaBaselineY);
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
              <Card key={zone.id} className="overflow-hidden">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-lg font-semibold text-foreground">{zone.name}</h3>
                  <div className="flex items-center gap-2">
                    <div className="inline-flex rounded-full bg-slate-100 p-1 dark:bg-slate-800">
                      <button
                        type="button"
                        className={
                          config.range === 'day'
                            ? 'rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow dark:bg-slate-700 dark:text-slate-100'
                            : 'rounded-full px-3 py-1 text-xs font-semibold text-slate-500 dark:text-slate-300'
                        }
                        onClick={() => setZoneStatsRange(zone.id, 'day')}
                      >
                        Day
                      </button>
                      <button
                        type="button"
                        className={
                          config.range === 'month'
                            ? 'rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow dark:bg-slate-700 dark:text-slate-100'
                            : 'rounded-full px-3 py-1 text-xs font-semibold text-slate-500 dark:text-slate-300'
                        }
                        onClick={() => setZoneStatsRange(zone.id, 'month')}
                      >
                        Month
                      </button>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => shiftZoneStats(zone.id, -1)}>‹</Button>
                    <Button size="sm" variant="outline" onClick={() => shiftZoneStats(zone.id, 1)}>›</Button>
                  </div>
                </div>

                <div className="mt-3 rounded-xl bg-slate-50/85 p-2 dark:bg-slate-900/50">
                  <div className="grid grid-cols-[auto,1fr] items-stretch gap-x-2">
                    <div className="flex h-full flex-col items-end justify-between py-1 text-[11px] text-slate-500 dark:text-slate-400">
                      <span>{`${axisTopLabel}°`}</span>
                      <span>{`${axisMidLabel}°`}</span>
                      <span>{`${axisBottomLabel}°`}</span>
                    </div>
                    <div>
                      <div
                      className="w-full"
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
                        {targetAreaPath ? <path d={targetAreaPath} fill="rgba(139,92,246,0.2)" stroke="none" /> : null}
                        {currentAreaPath ? <path d={currentAreaPath} fill="rgba(6,182,212,0.2)" stroke="none" /> : null}
                        {targetPath ? <path d={targetPath} fill="none" stroke="#8b5cf6" strokeWidth="3" /> : null}
                        {currentPath ? <path d={currentPath} fill="none" stroke="#06b6d4" strokeWidth="3" /> : null}
                        {targetCoords.map((pt, idx) => (
                          <circle key={`target-dot-${idx}`} cx={pt.x} cy={pt.y} r="3.2" fill="#8b5cf6" />
                        ))}
                        {currentCoords.map((pt, idx) => (
                          <circle key={`current-dot-${idx}`} cx={pt.x} cy={pt.y} r="3.2" fill="#06b6d4" />
                        ))}
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
                            fill="#8b5cf6"
                            stroke="white"
                            strokeWidth="1.5"
                          />
                        ) : null}
                        {hoveredPoint && Number.isFinite(hoveredPoint.currentTemp) ? (
                          <circle
                            cx={hoverX}
                            cy={2 + (1 - (hoveredPoint.currentTemp - minVal) / Math.max(0.01, maxVal - minVal)) * (graphH - 4)}
                            r="4.5"
                            fill="#06b6d4"
                            stroke="white"
                            strokeWidth="1.5"
                          />
                        ) : null}
                      </svg>
                    </div>
                      <div className="mt-1 flex items-center justify-between px-1 text-[11px] text-slate-500 dark:text-slate-400">
                        <span>{formatStatsAxisLabel(firstTs, config.range)}</span>
                        <span>{formatStatsAxisLabel(midTs, config.range)}</span>
                        <span>{formatStatsAxisLabel(lastTs, config.range)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-4 text-xs">
                  <div className="flex items-center gap-4 text-xs">
                    <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300">
                      <span className="h-2.5 w-2.5 rounded-full bg-cyan-500" />
                      Current
                    </span>
                    <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300">
                      <span className="h-2.5 w-2.5 rounded-full bg-violet-500" />
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

                {isLoading ? <p className="mt-1 text-xs text-muted">Loading samples…</p> : null}
              </Card>
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
      />
    </main>
  );
}
