// diag.js — 诊断：宏观层旧建筑被 archMask 遮蔽/泄漏情况
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const SRC = __dirname;
const GEN_FILES = [
  'gen/g01_core.js', 'gen/g02_skeleton.js', 'gen/g03_wards.js',
  'gen/g04_proto.js', 'gen/g04_landmark.js', 'gen/g04_fine.js', 'gen/g05_detail.js', 'gen/g06_audit_mesh.js', 'gen/g07_pipeline.js',
];
const sandbox = { console };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const f of GEN_FILES) vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), sandbox, { filename: f });
const CHANGAN = vm.runInContext('CHANGAN', sandbox);
const PAL_DEF = CHANGAN.PAL_DEF;

const seed = process.argv[2] ? parseInt(process.argv[2], 16) : 0x5a17c4a9;
const r = CHANGAN.generate(seed >>> 0);
if (!r.ok) { console.error(r.error); process.exit(1); }
const ctx = r._ctx;
const W = CHANGAN.CFG.WORLD;

// 建筑类颜色（细建筑层也用这些颜色；宏观层出现即旧建筑残留候选）
const BUILD_COLORS = new Set(['roofGrey','roofLight','roofDark','timber','timberDark','zhu','zhuDeep','zhuBright',
  'plaster','plasterWarm','doorDark','glazeGreen','glazeBlue','gold','bronze','stoneWhite','brickPave','iron']);
const nameOf = {};
PAL_DEF.forEach((d, i) => nameOf[i + 1] = d[0]);

let masked = 0, leak = 0, total = 0;
const leakByColor = {}, leakTopY = {}, maskedByColor = {};
const leakColTop = new Map(); // x,z -> 最高泄漏体素y
for (const [k, c] of ctx.store.map) {
  total++;
  const x = CHANGAN.unpackX(k), y = CHANGAN.unpackY(k), z = CHANGAN.unpackZ(k);
  const cn = nameOf[c];
  if (CHANGAN.isArchMasked(ctx, x, y, z)) { masked++; if (BUILD_COLORS.has(cn)) maskedByColor[cn] = (maskedByColor[cn] || 0) + 1; continue; }
  if (BUILD_COLORS.has(cn)) {
    leak++;
    leakByColor[cn] = (leakByColor[cn] || 0) + 1;
    leakTopY[y] = (leakTopY[y] || 0) + 1;
    const key = x * 1000 + z;
    const p = leakColTop.get(key); if (!p || y > p) leakColTop.set(key, y);
  }
}
console.log('总宏观体素', total, '被mask遮蔽', masked, '其中建筑色', Object.values(maskedByColor).reduce((a,b)=>a+b,0));
console.log('--- 泄漏(可见)的建筑色体素:', leak);
console.log('按颜色:', Object.entries(leakByColor).sort((a,b)=>b[1]-a[1]).map(e=>e[0]+':'+e[1]).join(' '));
console.log('被遮蔽建筑色按颜色:', Object.entries(maskedByColor).sort((a,b)=>b[1]-a[1]).map(e=>e[0]+':'+e[1]).join(' '));
console.log('泄漏体素高度分布(y:count):', Object.entries(leakTopY).sort((a,b)=>a[0]-b[1]).map(e=>e[0]+':'+e[1]).join(' '));
console.log('泄漏占据列数:', leakColTop.size);

