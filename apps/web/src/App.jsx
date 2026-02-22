import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Flame, Menu, Snowflake, X } from 'lucide-react';
import { Button } from './components/ui/button';
import { Card } from './components/ui/card';
import { Input } from './components/ui/input';

const API_BASE = 'http://localhost:3001';
const STORAGE_KEY = 'heating-web-session-token';
const DIAL_START_ANGLE = 135;
const DIAL_SWEEP_ANGLE = 270;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function snapToHalfStep(value) {
  return Math.round(value * 2) / 2;
}

function normalizeDeg(value) {
  return ((value % 360) + 360) % 360;
}

function temperatureToAngle(value, min, max) {
  const range = Math.max(max - min, 0.0001);
  const ratio = clamp((value - min) / range, 0, 1);
  return DIAL_START_ANGLE + ratio * DIAL_SWEEP_ANGLE;
}

function angleToTemperature(angleDeg, min, max) {
  const start = normalizeDeg(DIAL_START_ANGLE);
  const current = normalizeDeg(angleDeg);
  const clockwiseDelta = (current - start + 360) % 360;
  const clampedDelta = clamp(clockwiseDelta, 0, DIAL_SWEEP_ANGLE);
  const ratio = clampedDelta / DIAL_SWEEP_ANGLE;
  return min + ratio * (max - min);
}

function pointOnCircle(center, radius, angleDeg) {
  const angle = (angleDeg * Math.PI) / 180;
  return {
    x: center + radius * Math.cos(angle),
    y: center + radius * Math.sin(angle),
  };
}

function zoneState(stateByDeviceId, id) {
  return stateByDeviceId[String(id)] || stateByDeviceId[id] || {};
}

function formatTemperature(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '--.-°';
  }
  return `${value.toFixed(1)}°`;
}

function mapConnectionStatus(statusText) {
  const text = String(statusText || '').toLowerCase();
  if (text.startsWith('loaded')) {
    return { label: 'Connected', dotClass: 'bg-emerald-500' };
  }
  if (text.includes('loading') || text.includes('refreshing')) {
    return { label: 'Reconnecting', dotClass: 'bg-amber-500' };
  }
  if (text.includes('failed') || text.includes('error')) {
    return { label: 'Connection error', dotClass: 'bg-rose-500' };
  }
  return { label: 'Disconnected', dotClass: 'bg-slate-400' };
}

