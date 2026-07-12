const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const { getConfig } = require('./lib/config');
const { recordDownload, getSummary } = require('./lib/stats-store');

const app = express();
const isProduction = process.env.NODE_ENV === 'production';
const publicDir = path.join(__dirname, 'public');
const apkDir = path.join(publicDir, 'apk');
const PORT = Number(process.env.PORT) || 3000;
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

if (isProduction) app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'same-origin' } }));
app.use(express.json({ limit: '16kb' }));
app.use(express.urlencoded({ extended: false, limit: '16kb' }));
app.use(cookieParser());

const apiLimiter = rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false, message: { success: false, error: '请求过于频繁，请稍后再试。' } });
const downloadLimiter = rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false, message: { success: false, error: '下载请求过于频繁，请稍后再试。' } });
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: 'draft-7', legacyHeaders: false, skipSuccessfulRequests: true, message: { success: false, error: '登录尝试过于频繁，请 15 分钟后再试。' } });

function publicCors(req, res, next) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  return next();
}

function getBaseUrl(req) {
  const configured = (process.env.BASE_URL || '').trim().replace(/\/$/, '');
  if (configured && /^https?:\/\//i.test(configured)) return configured;
  const host = req.get('host');
  const protocol = req.protocol || (isProduction ? 'https' : 'http');
  return `${protocol}://${host}`;
}

function publicInfo(config) {
  const { apkFileName, ...safe } = config;
  return safe;
}

function signSession(payload) {
  const secret = process.env.SESSION_SECRET || 'development-only-change-this-secret';
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function verifySession(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return false;
  const [encoded, signature] = token.split('.');
  const expected = crypto.createHmac('sha256', process.env.SESSION_SECRET || 'development-only-change-this-secret').update(encoded).digest('base64url');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    return payload.role === 'admin' && Number.isFinite(payload.exp) && payload.exp > Date.now();
  } catch { return false; }
}

function requireAdmin(req, res, next) {
  if (!verifySession(req.cookies.admin_session)) return res.status(401).json({ success: false, error: '请先登录管理员后台。' });
  return next();
}

function downloadContentDisposition(filename) {
  const fallback = filename.replace(/[^a-zA-Z0-9._-]/g, '_') || 'app.apk';
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

app.get('/health', async (req, res) => {
  try {
    const config = await getConfig();
    res.json({ success: true, status: 'ok', version: config.latestVersion });
  } catch (error) {
    console.error('Health check failed:', error.message);
    res.status(503).json({ success: false, status: 'configuration_error' });
  }
});

app.get('/sitemap.xml', async (req, res, next) => {
  try {
    const baseUrl = getBaseUrl(req).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    res.type('application/xml').set('Cache-Control', 'public, max-age=3600');
    res.send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${baseUrl}/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url></urlset>`);
  } catch (error) { next(error); }
});

app.get('/api/version', apiLimiter, publicCors, async (req, res, next) => {
  try {
    const c = await getConfig();
    res.set('Cache-Control', 'public, max-age=300');
    res.json({ success: true, appName: c.appName, latestVersion: c.latestVersion, versionCode: c.versionCode, forceUpdate: c.forceUpdate, minSupportedVersion: c.minSupportedVersion, downloadUrl: `${getBaseUrl(req)}/download`, apkSize: c.apkSize, apkSha256: c.apkSha256 || null, releaseDate: c.releaseDate, updateLog: c.updateLog });
  } catch (error) { next(error); }
});

app.get('/api/app-info', apiLimiter, publicCors, async (req, res, next) => {
  try {
    const config = await getConfig();
    res.set('Cache-Control', 'public, max-age=300');
    res.json({ success: true, ...publicInfo(config), downloadUrl: `${getBaseUrl(req)}/download` });
  } catch (error) { next(error); }
});

app.get('/download', downloadLimiter, async (req, res, next) => {
  try {
    const config = await getConfig();
    if (config.remoteApkUrl) {
      recordDownload(config.latestVersion, req.get('user-agent')).catch((error) => console.error('Download statistic failed (download continues):', error.message));
      return res.redirect(302, config.remoteApkUrl);
    }
    const apkPath = path.resolve(apkDir, config.apkFileName);
    if (!apkPath.startsWith(`${apkDir}${path.sep}`)) return res.status(400).json({ success: false, error: '无效的下载配置。' });
    let stat;
    try { stat = await fsp.stat(apkPath); } catch (error) {
      if (error.code === 'ENOENT') return res.status(404).json({ success: false, error: '安装包暂未上传，请稍后再试或联系管理员。' });
      throw error;
    }
    if (!stat.isFile()) return res.status(404).json({ success: false, error: '安装包暂不可用。' });
    res.status(200);
    res.set({
      'Content-Type': 'application/vnd.android.package-archive',
      'Content-Length': String(stat.size),
      'Content-Disposition': downloadContentDisposition(config.downloadFileName),
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff'
    });
    recordDownload(config.latestVersion, req.get('user-agent')).catch((error) => console.error('Download statistic failed (download continues):', error.message));
    const stream = fs.createReadStream(apkPath);
    stream.on('error', (error) => { console.error('APK stream failed:', error.message); if (!res.headersSent) next(error); else res.destroy(error); });
    stream.pipe(res);
  } catch (error) { next(error); }
});

app.post('/api/admin/login', loginLimiter, (req, res) => {
  const password = String(req.body?.password || '');
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || expected.length < 12) {
    console.error('ADMIN_PASSWORD is unset or too short. Admin login disabled.');
    return res.status(503).json({ success: false, error: '管理员登录尚未配置。请设置安全的 ADMIN_PASSWORD。' });
  }
  const a = Buffer.from(password);
  const b = Buffer.from(expected);
  const valid = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!valid) return res.status(401).json({ success: false, error: '密码错误，请重试。' });
  const token = signSession({ role: 'admin', exp: Date.now() + SESSION_TTL_MS });
  res.cookie('admin_session', token, { httpOnly: true, secure: isProduction, sameSite: 'strict', maxAge: SESSION_TTL_MS, path: '/' });
  res.json({ success: true });
});

app.post('/api/admin/logout', (req, res) => {
  res.clearCookie('admin_session', { httpOnly: true, secure: isProduction, sameSite: 'strict', path: '/' });
  res.json({ success: true });
});

app.get('/api/admin/session', (req, res) => res.json({ success: true, authenticated: verifySession(req.cookies.admin_session) }));
app.get('/api/admin/stats', apiLimiter, requireAdmin, async (req, res, next) => {
  try {
    const [stats, config] = await Promise.all([getSummary(), getConfig()]);
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, stats, latestVersion: config.latestVersion, releaseDate: config.releaseDate, apkSize: config.apkSize });
  } catch (error) { next(error); }
});

app.get('/admin', (req, res) => res.sendFile(path.join(publicDir, 'admin.html')));
app.use('/apk', (req, res) => res.status(404).sendFile(path.join(publicDir, '404.html')));
app.use(express.static(publicDir, { maxAge: isProduction ? '1d' : 0, index: 'index.html', extensions: ['html'] }));
app.use((req, res) => res.status(404).sendFile(path.join(publicDir, '404.html')));

app.use((error, req, res, next) => {
  console.error('Unhandled request error:', error.message);
  if (res.headersSent) return next(error);
  const status = error.status && error.status >= 400 && error.status < 600 ? error.status : 500;
  const payload = { success: false, error: status === 500 ? '服务器暂时不可用，请稍后再试。' : '请求无法处理。' };
  if (req.path.startsWith('/api/') || req.path === '/download') return res.status(status).json(payload);
  return res.status(status).sendFile(path.join(publicDir, '404.html'));
});

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => console.log(`APK download site listening on 0.0.0.0:${PORT} (${process.env.NODE_ENV || 'development'})`));
}

module.exports = app;
