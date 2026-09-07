// inspect.js — 生成器数据层可视化/量化检查工具（不进 index.html）
// 用法:
//   node inspect.js map  [seed] [scale]      → ASCII 全城舆图（按顶面颜色分类）
//   node inspect.js zoom [seed] x0 z0 x1 z1  → 局部 ASCII 详图（1 体素≈1 字符）
//   node inspect.js stats [seed]             → 坊级统计（覆盖率/院落数/地块尺寸分布/布局家族）
//   node inspect.js png  [seed] [file]       → 顶视 PNG（256 色版式，供存档对照）
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');

const SRC = __dirname;
const GEN_FILES = [
  'gen/g01_core.js', 'gen/g02_skeleton.js', 'gen/g03_wards.js',
  'gen/g04_proto.js', 'gen/g04_landmark.js', 'gen/g05_detail.js', 'gen/g06_audit_mesh.js', 'gen/g07_pipeline.js',
];
function loadGen() {
  const sandbox = { console: { log() {}, warn() {}, error() {} } };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const f of GEN_FILES) vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), sandbox, { filename: f });
  return vm.runInContext('CHANGAN', sandbox);
}

const CH = loadGen();
const mode = process.argv[2] || 'map';
const seed = (parseInt(process.argv[3] || '5a17c4a9', 16) >>> 0) || 0x5a17c4a9;
const t0 = Date.now();
const res = CH.generate(seed, () => {});
if (!res.ok) { console.error('生成失败:', res.error); process.exit(1); }
console.error(`[inspect] 生成 ${Date.now() - t0}ms 体素=${res.stats.voxels} checksum=${res.stats.checksum}`);
const { fields, meta } = res;
const W = CH.CFG.WORLD, PAL = CH.PAL;
const F = (x, z) => (z - W.z0) * (W.x1 - W.x0 + 1) + (x - W.x0);

// 顶面颜色 → 字符
const ROOFS = new Set([PAL.roofGrey, PAL.roofLight, PAL.roofDark, PAL.glazeGreen, PAL.glazeBlue]);
const WALLS = new Set([PAL.rammed, PAL.rammedLight, PAL.rammedDark]);
const WATERS = new Set([PAL.canalWater, PAL.pondWater, PAL.weiWater, PAL.qujiangWater]);
const GREENS = new Set([PAL.grass, PAL.moss, PAL.huaiGreen, PAL.huaiLight, PAL.willowGreen, PAL.pineGreen, PAL.bambooGreen, PAL.wutongGreen, PAL.apricotPink, PAL.withered, PAL.fieldEarth]);
const ROADS = new Set([PAL.loessLight, PAL.brickPave, PAL.stoneWhite, PAL.riverSand]);
const ZHU = new Set([PAL.zhu, PAL.zhuDeep, PAL.zhuBright, PAL.timber, PAL.timberDark, PAL.doorDark]);
function charOf(x, z) {
  const i = F(x, z);
  const c = fields.topColor[i], th = fields.topH[i], gh = fields.groundH[i];
  if (WATERS.has(c)) return '~';
  if (ROOFS.has(c)) return th >= gh + 8 ? '#' : 'n';   // 高层屋顶 # / 普通屋顶 n
  if (ZHU.has(c)) return '+';
  if (GREENS.has(c)) return c === PAL.withered || c === PAL.fieldEarth ? ',' : '"';
  if (WALLS.has(c)) return th >= gh + 3 ? 'H' : '|';   // 高墙 H / 墙
  if (ROADS.has(c)) return fields.road[i] ? (fields.road[i] <= 2 ? '=' : '.') : '.';
  return ' ';
}

