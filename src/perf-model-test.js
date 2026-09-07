// perf-model-test.js — 默认中画质的静态批次保守模型。
// 它故意不做视锥剔除，统计 18 个机位全部宏观块与建筑块的主彩色通道；
// 用来阻止 LOD 改动把静态批次推过 240，但不冒充真实浏览器 FPS / 阴影 pass 测量。
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = __dirname;
const GEN_FILES = [
  'gen/g01_core.js', 'gen/g02_skeleton.js', 'gen/g03_wards.js',
  'gen/g04_proto.js', 'gen/g04_landmark.js', 'gen/g04_fine.js',
  'gen/g05_detail.js', 'gen/g06_audit_mesh.js', 'gen/g07_pipeline.js',
];

function loadGenerator() {
  const box = { console };
  box.globalThis = box;
  vm.createContext(box);
  for (const file of GEN_FILES) {
    vm.runInContext(fs.readFileSync(path.join(SRC, file), 'utf8'), box, { filename: file });
  }
  return vm.runInContext('CHANGAN', box);
}

function loadViews() {
  const box = { console };
  box.globalThis = box;
  vm.createContext(box);
  const source = fs.readFileSync(path.join(SRC, 'app/a02_views.js'), 'utf8')
    .replace(/\bexport\s+(?=(?:const|let|var|function|class)\b)/g, '');
  vm.runInContext(source, box, { filename: 'app/a02_views.js' });
  return vm.runInContext('VIEW_DEFS', box);
}

function readRenderConstants() {
  const source = fs.readFileSync(path.join(SRC, 'app/a01_engine.js'), 'utf8');
  const pick = (re, label) => {
    const match = source.match(re);
    if (!match) throw new Error(`无法读取 ${label}`);
    return Number(match[1]);
  };
  return {
    fov: pick(/PerspectiveCamera\((\d+(?:\.\d+)?)/, '相机 FOV'),
    macroDistance: pick(/mid:\s*\{[^}]*lodDist:\s*(\d+(?:\.\d+)?)/, '中画质宏观 LOD'),
    landmarkRadius: pick(/rankMax[^?]*\?\s*(\d+(?:\.\d+)?)\s*:\s*\d+(?:\.\d+)?/, '地标投影半径'),
    ordinaryRadius: pick(/rankMax[^?]*\?\s*\d+(?:\.\d+)?\s*:\s*(\d+(?:\.\d+)?)/, '普通建筑投影半径'),
    targetBias: pick(/distanceTo\(target\)\s*<\s*(\d+(?:\.\d+)?)/, '当前目标 LOD 半径'),
  };
}

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const countKinds = (object, kinds) => kinds.reduce((n, key) => n + (object && object[key] ? 1 : 0), 0);

const generator = loadGenerator();
const result = generator.generate(0x5a17c4a9);
if (!result.ok) throw new Error(result.error);
const views = loadViews();
const tuning = readRenderConstants();
const focalPx = 1080 / (2 * Math.tan(tuning.fov * Math.PI / 360));
let max = { total: 0, view: '' };

for (const view of views) {
  const pose = view.cam(result.meta.viewAnchors);
  const camera = pose.pos;
  const target = pose.target;
  let macro = 0;
  let architecture = 0;

  for (const chunk of result.chunks) {
    const center = [chunk.ox + 64, 10, chunk.oz + 64];
    const near = distance(center, camera) < tuning.macroDistance;
    macro += near
      ? countKinds(chunk.meshes, ['opaque', 'water', 'glow'])
      : countKinds(chunk.meshes, ['lod']);
  }

  for (const chunk of result.architectureChunks) {
    const center = [chunk.ox + (chunk.size || 64) * 0.5, 12, chunk.oz + (chunk.size || 64) * 0.5];
    const radius = chunk.rankMax >= 4 ? tuning.landmarkRadius : tuning.ordinaryRadius;
    const diameterPx = radius / Math.max(1, distance(center, camera)) * focalPx * 2;
    let level = diameterPx > 80 ? 0 : diameterPx > 20 ? 1 : 2;
    if (chunk.rankMax >= 4 || distance(center, target) < tuning.targetBias) level = Math.max(0, level - 1);
    if (!Object.keys(chunk.lods[level] || {}).length) level = Object.keys(chunk.lods[1] || {}).length ? 1 : 2;
    architecture += Object.keys(chunk.lods[level] || {}).length;
  }

  const total = macro + architecture;
  console.log(`${view.id.padEnd(12)} macro=${String(macro).padStart(2)} architecture=${String(architecture).padStart(3)} static=${total}`);
  if (total > max.total) max = { total, view: view.id };
}

if (max.total > 240) {
  console.error(`[FAIL] 不剔除静态批次峰值 ${max.total} > 240（${max.view}）`);
  process.exit(1);
}
console.log(`[perf-model] 通过：不剔除静态批次峰值 ${max.total}/240（${max.view}）；仍需浏览器实测 FPS、阴影 pass 与动态对象。`);