// 评估：若按 BuildingAssembly 包络（footprint 外扩 margin，高度到 collisionProxy.y1）补mask，覆盖率与误伤
function evalMargin(margin) {
  let cover = 0, remain = 0;
  for (const [k, c] of ctx.store.map) {
    const x = CHANGAN.unpackX(k), y = CHANGAN.unpackY(k), z = CHANGAN.unpackZ(k);
    const cn = nameOf[c]; if (!BUILD_COLORS.has(cn)) continue;
    if (CHANGAN.isArchMasked(ctx, x, y, z)) { cover++; continue; }
    let hit = false;
    for (const b of ctx.buildings) {
      const p = b.footprint, cp = b.collisionProxy;
      if (x >= Math.floor(p.x0)-margin && x <= Math.ceil(p.x1)+margin &&
          z >= Math.floor(p.z0)-margin && z <= Math.ceil(p.z1)+margin &&
          y >= (cp.y0||0)-1 && y <= Math.ceil(cp.y1)+margin) { hit = true; break; }
    }
    if (hit) cover++; else remain++;
  }
  return { cover, remain };
}
for (const m of [0,1,2,3,4]) {
  const { cover, remain } = evalMargin(m);
  console.log(`外扩${m}格补mask: 可覆盖建筑色 ${cover}, 剩余 ${remain}`);
}

// 抽样：剩余泄漏体素位置（外扩4仍盖不住的）
const samples = [];
for (const [k, c] of ctx.store.map) {
  const x = CHANGAN.unpackX(k), y = CHANGAN.unpackY(k), z = CHANGAN.unpackZ(k);
  const cn = nameOf[c]; if (!BUILD_COLORS.has(cn)) continue;
  if (CHANGAN.isArchMasked(ctx, x, y, z)) continue;
  let hit = false;
  for (const b of ctx.buildings) {
    const p = b.footprint, cp = b.collisionProxy;
    if (x >= Math.floor(p.x0)-4 && x <= Math.ceil(p.x1)+4 && z >= Math.floor(p.z0)-4 && z <= Math.ceil(p.z1)+4 && y >= (cp.y0||0)-1 && y <= Math.ceil(cp.y1)+4) { hit = true; break; }
  }
  if (!hit && samples.length < 25) samples.push(cn + '@' + x + ',' + y + ',' + z);
}
console.log('外扩4仍泄漏样本:', samples.join(' | '));

// 墙体完整性：坊墙环线 / 城墙带 被误遮的格数（应为 0，代表 city skeleton 没被 envelopeMask 吃掉）
{
  const WALLC = new Set(['rammed', 'rammedDark', 'rammedLight', 'brickPave']);
  const cov = ctx._archCover, Dd = ctx._archCover.Dd;
  const coverOf = (x, z) => { const i = (x - CHANGAN.CFG.WORLD.x0) * Dd + (z - CHANGAN.CFG.WORLD.z0); return cov.core[i] ? 'core' : cov.ring[i] ? 'ring' : 'none'; };
  let wardCols = 0, wardBroken = 0, cityCols = 0, cityBroken = 0;
  const bk = { core: 0, ring: 0, none: 0 }, cbk = { core: 0, ring: 0, none: 0 };
  const wardSamples = [], citySamples = [];
  for (const w of ctx.wards || []) {
    if (!w.base) continue;
    for (let x = w.x0; x <= w.x1; x++) for (let z = w.z0; z <= w.z1; z++) {
      if (!(x === w.x0 || x === w.x1 || z === w.z0 || z === w.z1)) continue;
      wardCols++;
      for (let y = w.base + 1; y <= w.base + 3; y++) {
        const c = ctx.store.get(x, y, z);
        if (c && WALLC.has(nameOf[c]) && CHANGAN.isArchMasked(ctx, x, y, z)) {
          wardBroken++; bk[coverOf(x, z)]++;
          if (wardSamples.length < 8) wardSamples.push(nameOf[c] + '@' + x + ',' + y + ',' + z + '(' + coverOf(x, z) + ',ward' + w.id + ')');
          break;
        }
      }
    }
  }
  const C = CHANGAN.CFG.CITY, T = CHANGAN.CFG.WALL, H = CHANGAN.CFG.Y.WALL_H;
  for (const [x0, z0, x1, z1] of [[C.x0 - T, C.z1 + 1, C.x1 + T, C.z1 + T], [C.x0 - T, C.z0 - T, C.x1 + T, C.z0 - 1],
    [C.x1 + 1, C.z0 - T, C.x1 + T, C.z1 + T], [C.x0 - T, C.z0 - T, C.x0 - 1, C.z1 + T]]) {
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      const gy = ctx.fields.groundH[CHANGAN.fieldIndex(x, z)];
      let hit = false;
      for (let y = gy + 1; y <= gy + H + 1; y++) {
        const c = ctx.store.get(x, y, z);
        if (c && WALLC.has(nameOf[c])) {
          if (CHANGAN.isArchMasked(ctx, x, y, z) && !hit) {
            cityBroken++; cbk[coverOf(x, z)]++;
            if (citySamples.length < 8) citySamples.push(nameOf[c] + '@' + x + ',' + y + ',' + z + '(' + coverOf(x, z) + ')');
          }
          hit = true;
        }
      }
      if (hit) cityCols++;
    }
  }
  console.log('--- 墙体完整性: 坊墙格', wardCols, '墙体色被遮', wardBroken, JSON.stringify(bk), wardSamples.join(' '));
  console.log('    城墙格', cityCols, '墙体色被遮', cityBroken, JSON.stringify(cbk), citySamples.join(' '));
}

