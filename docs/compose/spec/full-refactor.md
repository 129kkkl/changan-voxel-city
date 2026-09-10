---
feature: full-refactor
status: in-progress
updated: 2026-09-10
branch: codex/building-viewable-stage
commits: dc26359..HEAD
---

# 盛唐长安全方位升级（按 docs/15 落地）

## Report

**本轮完成（P0 + P1 立骨）**

按 `docs/14` 审计与 `docs/15` 决策，完成了验收闭环与表示层第一步迁移：

1. **P0**：`tools/visual-gate.js` 可跑并产出 `gate.json`；`tools/shot.js` 修复审计 B1（光照复位移到 `goToView` 之后）；`g04_fine`/`g09_refine` 已在 `_legacy/`；死体素浮空构件生成后清理。
2. **P1 表示层**：新增 `src/core/c01_units.js`（米制）、`src/arch/`（MeshBuf / 连续举折屋面 / BuildingSpec / 材质色表 / 厅堂组装）。`proto.hall` 与南向合院主堂+厢房屋面改走 mesh；其余朝向与地标仍走 ArchStore 体素。
3. **渲染**：建筑 mesh 使用 `MeshStandardMaterial` + 顶点 AO + 收紧环境光；`geometryFromArrays` 支持自定义法线。
4. **证据**：`node src/smoke.js` 三种子审计全过；`node tools/visual-gate.js --tag p1` **通过**（meshHalls=217，6 景截图在 `验收截图/p1/`）。俯瞰/天街机位屋顶已呈连续坡面，不再是台阶千层糕。

**未完成（P2–P6）**：非南向屋面、坊门/院墙、地标全量 mesh 化；纹理图集与 CSM；全城 5000+ 真实尺度宅地；26 景独立视觉门（禁止自评分数）。

**Verification**

| 命令 | 结果 |
|---|---|
| `node src/build.js` | PASS，index.html ~2507 KB |
| `node src/smoke.js` | PASS，三种子 × 审计全绿 |
| `node tools/visual-gate.js --tag p1` | PASS，见 `验收截图/p1/gate.json` |
| imgstat 均值 | 亮度 163.4 / 近黑 0% / 边缘 18.4% / 色数 131–189 |

**Journey log**

- 审计结论正确：体素建筑无法表达构件级细节，必须换表示层。
- 合院 `orientedArch` 旋转与 mesh 坐标不一致会导致朝向错位——P1 先只切南向，避免暗坑。
- 去掉 hall 的 ArchStore 主体后会出现少量浮空残留，需要 `purgeFloatingArch` 清场。
- smoke/build 的 GEN_FILES 必须同步新 arch 模块，否则 `buildHallMesh is not a function`。

## [S1] Problem

独立审计（`docs/14_项目审计报告_20260910.md`）确认：项目处于**数据层完备、表示层失败**状态。

用户长期不满意、反复调参无效的根因是：

1. **建筑用 4× 体素表示**（1 建筑格 ≈ 3.45 m），斗拱/瓦垄/窗棂在数学上无法表达，屋面只能做出台阶“千层糕”。
2. **城市尺度失真**：全城仅 ~387 个巨型建筑群，单群 165~360 m，没有“街—巷—院”三级空间。
3. **渲染层是功能最小实现**：3 个 Lambert 材质、无 AO、单张全城阴影（4.4 m/texel）、无后处理。
4. **验收闭环失效**：12 项结构审计全绿但审的不是画面；视觉分自评 8.34，独立评审 **4.56**。

## [S2] Design

目标：按 `docs/15_大重构升级方案_20260910.md` 五决策推进。

### 2.1 架构决策

| ID | 决策 | 状态 |
|---|---|---|
| D1 | 建筑改语义化网格，体素只留骨架地表 | P1 立骨：南向合院 + proto.hall |
| D2 | 米制权威 | `src/core/c01_units.js` |
| D3 | 材质/光照/大气重建 | P1：Standard+AO；P2 做图集/CSM |
| D4 | visual-gate 成为构建一部分 | 已上线（打包/截图/统计） |
| D5 | 一套建筑生成器 | 补丁层已归档，proto 路径收敛中 |

### 2.2 表示层契约

```
BuildingSpec（米）
  → 构件 / 连续举折屋面
  → MeshBuf（64 格分块）
  → Worker meshChunks
  → MeshStandardMaterial
```

### 2.3 与旧系统共存

- 体素保留：地形、城墙、街道、坊墙、水面。
- mesh：`proto.hall` + 南向合院主堂/厢房屋面。
- 暂留体素：非南向屋面、坊门、院墙、地标（P2/P4）。

### 2.6 分阶段

| 阶段 | 状态 |
|---|---|
| P0 基线可证伪 | **完成** |
| P1 连续屋面立骨 | **完成（南向）** |
| P2 材质光照全朝向 | 未做 |
| P3 全城 5000+ | 未做 |
| P4 类型学全 mesh | 未做 |
| P5 环境生活 | 未做 |
| P6 统稿视觉门 | 未做 |

## [S3] Out of Scope

- 不缩城市、不删 108 坊、不取消离线单文件
- 禁止自评视觉分数；禁止以“比旧版更好”作为完成依据
- 不做建筑级体素编辑重写

## Tasks

- [x] T1: 写升级规格 (covers: S2)
- [x] T2: `tools/visual-gate.js` (covers: S2.5)
- [x] T3: `shot.js` 光照复位修复 B1 (covers: S2.5)
- [x] T4: 死代码归档 + build.js (covers: S2.1 D5)
- [x] T5: `c01_units.js` (covers: S2.1 D2)
- [x] T6: `b03_roof.js` 连续屋面 (covers: S2.1 D1)
- [x] T7: `b10_mesh.js` (covers: S2.1 D1)
- [x] T8: `b01_spec.js` + `b11_atlas.js` (covers: S2.1 D3)
- [x] T9: `proto.hall` mesh 路径 (covers: S2.1 D1)
- [x] T10: 管线/引擎 meshChunks (covers: S2.3)
- [x] T11: MeshStandard + AO (covers: S2.4)
- [ ] T12: H1~H5 几何采样检查器 (covers: S2.2)
- [x] T13: P1 截图验收 `验收截图/p1/` (covers: S2.6)
- [x] T14: smoke 三种子全过 (covers: S2.3)
- [ ] T15: P2 全朝向 + 坊门/院墙 mesh (covers: S2.3)
- [ ] T16: P2 纹理图集 + CSM + 独立视觉门 (covers: S2.5)
