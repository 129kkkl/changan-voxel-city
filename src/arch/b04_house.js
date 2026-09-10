// b04_house.js — 民用厅堂：台基 + 柱 + 墙 + 连续屋面 → MeshBuf
// 输出单位：城市格。与 proto.hall 调用约定兼容（x0..z1 为城市格足迹）。
'use strict';

/**
 * @param {object} o
 *   x0,z0,x1,z1  城市格足迹（不含出檐）
 *   baseY        地面 Y（城市格）
 *   rank         等级 0-5
 *   roof         'gable'|'xie'|'hip'
 *   wallHCells   墙高（城市格，默认 3）
 *   col          柱色 RGB（可选）
 *   platform     台基层数
 */
CHANGAN.buildHallMesh = function (o) {
  const M = CHANGAN.MAT;
  const U = CHANGAN.UNITS;
  const buf = new CHANGAN.MeshBuf();
  const x0 = o.x0, z0 = o.z0, x1 = o.x1, z1 = o.z1;
  if (x1 - x0 < 2 || z1 - z0 < 2) return null;
  const baseY = o.baseY || 0;
  const rank = o.rank == null ? 1 : o.rank;
  const rng = CHANGAN.rngOf((o.seed || 1) ^ (x0 * 73856093) ^ (z0 * 19349663), 'hall-mesh');
  const spec = CHANGAN.specFromCityHall(x0, z0, x1, z1, {
    wallHCells: o.wallHCells || 3,
    roof: o.roof || 'gable',
    rank,
  });

  // 台基
  const platTiers = Math.max(0, o.platform || (rank >= 3 ? 1 : 0));
  let y0 = baseY;
  const margin = 0.35;
  for (let t = 0; t <= platTiers; t++) {
    const inset = t * 0.28;
    buf.box(
      x0 - margin + inset, y0, z0 - margin + inset,
      x1 + margin - inset, y0 + 0.22, z1 + margin - inset,
      t === platTiers ? M.stoneWhite : M.rammedDark,
      1
    );
    y0 += 0.22;
  }

  // 柱网：真柱径/开间比 ∈ [1/12, 1/8]
  const w = x1 - x0, d = z1 - z0;
  const bays = spec.bays;
  const colR = Math.max(0.06, Math.min(0.16, (w / bays) / 9)); // 城市格半径
  const colC = o.col || M.columnRed;
  const wallH = Math.max(1.1, Math.min(2.4, spec.wallHeightM * U.M_TO_CITY * 2.2));
  // 墙高用“视觉格”：真实 13.8m/格太大，建筑层 Y 需要压到与旧系统可比的尺度
  // 旧系统 arch 格 = 1/4 城市格，墙 4 城市格高的 3 = 12 arch = 3 城市格。
  // 这里取 wallHCells * 0.85 保持与坊墙/旧行人尺度衔接。
  const colH = (o.wallHCells || 3) * 0.85;

  const colXs = [];
  for (let i = 0; i <= bays; i++) {
    colXs.push(x0 + (w * i) / bays);
  }
  const colZs = [z0 + 0.12, z1 - 0.12];
  for (const cx of colXs) {
    for (const cz of colZs) {
      buf.column(cx, cz, y0, y0 + colH, colR, colC, 1);
      // 柱础
      buf.box(cx - colR * 1.6, y0, cz - colR * 1.6, cx + colR * 1.6, y0 + 0.08, cz + colR * 1.6, M.stoneGrey, 1);
    }
  }
  // 阑额
  for (const cz of colZs) {
    buf.box(x0, y0 + colH - 0.12, cz - 0.06, x1, y0 + colH, cz + 0.06, M.timberDark, 1);
  }

  // 墙体：前后墙 + 两端山墙下身；中间开门窗洞
  const wallC = M.plasterWarm;
  const doorBay = Math.floor(bays / 2);
  const winRGB = [M.timber[0] * 0.85 | 0, M.timber[1] * 0.85 | 0, M.timber[2] * 0.85 | 0];
  for (let i = 0; i < bays; i++) {
    const xa = colXs[i] + colR, xb = colXs[i + 1] - colR;
    for (const [z, n] of [[z0 + 0.12, 5], [z1 - 0.12, 4]]) {
      if (i === doorBay && z > z1 - 1) {
        // 南门：留洞 + 门框
        buf.box(xa, y0, z - 0.08, xb, y0 + colH * 0.95, z + 0.08, wallC, 0.95);
        // 门扇内凹
        buf.box((xa + xb) / 2 - 0.18, y0, z - 0.16, (xa + xb) / 2 + 0.18, y0 + colH * 0.72, z - 0.04, M.timberDark, 0.9);
      } else if (i === doorBay - 1 || i === doorBay + 1 || (bays <= 3 && i === 0) || (bays <= 3 && i === bays - 1)) {
        // 窗
        buf.box(xa, y0 + 0.15, z - 0.06, xb, y0 + colH * 0.78, z + 0.06, wallC, 0.96);
        buf.box(xa + 0.08, y0 + 0.28, z - 0.1, xb - 0.08, y0 + colH * 0.62, z + 0.1, winRGB, 0.85);
        // 直棂
        const n = 4;
        for (let k = 1; k < n; k++) {
          const xx = xa + 0.08 + ((xb - xa - 0.16) * k) / n;
          buf.box(xx - 0.02, y0 + 0.28, z - 0.12, xx + 0.02, y0 + colH * 0.62, z + 0.12, M.timber, 0.9);
        }
      } else {
        buf.box(xa, y0, z - 0.06, xb, y0 + colH, z + 0.06, wallC, 0.97);
      }
    }
  }
  // 山墙下身
  for (const x of [x0 + 0.12, x1 - 0.12]) {
    buf.box(x - 0.06, y0, z0 + colR, x + 0.06, y0 + colH, z1 - colR, wallC, 0.94);
  }

  // 檐口标高
  const yEave = y0 + colH + 0.12;
  const overhang = Math.max(0.8, Math.min(2.5, spec.overhangM)) * U.M_TO_CITY;
  // 出檐 0.8~2.5 m → 城市格 0.058~0.18，太小看不见；用“可读出檐”下限放大到与建筑尺度匹配
  // 建筑本身 width 用足迹城市格（如 8 格 = 110 m 已偏大）。P1 保持相对出檐：
  const over = Math.max(0.45, Math.min(1.1, overhang * 2.2 + 0.35));
  const pitch = spec.pitch;
  const half = Math.max(w, d) * 0.5;
  const rise = half * pitch * 0.95;
  const yRidge = yEave + rise;

  const roofRGB = CHANGAN.pickRoofRGB(rank, rng, spec.roofKind);
  CHANGAN.buildRoofMesh(buf, {
    x0: x0 - over, z0: z0 - over, x1: x1 + over, z1: z1 + over,
    yEave, yRidge,
    kind: spec.roofKind,
    rgb: roofRGB,
    curve: 1.5 + rng() * 0.2,
    upturn: 0.25 + rng() * 0.25,
  });

  // 檐下压暗 AO
  buf.bakeSimpleAO(baseY, yEave + rise * 0.35, 0.22);

  return {
    mesh: buf.toArray(),
    spec,
    topY: yRidge,
    roofRGB,
  };
};
