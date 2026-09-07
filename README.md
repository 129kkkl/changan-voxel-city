# 盛唐长安城体素箱庭 (Tang Chang'an Voxel Miniature)

全城一百〇八坊 · 三大内 · 东西两市 · 朱雀天街 · 晨鼓暮鼓

一个基于 Three.js 的单文件离线 WebGL 程序化体素箱庭项目。

---

## 快速上手与预览

本项目为**零依赖离线单文件**，随时可看：

1. **直接双击运行**：在文件资源管理器中直接双击 `index.html`（使用 Edge 或 Chrome 浏览器）。
2. **一键本地服务预览**：双击运行根目录下的 `preview.bat`（或在终端运行 `.\preview.ps1`），自动拉起本地服务并打开浏览器。

---

## 关键分支与稳定基准

项目已全面配置 Git 版本控制，当前存在两个重要阶段：

- **`v0.6-macro-stable`（稳定基线）**：
  - 2026-09-07 14:53 达成的健康宏观单层版本；
  - 全城 1120 栋建筑群、224 家成行店肆、1003 棵树木、160 FPS；
  - 坊内建筑密布、屋顶连绵，无双层穿模与浮空黑块。
  - 检出命令：`git checkout v0.6-macro-stable`
- **`v0.7-dual-scale-broken` / `experiment/m2-dual-scale`（实验态）**：
  - 2026-09-07 18:48 状态，测试微观双尺度细盒与遮蔽（`g04_fine.js`）；
  - 存在严重的双层建筑穿模、浮空黑块以及全城密度被削减的问题。
  - 检出命令：`git checkout experiment/m2-dual-scale`

更多详细规范与避坑原则，请阅读 [00_工作区正轨指引与避坑守则.md](00_工作区正轨指引与避坑守则.md)。

---

## 构建与测试命令

```powershell
# 重新构建 index.html 单文件产物
node src/build.js

# 运行烟包回归测试（三种子确定性与致命项审计）
node src/smoke.js

# 运行数据层诊断脚本（查看体素分类与遮蔽分布）
node src/diag.js
```
