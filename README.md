# 盛唐长安城体素箱庭 (Tang Chang'an Voxel Miniature)

全城一百〇八坊 · 三大内 · 东西两市 · 朱雀天街 · 晨鼓暮鼓

一个基于 Three.js 的单文件离线 WebGL 程序化体素箱庭项目。

---

## 快速上手与预览

本项目为**零依赖离线单文件**，随时可看：

1. **直接双击运行**：在文件资源管理器中直接双击 `index.html`（使用 Edge 或 Chrome 浏览器）。
2. **一键本地服务预览**：双击运行根目录下的 `preview.bat`（或在终端运行 `.\preview.ps1`），自动拉起本地服务并打开浏览器。

---

## 当前版本与历史分支

- **`codex/building-viewable-stage`（当前交付分支）**：建筑可看阶段。屋面形体重写（真坡度+举折+脊线）、
  出檐加深、檐底压木色椽头、院墙瓦顶压边、坊门坡顶、坊内加密、光照与瓦色配平。
  18 景视觉评分 4.76 → **7.82**，17/17 机位胜出，三 seed 数据门全过。验收见 [验收报告.md](验收报告.md)。
- **`hotfix/salvage-macro` / `v0.6-macro-stable`（历史基线）**：宏观单层抢修版，1120 栋、160 FPS。
  数字属历史档案，不再是当前交付依据。
- **`experiment/m2-dual-scale` / `v0.7-dual-scale-broken`（失败实验，勿续作）**：
  双层穿模、浮空黑块、民居被削到 278。教训见 [00_工作区正轨指引与避坑守则.md](00_工作区正轨指引与避坑守则.md) 铁律一。

更多规范见 [00_工作区正轨指引与避坑守则.md](00_工作区正轨指引与避坑守则.md)、技术规格 [SPEC.md](SPEC.md)。

---

## 构建与测试命令

```powershell
# 重新构建 index.html 单文件产物
node src/build.js

# 数据门：三种子 × 两遍确定性 + 11 项 fatal 审计
node src/smoke.js

# 密度与坊内地面构成快照
node tools/stats.js 5a17c4a9

# 画面门：逐机位截图（零依赖无头 Chrome/Edge，读 file:// 产物）
node tools/shot.js --out 验收截图/final --views all --seed 5a17c4a9 --t noon --q mid
node tools/shot.js --out 验收截图/close --views "cam@a:lane,0,3,14,0,1,-12" --seed 5a17c4a9
$env:SHOT_HIDE_UI='1'; node tools/shot.js --out 验收截图/close --views lane,wardGate

# 图片客观指标（亮度/对比/近黑占比/边缘密度）
node tools/imgstat.js "验收截图/final/*.png"
```

> 数据层测试全绿不等于画面达标。任何美术改动都必须过画面门（守则铁律二）。

