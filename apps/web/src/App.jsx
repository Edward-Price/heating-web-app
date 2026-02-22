import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, CalendarDays, ChevronUp, Flame, House, Menu, Snowflake, X } from 'lucide-react';
import { Button } from './components/ui/button';
import { Card } from './components/ui/card';
import { Input } from './components/ui/input';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';
const STORAGE_KEY = 'heating-web-session-token';
const WEEK_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const SCHEDULE_COLORS = [
  { bg: 'bg-sky-50', text: 'text-sky-700', bar: 'bg-sky-400', chip: 'bg-sky-500' },
  { bg: 'bg-orange-50', text: 'text-orange-700', bar: 'bg-orange-400', chip: 'bg-orange-500' },
  { bg: 'bg-emerald-50', text: 'text-emerald-700', bar: 'bg-emerald-400', chip: 'bg-emerald-500' },
  { bg: 'bg-violet-50', text: 'text-violet-700', bar: 'bg-violet-400', chip: 'bg-violet-500' },
];

function createDefaultDayPeriods() {
  return [
    { start: 0, end: 4, temp: 16, colorIndex: 0 },
    { start: 4, end: 7, temp: 18, colorIndex: 1 },
    { start: 7, end: 10, temp: 20.5, colorIndex: 2 },
    { start: 10, end: 15, temp: 21.5, colorIndex: 3 },
    { start: 15, end: 20, temp: 19, colorIndex: 1 },
    { start: 20, end: 24, temp: 17, colorIndex: 0 },
  ];
}

function createDefaultWeekSchedule() {
  return WEEK_DAYS.map((day) => ({ day, periods: createDefaultDayPeriods() }));
}

function createEmptyWeekSchedule() {
  return WEEK_DAYS.map((day) => ({ day, periods: [] }));
}

function formatHour(hour) {
  const safe = Math.max(0, Math.min(24, Number(hour) || 0));
  const h = Math.floor(safe);
  return `${String(h).padStart(2, '0')}:00`;
}

function isBinaryScheduleDevice(device) {
  return device && device.type === 'hotWater';
}

function formatScheduleValue(period, binaryMode) {
  if (binaryMode) {
    return Number(period.temp) >= 0.5 ? 'On' : 'Off';
  }
  const value = Number(period.temp);
  return Number.isFinite(value) ? `${value.toFixed(1)}°` : '--.-°';
}

