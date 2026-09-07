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

- **`hotfix/salvage-macro`（当前抢修版）**：
  - 从 `v0.6-macro-stable` 恢复宏观单层生成/渲染，不接入 M2 细建筑层；
  - 保留预览脚本与正轨文档；`g04_fine.js` 仍在源码树但不打进 `index.html`。
- **`v0.6-macro-stable`（稳定基线）**：1120 栋、224 家店肆、1003 棵树、满城瓦海。
- **`v0.7-dual-scale-broken` / `experiment/m2-dual-scale`（实验态，勿当交付）**：双层穿模、浮空黑块、民居被削到 278。

更多规范见 [00_工作区正轨指引与避坑守则.md](00_工作区正轨指引与避坑守则.md)。

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
