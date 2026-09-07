// 盛唐长安本地极简静态预览服务器 (零外部依赖，使用 Node 内置 http 模块)
const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = 8080;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

const server = http.createServer((req, res) => {
  let reqPath = decodeURIComponent(req.url.split('?')[0]);
  if (reqPath === '/' || reqPath === '') reqPath = '/index.html';
  
  const fullPath = path.join(ROOT, reqPath);
  if (!fullPath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('403 Forbidden');
    return;
  }

  fs.stat(fullPath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found: ' + reqPath);
      return;
    }
    const ext = path.extname(fullPath).toLowerCase();
    const contentType = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(fullPath).pipe(res);
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`[提示] 端口 ${PORT} 已被占用，尝试使用动态端口...`);
    server.listen(0);
  } else {
    console.error('服务器错误:', err);
  }
});

server.listen(PORT, () => {
  const address = server.address();
  const actualPort = typeof address === 'object' ? address.port : PORT;
  const url = `http://localhost:${actualPort}/index.html`;
  
  console.log('\n======================================================');
  console.log('       盛唐长安体素箱庭 · 本地快速预览服务已启动');
  console.log('======================================================');
  console.log(` 抢修版主入口: ${url}`);
  console.log(` 空间结构蓝图图纸: http://localhost:${actualPort}/03_唐长安城空间结构蓝图.html`);
  console.log('------------------------------------------------------');
  console.log(' 按 Ctrl+C 可停止预览服务\n');

  // 自动调起系统默认浏览器
  const startCmd = process.platform === 'win32' ? `start "" "${url}"` : `open "${url}"`;
  exec(startCmd, () => {});
});
