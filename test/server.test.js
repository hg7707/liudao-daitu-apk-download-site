const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
process.env.ADMIN_PASSWORD = 'test-admin-password-123';
process.env.SESSION_SECRET = 'test-session-secret-that-is-long-enough-123';
const app = require('../server');

let server;
let baseUrl;
test.before(async () => { server = app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve)); baseUrl = `http://127.0.0.1:${server.address().port}`; });
test.after(() => new Promise((resolve) => server.close(resolve)));
test('首页可访问', async () => { const response = await fetch(`${baseUrl}/`); assert.equal(response.status, 200); assert.match(await response.text(), /立即下载 APK/); });
test('版本接口返回动态下载地址和标准字段', async () => { const response = await fetch(`${baseUrl}/api/version`); const data = await response.json(); assert.equal(response.status, 200); assert.equal(data.success, true); assert.equal(data.downloadUrl, `${baseUrl}/download`); assert.equal(typeof data.versionCode, 'number'); });
test('公开应用信息不泄露服务器 APK 路径配置', async () => { const response = await fetch(`${baseUrl}/api/app-info`); const data = await response.json(); assert.equal(response.status, 200); assert.equal(data.apkFileName, undefined); assert.equal(data.success, true); });
test('正式 APK 下载接口不向客户端暴露远程存储地址', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1, 2, 3])); controller.close(); } }), {
    status: 200,
    headers: { 'content-length': '3', 'accept-ranges': 'bytes' }
  });
  try {
    const response = await new Promise((resolve, reject) => {
      const request = http.get(`${baseUrl}/download`, resolve);
      request.on('error', reject);
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['content-type'], 'application/vnd.android.package-archive');
    assert.match(response.headers['content-disposition'], /attachment/);
    assert.equal(response.headers.location, undefined);
    response.resume();
    await new Promise((resolve) => response.once('end', resolve));
  } finally {
    global.fetch = originalFetch;
  }
});
test('APK 目录不可直接访问', async () => { const response = await fetch(`${baseUrl}/apk/app-latest.apk`); assert.equal(response.status, 404); });
test('未登录不能读取后台统计', async () => { const response = await fetch(`${baseUrl}/api/admin/stats`); assert.equal(response.status, 401); });
test('管理员可登录并读取只读统计', async () => {
  const login = await fetch(`${baseUrl}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: process.env.ADMIN_PASSWORD }) });
  const body = await login.json();
  assert.equal(login.status, 200); assert.equal(body.success, true);
  const cookie = login.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Strict/);
  const stats = await fetch(`${baseUrl}/api/admin/stats`, { headers: { Cookie: cookie.split(';')[0] } });
  assert.equal(stats.status, 200); assert.equal((await stats.json()).success, true);
});
test('错误管理员密码被拒绝', async () => { const response = await fetch(`${baseUrl}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'wrong-password' }) }); assert.equal(response.status, 401); });
test('安全响应头已启用', async () => { const response = await fetch(`${baseUrl}/`); assert.equal(response.headers.get('x-content-type-options'), 'nosniff'); assert.ok(response.headers.get('x-frame-options')); });
