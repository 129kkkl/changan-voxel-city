// offline-test.js — 单文件/CSP/脚本装配/零外链静态验收
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
let fail = 0;
const check = (ok, label) => { console.log(`${ok ? '[PASS]' : '[FAIL]'} ${label}`); if (!ok) fail++; };
check(/Content-Security-Policy/.test(html) && /worker-src 'self' blob:/.test(html) && /connect-src 'self'/.test(html), 'CSP 限制网络并允许内嵌 Blob Worker');
check(!/<script\b[^>]*\bsrc\s*=/.test(html), '无外部 script src');
check(!/<link\b[^>]*rel=["']stylesheet["'][^>]*href\s*=/.test(html), '无外部样式表');
check(!/<(?:img|audio|video|source)\b[^>]*\bsrc\s*=["']https?:/i.test(html), '无远程媒体资源');
check(/id="vendor-three-core"/.test(html) && /id="gen-src"/.test(html), 'Three.js 与生成器均内嵌');
check(/architectureChunks/.test(html) && /positionScale:1\/Q/.test(html), '双尺度建筑消息与 0.125 位置缩放已装配');
const appSrc = html.match(/<script type="module">([\s\S]*?)<\/script>\s*<\/body>/);
if (appSrc) {
  const parseable = appSrc[1].replace(/^\s*import[^;]+;\s*$/gm, '').replace(/\bexport\s+(?=(?:const|let|var|function|class)\b)/g, '');
  try { new vm.Script(parseable, { filename: 'assembled-app.js' }); check(true, '合并后的应用模块可解析'); }
  catch (e) { console.error(e.stack); check(false, '合并后的应用模块可解析'); }
} else check(false, '找到应用模块');
const ownSource = fs.readdirSync(path.join(__dirname, 'app')).concat(fs.readdirSync(path.join(__dirname, 'gen')))
  .filter(f => f.endsWith('.js')).map(f => fs.existsSync(path.join(__dirname, 'app', f)) ? fs.readFileSync(path.join(__dirname, 'app', f), 'utf8') : fs.readFileSync(path.join(__dirname, 'gen', f), 'utf8')).join('\n');
check(!/\bfetch\s*\(|new\s+XMLHttpRequest\b|WebSocket\s*\(/.test(ownSource), '项目自有代码无网络请求');
console.log(fail ? `[offline-test] ${fail} 项失败 ✗` : '[offline-test] 全部通过 ✓');
process.exit(fail ? 1 : 0);
