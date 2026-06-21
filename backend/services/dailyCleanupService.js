const { MaintenanceRun, SystemActivityLog } = require('../models');
const { formatBytes } = require('../utils/formatBytes');
const { cleanManagedDirectories } = require('../utils/fileCleanup');
const { clearRegisteredCaches } = require('../utils/runtimeCache');
const { cleanExpired: cleanExpiredSessionTemp } = require('../utils/sessionTempStore');
const { toUaeDateKey } = require('../utils/uaeTime');

let isRunning = false;

const buildCleanupMessage = (bytesCleaned) => {
  const formatted = formatBytes(bytesCleaned);
  return `${formatted} of temporary and cache data has been successfully cleaned.`;
};

const performCleanup = async () => {
  const fileCleanup = await cleanManagedDirectories();
  const cacheCleanup = clearRegisteredCaches();
  const sessionCleanup = cleanExpiredSessionTemp();

  const bytesCleaned = (
    Number(fileCleanup.bytesReclaimed || 0)
    + Number(cacheCleanup.bytesReclaimed || 0)
    + Number(sessionCleanup.bytesReclaimed || 0)
  );

  return {
    bytesCleaned,
    fileCleanup,
    cacheCleanup,
    sessionCleanup
  };
};

const logMaintenanceActivity = async ({ status, message, bytesCleaned, details }) => {
  await SystemActivityLog.create({
    action: 'daily_cleanup',
    module: 'maintenance',
    message,
    details: {
      status,
      bytesCleaned,
      timezone: 'Asia/Dubai',
      ...details
    },
    actorUserId: null
  });
};

const recordMaintenanceRun = async ({ status, bytesCleaned, message, details }) => {
  return MaintenanceRun.create({
    status,
    bytesCleaned,
    message,
    details,
    ranAt: new Date()
  });
};

const runDailyCleanup = async ({ trigger = 'scheduler' } = {}) => {
  if (isRunning) {
    console.log('[DAILY CLEANUP] Skipped because a cleanup job is already running');
    return { skipped: true };
  }

  isRunning = true;
  const runDateKey = toUaeDateKey(new Date());

  try {
    const cleanupResult = await performCleanup();
    const bytesCleaned = cleanupResult.bytesCleaned;
    const message = buildCleanupMessage(bytesCleaned);

    const maintenanceRun = await recordMaintenanceRun({
      status: 'success',
      bytesCleaned,
      message,
      details: {
        trigger,
        runDateKey,
        ...cleanupResult
      }
    });

    await logMaintenanceActivity({
      status: 'success',
      message,
      bytesCleaned,
      details: {
        trigger,
        runDateKey,
        maintenanceRunId: maintenanceRun.id,
        ...cleanupResult
      }
    });

    console.log(`[DAILY CLEANUP] Completed for ${runDateKey}: ${message}`);

    return {
      success: true,
      maintenanceRun,
      message,
      bytesCleaned
    };
  } catch (error) {
    const failureMessage = 'Daily cleanup failed. The system will retry on the next scheduled run.';

    await recordMaintenanceRun({
      status: 'failed',
      bytesCleaned: 0,
      message: failureMessage,
      details: {
        trigger,
        runDateKey,
        error: error.message
      }
    }).catch((logError) => {
      console.error('[DAILY CLEANUP] Failed to record failed run:', logError.message);
    });

    await logMaintenanceActivity({
      status: 'failed',
      message: failureMessage,
      bytesCleaned: 0,
      details: {
        trigger,
        runDateKey,
        error: error.message
      }
    }).catch((logError) => {
      console.error('[DAILY CLEANUP] Failed to write activity log:', logError.message);
    });

    console.error(`[DAILY CLEANUP] Failed for ${runDateKey}:`, error.message);
    throw error;
  } finally {
    isRunning = false;
  }
};

const queueDailyCleanup = ({ trigger = 'scheduler' } = {}) => {
  setImmediate(() => {
    runDailyCleanup({ trigger }).catch(() => {});
  });
};

module.exports = {
  runDailyCleanup,
  queueDailyCleanup,
  buildCleanupMessage
};
