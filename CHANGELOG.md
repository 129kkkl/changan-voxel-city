# CHANGELOG

## [大重构 P0+P1 立骨] 2026-09-10

- **P0 验收闭环**：新增 `tools/visual-gate.js`（构建→截图→imgstat→gate.json）；修复 `tools/shot.js` 审计 B1（光照复位改在 `goToView` 之后）；浮空 ArchStore 残片生成后清理。
- **P1 表示层**：新增 `src/core/c01_units.js` 与 `src/arch/`（MeshBuf、连续举折屋面、BuildingSpec、材质色表、厅堂组装）。`proto.hall` 与南向合院主堂/厢房屋面改走语义网格；建筑 mesh 使用 MeshStandard + 顶点 AO。
- **证据**：`node src/smoke.js` 三种子全过；`node tools/visual-gate.js --tag p1` 通过（meshHalls=217）；截图 `验收截图/p1/`。
- 规格：`docs/compose/spec/full-refactor.md`。

## [大重构 P0] 2026-09-10

- 独立审计（`docs/14_项目审计报告_20260910.md`）：视觉基线 **4.56**（独立评审，18 景），推翻此前 7 轮自评分（最高 8.34）。审计证据：`审计截图/cur18/`。
- 按 `docs/15_大重构升级方案_20260910.md` 启动大重构。基线 tag：`pre-refactor-20260910`。
- 文档收敛：17 份历史提示词/诊断/阶段报告 → `docs/archive/`（含 `design/` 阶段报告）；审计报告与重构方案移入 `docs/`；根目录只留 `README.md`、`SPEC.md`、`验收标准.md`、`CHANGELOG.md`。
- 新增 `验收标准.md`：三层判定（硬不变量 H1~H12 + 独立视觉门 + 用户判断），冻结后不得下调。
- 注：`SPEC.md`、`README.md` 中的旧口径（体素 129 万、视觉 8.34 等）已被审计证伪，将在 P6 重写，一切以 `验收标准.md` 为准。
