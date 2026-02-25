import { zoneState } from '../../lib/deviceUtils';

export default function HeatingSystemOverview({ zones, hotWater, stateByDeviceId }) {
  const displayZones = [0, 1].map((idx) => zones[idx] || null);
  const leftZone = displayZones[0];
  const rightZone = displayZones[1];
  const leftState = leftZone ? zoneState(stateByDeviceId, leftZone.id) : {};
  const rightState = rightZone ? zoneState(stateByDeviceId, rightZone.id) : {};
  const hotWaterState = hotWater ? zoneState(stateByDeviceId, hotWater.id) : {};

  const leftActive = Boolean(leftState.heatingOn);
  const rightActive = Boolean(rightState.heatingOn);
  const waterActive = Boolean(hotWaterState.hotWaterOn);
  const boilerActive = leftActive || rightActive || waterActive;

  const leftPath = 'M 288 148 L 110 148 Q 96 148 96 134 L 96 62';
  const rightPath = 'M 312 148 L 490 148 Q 504 148 504 134 L 504 62';
  const waterPath = 'M 300 168 C 300 204 300 236 300 270';
  const upstairsZoneImageSrc = '/system-graphic/upstairs-radiator-new.png';
  const downstairsZoneImageSrc = '/system-graphic/downstairs-radiator-new.png';
  const fallbackZoneImageSrc = '/system-graphic/zone-radiator.png';
  const boilerImageSrc = '/system-graphic/boiler-new.png';
  const hotWaterImageSrc = '/system-graphic/hot-water-new.png';
  const leftZoneLabel = leftZone && leftZone.name ? leftZone.name : '';
  const rightZoneLabel = rightZone && rightZone.name ? rightZone.name : '';
  const hotWaterLabel = hotWater && hotWater.name ? hotWater.name : 'Hot Water';
  const leftZoneTemp = Number.isFinite(Number(leftState.currentTemp)) ? `${Number(leftState.currentTemp).toFixed(1)}°C` : '--.-°C';
  const rightZoneTemp = Number.isFinite(Number(rightState.currentTemp)) ? `${Number(rightState.currentTemp).toFixed(1)}°C` : '--.-°C';
  const hotWaterStatusLabel = waterActive ? 'On' : 'Off';
  const leftZoneImageSrc = pickZoneImage(leftZone, upstairsZoneImageSrc, downstairsZoneImageSrc, fallbackZoneImageSrc);
  const rightZoneImageSrc = pickZoneImage(rightZone, upstairsZoneImageSrc, downstairsZoneImageSrc, fallbackZoneImageSrc);

  function renderFlowParticles(path, color, active, durationSeconds = 1.8) {
    if (!active) return null;
    return (
      <>
        <polygon points="0,-6 13,0 0,6" fill={color} opacity="0.98">
          <animateMotion dur={`${durationSeconds}s`} repeatCount="indefinite" begin={`-${durationSeconds * 0.18}s`} rotate="auto" path={path} />
        </polygon>
        <circle r="3.2" fill={color} opacity="0.92">
          <animateMotion dur={`${durationSeconds}s`} repeatCount="indefinite" begin={`-${durationSeconds * 0.12}s`} path={path} />
        </circle>
        <circle r="2.8" fill={color} opacity="0.85">
          <animateMotion dur={`${durationSeconds}s`} repeatCount="indefinite" begin={`-${durationSeconds * 0.06}s`} path={path} />
        </circle>
        <circle r="2.4" fill={color} opacity="0.78">
          <animateMotion dur={`${durationSeconds}s`} repeatCount="indefinite" path={path} />
        </circle>
      </>
    );
  }

  function pickZoneImage(zone, upstairsSrc, downstairsSrc, fallbackSrc) {
    if (!zone || !zone.name) return fallbackSrc;
    const name = String(zone.name).toLowerCase();
    if (name.includes('upstairs') || name.includes('up stair') || name.includes('first floor')) return upstairsSrc;
    if (name.includes('downstairs') || name.includes('down stair') || name.includes('ground floor')) return downstairsSrc;
    return fallbackSrc;
  }

  return (
    <div className="mb-6">
      <style>{`
        @keyframes systemIconPulse {
          0%, 100% {
            opacity: 0.94;
          }
          50% {
            opacity: 1;
          }
        }
        @keyframes systemHaloPulse {
          0%, 100% {
            opacity: 0.26;
            transform: translate(-50%, -50%) scale(0.9);
          }
          50% {
            opacity: 0.48;
            transform: translate(-50%, -50%) scale(1.08);
          }
        }
      `}</style>
      <div className="relative mx-auto aspect-[4/3] w-full max-w-4xl sm:aspect-[16/9]">
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 600 320" role="img" aria-label="Heating flow diagram">
          <path d={leftPath} fill="none" stroke="#94a3b8" strokeOpacity="0.55" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="10 12" />
          <path d={rightPath} fill="none" stroke="#94a3b8" strokeOpacity="0.55" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="10 12" />
          <path d={waterPath} fill="none" stroke="#94a3b8" strokeOpacity="0.55" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="10 12" />

          {renderFlowParticles(leftPath, '#f43f5e', leftActive)}
          {renderFlowParticles(rightPath, '#f43f5e', rightActive)}
          {renderFlowParticles(waterPath, '#38bdf8', waterActive, 1.6)}
        </svg>

        <div className={`absolute left-1/2 top-[49%] -translate-x-1/2 -translate-y-1/2 ${
          boilerActive
            ? 'text-amber-700 dark:text-amber-300'
            : 'text-slate-600 dark:text-slate-200'
        }`}>
          {boilerActive ? (
            <span
              className="pointer-events-none absolute left-1/2 top-1/2 h-[70px] w-[70px] rounded-full bg-rose-500/50 blur-xl sm:h-[86px] sm:w-[86px]"
              style={{ animation: 'systemHaloPulse 2.4s ease-in-out infinite' }}
            />
          ) : null}
          <img
            src={boilerImageSrc}
            alt=""
            className="relative z-10 h-[72px] w-auto select-none object-contain sm:h-[86px]"
            draggable="false"
            style={boilerActive ? { animation: 'systemIconPulse 2.4s ease-in-out infinite' } : undefined}
          />
        </div>

        <div className={`absolute left-[16%] top-[26%] -translate-x-1/2 -translate-y-1/2 ${
          leftActive
            ? 'text-rose-700 dark:text-rose-300'
            : 'text-slate-700 dark:text-slate-200'
        }`}>
          {leftZoneLabel ? (
            <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-4 -translate-x-1/2 text-center text-slate-500 dark:text-slate-300">
              <span className="block whitespace-nowrap text-[10px] font-medium leading-none sm:text-xs">
                {leftZoneLabel}
              </span>
              <span className="mt-0.5 block whitespace-nowrap text-sm font-semibold leading-tight sm:text-base">
                {leftZoneTemp}
              </span>
            </span>
          ) : null}
          {leftActive ? (
            <span
              className="pointer-events-none absolute left-1/2 top-1/2 h-[56px] w-[56px] rounded-full bg-rose-500/45 blur-xl sm:h-[72px] sm:w-[72px]"
              style={{ animation: 'systemHaloPulse 2.4s ease-in-out infinite' }}
            />
          ) : null}
          <img
            src={leftZoneImageSrc}
            alt=""
            className="relative z-10 h-[58px] w-auto select-none object-contain sm:h-[72px]"
            draggable="false"
            style={leftActive ? { animation: 'systemIconPulse 2.4s ease-in-out infinite' } : undefined}
          />
        </div>

        <div className={`absolute left-[84%] top-[26%] -translate-x-1/2 -translate-y-1/2 ${
          rightActive
            ? 'text-rose-700 dark:text-rose-300'
            : 'text-slate-700 dark:text-slate-200'
        }`}>
          {rightZoneLabel ? (
            <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-4 -translate-x-1/2 text-center text-slate-500 dark:text-slate-300">
              <span className="block whitespace-nowrap text-[10px] font-medium leading-none sm:text-xs">
                {rightZoneLabel}
              </span>
              <span className="mt-0.5 block whitespace-nowrap text-sm font-semibold leading-tight sm:text-base">
                {rightZoneTemp}
              </span>
            </span>
          ) : null}
          {rightActive ? (
            <span
              className="pointer-events-none absolute left-1/2 top-1/2 h-[56px] w-[56px] rounded-full bg-rose-500/45 blur-xl sm:h-[72px] sm:w-[72px]"
              style={{ animation: 'systemHaloPulse 2.4s ease-in-out infinite' }}
            />
          ) : null}
          <img
            src={rightZoneImageSrc}
            alt=""
            className="relative z-10 h-[58px] w-auto select-none object-contain sm:h-[72px]"
            draggable="false"
            style={rightActive ? { animation: 'systemIconPulse 2.4s ease-in-out infinite' } : undefined}
          />
        </div>

        <div className={`absolute bottom-[18%] left-1/2 -translate-x-1/2 sm:bottom-[22%] ${
          waterActive
            ? 'text-sky-700 dark:text-sky-300'
            : 'text-slate-700 dark:text-slate-200'
        }`}>
          <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-3.5 -translate-x-1/2 text-center text-slate-500 dark:text-slate-300">
            <span className="block whitespace-nowrap text-[10px] font-medium leading-none sm:text-xs">
              {hotWaterLabel}
            </span>
            <span className="mt-0.5 block whitespace-nowrap text-sm font-semibold leading-tight sm:text-base">
              {hotWaterStatusLabel}
            </span>
          </span>
          {waterActive ? (
            <span
              className="pointer-events-none absolute left-1/2 top-1/2 h-[56px] w-[56px] rounded-full bg-sky-400/45 blur-xl sm:h-[72px] sm:w-[72px]"
              style={{ animation: 'systemHaloPulse 2.5s ease-in-out infinite' }}
            />
          ) : null}
          <img
            src={hotWaterImageSrc}
            alt=""
            className="relative z-10 h-[58px] w-auto select-none object-contain sm:h-[72px]"
            draggable="false"
            style={waterActive ? { animation: 'systemIconPulse 2.5s ease-in-out infinite' } : undefined}
          />
        </div>
      </div>
    </div>
  );
}