if (mode === 'map') {
  const scale = parseInt(process.argv[4] || '4', 10); // 每格体素数
  for (let z = W.z0; z <= W.z1; z += scale) {
    let line = '';
    for (let x = W.x0; x <= W.x1; x += scale) {
      // 块内优先取"高/显著"颜色
      let best = ' ';
      const pri = { '~': 6, '#': 5, 'n': 4, 'H': 4, '+': 3, '|': 3, '"': 2, ',': 1, '.': 1, '=': 2, ' ': 0 };
      for (let dz = 0; dz < scale && z + dz <= W.z1; dz++) for (let dx = 0; dx < scale && x + dx <= W.x1; dx++) {
        const ch = charOf(x + dx, z + dz);
        if (pri[ch] > pri[best]) best = ch;
      }
      line += best;
    }
    console.log(line);
  }
} else if (mode === 'zoom') {
  const [x0, z0, x1, z1] = process.argv.slice(4, 8).map(Number);
  console.log(`zoom x[${x0},${x1}] z[${z0},${z1}]`);
  for (let z = z0; z <= z1; z++) {
    let line = '';
    for (let x = x0; x <= x1; x++) line += charOf(x, z);
    console.log(line);
  }
} else if (mode === 'stats') {
  // 坊级量化：覆盖率、屋顶体量分布、连续墙长、开口空间
  const wards = meta.wards;
  let rowsOut = [];
  for (const w of wards) {
    const area = (w.x1 - w.x0 + 1) * (w.z1 - w.z0 + 1);
    let roof = 0, wall = 0, green = 0, water = 0, road = 0, open = 0, built = 0;
    let roofH = [];
    for (let x = w.x0; x <= w.x1; x++) for (let z = w.z0; z <= w.z1; z++) {
      const i = F(x, z), c = fields.topColor[i], th = fields.topH[i], gh = fields.groundH[i];
      if (WATERS.has(c)) { water++; continue; }
      if (fields.road[i]) { road++; continue; }
      if (ROOFS.has(c)) { roof++; roofH.push(th - gh); continue; }
      if (WALLS.has(c)) { wall++; continue; }
      if (GREENS.has(c)) { green++; continue; }
      if (th > gh) { built++; continue; }
      open++;
    }
    const avgH = roofH.length ? (roofH.reduce((a, b) => a + b, 0) / roofH.length).toFixed(1) : '-';
    const maxH = roofH.length ? Math.max(...roofH) : 0;
    rowsOut.push({
      name: w.name + (w.side === 'W' ? '(西)' : ''), type: w.type, small: w.small ? '小' : '大',
      row: 9 - Math.round((w.z1 - CFG_ROW0()) / 42),
      cover: ((roof + built) / area * 100).toFixed(1) + '%', walls: (wall / area * 100).toFixed(1) + '%',
      green: (green / area * 100).toFixed(1) + '%', water: (water / area * 100).toFixed(1) + '%',
      avgRoofH: avgH, maxH,
    });
  }
  function CFG_ROW0() { return -54; }
  // 按 z 排序输出
  rowsOut.sort((a, b) => a.row - b.row);
  for (const r of rowsOut) {
    console.log(`${r.row}行 ${r.name.padEnd(6, '　')} ${r.type}/${r.small} 建筑=${r.cover} 墙=${r.walls} 绿=${r.green} 水=${r.water} 均高=${r.avgRoofH} 峰=${r.maxH}`);
  }
  // 全城汇总
  console.log('\n汇总：', JSON.stringify(res.stats, (k, v) => v instanceof Set ? [...v] : v, 1).slice(0, 1200));
} else if (mode === 'png') {
  const file = process.argv[4] || 'map.png';
  const wpx = W.x1 - W.x0 + 1, hpx = W.z1 - W.z0 + 1;
  const raw = Buffer.alloc((wpx * 3 + 1) * hpx);
  for (let z = 0; z < hpx; z++) {
    const row = z * (wpx * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < wpx; x++) {
      const c = fields.topColor[F(W.x0 + x, W.z0 + z)];
      const rgb = res.stats ? (CH.PAL_DEF[c - 1] ? parseInt(CH.PAL_DEF[c - 1][1].slice(1), 16) : 0) : 0;
      raw[row + 1 + x * 3] = (rgb >> 16) & 255; raw[row + 2 + x * 3] = (rgb >> 8) & 255; raw[row + 3 + x * 3] = rgb & 255;
    }
  }
  const crc32 = (() => { let t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return b => { let c = 0xffffffff; for (const x of b) c = t[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }; })();
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(wpx, 0); ihdr.writeUInt32BE(hpx, 4); ihdr[8] = 8; ihdr[9] = 2;
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
  fs.writeFileSync(file, png);
  console.log('[png] 写出 ' + file + ' ' + wpx + 'x' + hpx);
}
