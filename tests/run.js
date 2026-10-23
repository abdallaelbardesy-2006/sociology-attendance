// يشغّل سيرفر التطوير ببيانات وهمية ثم يشغّل اختبارات الأمان والصلاحيات
const { spawn } = require('child_process');
const path = require('path');

const PORT = String(4100 + Math.floor(Math.random() * 500));
const server = spawn(process.execPath, [path.join(__dirname, '..', 'scripts', 'dev-server.js'), '--mock'], { env: { ...process.env, PORT }, stdio: ['ignore', 'pipe', 'inherit'] });

server.stdout.once('data', () => {
  const tests = spawn(process.execPath, [path.join(__dirname, 'api.test.js')], { env: { ...process.env, BASE: `http://localhost:${PORT}` }, stdio: 'inherit' });
  tests.on('exit', code => { server.kill(); process.exit(code); });
});