export default function App() {
  const [sessionToken, setSessionToken] = useState(() => localStorage.getItem(STORAGE_KEY) || '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('Please sign in.');
  const [devices, setDevices] = useState([]);
  const [stateByDeviceId, setStateByDeviceId] = useState({});
  const [selectedZoneId, setSelectedZoneId] = useState(null);
  const [targetDraft, setTargetDraft] = useState(20);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isDialDragging, setIsDialDragging] = useState(false);
  const isLoadingRef = useRef(false);
  const dialRef = useRef(null);
  const isTouchDialDraggingRef = useRef(false);

  const clearClientSession = useCallback((message = 'Session expired. Please sign in again.') => {
    setSessionToken('');
    localStorage.removeItem(STORAGE_KEY);
    setSelectedZoneId(null);
    setMenuOpen(false);
    setDevices([]);
    setStateByDeviceId({});
    setStatus(message);
  }, []);

  const authHeaders = useCallback(() => ({
    'X-Session-Token': sessionToken,
    'Content-Type': 'application/json'
  }), [sessionToken]);

  const apiGet = useCallback(async (path, tokenOverride) => {
    const token = typeof tokenOverride === 'string' ? tokenOverride : sessionToken;
    const res = await fetch(`${API_BASE}${path}`, {
      headers: {
        'X-Session-Token': token,
        'Content-Type': 'application/json'
      }
    });
    const data = await res.json();
    if (res.status === 401) {
      clearClientSession();
      throw new Error('Unauthorized');
    }
    if (!res.ok || !data.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }, [clearClientSession, sessionToken]);

  const apiPost = useCallback(async (path, body, tokenOverride) => {
    const token = typeof tokenOverride === 'string' ? tokenOverride : sessionToken;
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: {
        'X-Session-Token': token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body || {})
    });
    const data = await res.json();
    if (res.status === 401) {
      clearClientSession();
      throw new Error('Unauthorized');
    }
    if (!res.ok || !data.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }, [clearClientSession, sessionToken]);

  const loadDashboard = useCallback(async (tokenOverride) => {
    if (isLoadingRef.current) {
      return;
    }
    isLoadingRef.current = true;
    try {
      setStatus('Loading devices and state...');
      const devicesResult = await apiGet('/devices', tokenOverride);
      const stateResult = await apiGet('/state', tokenOverride);
      const fetchedDevices = Array.isArray(devicesResult.devices) ? devicesResult.devices : [];
      const fetchedState =
        stateResult && typeof stateResult.stateByDeviceId === 'object' && stateResult.stateByDeviceId
          ? stateResult.stateByDeviceId
          : {};

      setDevices((prev) => {
        if (fetchedDevices.length === 0 && prev.length > 0) {
          return prev;
        }
        return fetchedDevices;
      });

      setStateByDeviceId((prev) => {
        const fetchedKeys = Object.keys(fetchedState);
        if (fetchedKeys.length === 0 && Object.keys(prev).length > 0) {
          return prev;
        }
        return fetchedState;
      });

      const countForStatus = fetchedDevices.length > 0 ? fetchedDevices.length : devices.length;
      setStatus(`Loaded ${countForStatus} devices.`);
    } catch (err) {
      if (err && err.message === 'Unauthorized') {
        return;
      }
      setStatus(`Load failed: ${String(err.message || err)}`);
    } finally {
      isLoadingRef.current = false;
    }
  }, [apiGet, devices.length]);

  useEffect(() => {
    if (sessionToken) {
      void loadDashboard();
    }
  }, [sessionToken, loadDashboard]);

  const selectedZone = useMemo(
    () => devices.find((d) => d.type === 'zone' && Number(d.id) === Number(selectedZoneId)) || null,
    [devices, selectedZoneId]
  );

  const loggedIn = Boolean(sessionToken);

  async function onLogin(event) {
    event.preventDefault();
    try {
      setStatus('Signing in...');
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `Login failed (${res.status})`);
      setSessionToken(data.appSessionToken);
      localStorage.setItem(STORAGE_KEY, data.appSessionToken);
      await loadDashboard(data.appSessionToken);
    } catch (err) {
      setStatus(`Login failed: ${String(err.message || err)}`);
    }
  }

  async function onLogout() {
    try {
      if (sessionToken) {
        await fetch(`${API_BASE}/auth/logout`, { method: 'POST', headers: authHeaders() });
      }
    } catch (_err) {
      // ignore
    }
    setSessionToken('');
    clearClientSession('Logged out.');
  }

  async function writeTarget(zoneId, temp) {
    try {
      setStatus(`Setting ${temp.toFixed(1)}°C...`);
      await apiPost(`/zones/${zoneId}/target-temp`, { targetTemp: Number(temp) });
      await loadDashboard();
      setStatus(`Target updated to ${temp.toFixed(1)}°C.`);
    } catch (err) {
      setStatus(`Zone write failed: ${String(err.message || err)}`);
    }
  }

  async function writeHotWater(deviceId, minutes) {
    try {
      const label = minutes === 0 ? 'Turning hot water off...' : `Starting hot water boost (${minutes} min)...`;
      setStatus(label);
      await apiPost(`/hot-water/${deviceId}/boost`, { minutes });
      await loadDashboard();
    } catch (err) {
      setStatus(`Hot water write failed: ${String(err.message || err)}`);
    }
  }

  if (!loggedIn) {
    return (
      <main className="mx-auto max-w-5xl p-4 md:p-8">
        <header className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Heating Web App</h1>
        </header>
        <Card>
          <h2 className="mb-4 text-xl font-semibold">Sign in</h2>
          <form className="grid max-w-md gap-3" onSubmit={onLogin}>
            <label className="grid gap-1 text-sm font-semibold">Email<Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
            <label className="grid gap-1 text-sm font-semibold">Password<Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
            <Button type="submit">Sign in</Button>
          </form>
        </Card>
        <p className="mt-3 text-sm text-muted">{status}</p>
      </main>
    );
  }

  if (selectedZone) {
    const zone = selectedZone;
    const state = zoneState(stateByDeviceId, zone.id);
    const current = typeof state.currentTemp === 'number' ? `${state.currentTemp.toFixed(1)}°` : '--.-°';
    const target = typeof state.targetTemp === 'number' ? state.targetTemp : targetDraft;
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
    const dialValue = clamp(snapToHalfStep(targetDraft), minTemp, maxTemp);
    const dialAngle = temperatureToAngle(dialValue, minTemp, maxTemp);
    const knob = pointOnCircle(center, radius, dialAngle);
    const trackStart = pointOnCircle(center, radius, DIAL_START_ANGLE);
    const trackEnd = pointOnCircle(center, radius, DIAL_START_ANGLE + DIAL_SWEEP_ANGLE);
    const progressPath = `M ${trackStart.x} ${trackStart.y} A ${radius} ${radius} 0 ${
      normalizeDeg(dialAngle - DIAL_START_ANGLE) > 180 ? 1 : 0
    } 1 ${knob.x} ${knob.y}`;
    const basePath = `M ${trackStart.x} ${trackStart.y} A ${radius} ${radius} 0 1 1 ${trackEnd.x} ${trackEnd.y}`;

    const updateDialFromEvent = (event) => {
      const element = dialRef.current;
      if (!element) return;
      const rect = element.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const dx = x - center;
      const dy = y - center;
      const angleDeg = normalizeDeg((Math.atan2(dy, dx) * 180) / Math.PI);
      const next = clamp(snapToHalfStep(angleToTemperature(angleDeg, minTemp, maxTemp)), minTemp, maxTemp);
      setTargetDraft(next);
    };

    const shouldStartDialDrag = (event) => {
      const element = dialRef.current;
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const dx = x - center;
      const dy = y - center;
      const distanceFromCenter = Math.sqrt(dx * dx + dy * dy);
      return Math.abs(distanceFromCenter - radius) <= trackStroke + ringTouchTolerance;
    };

    const isTouchLike =
      typeof window !== 'undefined' &&
      ((typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches) ||
        (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0));

    return (
      <main className="mx-auto max-w-5xl p-4 md:p-8">
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
            <div
              ref={dialRef}
              className="relative grid place-items-center select-none"
              style={{ width: dialSize, height: dialSize, touchAction: isTouchDialDraggingRef.current ? 'none' : 'auto' }}
              onPointerDown={
                isTouchLike
                  ? undefined
                  : (event) => {
                    if (!shouldStartDialDrag(event)) {
                      return;
                    }
                    setIsDialDragging(true);
                    updateDialFromEvent(event);
                  }
              }
              onPointerMove={
                isTouchLike
                  ? undefined
                  : (event) => {
                    if (!isDialDragging) return;
                    updateDialFromEvent(event);
                  }
              }
              onPointerUp={isTouchLike ? undefined : () => setIsDialDragging(false)}
              onPointerLeave={isTouchLike ? undefined : () => setIsDialDragging(false)}
              onPointerCancel={isTouchLike ? undefined : () => setIsDialDragging(false)}
              onTouchStart={(event) => {
                const touch = event.touches[0];
                if (!touch) return;
                if (!shouldStartDialDrag({ clientX: touch.clientX, clientY: touch.clientY })) {
                  isTouchDialDraggingRef.current = false;
                  return;
                }
                isTouchDialDraggingRef.current = true;
                updateDialFromEvent({ clientX: touch.clientX, clientY: touch.clientY });
                // Trigger style refresh so touch-action switches to `none` while dragging.
                setTargetDraft((prev) => prev);
              }}
              onTouchMove={(event) => {
                if (!isTouchDialDraggingRef.current) return;
                const touch = event.touches[0];
                if (!touch) return;
                updateDialFromEvent({ clientX: touch.clientX, clientY: touch.clientY });
              }}
              onTouchEnd={() => {
                isTouchDialDraggingRef.current = false;
                // Trigger style refresh so touch-action returns to `auto`.
                setTargetDraft((prev) => prev);
              }}
              onTouchCancel={() => {
                isTouchDialDraggingRef.current = false;
                setTargetDraft((prev) => prev);
              }}
            >
              <svg width={dialSize} height={dialSize}>
                <defs>
                  <linearGradient id="tempDialGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#F6D365" />
                    <stop offset="55%" stopColor="#F39C12" />
                    <stop offset="100%" stopColor="#E74C3C" />
                  </linearGradient>
                </defs>

                <path d={basePath} fill="none" stroke="#e6ebf1" strokeWidth={trackStroke} strokeLinecap="round" />
                <path d={progressPath} fill="none" stroke="url(#tempDialGradient)" strokeWidth={trackStroke} strokeLinecap="round" />
                <circle cx={knob.x} cy={knob.y} r={knobRadius} fill="#ffffff" stroke="#635bff" strokeWidth="3" />
              </svg>

              <div className="pointer-events-none absolute inset-0 grid place-items-center">
                <div className="grid place-items-center gap-3 text-center">
                  <button
                    type="button"
                    className="pointer-events-auto grid h-11 w-11 place-items-center rounded-full border border-border bg-white text-2xl font-semibold leading-none text-foreground"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      setTargetDraft((prev) => clamp(snapToHalfStep(prev + 0.5), minTemp, maxTemp));
                    }}
                    aria-label="Increase target temperature"
                  >
                    +
                  </button>
                  <div>
                    <div className="text-5xl font-bold tracking-tight text-foreground">{dialValue.toFixed(1)}°</div>
                  </div>
                  <button
                    type="button"
                    className="pointer-events-auto grid h-11 w-11 place-items-center rounded-full border border-border bg-white text-2xl font-semibold leading-none text-foreground"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      setTargetDraft((prev) => clamp(snapToHalfStep(prev - 0.5), minTemp, maxTemp));
                    }}
                    aria-label="Decrease target temperature"
                  >
                    −
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="flex justify-center">
            <div className="flex items-center gap-2 rounded-full border border-border bg-white px-4 py-2 text-sm font-semibold text-foreground">
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
            className="h-12 w-full rounded-full bg-gradient-to-r from-[#6D5BFF] to-[#9B6BFF] text-base font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status.toLowerCase().includes('setting') ? 'Setting...' : 'Set temperature'}
          </button>
        </div>
        <p className="mt-3 text-sm text-muted">{status}</p>
      </main>
    );
  }

  const zones = devices.filter((d) => d.type === 'zone');
  const hotWater = devices.find((d) => d.type === 'hotWater');
  const connection = mapConnectionStatus(status);
  const isErrorStatus = status.toLowerCase().includes('failed') || status.toLowerCase().includes('error');

  return (
    <main className="mx-auto max-w-5xl p-4 md:p-8">
      <header className="mb-4">
        <div className="mb-1 flex items-center justify-between">
          <Button size="icon" variant="outline" onClick={() => setMenuOpen(true)}><Menu className="h-5 w-5" /></Button>
          <div className="flex items-center gap-2 text-sm text-muted">
            <span className={`h-2 w-2 rounded-full ${connection.dotClass}`} />
            <span>{connection.label}</span>
          </div>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Home</h1>
      </header>

      <div>
        <p className={`mb-3 text-sm ${isErrorStatus ? 'text-rose-600' : 'text-muted'}`}>{status}</p>

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
                  <div className="rounded-full bg-gradient-to-r from-[#6D5BFF] to-[#9B6BFF] px-3 py-1.5 text-xs font-bold text-white">
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
              <Button onClick={() => writeHotWater(hotWater.id, 60)}>Boost 1h</Button>
              <Button onClick={() => writeHotWater(hotWater.id, 120)}>Boost 2h</Button>
              <Button variant="outline" onClick={() => writeHotWater(hotWater.id, 0)}>Off</Button>
            </div>
          </Card>
        )}
      </div>

      {menuOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setMenuOpen(false)} />
          <aside className="fixed left-0 top-0 z-50 h-screen w-[85vw] max-w-xs border-r border-border bg-card p-4 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <strong>Menu</strong>
              <Button size="icon" variant="ghost" onClick={() => setMenuOpen(false)}><X className="h-4 w-4" /></Button>
            </div>
            <Button variant="outline" className="w-full justify-start" onClick={onLogout}>Log out</Button>
          </aside>
        </>
      )}
    </main>
  );
}
