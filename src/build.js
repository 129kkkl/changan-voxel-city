// build.js — 装配离线单文件 index.html
// 用法: node build.js
// 输入: src/index.template.html + src/vendor/*.js + src/gen/*.js + src/app/*.js + src/app.css
// 输出: ../index.html （项目根目录）, 并打印 SHA256 与体积
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SRC = __dirname;
const OUT = path.join(SRC, '..', 'index.html');

function read(p) { return fs.readFileSync(path.join(SRC, p), 'utf8'); }

// 生成器（纯数据层，顺序敏感：核心 → 骨架 → 坊市 → 原型地标 → 独立地标 → 细节 → 审计网格 → 编排）
const GEN_FILES = [
  'gen/g01_core.js',
  'gen/g02_skeleton.js',
  'gen/g03_wards.js',
  'gen/g04_proto.js',
  'gen/g04_landmark.js',
  'gen/g04_fine.js',
  'gen/g05_detail.js',
  'gen/g06_audit_mesh.js',
  'gen/g07_pipeline.js',
];
// 主线程（顺序敏感：引擎 → 机位 → 动态 → 交互 → 编排）
const APP_FILES = [
  'app/a01_engine.js',
  'app/a02_views.js',
  'app/a03_life.js',
  'app/a04_ui.js',
  'app/a05_main.js',
];

let html = read('index.template.html');
const inject = (tag, content) => {
  const marker = '{{' + tag + '}}';
  if (!html.includes(marker)) throw new Error('模板缺少占位符 ' + marker);
  html = html.replace(marker, () => content); // 函数式替换，避免 $ 特殊序列
};

inject('APP_CSS', read('app.css'));
inject('VENDOR_CORE', read('vendor/three.core.js').trim());
inject('VENDOR_MODULE', read('vendor/three.module.js').trim());
inject('VENDOR_ORBIT', read('vendor/OrbitControls.js').trim());
inject('GEN_SRC', GEN_FILES.map(f => '\n// ===== ' + f + ' =====\n' + read(f)).join('\n'));
inject('APP_SRC', APP_FILES.map(f => '\n// ===== ' + f + ' =====\n' + read(f)).join('\n'));

{
  const leftover = html.match(/\{\{[A-Z_]+\}\}/g);
  if (leftover) throw new Error('存在未替换的占位符: ' + leftover);
}
fs.writeFileSync(OUT, html, 'utf8');

const sha = crypto.createHash('sha256').update(fs.readFileSync(OUT)).digest('hex');
const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
console.log('[build] ' + OUT + '  ' + kb + ' KB');
console.log('[build] sha256=' + sha);
