const { createHash, timingSafeEqual } = require('node:crypto');
const digest = value => createHash('sha256').update(value).digest();
module.exports = function auth(req, res, next) {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'same-origin');
  res.set('X-Frame-Options', 'DENY');
  const user = process.env.APP_USERNAME, password = process.env.APP_PASSWORD;
  const required = process.env.VERCEL || process.env.NODE_ENV === 'production';
  if (!user || !password) {
    if (required) return res.status(503).json({ error: 'กรุณาตั้งค่า APP_USERNAME และ APP_PASSWORD ใน Vercel' });
    return next();
  }
  const header = req.get('authorization') || '';
  const supplied = /^Basic /i.test(header) ? Buffer.from(header.slice(6), 'base64').toString() : '';
  if (timingSafeEqual(digest(supplied), digest(user + ':' + password))) return next();
  res.set('Cache-Control', 'no-store');
  res.set('WWW-Authenticate', 'Basic realm="WASHY", charset="UTF-8"');
  return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
};
