const fs = require('fs/promises');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'data', 'app-config.json');

function assertString(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`配置项 ${field} 必须是非空字符串`);
}

function validateConfig(config) {
  const required = ['appName', 'slogan', 'description', 'latestVersion', 'apkFileName', 'downloadFileName', 'apkSize', 'releaseDate', 'websiteTitle', 'copyright'];
  required.forEach((field) => assertString(config[field], field));
  if (!Number.isInteger(config.versionCode) || config.versionCode < 1) throw new Error('配置项 versionCode 必须为正整数');
  if (typeof config.forceUpdate !== 'boolean') throw new Error('配置项 forceUpdate 必须为布尔值');
  if (!Array.isArray(config.updateLog) || !Array.isArray(config.historicalVersions)) throw new Error('配置项 updateLog 和 historicalVersions 必须为数组');
  if (config.apkSha256 && !/^[a-fA-F0-9]{64}$/.test(config.apkSha256)) throw new Error('配置项 apkSha256 必须是 SHA-256 十六进制值');
  if (config.remoteApkUrl && (typeof config.remoteApkUrl !== 'string' || !/^https:\/\//i.test(config.remoteApkUrl))) {
    throw new Error('配置项 remoteApkUrl 必须为空或 HTTPS 下载地址');
  }
  if (path.basename(config.apkFileName) !== config.apkFileName || !config.apkFileName.toLowerCase().endsWith('.apk')) {
    throw new Error('配置项 apkFileName 必须是单个 .apk 文件名，不能包含路径');
  }
  if (path.basename(config.downloadFileName) !== config.downloadFileName || !config.downloadFileName.toLowerCase().endsWith('.apk')) {
    throw new Error('配置项 downloadFileName 必须是单个 .apk 文件名，不能包含路径');
  }
  return config;
}

async function getConfig() {
  const raw = await fs.readFile(CONFIG_PATH, 'utf8');
  return validateConfig(JSON.parse(raw));
}

module.exports = { getConfig, CONFIG_PATH };
