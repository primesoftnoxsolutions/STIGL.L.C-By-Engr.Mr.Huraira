const {
  toUaeDateKey,
  addDaysToDateKey,
  getUaeNowParts,
  makeUaeDateFromKey
} = require('../utils/uaeTime');
const { saveDailyStockSnapshot } = require('../controllers/reportController');

const SCHEDULE_HOUR = 23;
const SCHEDULE_MINUTE = 55;

let timer = null;

const getNextRunAt = (now = new Date()) => {
  const todayKey = toUaeDateKey(now);
  const todayRun = makeUaeDateFromKey(todayKey, SCHEDULE_HOUR, SCHEDULE_MINUTE, 0, 0);
  if (!todayRun) return null;

  if (now.getTime() < todayRun.getTime()) {
    return { runAt: todayRun, dateKey: todayKey };
  }

  const nextKey = addDaysToDateKey(todayKey, 1);
  const nextRun = makeUaeDateFromKey(nextKey, SCHEDULE_HOUR, SCHEDULE_MINUTE, 0, 0);
  return { runAt: nextRun, dateKey: nextKey };
};

const scheduleNext = () => {
  const next = getNextRunAt(new Date());
  if (!next?.runAt) return;

  const delay = Math.max(1000, next.runAt.getTime() - Date.now());
  console.log(
    `[DAILY STOCK] Next scheduled run for UAE date ${next.dateKey} at 23:55 (UTC ${next.runAt.toISOString()})`
  );

  if (timer) clearTimeout(timer);
  timer = setTimeout(async () => {
    const runDateKey = toUaeDateKey(new Date());
    try {
      const result = await saveDailyStockSnapshot(runDateKey, { forceRecompute: true });
      console.log(`[DAILY STOCK] Snapshot saved for ${result.dateKey} (${result.count} rows)`);
    } catch (error) {
      console.error(`[DAILY STOCK] Snapshot failed for ${runDateKey}:`, error.message);
    } finally {
      scheduleNext();
    }
  }, delay);
};

const runStartupRecovery = async () => {
  const nowParts = getUaeNowParts(new Date());
  const todayKey = toUaeDateKey();
  const shouldUseToday = (
    nowParts.hour > SCHEDULE_HOUR
    || (nowParts.hour === SCHEDULE_HOUR && nowParts.minute >= SCHEDULE_MINUTE)
  );
  const targetDateKey = shouldUseToday ? todayKey : addDaysToDateKey(todayKey, -1);

  if (!targetDateKey) return;

  try {
    const result = await saveDailyStockSnapshot(targetDateKey, { forceRecompute: true });
    console.log(`[DAILY STOCK] Startup recovery ensured snapshot for ${result.dateKey} (${result.count} rows)`);
  } catch (error) {
    console.error(`[DAILY STOCK] Startup recovery failed for ${targetDateKey}:`, error.message);
  }
};

const startDailyStockScheduler = async () => {
  await runStartupRecovery();
  scheduleNext();
};

module.exports = {
  startDailyStockScheduler
};
