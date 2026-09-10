// c01_units.js — 米制权威（docs/15 D2）
// 唯一换算入口。城市场景单位 = 城市格；建筑几何输出同样折算到城市格。
'use strict';

// 外郭东西约 9721 m / 城内 704 格 → 1 城市格 ≈ 13.8 m
const CITY_CELL_M = 13.8;
const M_TO_CITY = 1 / CITY_CELL_M;
const CITY_TO_M = CITY_CELL_M;

CHANGAN.UNITS = {
  CITY_CELL_M,
  M_TO_CITY,
  CITY_TO_M,
  m2c(m) { return m * M_TO_CITY; },
  c2m(c) { return c * CITY_TO_M; },
  // 真实宅地尺度（米）→ 城市格
  plotWm: [15, 40],
  plotDm: [30, 80],
};
