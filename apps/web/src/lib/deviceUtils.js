export function zoneState(stateByDeviceId, id) {
  return stateByDeviceId[String(id)] || stateByDeviceId[id] || {};
}

export function formatTemperature(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '--.-°';
  }
  return `${value.toFixed(1)}°`;
}

export function mapConnectionStatus(connectionState) {
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
