const {
  toUaeDateKey,
  addDaysToDateKey,
  getUaeNowParts,
  makeUaeDateFromKey
} = require('../utils/uaeTime');
const { queueDailyCleanup } = require('./dailyCleanupService');

const SCHEDULE_HOUR = 23;
const SCHEDULE_MINUTE = 50;

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
    `[DAILY CLEANUP] Next scheduled run for UAE date ${next.dateKey} at 23:50 Asia/Dubai (UTC ${next.runAt.toISOString()})`
  );

  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    queueDailyCleanup({ trigger: 'scheduler' });
    scheduleNext();
  }, delay);
};

const runStartupRecovery = () => {
  const nowParts = getUaeNowParts(new Date());
  const shouldRunToday = (
    nowParts.hour > SCHEDULE_HOUR
    || (nowParts.hour === SCHEDULE_HOUR && nowParts.minute >= SCHEDULE_MINUTE)
  );

  if (!shouldRunToday) return;

  console.log('[DAILY CLEANUP] Startup recovery queued for today\'s missed cleanup window');
  queueDailyCleanup({ trigger: 'startup_recovery' });
};

const startDailyCleanupScheduler = () => {
  runStartupRecovery();
  scheduleNext();
};

module.exports = {
  startDailyCleanupScheduler
};
