export function formatRefreshAge(refreshedAt, now) {
  if (!Number.isFinite(refreshedAt)) return 'Waiting for first refresh';
  const minutes = Math.floor(Math.max(0, now - refreshedAt) / 60000);
  if (minutes < 1) return 'Last refreshed just now';
  if (minutes < 60) return `Last refreshed ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Last refreshed ${hours} hr ago`;
  return `Last refreshed ${Math.floor(hours / 24)} days ago`;
}

export function boostProgress(boost, now) {
  if (!boost || !Number.isFinite(boost.startedAt) || !Number.isFinite(boost.endsAt) || boost.endsAt <= boost.startedAt) return null;
  return {
    elapsedMinutes: Math.floor(Math.max(0, Math.min(now, boost.endsAt) - boost.startedAt) / 60000),
    remainingMinutes: Math.ceil(Math.max(0, boost.endsAt - now) / 60000),
  };
}
