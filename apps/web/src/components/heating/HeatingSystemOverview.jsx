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

  const leftPath = 'M 288 148 L 110 148 Q 96 148 96 134 L 96 44';
  const rightPath = 'M 312 148 L 490 148 Q 504 148 504 134 L 504 44';
  const waterPath = 'M 300 168 C 300 204 300 236 300 270';
  const zoneImageSrc = '/system-graphic/zone-radiator.png';
  const boilerImageSrc = '/system-graphic/boiler.png';
  const hotWaterImageSrc = '/system-graphic/hot-water-cylinder.png';

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

  return (
    <div className="mb-3">
      <style>{`
        @keyframes systemHotIcon {
          0%, 100% {
            opacity: 0.92;
            filter: drop-shadow(0 0 0 rgba(244, 63, 94, 0));
          }
          50% {
            opacity: 1;
            filter: drop-shadow(0 0 10px rgba(244, 63, 94, 0.55));
          }
        }
        @keyframes systemWaterIcon {
          0%, 100% {
            opacity: 0.92;
            filter: drop-shadow(0 0 0 rgba(14, 165, 233, 0));
          }
          50% {
            opacity: 1;
            filter: drop-shadow(0 0 10px rgba(14, 165, 233, 0.55));
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
          <img
            src={boilerImageSrc}
            alt=""
            className="h-[72px] w-auto select-none object-contain sm:h-[86px]"
            draggable="false"
            style={boilerActive ? { animation: 'systemHotIcon 2.4s ease-in-out infinite' } : undefined}
          />
        </div>

        <div className={`absolute left-[16%] top-[14%] -translate-x-1/2 -translate-y-1/2 ${
          leftActive
            ? 'text-rose-700 dark:text-rose-300'
            : 'text-slate-700 dark:text-slate-200'
        }`}>
          <img
            src={zoneImageSrc}
            alt=""
            className="h-[58px] w-auto select-none object-contain sm:h-[72px]"
            draggable="false"
            style={leftActive ? { animation: 'systemHotIcon 2.4s ease-in-out infinite' } : undefined}
          />
        </div>

        <div className={`absolute left-[84%] top-[14%] -translate-x-1/2 -translate-y-1/2 ${
          rightActive
            ? 'text-rose-700 dark:text-rose-300'
            : 'text-slate-700 dark:text-slate-200'
        }`}>
          <img
            src={zoneImageSrc}
            alt=""
            className="h-[58px] w-auto select-none object-contain sm:h-[72px]"
            draggable="false"
            style={rightActive ? { animation: 'systemHotIcon 2.4s ease-in-out infinite' } : undefined}
          />
        </div>

        <div className={`absolute bottom-[2%] left-1/2 -translate-x-1/2 sm:bottom-[8%] ${
          waterActive
            ? 'text-sky-700 dark:text-sky-300'
            : 'text-slate-700 dark:text-slate-200'
        }`}>
          <img
            src={hotWaterImageSrc}
            alt=""
            className="h-[58px] w-auto select-none object-contain sm:h-[72px]"
            draggable="false"
            style={waterActive ? { animation: 'systemWaterIcon 2.5s ease-in-out infinite' } : undefined}
          />
        </div>
      </div>
    </div>
  );
}
