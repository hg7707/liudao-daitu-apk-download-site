const fs = require('fs/promises');
const path = require('path');

const STATS_PATH = path.join(__dirname, '..', 'data', 'download-stats.json');
let writeQueue = Promise.resolve();

function defaultStats() {
  return { totalDownloads: 0, dailyDownloads: {}, versionDownloads: {}, deviceDownloads: { android: 0, ios: 0, desktop: 0, other: 0 }, lastDownloadAt: null };
}

function normalizeStats(data) {
  const base = defaultStats();
  return {
    ...base,
    ...data,
    dailyDownloads: { ...base.dailyDownloads, ...(data.dailyDownloads || {}) },
    versionDownloads: { ...base.versionDownloads, ...(data.versionDownloads || {}) },
    deviceDownloads: { ...base.deviceDownloads, ...(data.deviceDownloads || {}) }
  };
}

async function readStats() {
  try {
    return normalizeStats(JSON.parse(await fs.readFile(STATS_PATH, 'utf8')));
  } catch (error) {
    if (error.code === 'ENOENT') return defaultStats();
    throw error;
  }
}

async function atomicWrite(data) {
  const tempPath = `${STATS_PATH}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(tempPath, STATS_PATH);
}

function today() { return new Date().toISOString().slice(0, 10); }

function classifyDevice(userAgent = '') {
  if (/android/i.test(userAgent)) return 'android';
  if (/iphone|ipad|ipod/i.test(userAgent)) return 'ios';
  if (/windows|macintosh|linux|cros/i.test(userAgent)) return 'desktop';
  return 'other';
}

function recordDownload(version, userAgent) {
  const task = writeQueue.then(async () => {
    const stats = await readStats();
    const date = today();
    const device = classifyDevice(userAgent);
    stats.totalDownloads += 1;
    stats.dailyDownloads[date] = (stats.dailyDownloads[date] || 0) + 1;
    stats.versionDownloads[version] = (stats.versionDownloads[version] || 0) + 1;
    stats.deviceDownloads[device] = (stats.deviceDownloads[device] || 0) + 1;
    stats.lastDownloadAt = new Date().toISOString();
    await atomicWrite(stats);
    return stats;
  });
  writeQueue = task.catch(() => undefined);
  return task;
}

async function getSummary() {
  const stats = await readStats();
  const date = today();
  return { ...stats, todayDownloads: stats.dailyDownloads[date] || 0 };
}

module.exports = { recordDownload, getSummary, classifyDevice, STATS_PATH };
