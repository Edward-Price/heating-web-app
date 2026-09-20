import { Menu, Thermometer, Waves, ChevronRight, CircleAlert } from 'lucide-react';
import AppMenuDrawer from '../components/layout/AppMenuDrawer';

function StatusPill({ heating }) {
  return <span className={heating ? 'modern-status modern-status--active' : 'modern-status'}><span className="modern-status__dot" />{heating ? 'Heating now' : 'Holding steady'}</span>;
}

export default function ModernHomeScreen({ zones, hotWater, stateByDeviceId, zoneState, formatTemperature, connection, status, setSelectedZoneId, writeHotWater, renderBottomNav, menuOpen, setMenuOpen, toggleTheme, debugLayoutEnabled, toggleDebugLayout, theme, designMode, toggleDesignMode, onLogout, onChangeSystem, isDashboardLoading }) {
  const activeZones = zones.filter((zone) => Boolean(zoneState(stateByDeviceId, zone.id).heatingOn)).length;
  const connectionLabel = connection?.label || 'Connecting';
  const hasError = connection?.label === 'Error' || connection?.label === 'Offline';

  return (
    <main className="modern-shell">
      <div className="modern-page">
        <header className="modern-header">
          <div><p className="modern-eyebrow">Heating control</p><h1 className="modern-title">Home</h1><div className="modern-connection"><span className={hasError ? 'modern-connection__dot modern-connection__dot--error' : 'modern-connection__dot'} />{connectionLabel}</div></div>
          <button className="modern-icon-button" type="button" aria-label="Open menu" onClick={() => setMenuOpen(true)}><Menu size={21} strokeWidth={1.8} /></button>
        </header>

        <section className="modern-overview" aria-live="polite">
          <div className="modern-overview__icon"><Thermometer size={20} strokeWidth={1.8} /></div>
          <div><p className="modern-overview__label">System overview</p><h2>{isDashboardLoading ? 'Updating your home' : zones.length ? (activeZones ? `${activeZones} zone${activeZones === 1 ? '' : 's'} heating` : 'Home is comfortable') : 'No zones connected'}</h2><p>{status || (activeZones ? 'Your heating is actively warming the home.' : 'All zones are holding their target temperature.')}</p></div>
        </section>

        <section className="modern-section"><div className="modern-section__heading"><div><p className="modern-eyebrow">Your home</p><h2>Rooms</h2></div><span className="modern-count">{zones.length} {zones.length === 1 ? 'room' : 'rooms'}</span></div>
          <div className="modern-room-grid">{zones.map((zone) => { const state = zoneState(stateByDeviceId, zone.id); const heating = Boolean(state.heatingOn); return <button key={zone.id} type="button" className="modern-room" onClick={() => setSelectedZoneId(zone.id)}><div className="modern-room__top"><div><h3>{zone.name}</h3><StatusPill heating={heating} /></div><ChevronRight className="modern-room__arrow" size={20} strokeWidth={1.7} /></div><div className="modern-room__temperatures"><span className="modern-room__current">{formatTemperature(state.currentTemp)}</span><span className="modern-room__target">Target <strong>{formatTemperature(state.targetTemp)}</strong></span></div></button>; })}</div>
        </section>

        {hotWater ? (() => { const state = zoneState(stateByDeviceId, hotWater.id); return <section className="modern-water"><div className="modern-water__heading"><span className="modern-water__icon"><Waves size={19} strokeWidth={1.8} /></span><div><p className="modern-eyebrow">Hot water</p><h2>{hotWater.name || 'Hot Water'}</h2></div><span className={state.hotWaterOn ? 'modern-water__state modern-water__state--on' : 'modern-water__state'}>{state.hotWaterOn ? 'On' : 'Off'}</span></div><div className="modern-water__actions"><button type="button" onClick={() => writeHotWater(hotWater.id, 60)}>Boost 1 hour</button><button type="button" onClick={() => writeHotWater(hotWater.id, 120)}>Boost 2 hours</button><button type="button" className="modern-button--quiet" onClick={() => writeHotWater(hotWater.id, 0)}>Turn off</button></div></section>; })() : null}
        {!zones.length && !isDashboardLoading ? <div className="modern-empty"><CircleAlert size={20} /><span>{status || 'No heating zones are available.'}</span></div> : null}
      </div>
      {renderBottomNav()}
      <AppMenuDrawer menuOpen={menuOpen} setMenuOpen={setMenuOpen} toggleTheme={toggleTheme} debugLayoutEnabled={debugLayoutEnabled} toggleDebugLayout={toggleDebugLayout} theme={theme} designMode={designMode} toggleDesignMode={toggleDesignMode} onLogout={onLogout} onChangeSystem={onChangeSystem} />
    </main>
  );
}
