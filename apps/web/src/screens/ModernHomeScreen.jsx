import { Menu, Thermometer, Waves, ChevronRight, Flame, Minus, Plus, CircleAlert } from 'lucide-react';
import AppMenuDrawer from '../components/layout/AppMenuDrawer';

function StatusPill({ heating }) {
  return <span className={heating ? 'modern-status modern-status--active' : 'modern-status'}><span className="modern-status__dot" />{heating ? 'Heating now' : 'Maintaining temperature'}</span>;
}

export default function ModernHomeScreen({ zones, hotWater, stateByDeviceId, zoneState, formatTemperature, connection, status, setSelectedZoneId, writeTarget, writeHotWater, renderBottomNav, menuOpen, setMenuOpen, toggleTheme, debugLayoutEnabled, toggleDebugLayout, theme, designMode, toggleDesignMode, onLogout, onChangeSystem, isDashboardLoading }) {
  const primary = zones[0];
  const primaryState = primary ? zoneState(stateByDeviceId, primary.id) : {};
  const activeZones = zones.filter((zone) => Boolean(zoneState(stateByDeviceId, zone.id).heatingOn)).length;
  const connectionLabel = connection?.label || 'Connecting';
  const hasError = connection?.label === 'Error' || connection?.label === 'Offline';
  const adjust = (delta) => {
    if (!primary) return;
    const next = Math.max(5, Math.min(35, Math.round((Number(primaryState.targetTemp || 20) + delta) * 2) / 2));
    writeTarget(primary.id, next);
  };

  return (
    <main className="modern-shell">
      <div className="modern-page">
        <header className="modern-header"><div><p className="modern-eyebrow">Smart heating</p><h1 className="modern-title">Good morning</h1><div className="modern-connection"><span className={hasError ? 'modern-connection__dot modern-connection__dot--error' : 'modern-connection__dot'} />{connectionLabel}</div></div><button className="modern-icon-button" type="button" aria-label="Open menu" onClick={() => setMenuOpen(true)}><Menu size={21} /></button></header>
        {primary ? <section className="modern-hero" aria-live="polite">
          <div className="modern-hero__top"><div><p className="modern-eyebrow">{primary.name}</p><StatusPill heating={Boolean(primaryState.heatingOn)} /></div><span className="modern-hero__badge"><Thermometer size={15} /> Now</span></div>
          <div className="modern-hero__temperature"><span>{formatTemperature(primaryState.currentTemp)}</span><small>inside</small></div>
          <div className="modern-hero__target"><span>Target {formatTemperature(primaryState.targetTemp)}</span><span>{activeZones ? `${activeZones} zone${activeZones === 1 ? '' : 's'} calling` : 'On target'}</span></div>
          <div className="modern-hero__controls"><button type="button" aria-label="Lower target temperature" onClick={() => adjust(-0.5)}><Minus size={18} /></button><div><span>Set temperature</span><strong>{formatTemperature(primaryState.targetTemp)}</strong></div><button type="button" aria-label="Raise target temperature" onClick={() => adjust(0.5)}><Plus size={18} /></button></div>
          <p className="modern-hero__note">{status || (activeZones ? 'Your heating is warming the home.' : 'Your home is holding steady.')}</p>
        </section> : <div className="modern-empty"><CircleAlert size={20} />{isDashboardLoading ? 'Updating your home…' : (status || 'No heating zones are available.')}</div>}
        {zones.length > 1 ? <section className="modern-section"><div className="modern-section__heading"><div><p className="modern-eyebrow">Your home</p><h2>Other rooms</h2></div><span className="modern-count">{zones.length - 1} more</span></div><div className="modern-room-list">{zones.slice(1).map((zone) => { const state = zoneState(stateByDeviceId, zone.id); return <button key={zone.id} type="button" className="modern-room-row" onClick={() => setSelectedZoneId(zone.id)}><span className="modern-room-row__icon"><Thermometer size={17} /></span><span className="modern-room-row__main"><strong>{zone.name}</strong><StatusPill heating={Boolean(state.heatingOn)} /></span><span className="modern-room-row__temp">{formatTemperature(state.currentTemp)}<small>Target {formatTemperature(state.targetTemp)}</small></span><ChevronRight size={18} /></button>; })}</div></section> : null}
        {hotWater ? (() => { const state = zoneState(stateByDeviceId, hotWater.id); return <section className="modern-water"><div className="modern-water__heading"><span className="modern-water__icon"><Waves size={19} /></span><div><p className="modern-eyebrow">Hot water</p><h2>{hotWater.name || 'Hot Water'}</h2></div><span className={state.hotWaterOn ? 'modern-water__state modern-water__state--on' : 'modern-water__state'}>{state.hotWaterOn ? 'On now' : 'Off'}</span></div><div className="modern-water__actions"><button type="button" onClick={() => writeHotWater(hotWater.id, 60)}>Boost 1 hour</button><button type="button" onClick={() => writeHotWater(hotWater.id, 120)}>Boost 2 hours</button><button type="button" className="modern-button--quiet" onClick={() => writeHotWater(hotWater.id, 0)}>Turn off</button></div></section>; })() : null}
      </div>{renderBottomNav()}<AppMenuDrawer menuOpen={menuOpen} setMenuOpen={setMenuOpen} toggleTheme={toggleTheme} debugLayoutEnabled={debugLayoutEnabled} toggleDebugLayout={toggleDebugLayout} theme={theme} designMode={designMode} toggleDesignMode={toggleDesignMode} onLogout={onLogout} onChangeSystem={onChangeSystem} />
    </main>
  );
}