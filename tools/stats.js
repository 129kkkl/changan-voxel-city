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
  const builtSet = new Set([PAL.roofGrey, PAL.roofLight, PAL.roofDark, PAL.roofGroove,
    PAL.roofSlate, PAL.roofSlateL, PAL.roofSlateG, PAL.roofGreen, PAL.roofGreenL, PAL.roofGreenG,
    PAL.roofBlue, PAL.roofBlueL, PAL.roofBlueG, PAL.roofBrown, PAL.roofBrownL, PAL.roofBrownG,
    PAL.timber, PAL.timberDark, PAL.zhu, PAL.zhuDeep, PAL.zhuBright, PAL.plaster, PAL.plasterWarm,
    PAL.doorDark, PAL.brickPave, PAL.stoneGrey, PAL.stoneWhite, PAL.glazeGreen, PAL.glazeBlue, PAL.gold]);
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

// 建筑类型学分布（来自 ctx.buildLog）
const log = res._ctx && res._ctx.buildLog;
if (log && log.length) {
  const tally = (f) => {
    const m = new Map();
    for (const e of log) { const k = f(e); if (k == null) continue; m.set(k, (m.get(k) || 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  console.log(`建筑记录 ${log.length} 条`);
  console.log('  屋顶形制: ' + tally(e => e.roofProfile).map(([k, v]) => `${k}=${v}`).join(' '));
  console.log('  等级:     ' + tally(e => 'r' + e.rank).map(([k, v]) => `${k}=${v}`).join(' '));
  console.log('  面阔:     ' + tally(e => 'w' + Math.min(24, e.x1 - e.x0 + 1)).sort((a, b) => +a[0].slice(1) - +b[0].slice(1)).map(([k, v]) => `${k}=${v}`).join(' '));
  console.log('  总高:     ' + tally(e => 'h' + Math.min(20, e.h)).sort((a, b) => +a[0].slice(1) - +b[0].slice(1)).map(([k, v]) => `${k}=${v}`).join(' '));
  console.log('  开间:     ' + tally(e => e.bayPattern).slice(0, 12).map(([k, v]) => `${k}=${v}`).join(' '));
  const hashes = new Set(log.map(e => e.silhouetteHash));
  console.log(`  轮廓签名去重: ${hashes.size} 种 / ${log.length} 条（重复率 ${(100 * (1 - hashes.size / log.length)).toFixed(1)}%）`);
  const real = log.filter(e => !e.generic);
  const rh = new Set(real.map(e => e.silhouetteHash));
  console.log(`  非 generic 记录: ${real.length} 条，轮廓去重 ${rh.size} 种`);
}

// 屋顶/厅堂类型学普查（由 proto.roof / proto.hall 直接计数）
{
  const c2 = (res._ctx && res._ctx.counters) || {};
  const pick2 = (prefix) => Object.keys(c2).filter(k => k.startsWith(prefix))
    .map(k => [k.slice(prefix.length), c2[k]])
    .sort((a, b) => (/^\d+$/.test(a[0]) && /^\d+$/.test(b[0])) ? (+a[0] - +b[0]) : b[1] - a[1]);
  const roofT = pick2('roof_');
  const roofS = pick2('roofspan_');
  const hallW = pick2('hallw_');
  const hallH = pick2('hallh_');
  if (roofT.length) console.log('屋顶形制普查: ' + roofT.map(([k, v]) => `${k}=${v}`).join(' '));
  const roofHalf = pick2('roofhalf_');
  if (roofHalf.length) {
    const tot = roofHalf.reduce((a, [, v]) => a + v, 0);
    const bad = roofHalf.filter(([k]) => +k <= 2).reduce((a, [, v]) => a + v, 0);
    console.log('  屋面半跨分布: ' + roofHalf.map(([k, v]) => `${k}=${v}`).join(' ') + `  ← 半跨<=2（读作平顶）占 ${(bad / tot * 100).toFixed(1)}%`);
  }
  if (roofS.length) console.log('  屋面跨度: ' + roofS.map(([k, v]) => `${k}=${v}`).join(' '));
  if (hallW.length) console.log('  厅堂面阔: ' + hallW.map(([k, v]) => `${k}=${v}`).join(' '));
  if (hallH.length) console.log('  厅堂墙高: ' + hallH.map(([k, v]) => `${k}=${v}`).join(' '));
}
