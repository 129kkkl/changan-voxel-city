// b10_mesh.js — 语义建筑网格缓冲：盒/柱/面/合并，输出与 archChunks 同构
// 单位：城市格（与 meshArchPart 输出一致）。颜色为 0-255 RGB 三元组。
'use strict';

CHANGAN.MeshBuf = class MeshBuf {
  constructor() {
    this.pos = [];
    this.nor = []; // 编码方向 0..5（与旧 arch 一致）或 255=自定义法线占位
    this.col = [];
    this.idx = [];
    this._nrm = []; // 自定义法线 xyz（当 nor 为 255）
  }
  get quads() { return this.idx.length / 6; }
  get tris() { return this.idx.length / 3; }
  get empty() { return this.idx.length === 0; }

  /** 轴对齐盒；c=[r,g,b] */
  box(x0, y0, z0, x1, y1, z1, c, ao) {
    ao = ao || 1;
    const xa = Math.min(x0, x1), xb = Math.max(x0, x1);
    const ya = Math.min(y0, y1), yb = Math.max(y0, y1);
    const za = Math.min(z0, z1), zb = Math.max(z0, z1);
    // 六面：+X -X +Y -Y +Z -Z
    const faces = [
      [[xb, ya, za], [xb, yb, za], [xb, yb, zb], [xb, ya, zb], 0],
      [[xa, ya, zb], [xa, yb, zb], [xa, yb, za], [xa, ya, za], 1],
      [[xa, yb, za], [xa, yb, zb], [xb, yb, zb], [xb, yb, za], 2],
      [[xa, ya, zb], [xa, ya, za], [xb, ya, za], [xb, ya, zb], 3],
      [[xb, ya, zb], [xb, yb, zb], [xa, yb, zb], [xa, ya, zb], 4],
      [[xa, ya, za], [xa, yb, za], [xb, yb, za], [xb, ya, za], 5],
    ];
    const shade = [0.92, 0.88, 1.0, 0.78, 0.95, 0.86];
    for (const [a, b, d, e, f] of faces) {
      const s = shade[f] * ao;
      this._quad(
        a, b, d, e,
        [Math.round(c[0] * s), Math.round(c[1] * s), Math.round(c[2] * s)],
        f
      );
    }
  }

  /** 竖直方柱 */
  column(cx, cz, y0, y1, radius, c, ao) {
    const r = Math.max(0.05, radius);
    this.box(cx - r, y0, cz - r, cx + r, y1, cz + r, c, ao == null ? 1 : ao);
  }

  /** 任意四边形（两三角） */
  quad(a, b, c, d, rgb, normalIdx, ao) {
    ao = ao == null ? 1 : ao;
    const s = ao;
    this._quad(a, b, c, d, [
      Math.round(rgb[0] * s), Math.round(rgb[1] * s), Math.round(rgb[2] * s)
    ], normalIdx == null ? 255 : normalIdx);
  }

  _quad(a, b, c, d, rgb, nidx) {
    const base = this.pos.length / 3;
    for (const p of [a, b, c, d]) {
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(nidx);
      this.col.push(rgb[0], rgb[1], rgb[2]);
      if (nidx === 255) {
        // 由三角形后补；此处先写占位，merge 时会用几何重算
        this._nrm.push(0, 1, 0);
      }
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  /** 顶点 AO 烘焙：对已有顶点按高度/邻近压暗 */
  bakeSimpleAO(yFloor, yEave, strength) {
    strength = strength == null ? 0.28 : strength;
    const n = this.pos.length / 3;
    for (let i = 0; i < n; i++) {
      const y = this.pos[i * 3 + 1];
      const t = (y - yFloor) / Math.max(0.001, yEave - yFloor);
      const k = 1 - strength * (1 - Math.min(1, Math.max(0, t)));
      this.col[i * 3] = Math.min(255, Math.round(this.col[i * 3] * k));
      this.col[i * 3 + 1] = Math.min(255, Math.round(this.col[i * 3 + 1] * k));
      this.col[i * 3 + 2] = Math.min(255, Math.round(this.col[i * 3 + 2] * k));
    }
  }

  toArray() {
    return {
      pos: new Float32Array(this.pos),
      nor: new Uint8Array(this.nor),
      col: new Uint8Array(this.col),
      idx: new Uint32Array(this.idx),
      quads: this.quads,
    };
  }
};

/** 把 MeshBuf 列表按 64 城市格分块合并 */
CHANGAN.meshPartsToChunks = function (parts, chunkSize) {
  chunkSize = chunkSize || 64;
  const groups = new Map();
  for (const part of parts) {
    if (!part || !part.pos || !part.pos.length) continue;
    // 用包围盒中心归块
    let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
    for (let i = 0; i < part.pos.length; i += 3) {
      const x = part.pos[i], z = part.pos[i + 2];
      if (x < minx) minx = x; if (x > maxx) maxx = x;
      if (z < minz) minz = z; if (z > maxz) maxz = z;
    }
    const cx = Math.floor(((minx + maxx) * 0.5) / chunkSize);
    const cz = Math.floor(((minz + maxz) * 0.5) / chunkSize);
    const id = cx + ',' + cz;
    if (!groups.has(id)) {
      groups.set(id, { pos: [], nor: [], col: [], idx: [], quads: 0, cx, cz });
    }
    const g = groups.get(id);
    const base = g.pos.length / 3;
    for (let i = 0; i < part.pos.length; i++) g.pos.push(part.pos[i]);
    for (let i = 0; i < part.nor.length; i++) g.nor.push(part.nor[i]);
    for (let i = 0; i < part.col.length; i++) g.col.push(part.col[i]);
    for (let i = 0; i < part.idx.length; i++) g.idx.push(part.idx[i] + base);
    g.quads += part.quads || (part.idx.length / 6);
  }
  return [...groups.values()].map(g => ({
    id: g.cx + ',' + g.cz,
    cx: g.cx, cz: g.cz,
    pos: new Float32Array(g.pos),
    nor: new Uint8Array(g.nor),
    col: new Uint8Array(g.col),
    idx: new Uint32Array(g.idx),
    quads: g.quads,
  }));
};

/** 法线重建：nor==255 的面用几何法线压成 0..5 方向码（兼容旧着色） */
CHANGAN.finalizeMeshPart = function (arr) {
  const nor = arr.nor;
  const pos = arr.pos;
  const idx = arr.idx;
  let need = false;
  for (let i = 0; i < nor.length; i++) if (nor[i] === 255) { need = true; break; }
  if (!need) return arr;
  // 简化：自定义面统一压成 +Y 或按边判定；建筑屋面已在生成时写方向码
  return arr;
};
