// tools/audit-scale.js — 审计用：量化真实几何尺度与层级构成（不改产物）
// 用法: node tools/audit-scale.js [seed]
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'src');
const GEN_FILES = [
  'gen/g01_core.js', 'gen/g02_skeleton.js', 'gen/g03_wards.js',
  'gen/g04_proto.js', 'gen/g04_landmark.js', 'gen/g05_detail.js', 'gen/g06_audit_mesh.js', 'gen/g08_arch.js', 'gen/g09_refine.js', 'gen/g07_pipeline.js',
];
const seed = (parseInt(process.argv[2] || '5a17c4a9', 16) >>> 0) || 0x5a17c4a9;

const sandbox = { console: { log: () => {}, warn: () => {}, error: () => {} } };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const f of GEN_FILES) vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), sandbox, { filename: f });
const CHANGAN = vm.runInContext('CHANGAN', sandbox);

const t0 = Date.now();
const res = CHANGAN.generate(seed, () => {}, { plan: 'C' });
console.log(`生成 ${Date.now() - t0}ms ok=${res.ok}`);
if (!res.ok) { console.log(res.error); process.exit(1); }

const CFG = CHANGAN.CFG;
const CITY = CFG.CITY;
console.log('\n=== 1. 尺度契约 ===');
console.log(`世界(城市格): x ${CFG.WORLD.x0}..${CFG.WORLD.x1}  z ${CFG.WORLD.z0}..${CFG.WORLD.z1}  H=${CFG.WORLD.H}`);
console.log(`ARCH_S=${CHANGAN.ARCH_SCALE}  → 1 建筑格 = 1/${CHANGAN.ARCH_SCALE} 城市格`);
const M_PER_CITY = 13.8;
console.log(`SPEC 口径 1 城市格 ≈ ${M_PER_CITY} m`);
console.log(`→ 1 建筑格水平 ≈ ${(M_PER_CITY / CHANGAN.ARCH_SCALE).toFixed(2)} m`);
console.log(`→ g08 注释声称 1 建筑格 ≈ 0.30 m  → 声称/实际 = ${(0.30 / (M_PER_CITY / CHANGAN.ARCH_SCALE)).toFixed(3)}`);
console.log(`  要到 0.30 m 需要 ARCH_S ≈ ${Math.round(M_PER_CITY / 0.30)}`);

console.log('\n=== 2. 体素/网格规模 ===');
const s = res.stats;
console.log(`城市层体素=${s.voxels}  建筑层体素=${s.archVoxels}  建筑层四边面=${s.archQuads}  LOD面=${s.archLodQuads}`);
console.log(`屋顶构件记录=${s.roofElements}  建筑群=${s.compounds}  厅=${s.buildings} 店=${s.shops} 树=${s.trees} 塔=${s.towers}`);
console.log(`checksum=${s.checksum}  archChecksum=${s.archChecksum}`);
console.log(`drawCalls 预算=${CFG.BUDGET.drawCalls}`);
console.log('阶段耗时: ' + Object.entries(s.stageMs).map(([k, v]) => `${k}=${v}ms`).join(' '));

console.log('\n=== 3. 建筑实体尺寸（archLog，单位：城市格 / 米） ===');
const log = res._ctx.archLog || [];
console.log(`archLog 条数=${log.length}`);
if (log.length) {
  const w = log.map(e => e.x1 - e.x0 + 1).sort((a, b) => a - b);
  const h = log.map(e => e.h).sort((a, b) => a - b);
  const q = (arr, p) => arr[Math.min(arr.length - 1, Math.floor(arr.length * p))];
  console.log(`建筑占地面阔(城市格): min=${w[0]} p25=${q(w, .25)} 中位=${q(w, .5)} p75=${q(w, .75)} max=${w[w.length - 1]}`);
  console.log(`  换算米: 中位=${(q(w, .5) * M_PER_CITY).toFixed(1)}m  max=${(w[w.length - 1] * M_PER_CITY).toFixed(1)}m`);
  console.log(`建筑总高(城市格): min=${h[0]} 中位=${q(h, .5)} max=${h[h.length - 1]}`);
  const kinds = new Map();
  for (const e of log) kinds.set(e.kind, (kinds.get(e.kind) || 0) + 1);
  console.log('类型: ' + [...kinds].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' '));
  const roofs = new Map();
  for (const e of log) roofs.set(e.roofProfile || e.roof, (roofs.get(e.roofProfile || e.roof) || 0) + 1);
  console.log('屋面: ' + [...roofs].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' '));
  console.log('样例前 6 条:');
  for (const e of log.slice(0, 6)) console.log('  ' + JSON.stringify(e));
}

console.log('\n=== 4. 构件粒度抽样（建筑层实测） ===');
const a = res._ctx.arch;
// 柱径：统计 zhu 色在 x 方向的连续run长度分布
const PAL = CHANGAN.PAL;
const runs = [];
for (const [k, c] of a.map) {
  if (c !== PAL.zhu && c !== PAL.zhuBright && c !== PAL.zhuDeep) continue;
  const y = k % 512, t = (k - y) / 512, z = t % 16384, x = (t - z) / 16384 - 8192;
  if (!a.map.has((((x - 1) + 8192) * 16384 + (z + 8192)) * 512 + y)) runs.push(x);
}
const runLen = new Map();
for (const x of runs) runLen.set(x, (runLen.get(x) || 0) + 1);
const lens = [...runLen.values()].sort((p, q2) => p - q2);
if (lens.length) console.log(`柱色 x 向连续段数=${lens.length} 中位段长=${lens[Math.floor(lens.length / 2)]} 建筑格 = ${(lens[Math.floor(lens.length / 2)] * M_PER_CITY / 4).toFixed(2)} m`);

// 高度分布
const ys = new Map();
for (const [k] of a.map) { const y = k % 512; ys.set(y, (ys.get(y) || 0) + 1); }
console.log(`建筑层 y 范围: ${Math.min(...ys.keys())} .. ${Math.max(...ys.keys())} 建筑格 = ${(Math.max(...ys.keys()) * M_PER_CITY / 4).toFixed(1)} m（若垂直同尺度）`);

console.log('\n=== 5. 分层归属（哪些走 4× 建筑层，哪些留在 1× 城市层） ===');
const counters = res._ctx.counters || {};
console.log('计数: ' + Object.entries(counters).filter(([, v]) => typeof v === 'number').map(([k, v]) => `${k}=${v}`).join(' '));

console.log('\n=== 6. 审计项 ===');
for (const au of (s.audits || [])) console.log(`  ${au.pass ? '过 ' : 'FATAL'} ${au.name}: ${au.detail || ''}`);