function getTempScaleColor(temp) {
  const n = Number(temp);
  const clamped = Math.max(10, Math.min(26, Number.isFinite(n) ? n : 18));
  const ratio = (clamped - 10) / (26 - 10);
  const hue = 205 - ratio * (205 - 8);
  return `hsl(${hue} 72% 58%)`;
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

function mapConnectionStatus(connectionState) {
  if (connectionState === 'connected') {
    return { label: 'Connected', dotClass: 'bg-emerald-500' };
  }
  if (connectionState === 'loading') {
    return { label: 'Reconnecting', dotClass: 'bg-amber-500' };
  }
  if (connectionState === 'error') {
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
  const [activeTab, setActiveTab] = useState('home');
  const [scheduleZoneId, setScheduleZoneId] = useState(null);
  const [scheduleDayIndex, setScheduleDayIndex] = useState(null);
  const [scheduleByZone, setScheduleByZone] = useState({});
  const [expandedScheduleDays, setExpandedScheduleDays] = useState({});
  const [connectionState, setConnectionState] = useState('disconnected');
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const isLoadingRef = useRef(false);
  const dialPointerIdRef = useRef(null);
  const scheduleScrollerRef = useRef(null);
  const contentRef = useRef(null);
  const pullStartYRef = useRef(null);

  const clearClientSession = useCallback((message = 'Session expired. Please sign in again.') => {
    setSessionToken('');
    localStorage.removeItem(STORAGE_KEY);
    setSelectedZoneId(null);
    setScheduleZoneId(null);
    setScheduleDayIndex(null);
    setMenuOpen(false);
    setDevices([]);
    setStateByDeviceId({});
    setConnectionState('disconnected');
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
      setConnectionState('loading');
      setStatus((prev) => (prev && (prev.toLowerCase().includes('failed') || prev.toLowerCase().includes('error')) ? prev : ''));
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

      setConnectionState('connected');
      setStatus((prev) => (prev && !prev.toLowerCase().includes('failed') && !prev.toLowerCase().includes('error') ? '' : prev));
    } catch (err) {
      if (err && err.message === 'Unauthorized') {
        return;
      }
      setConnectionState('error');
      setStatus(`Load failed: ${String(err.message || err)}`);
    } finally {
      isLoadingRef.current = false;
    }
  }, [apiGet, devices.length]);
  const zones = useMemo(() => devices.filter((d) => d.type === 'zone'), [devices]);
  const scheduleDevices = useMemo(() => devices, [devices]);

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


  function onSelectTab(tab) {
    setActiveTab(tab);
    if (tab !== 'home') {
      setSelectedZoneId(null);
    }
    if (tab === 'home') {
      setStatus('');
    }
  }

  function getZoneSchedule(zoneId) {
    return scheduleByZone[String(zoneId)] || createEmptyWeekSchedule();
  }

  function getDayPeriods(zoneId, dayIndex) {
    const week = getZoneSchedule(zoneId);
    return Array.isArray(week[dayIndex]?.periods) ? week[dayIndex].periods : [];
  }

  function updateDayPeriods(zoneId, dayIndex, updater) {
    const zoneKey = String(zoneId);
    setScheduleByZone((prev) => {
      const currentWeek = prev[zoneKey] || createEmptyWeekSchedule();
      const nextWeek = currentWeek.map((day, idx) => {
        if (idx !== dayIndex) return day;
        return { ...day, periods: updater(day.periods) };
      });
      return { ...prev, [zoneKey]: nextWeek };
    });
  }

  function adjustScheduleTemp(zoneId, dayIndex, periodIndex, delta) {
    updateDayPeriods(zoneId, dayIndex, (periods) =>
      periods.map((period, idx) => {
        if (idx !== periodIndex) return period;
        const next = Math.max(5, Math.min(35, Math.round((period.temp + delta) * 2) / 2));
        return { ...period, temp: next };
      })
    );
  }

  function setSchedulePeriodValue(zoneId, dayIndex, periodIndex, nextValue) {
    updateDayPeriods(zoneId, dayIndex, (periods) =>
      periods.map((period, idx) => (idx === periodIndex ? { ...period, temp: nextValue } : period))
    );
  }

  function addSchedulePeriod(zoneId, dayIndex) {
    updateDayPeriods(zoneId, dayIndex, (periods) => {
      if (!Array.isArray(periods) || periods.length === 0) {
        return [{ start: 0, end: 24, temp: 18, colorIndex: 0 }];
      }
      const sorted = [...periods].sort((a, b) => a.start - b.start);
      const last = sorted[sorted.length - 1];
      if (last.end >= 24) {
        return sorted;
      }
      const nextStart = last.end;
      const nextEnd = Math.min(24, nextStart + 4);
      const nextColor = (last.colorIndex + 1) % SCHEDULE_COLORS.length;
      return [...sorted, { start: nextStart, end: nextEnd, temp: last.temp, colorIndex: nextColor }];
    });
  }


  function removeSchedulePeriod(zoneId, dayIndex, periodIndex) {
    updateDayPeriods(zoneId, dayIndex, (periods) => {
      if (periods.length <= 1) return periods;
      return periods.filter((_, idx) => idx !== periodIndex);
    });
  }

  function selectedScheduleZone() {
    if (!scheduleZoneId) return null;
    return scheduleDevices.find((z) => Number(z.id) === Number(scheduleZoneId)) || null;
  }

  function normalizeScheduleWeekPayload(weekPayload) {
    if (!Array.isArray(weekPayload)) {
      return createEmptyWeekSchedule();
    }

    return WEEK_DAYS.map((day, dayIndex) => {
      const source = weekPayload.find((item) => Number(item && item.dayIndex) === dayIndex) || {};
      const periods = Array.isArray(source.periods) ? source.periods : [];
      const normalizedPeriods = periods
        .map((period, idx) => {
          const start = Math.max(0, Math.min(24, Number(period.start)));
          const end = Math.max(start, Math.min(24, Number(period.end)));
          const temp = Number(period.temp);
          return {
            start: Number.isFinite(start) ? start : 0,
            end: Number.isFinite(end) ? end : 24,
            temp: Number.isFinite(temp) ? temp : 18,
            colorIndex: idx % SCHEDULE_COLORS.length,
          };
        })
        .filter((p) => p.end > p.start);

      return {
        day,
        periods: normalizedPeriods.length ? normalizedPeriods : [{ start: 0, end: 24, temp: 18, colorIndex: 0 }],
      };
    });
  }

  async function openScheduleZone(zoneId) {
    setScheduleZoneId(zoneId);
    setScheduleDayIndex(null);
    try {
      const res = await apiGet(`/zones/${zoneId}/schedule`);
      const week = normalizeScheduleWeekPayload(res.week);
      console.log("[Schedule API] zone schedule response", {
        zoneId,
        scheduleId: res.scheduleId ?? null,
        rawWeek: res.week,
        normalizedWeek: week,
        providerResponse: res.providerResponse ?? null,
      });
      setScheduleByZone((prev) => ({ ...prev, [String(zoneId)]: week }));
      setStatus('');
    } catch (err) {
      setStatus(`Schedule load failed: ${String(err.message || err)}`);
    }
  }

  function isScheduleDayExpanded(zoneId, dayIndex) {
    return Boolean(expandedScheduleDays[`${zoneId}:${dayIndex}`]);
  }

  function toggleScheduleDayExpanded(zoneId, dayIndex) {
    const key = `${zoneId}:${dayIndex}`;
    setExpandedScheduleDays((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function renderBottomNav() {
    const tabs = [
      { key: 'schedule', label: 'Schedule', icon: CalendarDays },
      { key: 'home', label: 'Home', icon: House },
      { key: 'stats', label: 'Stats', icon: BarChart3 },
    ];

    return (
      <nav className="shrink-0 border-t border-border/80 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="mx-auto grid max-w-5xl grid-cols-3 px-3 py-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const selected = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => onSelectTab(tab.key)}
                className="flex flex-col items-center justify-center gap-1 py-1"
                aria-label={tab.label}
                aria-current={selected ? 'page' : undefined}
              >
                <Icon className={selected ? 'h-5 w-5 text-foreground' : 'h-5 w-5 text-slate-400'} />
                <span className={selected ? 'text-xs font-semibold text-foreground' : 'text-xs font-medium text-slate-400'}>
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    );
  }

  const runPullRefresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await loadDashboard();
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing, loadDashboard]);

  const onContentTouchStart = useCallback((event) => {
    const el = contentRef.current;
    if (!el) return;
    if (el.scrollTop > 0) {
      pullStartYRef.current = null;
      return;
    }
    pullStartYRef.current = event.touches[0]?.clientY ?? null;
  }, []);

  const onContentTouchMove = useCallback((event) => {
    const el = contentRef.current;
    const startY = pullStartYRef.current;
    if (!el || startY === null || el.scrollTop > 0) return;

    const currentY = event.touches[0]?.clientY ?? startY;
    const delta = currentY - startY;
    if (delta <= 0) {
      setPullDistance(0);
      return;
    }

    setPullDistance(Math.min(84, delta * 0.45));
  }, []);

  const onContentTouchEnd = useCallback(() => {
    const shouldRefresh = pullDistance >= 56;
    pullStartYRef.current = null;
    setPullDistance(0);
    if (shouldRefresh) {
      void runPullRefresh();
    }
  }, [pullDistance, runPullRefresh]);

  if (!loggedIn) {
    return (
      <main className="mx-auto max-w-5xl p-4 pb-24 md:p-8">
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

  if (activeTab !== 'home') {
    if (activeTab === 'stats') {
      return (
        <main className="mx-auto flex h-[100dvh] max-w-5xl flex-col overflow-hidden p-4 md:p-8">
          <header className="mb-3 shrink-0">
            <div className="mb-1 flex items-center justify-between">
              <Button size="icon" variant="outline" onClick={() => setMenuOpen(true)}><Menu className="h-5 w-5" /></Button>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Stats</h1>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <Card className="mt-2">
              <h2 className="text-xl font-semibold text-foreground">Stats</h2>
              <p className="mt-2 text-sm text-muted">Statistics screen coming soon.</p>
            </Card>
          </div>

          {renderBottomNav()}

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

    const scheduleZone = selectedScheduleZone();
    const scheduleIsBinary = isBinaryScheduleDevice(scheduleZone);
    const dayName = scheduleDayIndex === null ? '' : WEEK_DAYS[scheduleDayIndex] || 'Day';

    return (
      <main className="mx-auto flex h-[100dvh] max-w-5xl flex-col overflow-hidden p-4 md:p-8">
        <header className="mb-3 shrink-0">
          <div className="mb-1 flex items-center justify-between">
            <Button
              size="icon"
              variant="outline"
              onClick={() => {
                if (scheduleDayIndex !== null) {
                  setScheduleDayIndex(null);
                } else if (scheduleZoneId !== null) {
                  setScheduleZoneId(null);
                } else {
                  setMenuOpen(true);
                }
              }}
            >
              {scheduleZoneId !== null ? '‹' : <Menu className="h-5 w-5" />}
            </Button>
            <div className="text-sm font-medium text-slate-500">
              {scheduleDayIndex !== null ? dayName : scheduleZone ? scheduleZone.name : 'Select a zone'}
            </div>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Schedule</h1>
        </header>

        <div ref={scheduleScrollerRef} className="min-h-0 flex-1 overflow-y-auto">
          {scheduleZoneId === null ? (
            <section className="grid gap-3">
              {scheduleDevices.map((zone) => (
                <Card
                  key={zone.id}
                  className="cursor-pointer"
                  onClick={() => {
                    void openScheduleZone(zone.id);
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-foreground">{zone.name}</h3>
                      <p className="text-sm text-muted">Tap to edit weekly program</p>
                    </div>
                    <span className="text-2xl text-slate-400">›</span>
                  </div>
                </Card>
              ))}
            </section>
          ) : scheduleDayIndex === null ? (
            <section className="grid gap-3">
              {getZoneSchedule(scheduleZoneId).map((day, dayIdx) => (
                <Card key={day.day} className="border border-slate-200/90">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between"
                    onClick={() => toggleScheduleDayExpanded(scheduleZoneId, dayIdx)}
                    aria-expanded={isScheduleDayExpanded(scheduleZoneId, dayIdx)}
                  >
                    <h3 className="text-2xl font-semibold text-slate-900">{day.day}</h3>
                    <ChevronUp
                      className={`h-5 w-5 text-slate-400 transition-transform ${
                        isScheduleDayExpanded(scheduleZoneId, dayIdx) ? 'rotate-0' : 'rotate-180'
                      }`}
                    />
                  </button>

                  {!isScheduleDayExpanded(scheduleZoneId, dayIdx) ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {day.periods
                        .slice()
                        .sort((a, b) => a.start - b.start)
                        .map((period, idx) => (
                          <div
                            key={idx}
                            className={scheduleIsBinary ? (Number(period.temp) >= 0.5 ? "rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700" : "rounded-full border border-slate-200 bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600") : "rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600"}
                          >
                            {formatScheduleValue(period, scheduleIsBinary)} → {formatHour(period.end)}
                          </div>
                        ))}
                    </div>
                  ) : null}

                  {isScheduleDayExpanded(scheduleZoneId, dayIdx) ? (
                    <>
                      <div className="mt-3 grid gap-3">
                        {day.periods
                          .slice()
                          .sort((a, b) => a.start - b.start)
                          .map((period, idx) => {
                            const color = SCHEDULE_COLORS[period.colorIndex % SCHEDULE_COLORS.length];
                            const startPct = (period.start / 24) * 100;
                            const widthPct = ((period.end - period.start) / 24) * 100;
                            const endLabel = formatHour(period.end);
                            const labelCenterPct = startPct + widthPct / 2;
                            const clampedLabelCenterPct = Math.max(18, Math.min(82, labelCenterPct));
                            const barColor = scheduleIsBinary ? (Number(period.temp) >= 0.5 ? '#22c55e' : '#94a3b8') : getTempScaleColor(period.temp);
                            return (
                              <div key={idx}>
                                <div className="relative mb-1 h-7">
                                  <div
                                    className={`absolute top-0 text-center text-sm font-semibold whitespace-nowrap ${color.text}`}
                                    style={{ left: `${clampedLabelCenterPct}%`, transform: 'translateX(-50%)' }}
                                  >
                                    {formatScheduleValue(period, scheduleIsBinary)} <span className="text-xs font-medium text-slate-500">→ {endLabel}</span>
                                  </div>
                                </div>
                                <div className="h-3 rounded-full bg-slate-100">
                                  <div
                                    className="h-3 rounded-full"
                                    style={{ backgroundColor: barColor, marginLeft: `${startPct}%`, width: `${widthPct}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                      </div>

                      <button
                        type="button"
                        className="mt-4 w-full rounded-xl border border-slate-200 px-4 py-3 text-base font-semibold text-emerald-600"
                        onClick={() => setScheduleDayIndex(dayIdx)}
                      >
                        Edit day
                      </button>
                    </>
                  ) : null}
                </Card>
              ))}
            </section>
          ) : (
            <section className="grid gap-3 pb-2">
              <Card>
                <div className="mb-2 flex items-center justify-between text-sm text-muted">
                  <span>{dayName}</span>
                  <span>24h timeline</span>
                </div>
                <div className="rounded-xl border border-border bg-slate-50 p-2">
                  <div className="flex h-14 overflow-hidden rounded-lg border border-border bg-white">
                    {getDayPeriods(scheduleZoneId, scheduleDayIndex)
                      .slice()
                      .sort((a, b) => a.start - b.start)
                      .map((period, idx) => {
                        const barColor = scheduleIsBinary ? (Number(period.temp) >= 0.5 ? '#22c55e' : '#94a3b8') : getTempScaleColor(period.temp);
                        const widthPercent = ((period.end - period.start) / 24) * 100;
                        return (
                          <div
                            key={idx}
                            className="flex items-center justify-center text-sm font-bold text-white"
                            style={{ width: `${widthPercent}%`, backgroundColor: barColor }}
                          >
                            {formatScheduleValue(period, scheduleIsBinary)}
                          </div>
                        );
                      })}
                  </div>
                  <div className="mt-2 flex justify-between px-1 text-xs text-slate-400">
                    <span>0:00</span>
                    <span>6:00</span>
                    <span>12:00</span>
                    <span>18:00</span>
                    <span>24:00</span>
                  </div>
                </div>
              </Card>

              {getDayPeriods(scheduleZoneId, scheduleDayIndex)
                .slice()
                .sort((a, b) => a.start - b.start)
                .map((period, idx) => {
                  const color = SCHEDULE_COLORS[period.colorIndex % SCHEDULE_COLORS.length];
                  const barColor = scheduleIsBinary ? (Number(period.temp) >= 0.5 ? '#22c55e' : '#94a3b8') : getTempScaleColor(period.temp);
                  return (
                    <Card key={`${period.start}-${period.end}-${idx}`} className={`${color.bg}`}>
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-1.5 rounded-full" style={{ backgroundColor: barColor }} />
                        <div className="min-w-[110px] text-base font-semibold text-slate-600">
                          {formatHour(period.start)} - {formatHour(period.end)}
                        </div>
                        <div className="ml-auto flex items-center gap-2">
                          {scheduleIsBinary ? (
                            <button
                              type="button"
                              className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-700"
                              onClick={() =>
                                setSchedulePeriodValue(scheduleZoneId, scheduleDayIndex, idx, Number(period.temp) >= 0.5 ? 0 : 1)
                              }
                            >
                              {Number(period.temp) >= 0.5 ? 'Set Off' : 'Set On'}
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="grid h-9 w-9 place-items-center rounded-full bg-white text-lg font-bold text-slate-500"
                                onClick={() => adjustScheduleTemp(scheduleZoneId, scheduleDayIndex, idx, -0.5)}
                              >
                                −
                              </button>
                              <div className={`min-w-[68px] text-center text-xl font-bold ${color.text}`}>
                                {formatScheduleValue(period, scheduleIsBinary)}
                              </div>
                              <button
                                type="button"
                                className="grid h-9 w-9 place-items-center rounded-full bg-white text-lg font-bold text-slate-500"
                                onClick={() => adjustScheduleTemp(scheduleZoneId, scheduleDayIndex, idx, 0.5)}
                              >
                                +
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            className="ml-1 grid h-9 w-9 place-items-center rounded-full bg-white text-base font-bold text-slate-400"
                            onClick={() => removeSchedulePeriod(scheduleZoneId, scheduleDayIndex, idx)}
                            aria-label="Delete period"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    </Card>
                  );
                })}

              <Button variant="outline" onClick={() => addSchedulePeriod(scheduleZoneId, scheduleDayIndex)}>
                + Add period
              </Button>
            </section>
          )}
        </div>

        {renderBottomNav()}

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

  if (activeTab === 'home' && selectedZone) {
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
      const start = ((startAngle % 360) + 360) % 360;
      const clockwiseDelta = (angleDeg - start + 360) % 360;
      const clampedDelta = Math.min(sweepAngle, Math.max(0, clockwiseDelta));
      const ratio = clampedDelta / sweepAngle;
      const next = minTemp + ratio * (maxTemp - minTemp);
      const snapped = Math.round(next * 2) / 2;
      setTargetDraft(Math.max(minTemp, Math.min(maxTemp, snapped)));
    };

    return (
      <main className="mx-auto flex h-[100dvh] max-w-5xl flex-col overflow-hidden p-4 md:p-8">
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
                  if (!shouldStartDialDrag(event, element)) {
                    return;
                  }
                  dialPointerIdRef.current = event.pointerId;
                  updateDialFromPointer(event, element);
                  element.setPointerCapture?.(event.pointerId);
                }}
                onPointerMove={(event) => {
                  if (dialPointerIdRef.current !== event.pointerId) {
                    return;
                  }
                  updateDialFromPointer(event, event.currentTarget);
                }}
                onPointerUp={(event) => {
                  if (dialPointerIdRef.current !== event.pointerId) {
                    return;
                  }
                  dialPointerIdRef.current = null;
                  event.currentTarget.releasePointerCapture?.(event.pointerId);
                }}
                onPointerCancel={(event) => {
                  if (dialPointerIdRef.current !== event.pointerId) {
                    return;
                  }
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
        </div>

        {renderBottomNav()}
      </main>
    );
  }

  const hotWater = devices.find((d) => d.type === 'hotWater');
  const connection = mapConnectionStatus(connectionState);
  const isErrorStatus = status.toLowerCase().includes('failed') || status.toLowerCase().includes('error');
  const pullProgress = Math.min(1, pullDistance / 56);
  const ringRadius = 10;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringDashOffset = ringCircumference * (1 - pullProgress);

  return (
    <main className="mx-auto flex h-[100dvh] max-w-5xl flex-col overflow-hidden p-4 md:p-8">
      <header className="mb-3 shrink-0">
        <div className="mb-1 flex items-center justify-between">
          <Button size="icon" variant="outline" onClick={() => setMenuOpen(true)}><Menu className="h-5 w-5" /></Button>
          <div className="flex items-center gap-2 text-sm text-muted">
            <span className={`h-2 w-2 rounded-full ${connection.dotClass}`} />
            <span>{connection.label}</span>
          </div>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Home</h1>
      </header>

      <div
        ref={contentRef}
        className="min-h-0 flex-1 overflow-y-auto"
        onTouchStart={onContentTouchStart}
        onTouchMove={onContentTouchMove}
        onTouchEnd={onContentTouchEnd}
        onTouchCancel={onContentTouchEnd}
      >
        <div className="flex justify-center" style={{ height: pullDistance > 0 || isRefreshing ? 36 : 0 }}>
          <div className="mt-1.5 h-6 w-6">
            <svg
              viewBox="0 0 24 24"
              className={isRefreshing ? 'h-6 w-6 animate-spin' : 'h-6 w-6'}
              aria-hidden="true"
            >
              <circle
                cx="12"
                cy="12"
                r={ringRadius}
                fill="none"
                stroke="#cbd5e1"
                strokeWidth="2"
              />
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

        <div style={{ transform: `translateY(${pullDistance}px)`, transition: pullDistance === 0 ? 'transform 140ms ease' : 'none' }}>
          {status ? (
            <p className={`mb-3 text-sm ${isErrorStatus ? 'text-rose-600' : 'text-muted'}`}>{status}</p>
          ) : null}

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
      </div>

      {renderBottomNav()}

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
