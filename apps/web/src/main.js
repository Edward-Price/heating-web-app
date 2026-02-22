const API_BASE = 'http://localhost:3001';
const STORAGE_KEY = 'heating-web-session-token';

const loginSection = document.getElementById('login-section');
const dashboardSection = document.getElementById('dashboard-section');
const zoneSection = document.getElementById('zone-section');
const loginForm = document.getElementById('login-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const logoutBtn = document.getElementById('logout-btn');
const menuBtn = document.getElementById('menu-btn');
const menuCloseBtn = document.getElementById('menu-close-btn');
const sideNav = document.getElementById('side-nav');
const sideNavBackdrop = document.getElementById('side-nav-backdrop');
const pullIndicator = document.getElementById('pull-indicator');
const statusEl = document.getElementById('status');
const zonesEl = document.getElementById('zones');
const hotWaterEl = document.getElementById('hot-water');
const zoneBackBtn = document.getElementById('zone-back-btn');
const zoneRefreshBtn = document.getElementById('zone-refresh-btn');
const zoneTitleEl = document.getElementById('zone-title');
const zoneCurrentTempEl = document.getElementById('zone-current-temp');
const zoneTargetTempEl = document.getElementById('zone-target-temp');
const zoneHeatingStateEl = document.getElementById('zone-heating-state');
const zoneTargetInputEl = document.getElementById('zone-target-input');
const zoneTargetRangeEl = document.getElementById('zone-target-range');
const zoneSetBtn = document.getElementById('zone-set-btn');

let sessionToken = localStorage.getItem(STORAGE_KEY) || '';
let devicesCache = [];
let stateByDeviceIdCache = {};
let selectedZoneId = null;
let pullStartY = null;
let pullActive = false;
let pullReady = false;

const PULL_THRESHOLD = 82;

function setStatus(text) {
  statusEl.textContent = text;
}

function authHeaders() {
  return {
    'X-Session-Token': sessionToken,
    'Content-Type': 'application/json',
  };
}

async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`, { headers: authHeaders() });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body || {}),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

function showLoggedIn() {
  loginSection.classList.add('hidden');
  dashboardSection.classList.remove('hidden');
  zoneSection.classList.add('hidden');
  menuBtn.classList.remove('hidden');
}

function showLoggedOut() {
  loginSection.classList.remove('hidden');
  dashboardSection.classList.add('hidden');
  zoneSection.classList.add('hidden');
  menuBtn.classList.add('hidden');
  closeSideNav();
}

function showZoneScreen() {
  loginSection.classList.add('hidden');
  dashboardSection.classList.add('hidden');
  zoneSection.classList.remove('hidden');
}

function openSideNav() {
  sideNav.classList.remove('hidden');
  sideNavBackdrop.classList.remove('hidden');
  sideNav.setAttribute('aria-hidden', 'false');
}

function closeSideNav() {
  sideNav.classList.add('hidden');
  sideNavBackdrop.classList.add('hidden');
  sideNav.setAttribute('aria-hidden', 'true');
}

function setPullIndicator(text) {
  if (pullIndicator) pullIndicator.textContent = text;
}

function zoneState(stateByDeviceId, id) {
  return stateByDeviceId[String(id)] || stateByDeviceId[id] || {};
}

function renderZones(devices, stateByDeviceId) {
  zonesEl.innerHTML = '';
  const zones = devices.filter((d) => d.type === 'zone');

  for (const zone of zones) {
    const state = zoneState(stateByDeviceId, zone.id);
    const card = document.createElement('article');
    card.className = 'device';

    const current = typeof state.currentTemp === 'number' ? `${state.currentTemp.toFixed(1)}°C` : '--.-°C';
    const target = typeof state.targetTemp === 'number' ? `${state.targetTemp.toFixed(1)}°C` : '--.-°C';
    const heating = state.heatingOn ? '🔥 Heating' : '❄️ Idle';

    card.innerHTML = `
      <h3>${zone.name}</h3>
      <div class="row"><span class="muted">Current</span><strong>${current}</strong></div>
      <div class="row"><span class="muted">Target</span><strong>${target}</strong></div>
      <div class="row"><span class="muted">State</span><strong>${heating}</strong></div>
      <div class="link-row"><button class="ghost">Open controls</button></div>
    `;

    const btn = card.querySelector('button');
    btn.addEventListener('click', async () => {
      selectedZoneId = zone.id;
      renderZoneScreen();
      showZoneScreen();
    });

    zonesEl.appendChild(card);
  }
}

function renderHotWater(devices, stateByDeviceId) {
  hotWaterEl.innerHTML = '';
  const hw = devices.find((d) => d.type === 'hotWater');
  if (!hw) return;

  const state = zoneState(stateByDeviceId, hw.id);
  const on = state.hotWaterOn ? 'On' : 'Off';

  const card = document.createElement('article');
  card.className = 'device';
  card.innerHTML = `
    <h3>${hw.name || 'Hot Water'}</h3>
    <div class="row"><span class="muted">Status</span><strong>${on}</strong></div>
    <div class="controls">
      <button data-min="60">Boost 1h</button>
      <button data-min="120">Boost 2h</button>
      <button data-min="0">Off</button>
    </div>
  `;

  const actionButtons = Array.from(card.querySelectorAll('button[data-min]'));
  actionButtons.forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        actionButtons.forEach((btn) => {
          btn.disabled = true;
        });
        const actionMinutes = Number(button.dataset.min);
        const actionLabel =
          actionMinutes === 0 ? 'Turning hot water off...' : `Starting hot water boost (${actionMinutes} min)...`;
        setStatus(actionLabel);
        await apiPost(`/hot-water/${hw.id}/boost`, { minutes: actionMinutes });
        await loadDashboard();
      } catch (err) {
        setStatus(`Hot water write failed: ${String(err.message || err)}`);
      } finally {
        actionButtons.forEach((btn) => {
          btn.disabled = false;
        });
      }
    });
  });

  hotWaterEl.appendChild(card);
}

function renderZoneScreen() {
  const zone = devicesCache.find((item) => item.type === 'zone' && Number(item.id) === Number(selectedZoneId));
  if (!zone) {
    showLoggedIn();
    return;
  }

  const state = zoneState(stateByDeviceIdCache, zone.id);
  const currentText = typeof state.currentTemp === 'number' ? `${state.currentTemp.toFixed(1)}°C` : '--.-°C';
  const targetValue = typeof state.targetTemp === 'number' ? state.targetTemp : 20;
  const targetText = `${targetValue.toFixed(1)}°C`;
  const heatingText = state.heatingOn ? '🔥 Heating' : '❄️ Idle';

  zoneTitleEl.textContent = zone.name;
  zoneCurrentTempEl.textContent = currentText;
  zoneTargetTempEl.textContent = targetText;
  zoneHeatingStateEl.textContent = heatingText;
  zoneTargetInputEl.value = String(targetValue);
  zoneTargetRangeEl.value = String(targetValue);
}

async function loadDashboard() {
  try {
    setStatus('Loading devices and state...');
    const [devicesResult, stateResult] = await Promise.all([apiGet('/devices'), apiGet('/state')]);
    devicesCache = devicesResult.devices || [];
    stateByDeviceIdCache = stateResult.stateByDeviceId || {};

    renderZones(devicesCache, stateByDeviceIdCache);
    renderHotWater(devicesCache, stateByDeviceIdCache);
    if (selectedZoneId !== null) {
      renderZoneScreen();
    }
    setStatus(`Loaded ${devicesCache.length} devices.`);
  } catch (err) {
    setStatus(`Load failed: ${String(err.message || err)}`);
  }
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    setStatus('Signing in...');
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: emailInput.value.trim(),
        password: passwordInput.value,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(data.error || `Login failed (${res.status})`);
    }

    sessionToken = data.appSessionToken;
    localStorage.setItem(STORAGE_KEY, sessionToken);
    showLoggedIn();
    await loadDashboard();
  } catch (err) {
    setStatus(`Login failed: ${String(err.message || err)}`);
  }
});

zoneBackBtn.addEventListener('click', () => {
  selectedZoneId = null;
  showLoggedIn();
});

zoneRefreshBtn.addEventListener('click', async () => {
  await loadDashboard();
});

zoneTargetInputEl.addEventListener('input', () => {
  const value = Number(zoneTargetInputEl.value);
  if (!Number.isFinite(value)) return;
  zoneTargetRangeEl.value = String(value);
});

zoneTargetRangeEl.addEventListener('input', () => {
  zoneTargetInputEl.value = String(zoneTargetRangeEl.value);
});

zoneSetBtn.addEventListener('click', async () => {
  if (selectedZoneId === null) return;
  const nextValue = Number(zoneTargetInputEl.value);
  if (!Number.isFinite(nextValue)) {
    setStatus('Target temperature is invalid.');
    return;
  }

  try {
    zoneSetBtn.disabled = true;
    setStatus(`Setting ${nextValue.toFixed(1)}°C...`);
    await apiPost(`/zones/${selectedZoneId}/target-temp`, { targetTemp: nextValue });
    await loadDashboard();
    renderZoneScreen();
    showZoneScreen();
    setStatus(`Target updated to ${nextValue.toFixed(1)}°C.`);
  } catch (err) {
    setStatus(`Zone write failed: ${String(err.message || err)}`);
  } finally {
    zoneSetBtn.disabled = false;
  }
});

menuBtn.addEventListener('click', () => {
  openSideNav();
});

menuCloseBtn.addEventListener('click', () => {
  closeSideNav();
});

sideNavBackdrop.addEventListener('click', () => {
  closeSideNav();
});

dashboardSection.addEventListener('touchstart', (event) => {
  if (dashboardSection.classList.contains('hidden')) return;
  if (window.scrollY > 0) return;
  pullStartY = event.touches[0].clientY;
  pullActive = true;
  pullReady = false;
  setPullIndicator('Pull to refresh');
}, { passive: true });

dashboardSection.addEventListener('touchmove', (event) => {
  if (!pullActive || pullStartY === null) return;
  const dy = event.touches[0].clientY - pullStartY;
  if (dy <= 0) {
    pullReady = false;
    setPullIndicator('Pull to refresh');
    return;
  }
  if (dy >= PULL_THRESHOLD) {
    pullReady = true;
    setPullIndicator('Release to refresh');
  } else {
    pullReady = false;
    setPullIndicator('Pull to refresh');
  }
}, { passive: true });

dashboardSection.addEventListener('touchend', async () => {
  if (!pullActive) return;
  const shouldRefresh = pullReady;
  pullActive = false;
  pullReady = false;
  pullStartY = null;
  if (shouldRefresh) {
    setPullIndicator('Refreshing...');
    await loadDashboard();
  }
  setPullIndicator('Pull to refresh');
}, { passive: true });

logoutBtn.addEventListener('click', async () => {
  try {
    closeSideNav();
    if (sessionToken) {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: authHeaders(),
      });
    }
  } catch (_err) {
    // ignore
  }
  sessionToken = '';
  selectedZoneId = null;
  devicesCache = [];
  stateByDeviceIdCache = {};
  localStorage.removeItem(STORAGE_KEY);
  showLoggedOut();
  setStatus('Logged out.');
});

if (sessionToken) {
  showLoggedIn();
  void loadDashboard();
} else {
  showLoggedOut();
  setStatus('Please sign in.');
}