// 高空泄漏族：按 (x>>4,z>>4) 聚簇，定位是哪片建筑没被细层接管
{
  const FACADE = new Set(['roofGrey','roofLight','roofDark','timber','timberDark','zhu','zhuDeep','zhuBright',
    'plaster','plasterWarm','doorDark','glazeGreen','glazeBlue','gold','bronze','iron',
    'clothCream','clothHu','flagRed','flagBlue','flagYellow','flagGreen','flagPurple','paperWhite']);
  const clusters = new Map();
  for (const [k, c] of ctx.store.map) {
    const x = CHANGAN.unpackX(k), y = CHANGAN.unpackY(k), z = CHANGAN.unpackZ(k);
    if (y < 12) continue;
    const cn = nameOf[c]; if (!FACADE.has(cn)) continue;
    if (CHANGAN.isArchMasked(ctx, x, y, z)) continue;
    const key = (x >> 4) + ',' + (z >> 4);
    const e = clusters.get(key) || { n: 0, top: 0, colors: {}, sample: null };
    e.n++; if (y > e.top) e.top = y; e.colors[cn] = (e.colors[cn] || 0) + 1;
    if (!e.sample) e.sample = cn + '@' + x + ',' + y + ',' + z;
    clusters.set(key, e);
  }
  const list = [...clusters.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 14);
  console.log('--- 高空泄漏聚簇 top14 (格>>4, 数量, 最高y, 样例):');
  for (const [key, e] of list) {
    const col = Object.entries(e.colors).sort((a,b)=>b[1]-a[1]).slice(0,3).map(v=>v[0]+':'+v[1]).join(' ');
    console.log('    ', key, 'n=' + e.n, 'top=' + e.top, col, '|', e.sample);
  }
}

// P0-4 新口径：覆盖列漏遮 / 高空泄漏 / 主动保留
const leakAudit = CHANGAN.auditArchLeak(ctx);
console.log('--- 遮蔽闭环审计:', leakAudit.detail, leakAudit.pass ? '[PASS]' : '[FAIL]');
console.log('    离地≥6未接管按颜色:', Object.entries(leakAudit.tallByColor).sort((a,b)=>b[1]-a[1]).map(e=>e[0]+':'+e[1]).join(' '));

// 细建筑盒子按材质/lod统计
const matCount = {}, lodCount = {};
for (const b of ctx.fineStore.boxes) { matCount[b.material] = (matCount[b.material]||0)+1; lodCount[b.lod] = (lodCount[b.lod]||0)+1; }
console.log('细盒材质:', JSON.stringify(matCount), 'lod:', JSON.stringify(lodCount));
console.log('建筑群数:', ctx.buildings.length, 'role分布:', JSON.stringify(ctx.buildings.reduce((m,b)=>{m[b.role]=(m[b.role]||0)+1;return m;},{})));
