// b01_spec.js — BuildingSpec 定义与校验（docs/15 §3.1）
'use strict';

CHANGAN.validateSpec = function (spec) {
  const err = [];
  if (!spec) return { ok: false, err: ['empty'] };
  if (!(spec.bays >= 1)) err.push('bays');
  if (!(spec.widthM > 0)) err.push('widthM');
  if (!(spec.depthM > 0)) err.push('depthM');
  if (!(spec.pitch > 0.25 && spec.pitch < 0.75)) err.push('pitch');
  if (!(spec.overhangM >= 0.8 && spec.overhangM <= 2.5)) err.push('overhangM');
  const colR = spec.columnRadiusM || 0;
  const bayW = spec.bayWidthM || 0;
  if (bayW > 0 && colR > 0) {
    const ratio = colR / bayW;
    if (ratio < 1 / 14 || ratio > 1 / 6) err.push('colBayRatio');
  }
  if (err.length) return { ok: false, err };
  return { ok: true, err: [] };
};

/** 由城市格足迹生成一份民用厅堂 spec（米） */
CHANGAN.specFromCityHall = function (x0, z0, x1, z1, opts) {
  opts = opts || {};
  const U = CHANGAN.UNITS;
  const wCells = Math.max(3, x1 - x0 + 1);
  const dCells = Math.max(3, z1 - z0 + 1);
  const widthM = U.c2m(wCells);
  const depthM = U.c2m(dCells);
  const bays = Math.max(3, Math.min(9, Math.round(widthM / 3.2)));
  const bayWidthM = widthM / bays;
  const columnRadiusM = Math.max(0.18, Math.min(0.45, bayWidthM / 10));
  const wallHm = (opts.wallHCells || 3) * U.CITY_CELL_M * 0.22; // 视觉墙高，非一整格 13.8m
  const pitch = opts.pitch || 0.42;
  const overhangM = opts.overhangM || 1.4;
  const rank = opts.rank == null ? 1 : opts.rank;
  return {
    kind: opts.kind || 'house',
    rank,
    bays,
    widthM, depthM, bayWidthM,
    columnRadiusM,
    wallHeightM: Math.max(2.4, Math.min(5.5, wallHm)),
    pitch,
    overhangM,
    roofKind: opts.roof || 'gable',
  };
};
