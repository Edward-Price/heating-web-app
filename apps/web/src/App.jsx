import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, CalendarDays, House } from 'lucide-react';
import { Button } from './components/ui/button';
import { Card } from './components/ui/card';
import { Input } from './components/ui/input';
import HomeScreen from './screens/HomeScreen';
import ModernHomeScreen from './screens/ModernHomeScreen';
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
const DESIGN_STORAGE_KEY = 'heating-web-design';
const DEBUG_LAYOUT_STORAGE_KEY = 'heating-web-debug-layout';
const SCHEDULE_COLORS = [
  { bg: 'bg-sky-50', text: 'text-sky-700', bar: 'bg-sky-400', chip: 'bg-sky-500' },
  { bg: 'bg-orange-50', text: 'text-orange-700', bar: 'bg-orange-400', chip: 'bg-orange-500' },
  { bg: 'bg-emerald-50', text: 'text-emerald-700', bar: 'bg-emerald-400', chip: 'bg-emerald-500' },
  { bg: 'bg-violet-50', text: 'text-violet-700', bar: 'bg-violet-400', chip: 'bg-violet-500' },
];
const EMPTY_SCHEDULE_NOTICE = { kind: 'neutral', text: '', dismissAt: null, zoneId: null, dayIndex: null };

export default function App() {
  const [debugLayoutEnabled, setDebugLayoutEnabled] = useState(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    const queryValue = params.get('debugLayout');
    if (queryValue === '1') return true;
    if (queryValue === '0') return false;
    return localStorage.getItem(DEBUG_LAYOUT_STORAGE_KEY) === '1';
  });
  const [sessionToken, setSessionToken] = useState(() => localStorage.getItem(STORAGE_KEY) || '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('Please sign in.');
  const [systems, setSystems] = useState([]);
  const [selectedSystemId, setSelectedSystemId] = useState(null);
  const [systemsLoading, setSystemsLoading] = useState(false);
  const [devices, setDevices] = useState([]);
  const [stateByDeviceId, setStateByDeviceId] = useState({});
  const [selectedZoneId, setSelectedZoneId] = useState(null);
  const [targetDraft, setTargetDraft] = useState(20);
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_STORAGE_KEY) || 'light');
  const [designMode, setDesignMode] = useState(() => localStorage.getItem(DESIGN_STORAGE_KEY) || 'classic');
  const [activeTab, setActiveTab] = useState('home');
  const [scheduleZoneId, setScheduleZoneId] = useState(null);
  const [scheduleDayIndex, setScheduleDayIndex] = useState(null);
  const [scheduleByZone, setScheduleByZone] = useState({});
  const [savedScheduleByZone, setSavedScheduleByZone] = useState({});
  const [scheduleIdByZone, setScheduleIdByZone] = useState({});
  const [scheduleLoadingByZone, setScheduleLoadingByZone] = useState({});
  const [scheduleSavingByZone, setScheduleSavingByZone] = useState({});
  const [scheduleNotice, setScheduleNotice] = useState(EMPTY_SCHEDULE_NOTICE);
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
  const [layoutDebug, setLayoutDebug] = useState(null);
  const [layoutCopyStatus, setLayoutCopyStatus] = useState('');
  const isLoadingRef = useRef(false);
  const isSystemsLoadingRef = useRef(false);
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
    setSystems([]);
    setSelectedSystemId(null);
    setSystemsLoading(false);
    setScheduleZoneId(null);
    setScheduleDayIndex(null);
    setMenuOpen(false);
    setDevices([]);
    setStateByDeviceId({});
    setScheduleByZone({});
    setSavedScheduleByZone({});
    setScheduleIdByZone({});
    setScheduleLoadingByZone({});
    setScheduleSavingByZone({});
    setScheduleNotice(EMPTY_SCHEDULE_NOTICE);
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

  const apiPut = useCallback(async (path, body, tokenOverride) => {
    const token = typeof tokenOverride === 'string' ? tokenOverride : sessionToken;
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'PUT',
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
  }, [apiGet]);

  const loadSystems = useCallback(async (tokenOverride) => {
    if (isSystemsLoadingRef.current) return;
    isSystemsLoadingRef.current = true;
    setSystemsLoading(true);
    try {
      setStatus('Loading heating systems...');
      const result = await apiGet('/systems', tokenOverride);
      const fetchedSystems = Array.isArray(result.systems) ? result.systems : [];
      setSystems(fetchedSystems);
      const selectedId = result.selectedGatewayId ? String(result.selectedGatewayId) : null;
      setSelectedSystemId(selectedId);
      if (selectedId) {
        await loadDashboard(tokenOverride);
      } else {
        setStatus(fetchedSystems.length ? 'Choose a heating system.' : 'No heating systems were found for this account.');
      }
    } catch (err) {
      if (err && err.message !== 'Unauthorized') {
        setStatus(`System load failed: ${String(err.message || err)}`);
      }
    } finally {
      setSystemsLoading(false);
      isSystemsLoadingRef.current = false;
    }
  }, [apiGet, loadDashboard]);
  const zones = useMemo(() => devices.filter((d) => d.type === 'zone'), [devices]);
  const scheduleDevices = useMemo(() => devices, [devices]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(DEBUG_LAYOUT_STORAGE_KEY, debugLayoutEnabled ? '1' : '0');
  }, [debugLayoutEnabled]);

  useEffect(() => {
    localStorage.setItem(DESIGN_STORAGE_KEY, designMode);
  }, [designMode]);

  const collectLayoutSnapshot = useCallback(() => {
    if (!debugLayoutEnabled) return null;

    const toRect = (element) => {
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return {
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
        height: Math.round(rect.height),
      };
    };

    const probe = document.createElement('div');
    probe.style.position = 'fixed';
    probe.style.visibility = 'hidden';
    probe.style.pointerEvents = 'none';
    probe.style.paddingTop = 'env(safe-area-inset-top)';
    probe.style.paddingBottom = 'env(safe-area-inset-bottom)';
    document.body.appendChild(probe);
    const probeStyle = getComputedStyle(probe);
    const safeAreaTop = probeStyle.paddingTop;
    const safeAreaBottom = probeStyle.paddingBottom;
    probe.remove();

    const main = document.querySelector('main');
    const nav = document.querySelector('nav');
    const root = document.getElementById('root');
    const snapshot = {
      timestamp: new Date().toISOString(),
      activeTab,
      standalone: window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true,
      ua: window.navigator.userAgent,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      visualViewportHeight: window.visualViewport?.height ?? null,
      visualViewportOffsetTop: window.visualViewport?.offsetTop ?? null,
      docClientHeight: document.documentElement.clientHeight,
      safeAreaTop,
      safeAreaBottom,
      mainRect: toRect(main),
      navRect: toRect(nav),
      rootRect: toRect(root),
    };
    setLayoutDebug(snapshot);
    return snapshot;
  }, [activeTab, debugLayoutEnabled]);

  useEffect(() => {
    if (!debugLayoutEnabled) return undefined;

    const refresh = () => {
      window.requestAnimationFrame(() => {
        collectLayoutSnapshot();
      });
    };

    refresh();
    window.addEventListener('resize', refresh);
    window.addEventListener('orientationchange', refresh);
    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', refresh);
    window.addEventListener('visibilitychange', refresh);
    window.visualViewport?.addEventListener('resize', refresh);

    return () => {
      window.removeEventListener('resize', refresh);
      window.removeEventListener('orientationchange', refresh);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('pageshow', refresh);
      window.removeEventListener('visibilitychange', refresh);
      window.visualViewport?.removeEventListener('resize', refresh);
    };
  }, [collectLayoutSnapshot, debugLayoutEnabled]);

  useEffect(() => {
    if (!layoutCopyStatus) return undefined;
    const timeoutId = window.setTimeout(() => setLayoutCopyStatus(''), 1800);
    return () => window.clearTimeout(timeoutId);
  }, [layoutCopyStatus]);

  useEffect(() => {
    if (!Number.isFinite(Number(scheduleNotice.dismissAt))) return undefined;
    const delay = Math.max(0, Number(scheduleNotice.dismissAt) - Date.now());
    const timeoutId = window.setTimeout(() => {
      setScheduleNotice((prev) => {
        if (prev.dismissAt !== scheduleNotice.dismissAt) return prev;
        return EMPTY_SCHEDULE_NOTICE;
      });
    }, delay);
    return () => window.clearTimeout(timeoutId);
  }, [scheduleNotice.dismissAt]);

  useEffect(() => {
    if (sessionToken) {
      void loadSystems();
    }
  }, [sessionToken, loadSystems]);

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
      setSystems(Array.isArray(data.systems) ? data.systems : []);
      setSelectedSystemId(null);
      setStatus('Choose a heating system.');
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

  async function onSelectSystem(gatewayId) {
    const system = systems.find((item) => String(item.gatewayId) === String(gatewayId));
    try {
      setStatus(`Loading ${system?.name || 'heating system'}...`);
      await apiPost('/systems/select', { gatewayId: String(gatewayId) });
      setSelectedSystemId(String(gatewayId));
      setDevices([]);
      setStateByDeviceId({});
      setSelectedZoneId(null);
      setScheduleZoneId(null);
      setScheduleDayIndex(null);
      setScheduleByZone({});
      setSavedScheduleByZone({});
      setScheduleIdByZone({});
      setActiveTab('home');
      await loadDashboard();
    } catch (err) {
      setSelectedSystemId(null);
      setStatus(`System selection failed: ${String(err.message || err)}`);
    }
  }

  function onChangeSystem() {
    setMenuOpen(false);
    setSelectedSystemId(null);
    setSelectedZoneId(null);
    setDevices([]);
    setStateByDeviceId({});
    setConnectionState('disconnected');
    setActiveTab('home');
    setStatus('Choose a heating system.');
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

  function toggleDesignMode() {
    setDesignMode((prev) => (prev === 'modern' ? 'classic' : 'modern'));
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

  function cloneWeekSchedule(week) {
    const sourceWeek = Array.isArray(week) ? week : createEmptyWeekSchedule();
    return sourceWeek.map((day, dayIndex) => ({
      day: day && day.day ? day.day : WEEK_DAYS[dayIndex],
      periods: Array.isArray(day && day.periods) ? day.periods.map((period) => ({ ...period })) : [],
    }));
  }

  function showScheduleNotice(zoneId, dayIndex, kind, text, autoDismissMs = null) {
    setScheduleNotice({
      kind,
      text,
      zoneId: Number(zoneId),
      dayIndex: Number(dayIndex),
      dismissAt: Number.isFinite(Number(autoDismissMs)) ? Date.now() + Number(autoDismissMs) : null,
    });
  }

  function dismissScheduleNotice() {
    setScheduleNotice(EMPTY_SCHEDULE_NOTICE);
  }

  function clearScheduleNoticeForContext(zoneId, dayIndex) {
    setScheduleNotice((prev) => {
      if (Number(prev.zoneId) !== Number(zoneId) || Number(prev.dayIndex) !== Number(dayIndex)) {
        return prev;
      }
      if (prev.kind === 'saving') {
        return prev;
      }
      return EMPTY_SCHEDULE_NOTICE;
    });
  }

  function normalizePeriodsForCompare(periods) {
    return (Array.isArray(periods) ? periods : [])
      .map((period) => ({
        start: Number(period && period.start),
        end: Number(period && period.end),
        temp: Number(period && period.temp),
      }))
      .filter((period) => Number.isFinite(period.start) && Number.isFinite(period.end) && Number.isFinite(period.temp))
      .map((period) => ({
        start: Math.round(period.start * 100) / 100,
        end: Math.round(period.end * 100) / 100,
        temp: Math.round(period.temp * 100) / 100,
      }))
      .sort((a, b) => a.start - b.start);
  }

  function areSchedulePeriodsEqual(leftPeriods, rightPeriods) {
    const left = normalizePeriodsForCompare(leftPeriods);
    const right = normalizePeriodsForCompare(rightPeriods);
    return JSON.stringify(left) === JSON.stringify(right);
  }

  function areScheduleWeeksEqual(leftWeek, rightWeek) {
    const getPeriods = (week, dayIndex) => {
      if (!Array.isArray(week)) return [];
      const day =
        week.find((item) => Number(item && item.dayIndex) === dayIndex)
        || week[dayIndex]
        || null;
      return Array.isArray(day && day.periods) ? day.periods : [];
    };

    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      if (!areSchedulePeriodsEqual(getPeriods(leftWeek, dayIndex), getPeriods(rightWeek, dayIndex))) {
        return false;
      }
    }
    return true;
  }

  function updateDayPeriods(zoneId, dayIndex, updater) {
    const zoneKey = String(zoneId);
    clearScheduleNoticeForContext(zoneId, dayIndex);
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
        return [
          { start: 0, end: 23, temp: 18, colorIndex: 0 },
          { start: 23, end: 24, temp: 18, colorIndex: 1 },
        ];
      }
      const sorted = [...periods]
        .map((period, idx) => ({ period, idx }))
        .sort((a, b) => a.period.start - b.period.start);
      const last = sorted[sorted.length - 1];
      if (!last) return periods;

      const next = [...periods].map((period) => ({ ...period }));
      const lastPeriod = next[last.idx];
      if (!lastPeriod) return periods;

      const defaultDuration = 1;
      const minDuration = 0.5;

      if (lastPeriod.end < 24) {
        const newStart = lastPeriod.end;
        const newEnd = Math.min(24, newStart + defaultDuration);
        next.push({ start: newStart, end: newEnd, temp: lastPeriod.temp, colorIndex: 0 });
        return next;
      }

      const carveStart = Math.max(lastPeriod.start + minDuration, 24 - defaultDuration);
      if (carveStart >= lastPeriod.end) {
        return periods;
      }
      next[last.idx] = { ...lastPeriod, end: carveStart };
      next.push({ ...lastPeriod, start: carveStart, end: 24, colorIndex: 0 });
      return next;
    });
  }


  function removeSchedulePeriod(zoneId, dayIndex, periodIndex) {
    updateDayPeriods(zoneId, dayIndex, (periods) => {
      if (periods.length <= 1) return periods;
      const next = periods.map((period) => ({ ...period }));
      const removed = next[periodIndex];
      if (!removed) return periods;

      if (periodIndex === 0) {
        next[1] = { ...next[1], start: removed.start };
      } else if (periodIndex === next.length - 1) {
        next[periodIndex - 1] = { ...next[periodIndex - 1], end: removed.end };
      } else {
        next[periodIndex - 1] = { ...next[periodIndex - 1], end: removed.end };
      }
      next.splice(periodIndex, 1);
      return next;
    });
  }

  function setSchedulePeriodStart(zoneId, dayIndex, periodIndex, nextStart) {
    updateDayPeriods(zoneId, dayIndex, (periods) => {
      const next = periods.map((period) => ({ ...period }));
      if (periodIndex < 0 || periodIndex >= next.length) {
        return periods;
      }
      const current = next[periodIndex];
      if (!current) return periods;
      const previous = next[periodIndex - 1];
      const step = 10 / 60;
      const minStart = previous ? previous.start + step : 0;
      const maxStart = current.end - step;
      const start = Math.max(minStart, Math.min(maxStart, Number(nextStart)));
      if (!Number.isFinite(start)) return periods;

      if (previous) {
        previous.end = start;
      }
      current.start = start;
      return next;
    });
  }

  function setSchedulePeriodEnd(zoneId, dayIndex, periodIndex, nextEnd) {
    updateDayPeriods(zoneId, dayIndex, (periods) =>
      periods.map((period, idx) => {
        if (idx !== periodIndex) return period;
        const end = Math.min(24, Math.max(period.start + 0.5, Number(nextEnd)));
        return { ...period, end: Number.isFinite(end) ? end : period.end };
      })
    );
  }

  function selectedScheduleZone() {
    if (!scheduleZoneId) return null;
    return scheduleDevices.find((z) => Number(z.id) === Number(scheduleZoneId)) || null;
  }

  function normalizeScheduleWeekPayload(weekPayload) {
    if (!Array.isArray(weekPayload)) {
      return createEmptyWeekSchedule();
    }

    const STEP_MINUTES = 10;
    const MINUTES_PER_HOUR = 60;
    const DAY_MINUTES = 24 * MINUTES_PER_HOUR;
    const snapHourToStep = (hourValue) => {
      const totalMinutes = Math.round(Number(hourValue) * MINUTES_PER_HOUR);
      if (!Number.isFinite(totalMinutes)) return NaN;
      const snappedMinutes = Math.round(totalMinutes / STEP_MINUTES) * STEP_MINUTES;
      const clampedMinutes = Math.max(0, Math.min(DAY_MINUTES, snappedMinutes));
      return clampedMinutes / MINUTES_PER_HOUR;
    };

    return WEEK_DAYS.map((day, dayIndex) => {
      const source = weekPayload.find((item) => Number(item && item.dayIndex) === dayIndex) || {};
      const periods = Array.isArray(source.periods) ? source.periods : [];
      const normalizedPeriods = periods
        .map((period, idx) => {
          const start = snapHourToStep(period.start);
          const endRaw = snapHourToStep(period.end);
          const end = Number.isFinite(start) && Number.isFinite(endRaw) ? Math.max(start, endRaw) : NaN;
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
    dismissScheduleNotice();
    setScheduleLoadingByZone((prev) => ({ ...prev, [zoneKey]: true }));
    try {
      const res = await apiGet(`/zones/${zoneId}/schedule`);
      const week = normalizeScheduleWeekPayload(res.week);
      setScheduleByZone((prev) => ({ ...prev, [zoneKey]: week }));
      setSavedScheduleByZone((prev) => ({ ...prev, [zoneKey]: week }));
      setScheduleIdByZone((prev) => ({ ...prev, [zoneKey]: Number(res.scheduleId) || null }));
      setStatus('');
    } catch (err) {
      setStatus(`Schedule load failed: ${String(err.message || err)}`);
    } finally {
      setScheduleLoadingByZone((prev) => ({ ...prev, [zoneKey]: false }));
    }
  }

  function openZoneScheduleFromHome(zoneId) {
    setSelectedZoneId(null);
    setActiveTab('schedule');
    void openScheduleZone(zoneId);
  }

  async function saveScheduleDay(zoneId, dayIndex) {
    if (!Number.isFinite(Number(zoneId)) || !Number.isInteger(Number(dayIndex))) return;
    const zoneKey = String(zoneId);
    const week = getZoneSchedule(zoneId).map((day, idx) => ({
      dayIndex: idx,
      periods: Array.isArray(day.periods) ? day.periods : [],
    }));

    setScheduleSavingByZone((prev) => ({ ...prev, [zoneKey]: true }));
    showScheduleNotice(zoneId, dayIndex, 'saving', 'Saving schedule...');
    try {
      let res;
      try {
        res = await apiPut(`/zones/${zoneId}/schedule/day/${dayIndex}`, {
          scheduleId: scheduleIdByZone[zoneKey],
          week,
        });
      } catch (putErr) {
        const msg = String(putErr && putErr.message ? putErr.message : putErr);
        if (!msg.includes('404')) throw putErr;
        res = await apiPost(`/zones/${zoneId}/schedule/day/${dayIndex}`, {
          scheduleId: scheduleIdByZone[zoneKey],
          week,
        });
      }
      const normalizedWeek = normalizeScheduleWeekPayload(res.week);
      setScheduleByZone((prev) => ({ ...prev, [zoneKey]: normalizedWeek }));
      setSavedScheduleByZone((prev) => ({ ...prev, [zoneKey]: normalizedWeek }));
      setScheduleIdByZone((prev) => ({ ...prev, [zoneKey]: Number(res.scheduleId) || prev[zoneKey] || null }));
      showScheduleNotice(zoneId, dayIndex, 'saved', `${WEEK_DAYS[dayIndex] || 'Day'} schedule saved.`, 2200);
    } catch (err) {
      showScheduleNotice(zoneId, dayIndex, 'error', `Schedule save failed: ${String(err.message || err)}`);
    } finally {
      setScheduleSavingByZone((prev) => ({ ...prev, [zoneKey]: false }));
    }
  }

  async function saveScheduleWeek(zoneId) {
    const fallbackDayIndex = Number.isInteger(Number(scheduleDayIndex)) ? Number(scheduleDayIndex) : 0;
    await saveScheduleDay(zoneId, fallbackDayIndex);
  }

  function copyScheduleDayPattern(zoneId, sourceDayIndex, targetDayIndexes) {
    const zoneKey = String(zoneId);
    const sourceDay = getZoneSchedule(zoneId)[sourceDayIndex];
    if (!sourceDay || !Array.isArray(sourceDay.periods)) return 0;

    const targetSet = new Set(
      (Array.isArray(targetDayIndexes) ? targetDayIndexes : [])
        .map((idx) => Number(idx))
        .filter((idx) => Number.isInteger(idx) && idx >= 0 && idx <= 6)
    );
    targetSet.delete(Number(sourceDayIndex));
    if (targetSet.size === 0) return 0;

    const copiedPeriods = sourceDay.periods.map((period) => ({ ...period }));
    setScheduleByZone((prev) => {
      const currentWeek = prev[zoneKey] || createEmptyWeekSchedule();
      const nextWeek = currentWeek.map((day, idx) => {
        if (!targetSet.has(idx)) return day;
        return { ...day, periods: copiedPeriods.map((period) => ({ ...period })) };
      });
      return { ...prev, [zoneKey]: nextWeek };
    });
    showScheduleNotice(
      zoneId,
      sourceDayIndex,
      'copied',
      `Copied to ${targetSet.size} ${targetSet.size === 1 ? 'day' : 'days'}.`,
      2200
    );
    return targetSet.size;
  }

  function resetScheduleDay(zoneId, dayIndex) {
    if (!Number.isFinite(Number(zoneId)) || !Number.isInteger(Number(dayIndex))) return;
    const zoneKey = String(zoneId);
    setScheduleByZone((prev) => {
      const currentWeek = cloneWeekSchedule(prev[zoneKey] || createEmptyWeekSchedule());
      const savedWeek = cloneWeekSchedule(savedScheduleByZone[zoneKey] || createEmptyWeekSchedule());
      if (!currentWeek[dayIndex] || !savedWeek[dayIndex]) return prev;
      currentWeek[dayIndex] = { ...savedWeek[dayIndex], periods: savedWeek[dayIndex].periods.map((period) => ({ ...period })) };
      return { ...prev, [zoneKey]: currentWeek };
    });
    showScheduleNotice(zoneId, dayIndex, 'saved', `${WEEK_DAYS[dayIndex] || 'Day'} reset.`, 2200);
  }

  function resetScheduleWeek(zoneId) {
    if (!Number.isFinite(Number(zoneId))) return;
    const zoneKey = String(zoneId);
    setScheduleByZone((prev) => ({
      ...prev,
      [zoneKey]: cloneWeekSchedule(savedScheduleByZone[zoneKey] || createEmptyWeekSchedule()),
    }));
    if (Number.isInteger(Number(scheduleDayIndex))) {
      showScheduleNotice(zoneId, scheduleDayIndex, 'saved', 'Week reset to saved schedule.', 2200);
    } else {
      dismissScheduleNotice();
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
      <nav className="fixed inset-x-0 bottom-0 z-50 overflow-visible border-t border-border/80 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 dark:bg-slate-900/95 dark:supports-[backdrop-filter]:bg-slate-900/80">
        <div className="mx-auto grid max-w-5xl grid-cols-3 px-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-1">
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

  async function copyLayoutSnapshot() {
    const snapshot = collectLayoutSnapshot();
    if (!snapshot) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2));
      setLayoutCopyStatus('Copied');
    } catch (_error) {
      setLayoutCopyStatus('Copy failed');
    }
  }

  function toggleDebugLayout() {
    setDebugLayoutEnabled((prev) => !prev);
  }

  function renderLayoutDebugOverlay() {
    if (!debugLayoutEnabled) return null;
    const data = layoutDebug;

    return (
      <aside className="fixed right-2 top-2 z-[120] max-h-[40vh] w-[min(92vw,360px)] overflow-auto rounded-lg border border-slate-400/70 bg-white/95 p-2 text-[11px] text-slate-800 shadow-lg dark:border-slate-600 dark:bg-slate-900/95 dark:text-slate-100">
        <div className="mb-2 flex items-center justify-between gap-2">
          <strong className="text-xs">Layout Debug</strong>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => {
                void collectLayoutSnapshot();
              }}
              className="rounded border border-slate-300 px-1.5 py-0.5 text-[10px] font-semibold dark:border-slate-600"
            >
              Recalc
            </button>
            <button
              type="button"
              onClick={() => {
                void copyLayoutSnapshot();
              }}
              className="rounded border border-slate-300 px-1.5 py-0.5 text-[10px] font-semibold dark:border-slate-600"
            >
              Copy
            </button>
          </div>
        </div>
        {layoutCopyStatus ? <p className="mb-1 text-[10px] font-semibold">{layoutCopyStatus}</p> : null}
        <pre className="m-0 whitespace-pre-wrap break-all leading-[1.25]">
          {data
            ? JSON.stringify({
                activeTab: data.activeTab,
                standalone: data.standalone,
                inner: `${data.innerWidth}x${data.innerHeight}`,
                vvHeight: data.visualViewportHeight,
                vvTop: data.visualViewportOffsetTop,
                docClientHeight: data.docClientHeight,
                safeTop: data.safeAreaTop,
                safeBottom: data.safeAreaBottom,
                mainRect: data.mainRect,
                navRect: data.navRect,
                rootRect: data.rootRect,
              }, null, 2)
            : 'Collecting...'}
        </pre>
      </aside>
    );
  }

  if (!loggedIn) {
    return (
      <>
        <main className="mx-auto h-[100lvh] max-w-5xl overflow-y-auto px-4 pt-[calc(env(safe-area-inset-top)+1rem)] md:px-8">
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
        {renderLayoutDebugOverlay()}
      </>
    );
  }

  if (!selectedSystemId) {
    return (
      <>
        <main className="mx-auto h-[100lvh] max-w-5xl overflow-y-auto px-4 pt-[calc(env(safe-area-inset-top)+1rem)] md:px-8">
          <header className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold">Choose a heating system</h1>
              <p className="mt-1 text-sm text-muted">Select the system you want to view and control.</p>
            </div>
            <Button variant="outline" onClick={onLogout}>Log out</Button>
          </header>

          <section className="grid gap-3 md:grid-cols-2">
            {systems.map((system) => (
              <Card key={system.gatewayId} className="grid gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">{system.name || 'Heating system'}</h2>
                  {system.serialNumber ? (
                    <p className="mt-1 text-sm text-muted">Serial {system.serialNumber}</p>
                  ) : null}
                  <p className="mt-1 break-all text-xs text-muted">Gateway {system.gatewayId}</p>
                </div>
                <Button onClick={() => onSelectSystem(system.gatewayId)}>Load this system</Button>
              </Card>
            ))}
          </section>

          {systemsLoading ? <p className="mt-4 text-sm text-muted">Loading heating systems…</p> : null}
          {!systemsLoading && systems.length === 0 ? (
            <Button className="mt-4" variant="outline" onClick={() => loadSystems()}>Try again</Button>
          ) : null}
          <p className="mt-3 text-sm text-muted">{status}</p>
        </main>
        {renderLayoutDebugOverlay()}
      </>
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
  const savedDayPeriods =
    scheduleZoneId !== null && scheduleDayIndex !== null
      ? (savedScheduleByZone[String(scheduleZoneId)]?.[scheduleDayIndex]?.periods) || []
      : [];
  const currentWeek = scheduleZoneId !== null ? getZoneSchedule(scheduleZoneId) : [];
  const savedWeek = scheduleZoneId !== null ? (savedScheduleByZone[String(scheduleZoneId)] || createEmptyWeekSchedule()) : [];
  const hasUnsavedScheduleChanges =
    scheduleZoneId !== null && scheduleDayIndex !== null
      ? !areScheduleWeeksEqual(currentWeek, savedWeek)
      : false;
  const hasUnsavedWeekChanges =
    scheduleZoneId !== null
      ? !areScheduleWeeksEqual(currentWeek, savedWeek)
      : false;
  const hasUnsavedCurrentDayChanges =
    scheduleZoneId !== null && scheduleDayIndex !== null
      ? !areSchedulePeriodsEqual(
        getDayPeriods(scheduleZoneId, scheduleDayIndex),
        savedScheduleByZone[String(scheduleZoneId)]?.[scheduleDayIndex]?.periods || []
      )
      : false;
  const dayName = scheduleDayIndex === null ? '' : WEEK_DAYS[scheduleDayIndex] || 'Day';
  const HomeComponent = designMode === 'modern' && !selectedZone ? ModernHomeScreen : HomeScreen;

  if (activeTab === 'stats') {
    return (
      <>
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
          designMode={designMode}
          toggleDesignMode={toggleDesignMode}
          debugLayoutEnabled={debugLayoutEnabled}
          toggleDebugLayout={toggleDebugLayout}
          theme={theme}
          onLogout={onLogout}
          onChangeSystem={onChangeSystem}
        />
        {renderLayoutDebugOverlay()}
      </>
    );
  }

  if (activeTab === 'schedule') {
    return (
      <>
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
          setSchedulePeriodStart={setSchedulePeriodStart}
          setSchedulePeriodEnd={setSchedulePeriodEnd}
          saveScheduleDay={saveScheduleDay}
          saveScheduleWeek={saveScheduleWeek}
          copyScheduleDayPattern={copyScheduleDayPattern}
          resetScheduleDay={resetScheduleDay}
          resetScheduleWeek={resetScheduleWeek}
          isScheduleSaving={scheduleZoneId !== null && Boolean(scheduleSavingByZone[String(scheduleZoneId)])}
          hasUnsavedScheduleChanges={hasUnsavedScheduleChanges}
          hasUnsavedWeekChanges={hasUnsavedWeekChanges}
          hasUnsavedCurrentDayChanges={hasUnsavedCurrentDayChanges}
          scheduleNotice={scheduleNotice}
          dismissScheduleNotice={dismissScheduleNotice}
          savedDayPeriods={savedDayPeriods}
          getDayPeriods={getDayPeriods}
          renderBottomNav={renderBottomNav}
          menuOpen={menuOpen}
          setMenuOpen={setMenuOpen}
          toggleTheme={toggleTheme}
          designMode={designMode}
          toggleDesignMode={toggleDesignMode}
          debugLayoutEnabled={debugLayoutEnabled}
          toggleDebugLayout={toggleDebugLayout}
          theme={theme}
          onLogout={onLogout}
          onChangeSystem={onChangeSystem}
        />
        {renderLayoutDebugOverlay()}
      </>
    );
  }

  return (
    <>
      <HomeComponent
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
        designMode={designMode}
        toggleDesignMode={toggleDesignMode}
        debugLayoutEnabled={debugLayoutEnabled}
        toggleDebugLayout={toggleDebugLayout}
        theme={theme}
        onLogout={onLogout}
        onChangeSystem={onChangeSystem}
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
        onOpenZoneSchedule={openZoneScheduleFromHome}
      />
      {renderLayoutDebugOverlay()}
    </>
  );
}
