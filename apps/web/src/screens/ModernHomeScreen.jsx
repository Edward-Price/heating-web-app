import { Menu, Thermometer, Waves } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import AppMenuDrawer from '../components/layout/AppMenuDrawer';

export default function ModernHomeScreen({
  zones,
  hotWater,
  stateByDeviceId,
  zoneState,
  formatTemperature,
  connection,
  status,
  setSelectedZoneId,
  writeHotWater,
  renderBottomNav,
  menuOpen,
  setMenuOpen,
  toggleTheme,
  debugLayoutEnabled,
  toggleDebugLayout,
  theme,
  designMode,
  toggleDesignMode,
  onLogout,
  onChangeSystem,
  isDashboardLoading,
}) {
  const connected = connection?.label || 'Connecting';
  return (
    <main className="min-h-screen bg-slate-50 pb-24 text-slate-950 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-5xl px-4 pb-8 pt-5 sm:px-6">
        <header className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Home climate</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">Your home</h1>
            <div className="mt-2 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              <span className={`h-2 w-2 rounded-full ${connection?.dotClass || 'bg-slate-400'}`} />
              <span>{connected}</span>
            </div>
          </div>
          <Button size="icon" variant="outline" aria-label="Open menu" onClick={() => setMenuOpen(true)}><Menu className="h-5 w-5" /></Button>
        </header>

        <section className="mb-6 rounded-3xl bg-slate-900 p-5 text-white shadow-xl shadow-slate-900/10 dark:bg-slate-800">
          <div className="flex items-center gap-2 text-sm text-slate-300"><Thermometer className="h-4 w-4" /> System status</div>
          <p className="mt-3 text-2xl font-semibold">{isDashboardLoading ? 'Updating your home…' : zones.length ? 'Comfort is in your hands' : 'No zones connected'}</p>
          <p className="mt-1 text-sm text-slate-400">{status || 'Tap a zone to adjust its target temperature.'}</p>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">Zones</h2><span className="text-sm text-slate-500 dark:text-slate-400">{zones.length} active</span></div>
          <div className="grid gap-3 sm:grid-cols-2">
            {zones.map((zone) => {
              const state = zoneState(stateByDeviceId, zone.id);
              const heating = Boolean(state.heatingOn);
              return (
                <button key={zone.id} type="button" onClick={() => setSelectedZoneId(zone.id)} className="text-left">
                  <Card className="rounded-2xl border-slate-200 p-4 transition hover:-translate-y-0.5 hover:border-slate-400 hover:shadow-md dark:border-slate-700">
                    <div className="flex items-start justify-between gap-3"><div><p className="text-base font-semibold">{zone.name}</p><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{heating ? 'Heating now' : 'Holding steady'}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${heating ? 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}>{heating ? 'Heating' : 'Idle'}</span></div>
                    <div className="mt-6 flex items-end justify-between"><span className="text-4xl font-semibold tracking-tight">{formatTemperature(state.currentTemp)}</span><span className="text-sm text-slate-500 dark:text-slate-400">Target {formatTemperature(state.targetTemp)}</span></div>
                  </Card>
                </button>
              );
            })}
          </div>
        </section>

        {hotWater ? (() => { const state = zoneState(stateByDeviceId, hotWater.id); return <Card className="mt-4 rounded-2xl border-slate-200 p-4 dark:border-slate-700"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><Waves className="h-5 w-5 text-cyan-500" /><h2 className="font-semibold">{hotWater.name || 'Hot Water'}</h2></div><span className="text-sm text-slate-500">{state.hotWaterOn ? 'On' : 'Off'}</span></div><div className="mt-4 grid grid-cols-3 gap-2"><Button onClick={() => writeHotWater(hotWater.id, 60)}>Boost 1h</Button><Button onClick={() => writeHotWater(hotWater.id, 120)}>Boost 2h</Button><Button variant="outline" onClick={() => writeHotWater(hotWater.id, 0)}>Off</Button></div></Card>; })() : null}
      </div>
      {renderBottomNav()}
      <AppMenuDrawer menuOpen={menuOpen} setMenuOpen={setMenuOpen} toggleTheme={toggleTheme} debugLayoutEnabled={debugLayoutEnabled} toggleDebugLayout={toggleDebugLayout} theme={theme} designMode={designMode} toggleDesignMode={toggleDesignMode} onLogout={onLogout} onChangeSystem={onChangeSystem} />
    </main>
  );
}
