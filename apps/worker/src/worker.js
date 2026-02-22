const INTERVAL_MINUTES = process.env.WORKER_INTERVAL_MINUTES
  ? Number(process.env.WORKER_INTERVAL_MINUTES)
  : 15;

function tick() {
  const now = new Date().toISOString();
  console.log(`[worker] tick ${now}`);
  console.log('[worker] TODO: fetch /state from api and persist to database');
}

console.log(`[worker] started. interval=${INTERVAL_MINUTES} minutes`);

// Immediate run then interval
void tick();
setInterval(tick, INTERVAL_MINUTES * 60 * 1000);
