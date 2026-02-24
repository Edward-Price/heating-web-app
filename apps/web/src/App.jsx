import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, CalendarDays, House } from 'lucide-react';
import { Button } from './components/ui/button';
import { Card } from './components/ui/card';
import { Input } from './components/ui/input';
import HomeScreen from './screens/HomeScreen';
import StatsScreen from './screens/StatsScreen';
import ScheduleScreen from './screens/ScheduleScreen';
import { zoneState, formatTemperature, mapConnectionStatus } from './lib/deviceUtils';
import {
  createStatsConfig,
  shiftAnchor,
  getStatsDomainBounds,
  buildSeriesPath,
  buildSeriesCoordinates,
  buildSeriesAreaPath,
  formatStatsTimestamp,
  formatStatsAxisLabel,
} from './lib/statsUtils';
import {
  WEEK_DAYS,
  createEmptyWeekSchedule,
  formatHour,
  isBinaryScheduleDevice,
  formatScheduleValue,
  getTempScaleColor,
} from './lib/scheduleUtils';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';
const STORAGE_KEY = 'heating-web-session-token';
const THEME_STORAGE_KEY = 'heating-web-theme';
const SCHEDULE_COLORS = [
  { bg: 'bg-sky-50', text: 'text-sky-700', bar: 'bg-sky-400', chip: 'bg-sky-500' },
  { bg: 'bg-orange-50', text: 'text-orange-700', bar: 'bg-orange-400', chip: 'bg-orange-500' },
  { bg: 'bg-emerald-50', text: 'text-emerald-700', bar: 'bg-emerald-400', chip: 'bg-emerald-500' },
  { bg: 'bg-violet-50', text: 'text-violet-700', bar: 'bg-violet-400', chip: 'bg-violet-500' },
];

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
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_STORAGE_KEY) || 'light');
  const [activeTab, setActiveTab] = useState('home');
  const [scheduleZoneId, setScheduleZoneId] = useState(null);
  const [scheduleDayIndex, setScheduleDayIndex] = useState(null);
  const [scheduleByZone, setScheduleByZone] = useState({});
  const [scheduleLoadingByZone, setScheduleLoadingByZone] = useState({});
  const [expandedScheduleDays, setExpandedScheduleDays] = useState({});
  const [statsConfigByZone, setStatsConfigByZone] = useState({});
  const [statsSeriesByZone, setStatsSeriesByZone] = useState({});
  const [statsLoadingByZone, setStatsLoadingByZone] = useState({});
  const [statsHoverByZone, setStatsHoverByZone] = useState({});
  const [connectionState, setConnectionState] = useState('disconnected');
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [statsPullDistance, setStatsPullDistance] = useState(0);
  const [isStatsRefreshing, setIsStatsRefreshing] = useState(false);
  const isLoadingRef = useRef(false);
  const dialPointerIdRef = useRef(null);
  const scheduleScrollerRef = useRef(null);
  const contentRef = useRef(null);
  const pullStartYRef = useRef(null);
  const statsContentRef = useRef(null);
  const statsPullStartYRef = useRef(null);

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
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (sessionToken) {
      void loadDashboard();
    }
  }, [sessionToken, loadDashboard]);

  useEffect(() => {
    if (!zones.length) return;
    setStatsConfigByZone((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const zone of zones) {
        const key = String(zone.id);
        if (!next[key]) {
          next[key] = createStatsConfig('day');
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [zones]);

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


  function toggleTheme() {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
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

  async function fetchZoneStats(zoneId, overrideConfig) {
    const key = String(zoneId);
    const config = overrideConfig || statsConfigByZone[key] || createStatsConfig('day');
    const range = config.range === 'month' ? 'month' : 'day';
    const anchor = config.anchor;

    setStatsLoadingByZone((prev) => ({ ...prev, [key]: true }));
    try {
      const qs = new URLSearchParams({ range, anchor }).toString();
      const res = await apiGet(`/stats/zone/${zoneId}?${qs}`);
      const points = Array.isArray(res.points) ? res.points : [];
      setStatsSeriesByZone((prev) => ({
        ...prev,
        [key]: {
          zoneId: Number(zoneId),
          range,
          anchor,
          points,
          from: res.from || null,
          to: res.to || null,
        },
      }));
    } catch (err) {
      setStatus(`Stats load failed: ${String(err.message || err)}`);
    } finally {
      setStatsLoadingByZone((prev) => ({ ...prev, [key]: false }));
    }
  }

  useEffect(() => {
    if (activeTab !== 'stats' || !zones.length) return;
    for (const zone of zones) {
      const key = String(zone.id);
      if (!statsSeriesByZone[key]) {
        const config = statsConfigByZone[key] || createStatsConfig('day');
        void fetchZoneStats(zone.id, config);
      }
    }
  }, [activeTab, zones, statsSeriesByZone, statsConfigByZone]);

  function setZoneStatsRange(zoneId, range) {
    const key = String(zoneId);
    const nextConfig = createStatsConfig(range);
    setStatsConfigByZone((prev) => ({ ...prev, [key]: nextConfig }));
    void fetchZoneStats(zoneId, nextConfig);
  }

  function shiftZoneStats(zoneId, delta) {
    const key = String(zoneId);
    const currentConfig = statsConfigByZone[key] || createStatsConfig('day');
    const nextConfig = {
      ...currentConfig,
      anchor: shiftAnchor(currentConfig.anchor, currentConfig.range, delta),
    };
    setStatsConfigByZone((prev) => ({ ...prev, [key]: nextConfig }));
    void fetchZoneStats(zoneId, nextConfig);
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
    const zoneKey = String(zoneId);
    setScheduleZoneId(zoneId);
    setScheduleDayIndex(null);
    setScheduleLoadingByZone((prev) => ({ ...prev, [zoneKey]: true }));
    try {
      const res = await apiGet(`/zones/${zoneId}/schedule`);
      const week = normalizeScheduleWeekPayload(res.week);
      setScheduleByZone((prev) => ({ ...prev, [zoneKey]: week }));
      setStatus('');
    } catch (err) {
      setStatus(`Schedule load failed: ${String(err.message || err)}`);
    } finally {
      setScheduleLoadingByZone((prev) => ({ ...prev, [zoneKey]: false }));
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
      <nav className="z-50 shrink-0 overflow-visible border-t border-border/80 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-white/80 dark:bg-slate-900/95 dark:supports-[backdrop-filter]:bg-slate-900/80">
        <div className="mx-auto grid max-w-5xl grid-cols-3 px-3 pb-2 pt-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const selected = activeTab === tab.key;
            const isHomeTab = tab.key === 'home';
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => onSelectTab(tab.key)}
                className={isHomeTab ? 'relative -mt-5 flex flex-col items-center justify-center gap-1 py-1' : 'flex flex-col items-center justify-center gap-1 py-1'}
                aria-label={tab.label}
                aria-current={selected ? 'page' : undefined}
              >
                {isHomeTab ? (
                  <span
                    className={
                      selected
                        ? 'grid h-14 w-14 place-items-center rounded-full border border-border bg-foreground text-white shadow-lg shadow-slate-900/20 dark:border-slate-600 dark:bg-slate-100 dark:text-slate-900'
                        : 'grid h-14 w-14 place-items-center rounded-full border border-border bg-white text-slate-500 shadow-md shadow-slate-900/10 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300'
                    }
                  >
                    <Icon className="h-6 w-6" />
                  </span>
                ) : (
                  <Icon className={selected ? 'h-5 w-5 text-foreground' : 'h-5 w-5 text-slate-400'} />
                )}
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

  const runStatsPullRefresh = useCallback(async () => {
    if (isStatsRefreshing) return;
    setIsStatsRefreshing(true);
    try {
      await loadDashboard();
      await Promise.all(
        zones.map((zone) => {
          const key = String(zone.id);
          const config = statsConfigByZone[key] || createStatsConfig('day');
          return fetchZoneStats(zone.id, config);
        })
      );
    } finally {
      setIsStatsRefreshing(false);
    }
  }, [isStatsRefreshing, loadDashboard, zones, statsConfigByZone, fetchZoneStats]);

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

    event.preventDefault();
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

  const onStatsTouchStart = useCallback((event) => {
    const el = statsContentRef.current;
    if (!el) return;
    if (el.scrollTop > 0) {
      statsPullStartYRef.current = null;
      return;
    }
    statsPullStartYRef.current = event.touches[0]?.clientY ?? null;
  }, []);

  const onStatsTouchMove = useCallback((event) => {
    const el = statsContentRef.current;
    const startY = statsPullStartYRef.current;
    if (!el || startY === null || el.scrollTop > 0) return;

    const currentY = event.touches[0]?.clientY ?? startY;
    const delta = currentY - startY;
    if (delta <= 0) {
      setStatsPullDistance(0);
      return;
    }
    event.preventDefault();
    setStatsPullDistance(Math.min(84, delta * 0.45));
  }, []);

  const onStatsTouchEnd = useCallback(() => {
    const shouldRefresh = statsPullDistance >= 56;
    statsPullStartYRef.current = null;
    setStatsPullDistance(0);
    if (shouldRefresh) {
      void runStatsPullRefresh();
    }
  }, [statsPullDistance, runStatsPullRefresh]);

  const setStatsHoverFromClientX = useCallback((zoneId, points, clientX, bounds, domainStartTs, domainEndTs) => {
    if (!Array.isArray(points) || points.length === 0 || !bounds || bounds.width <= 0) {
      setStatsHoverByZone((prev) => ({ ...prev, [String(zoneId)]: null }));
      return;
    }

    const firstTs = Number.isFinite(Number(domainStartTs)) ? Number(domainStartTs) : Number(points[0].ts);
    const lastTs = Number.isFinite(Number(domainEndTs)) ? Number(domainEndTs) : Number(points[points.length - 1].ts);
    const firstDataTs = Number(points[0].ts);
    const lastDataTs = Number(points[points.length - 1].ts);
    const clampedRatio = Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width));
    const targetTs = firstTs + (lastTs - firstTs) * clampedRatio;
    if (targetTs < firstDataTs || targetTs > lastDataTs) {
      setStatsHoverByZone((prev) => ({ ...prev, [String(zoneId)]: null }));
      return;
    }

    let closestIdx = 0;
    let closestDiff = Infinity;
    for (let idx = 0; idx < points.length; idx += 1) {
      const diff = Math.abs(Number(points[idx].ts) - targetTs);
      if (diff < closestDiff) {
        closestDiff = diff;
        closestIdx = idx;
      }
    }

    setStatsHoverByZone((prev) => ({ ...prev, [String(zoneId)]: closestIdx }));
  }, []);

  const clearStatsHover = useCallback((zoneId) => {
    setStatsHoverByZone((prev) => ({ ...prev, [String(zoneId)]: null }));
  }, []);

  if (!loggedIn) {
    return (
      <main className="mx-auto min-h-[100svh] h-[100dvh] max-w-5xl overflow-y-auto px-4 pb-4 pt-[calc(env(safe-area-inset-top)+1rem)] md:p-8">
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

  const hotWater = devices.find((d) => d.type === 'hotWater');
  const connection = mapConnectionStatus(connectionState);
  const isErrorStatus = status.toLowerCase().includes('failed') || status.toLowerCase().includes('error');
  const isDashboardLoading = connectionState === 'loading' && zones.length === 0;
  const pullProgress = Math.min(1, pullDistance / 56);
  const ringRadius = 10;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringDashOffset = ringCircumference * (1 - pullProgress);
  const scheduleZone = selectedScheduleZone();
  const scheduleIsBinary = isBinaryScheduleDevice(scheduleZone);
  const isScheduleZoneLoading = scheduleZoneId !== null && Boolean(scheduleLoadingByZone[String(scheduleZoneId)]);
  const dayName = scheduleDayIndex === null ? '' : WEEK_DAYS[scheduleDayIndex] || 'Day';

  if (activeTab === 'stats') {
    return (
      <StatsScreen
        zones={zones}
        statsPullDistance={statsPullDistance}
        isStatsRefreshing={isStatsRefreshing}
        statsContentRef={statsContentRef}
        onStatsTouchStart={onStatsTouchStart}
        onStatsTouchMove={onStatsTouchMove}
        onStatsTouchEnd={onStatsTouchEnd}
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
        renderBottomNav={renderBottomNav}
        statsConfigByZone={statsConfigByZone}
        createStatsConfig={createStatsConfig}
        statsSeriesByZone={statsSeriesByZone}
        statsLoadingByZone={statsLoadingByZone}
        getStatsDomainBounds={getStatsDomainBounds}
        buildSeriesPath={buildSeriesPath}
        buildSeriesCoordinates={buildSeriesCoordinates}
        buildSeriesAreaPath={buildSeriesAreaPath}
        statsHoverByZone={statsHoverByZone}
        setZoneStatsRange={setZoneStatsRange}
        shiftZoneStats={shiftZoneStats}
        setStatsHoverFromClientX={setStatsHoverFromClientX}
        clearStatsHover={clearStatsHover}
        formatStatsAxisLabel={formatStatsAxisLabel}
        formatStatsTimestamp={formatStatsTimestamp}
        toggleTheme={toggleTheme}
        theme={theme}
        onLogout={onLogout}
      />
    );
  }

  if (activeTab === 'schedule') {
    return (
      <ScheduleScreen
        scheduleZone={scheduleZone}
        scheduleIsBinary={scheduleIsBinary}
        isScheduleZoneLoading={isScheduleZoneLoading}
        dayName={dayName}
        scheduleZoneId={scheduleZoneId}
        setScheduleZoneId={setScheduleZoneId}
        scheduleDayIndex={scheduleDayIndex}
        setScheduleDayIndex={setScheduleDayIndex}
        scheduleScrollerRef={scheduleScrollerRef}
        scheduleDevices={scheduleDevices}
        openScheduleZone={openScheduleZone}
        WEEK_DAYS={WEEK_DAYS}
        getZoneSchedule={getZoneSchedule}
        isScheduleDayExpanded={isScheduleDayExpanded}
        toggleScheduleDayExpanded={toggleScheduleDayExpanded}
        formatScheduleValue={formatScheduleValue}
        formatHour={formatHour}
        getTempScaleColor={getTempScaleColor}
        SCHEDULE_COLORS={SCHEDULE_COLORS}
        setSchedulePeriodValue={setSchedulePeriodValue}
        adjustScheduleTemp={adjustScheduleTemp}
        removeSchedulePeriod={removeSchedulePeriod}
        addSchedulePeriod={addSchedulePeriod}
        getDayPeriods={getDayPeriods}
        renderBottomNav={renderBottomNav}
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
        toggleTheme={toggleTheme}
        theme={theme}
        onLogout={onLogout}
      />
    );
  }

  return (
    <HomeScreen
      selectedZone={selectedZone}
      zoneState={zoneState}
      stateByDeviceId={stateByDeviceId}
      targetDraft={targetDraft}
      setTargetDraft={setTargetDraft}
      setSelectedZoneId={setSelectedZoneId}
      status={status}
      writeTarget={writeTarget}
      renderBottomNav={renderBottomNav}
      dialPointerIdRef={dialPointerIdRef}
      connection={connection}
      menuOpen={menuOpen}
      setMenuOpen={setMenuOpen}
      toggleTheme={toggleTheme}
      theme={theme}
      onLogout={onLogout}
      contentRef={contentRef}
      onContentTouchStart={onContentTouchStart}
      onContentTouchMove={onContentTouchMove}
      onContentTouchEnd={onContentTouchEnd}
      pullDistance={pullDistance}
      isRefreshing={isRefreshing}
      ringRadius={ringRadius}
      ringCircumference={ringCircumference}
      ringDashOffset={ringDashOffset}
      isErrorStatus={isErrorStatus}
      isDashboardLoading={isDashboardLoading}
      zones={zones}
      formatTemperature={formatTemperature}
      hotWater={hotWater}
      writeHotWater={writeHotWater}
    />
  );
}
