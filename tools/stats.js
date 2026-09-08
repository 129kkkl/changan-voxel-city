// tools/stats.js — 密度与计数快照（复用与 Worker 完全相同的生成源码）
// 用法: node tools/stats.js [seed]
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'src');
const GEN_FILES = [
  'gen/g01_core.js', 'gen/g02_skeleton.js', 'gen/g03_wards.js',
  'gen/g04_proto.js', 'gen/g04_landmark.js', 'gen/g05_detail.js', 'gen/g06_audit_mesh.js', 'gen/g07_pipeline.js',
];
const seed = (parseInt(process.argv[2] || '5a17c4a9', 16) >>> 0) || 0x5a17c4a9;

const sandbox = { console: { log: () => {}, warn: () => {}, error: () => {} } };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const f of GEN_FILES) vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), sandbox, { filename: f });
const CHANGAN = vm.runInContext('CHANGAN', sandbox);

const t0 = Date.now();
const res = CHANGAN.generate(seed, () => {});
const ms = Date.now() - t0;
if (!res.ok) { console.error('生成失败: ' + res.error); console.error('审计明细: ' + JSON.stringify(res.stats && res.stats.audits || null)); process.exit(1); }
const s = res.stats;

console.log(`seed=0x${seed.toString(16)}  ${ms}ms  体素=${s.voxels}  checksum=${s.checksum}`);
console.log(`坊=${s.wardCount} 市坊位=${s.marketPlots} 门=${s.gateCount} 树=${s.trees}`);
console.log('审计: ' + s.audits.map(a => `${a.name}:${a.pass ? '过' : 'FATAL'}`).join(' '));
for (const a of s.audits) if (!a.pass) console.log(`  ✗ ${a.name}: ${a.detail || ''}`);
const c = (res._ctx && res._ctx.counters) || {};
const keys = Object.keys(c).filter(k => typeof c[k] === 'number').sort();
console.log('计数: ' + keys.map(k => `${k}=${c[k]}`).join(' '));

// 坊内地面构成（仅统计坊区内的列）
const fields = res.fields;
const PAL = CHANGAN.PAL;
if (fields && fields.wardId) {
  const builtSet = new Set([PAL.roofGrey, PAL.roofLight, PAL.roofDark, PAL.timber, PAL.timberDark, PAL.zhu, PAL.zhuDeep, PAL.zhuBright, PAL.plaster, PAL.plasterWarm, PAL.doorDark, PAL.brickPave, PAL.stoneGrey, PAL.stoneWhite, PAL.glazeGreen, PAL.glazeBlue, PAL.gold]);
  let built = 0, bare = 0, road = 0, water = 0, tot = 0;
  for (let i = 0; i < fields.topH.length; i++) {
    if (!fields.wardId[i]) continue;
    tot++;
    if (fields.water[i]) { water++; continue; }
    if (fields.road[i]) { road++; continue; }
    if (builtSet.has(fields.topColor[i])) built++; else bare++;
  }
  const pct = v => (v / tot * 100).toFixed(1) + '%';
  console.log(`坊内构成(${tot}列): 建筑/铺装=${pct(built)} 道路=${pct(road)} 水=${pct(water)} 裸地/植被=${pct(bare)}`);
}
