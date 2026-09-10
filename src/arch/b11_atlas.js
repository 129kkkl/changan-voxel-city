// b11_atlas.js — 程序化材质色表与顶点色权威（离线，无外部贴图文件）
// 颜色以 RGB 0-255 存储；纹理细节用顶点色微扰 + 后续 canvas 图集（P2）。
'use strict';

const hex2rgb = (h) => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

CHANGAN.MAT = {
  // 屋面
  roofGrey: hex2rgb('#5a6570'),
  roofGreyDark: hex2rgb('#3e4750'),
  roofSlate: hex2rgb('#4a5560'),
  roofSlateLight: hex2rgb('#6a7682'),
  roofGreen: hex2rgb('#4d7a58'),
  roofBlue: hex2rgb('#3f5f7a'),
  roofBrown: hex2rgb('#6b5344'),
  ridge: hex2rgb('#2c3238'),
  // 木构
  timber: hex2rgb('#8b3a2a'),
  timberDark: hex2rgb('#5c281c'),
  timberBright: hex2rgb('#a84832'),
  columnRed: hex2rgb('#9c3b28'),
  // 墙
  plasterWarm: hex2rgb('#e6dcc4'),
  plasterCool: hex2rgb('#d4d0c4'),
  rammed: hex2rgb('#c4b08a'),
  rammedLight: hex2rgb('#d2c09a'),
  rammedDark: hex2rgb('#a89070'),
  brick: hex2rgb('#9a8878'),
  // 石
  stoneGrey: hex2rgb('#9a9a92'),
  stoneWhite: hex2rgb('#c8c4b8'),
  // 地
  loess: hex2rgb('#c9b892'),
  loessDeep: hex2rgb('#b5a078'),
  brickPave: hex2rgb('#b0a090'),
  // 水/植被（骨架层仍用 PAL，这里给 mesh 用）
  willow: hex2rgb('#6a9a4a'),
  pine: hex2rgb('#3d6b45'),
};

/** 按 rank 选屋面色族：大建筑可有琉璃，小房子灰调 */
CHANGAN.pickRoofRGB = function (rank, rng, kind) {
  const M = CHANGAN.MAT;
  const r = rng ? rng() : 0.5;
  if (kind === 'hip' || kind === 'xie' || (rank != null && rank >= 3)) {
    if (r < 0.35) return M.roofGreen.slice();
    if (r < 0.55) return M.roofBlue.slice();
    if (r < 0.75) return M.roofSlate.slice();
    return M.roofGrey.slice();
  }
  if (r < 0.45) return M.roofGrey.slice();
  if (r < 0.7) return M.roofSlate.slice();
  if (r < 0.85) return M.roofBrown.slice();
  return M.roofGreyDark.slice();
};

/** 瓦垄交替：同族微差 */
CHANGAN.tileGroove = function (rgb, u) {
  const k = (u & 1) ? 0.88 : 1.0;
  return [rgb[0] * k | 0, rgb[1] * k | 0, rgb[2] * k | 0];
};
