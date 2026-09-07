// a01_engine.js — 渲染引擎：场景、分块网格、LOD、五档画质（LOW/MEDIUM/HIGH/ULTRA/PHOTO地标保真）、天空光照
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const NORMALS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

export const Engine = {
  renderer: null, scene: null, camera: null, controls: null,
  chunkGroup: null, lodGroup: null, archGroup: null, dynGroup: null,
  chunks: [],               // {cx,cz,center,meshes:{opaque,water,glow,lod}}
  archChunks: [],           // {cx,cz,center,rankMax,lods:[meshes]}
  materials: {},
  quality: 'mid',
  lodDist: 320,
  fps: 0, drawCalls: 0, frame: 0,
  _fpsAcc: 0, _fpsN: 0, _fpsT: 0,
  autoQuality: { enabled: true, measured: 0, t: 0 },
};

const QUALITY_TIERS = {
  // 一级地标质量>普通建筑>微装饰：低档简化远景小物但保地标轮廓（lodDist保含元/双塔/城门块常驻高模）
  low:  { dpr: 1.0, shadow: 0, lodDist: 360, actorMul: 0.35, shadows: false, label: '低' },
  mid:  { dpr: 1.25, shadow: 1024, lodDist: 460, actorMul: 0.65, shadows: true, label: '中' },
  high: { dpr: 1.5, shadow: 2048, lodDist: 860, actorMul: 1, shadows: true, label: '高' },
  ultra: { dpr: 2.0, shadow: 4096, lodDist: 1e9, actorMul: 1, shadows: true, label: '超高' },
  photo: { dpr: 2.0, shadow: 4096, lodDist: 1e9, actorMul: 0.2, shadows: true, label: '摄影' },
};

export function initEngine(canvasHost) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.04;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  canvasHost.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.5, 2800);
  camera.position.set(-90, 210, 480);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.minDistance = 3;
  controls.maxDistance = 1400;
  controls.target.set(0, 10, -40);

  Object.assign(Engine, { renderer, scene, camera, controls });
  Engine.chunkGroup = new THREE.Group();
  Engine.lodGroup = new THREE.Group();
  Engine.archGroup = new THREE.Group();
  Engine.dynGroup = new THREE.Group();
  scene.add(Engine.chunkGroup, Engine.lodGroup, Engine.archGroup, Engine.dynGroup);

  Engine.materials.opaque = new THREE.MeshLambertMaterial({ vertexColors: true });
  Engine.materials.water = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.78, depthWrite: false });
  Engine.materials.glow = new THREE.MeshBasicMaterial({ vertexColors: true });
  // 建筑层四材质：色彩来自离线顶点色，粗糙度负责区分夯土、木、瓦与金属/琉璃。
  Engine.materials.archEarth = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0.0 });
  Engine.materials.archTimber = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.74, metalness: 0.0 });
  Engine.materials.archTile = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.58, metalness: 0.02 });
  Engine.materials.archAccent = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.12 });
  Engine.materials.archMass = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0.0 });

  // 雾与背景（昼/夜由 DayNight 引擎驱动）
  scene.fog = new THREE.Fog(0xc0c5c2, 700, 2200);
  scene.background = new THREE.Color(0x91afc2);

  const hemi = new THREE.HemisphereLight(0xe7eef1, 0x705b45, 0.52);
  const sun = new THREE.DirectionalLight(0xffe6c1, 2.05);
  sun.position.set(-260, 380, 160);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -440; sun.shadow.camera.right = 440;
  sun.shadow.camera.top = 440; sun.shadow.camera.bottom = -440;
  sun.shadow.camera.near = 50;
  sun.shadow.camera.far = 1400;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  const amb = new THREE.AmbientLight(0x303e54, 0.25);
  scene.add(hemi, sun, amb);
  Engine.lights = { hemi, sun, amb };

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
  renderer.setSize(innerWidth, innerHeight);
  applyQuality(Engine.quality);
  return Engine;
}

export function applyQuality(q) {
  const tier = QUALITY_TIERS[q] || QUALITY_TIERS.mid;
  Engine.quality = q;
  Engine.lodDist = tier.lodDist;
  Engine.actorMul = tier.actorMul;
  const { renderer, lights } = Engine;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, tier.dpr));
  renderer.shadowMap.enabled = !!tier.shadows;
  if (lights) {
    lights.sun.castShadow = tier.shadows;
    if (tier.shadows) lights.sun.shadow.mapSize.set(tier.shadow, tier.shadow);
    lights.sun.shadow.needsUpdate = true;
  }
  const label = document.getElementById('quality-label');
  if (label) label.textContent = '画质 · ' + ((QUALITY_TIERS[q] || {}).label || q);
  try { localStorage.setItem('changan.q', q); } catch {}
}

// 默认固定从中档起步；仅在设备明显吃力时自动降档，不再擅自升到高档破坏 60 FPS 预算。
export function autoQualityTick(dt) {
  const a = Engine.autoQuality;
  if (!a.enabled) return;
  a.t += dt;
  if (a.t < 3) return;
  a.enabled = false;
  const fps = Engine.fps;
  if (fps < 42 && Engine.quality !== 'low') applyQuality('low');
}

// ---------------------------------------------------------------- 分块网格构建
function geometryFromArrays(m) {
  const g = new THREE.BufferGeometry();
  const n = m.pos.length / 3;
  g.setAttribute('position', new THREE.BufferAttribute(m.pos, 3));
  const colors = new Uint8Array(n * 3);
  colors.set(m.col);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3, true));
  const normals = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const N = NORMALS[m.nor[i]];
    normals[i * 3] = N[0]; normals[i * 3 + 1] = N[1]; normals[i * 3 + 2] = N[2];
  }
  g.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  g.setIndex(new THREE.BufferAttribute(m.idx, 1));
  return g;
}

export function buildChunks(chunkData) {
  // 清空旧场景（换种子重建）
  for (const grp of [Engine.chunkGroup, Engine.lodGroup]) {
    while (grp.children.length) {
      const m = grp.children.pop();
      m.geometry && m.geometry.dispose();
    }
  }
  Engine.chunks = [];
  for (const ch of chunkData) {
    const entry = { cx: ch.cx, cz: ch.cz, center: new THREE.Vector3(ch.ox + 64, 10, ch.oz + 64), meshes: {} };
    for (const kind of ['opaque', 'water', 'glow', 'lod']) {
      const m = ch.meshes[kind];
      if (!m) continue;
      const geo = geometryFromArrays(m);
      const isLod = kind === 'lod';
      const mesh = new THREE.Mesh(geo, Engine.materials[isLod ? 'opaque' : kind]);
      mesh.position.set(ch.ox, 0, ch.oz);
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      mesh.castShadow = kind === 'opaque' && !isLod;
      mesh.receiveShadow = kind === 'opaque';
      mesh.frustumCulled = true;
      mesh.geometry.computeBoundingSphere();
      (isLod ? Engine.lodGroup : Engine.chunkGroup).add(mesh);
      entry.meshes[kind] = mesh;
    }
    Engine.chunks.push(entry);
  }
}

function archMaterial(kind) {
  return Engine.materials[{ earth: 'archEarth', timber: 'archTimber', tile: 'archTile', accent: 'archAccent', mass: 'archMass' }[kind] || 'archMass'];
}

function disposeGroup(group) {
  while (group.children.length) {
    const m = group.children[group.children.length - 1];
    group.remove(m);
    if (m.geometry) m.geometry.dispose();
  }
}

function makeArchitectureMesh(ch, level, kind, data) {
  const geo = geometryFromArrays(data);
  const mesh = new THREE.Mesh(geo, archMaterial(kind));
  const scale = data.positionScale || 0.125;
  mesh.position.set(ch.ox, 0, ch.oz);
  mesh.scale.setScalar(scale);
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  mesh.castShadow = level === 0 && kind !== 'earth';
  mesh.receiveShadow = level === 0;
  mesh.frustumCulled = true;
  mesh.geometry.computeBoundingSphere();
  mesh.userData.layer = 'architecture';
  mesh.userData.archChunkKey = ch.key;
  mesh.userData.archLevel = level;
  return mesh;
}

export function buildArchitectureChunks(data) {
  disposeGroup(Engine.archGroup);
  Engine.archChunks = [];
  for (const ch of data || []) {
    const entry = {
      cx: ch.cx, cz: ch.cz, key: ch.key, rankMax: ch.rankMax || 0,
      center: new THREE.Vector3(ch.ox + (ch.size || 64) * .5, 12, ch.oz + (ch.size || 64) * .5), radius: (ch.rankMax || 0) >= 4 ? 18 : 5,
      buildingIds: ch.buildingIds || [], lods: [{}, {}, {}], activeLevel: -1,
    };
    for (let level = 0; level < 3; level++) {
      for (const [kind, m] of Object.entries(ch.lods[level] || {})) {
        if (!m) continue;
        const mesh = makeArchitectureMesh(ch, level, kind, m);
        mesh.visible = false;
        Engine.archGroup.add(mesh);
        entry.lods[level][kind] = mesh;
      }
    }
    Engine.archChunks.push(entry);
  }
}

export function replaceArchitectureChunks(data) {
  for (const ch of data || []) {
    const old = Engine.archChunks.find(e => e.key === ch.key);
    if (old) {
      for (const lod of old.lods) for (const mesh of Object.values(lod)) {
        Engine.archGroup.remove(mesh); mesh.geometry.dispose();
      }
      Engine.archChunks.splice(Engine.archChunks.indexOf(old), 1);
    }
    const entry = {
      cx: ch.cx, cz: ch.cz, key: ch.key, rankMax: ch.rankMax || 0,
      center: new THREE.Vector3(ch.ox + (ch.size || 64) * .5, 12, ch.oz + (ch.size || 64) * .5), radius: (ch.rankMax || 0) >= 4 ? 18 : 5,
      buildingIds: ch.buildingIds || [], lods: [{}, {}, {}], activeLevel: -1,
    };
    for (let level = 0; level < 3; level++) for (const [kind, m] of Object.entries(ch.lods[level] || {})) {
      const mesh = makeArchitectureMesh(ch, level, kind, m); mesh.visible = false;
      Engine.archGroup.add(mesh); entry.lods[level][kind] = mesh;
    }
    Engine.archChunks.push(entry);
  }
}

// LOD 切换：按块心距
export function adaptFog() {
  const fog = Engine.scene.fog;
  if (!fog) return;
  const y = Engine.camera.position.y;
  if (y < 20) { fog.near = 60; fog.far = 520; }
  else if (y < 80) { fog.near = 220; fog.far = 1600; }
  else { fog.near = 450; fog.far = 2800; }
}

export function updateLOD() {
  const cam = Engine.camera.position;
  const D = Engine.lodDist;
  for (const ch of Engine.chunks) {
    const near = ch.center.distanceTo(cam) < D;
    for (const kind of ['opaque', 'water', 'glow']) {
      const m = ch.meshes[kind];
      if (m) m.visible = near;
    }
    if (ch.meshes.lod) ch.meshes.lod.visible = !near;
  }
  // 建筑 LOD 按屏幕投影直径判定：>80 px / 20–80 px / <20 px。
  const focalPx = Math.max(1, Engine.renderer.domElement.clientHeight) / (2 * Math.tan(THREE.MathUtils.degToRad(Engine.camera.fov) * .5));
  const target = Engine.controls && Engine.controls.target;
  for (const ch of Engine.archChunks) {
    const distance = Math.max(1, ch.center.distanceTo(cam));
    const projected = ch.radius / distance * focalPx * 2;
    let level = projected > 80 ? 0 : projected > 20 ? 1 : 2;
    if (ch.rankMax >= 4 || (target && ch.center.distanceTo(target) < 44)) level = Math.max(0, level - 1);
    if (Engine.quality === 'low' && ch.rankMax < 4) level = Math.max(1, level);
    if (!Object.keys(ch.lods[level]).length) level = Object.keys(ch.lods[1]).length ? 1 : 2;
    if (level !== ch.activeLevel) {
      for (let i = 0; i < 3; i++) for (const m of Object.values(ch.lods[i])) m.visible = i === level;
      ch.activeLevel = level;
    }
  }
}

// Worker 重建的块（涂抹/门扉）
export function replaceChunks(remeshChunks) {
  for (const ch of remeshChunks) {
    const entry = Engine.chunks.find(c => c.cx === ch.cx && c.cz === ch.cz);
    if (!entry) continue;
    for (const kind of ['opaque', 'water', 'glow']) {
      const old = entry.meshes[kind];
      if (old) {
        Engine.chunkGroup.remove(old);
        old.geometry.dispose();
        delete entry.meshes[kind];
      }
      const m = ch.meshes[kind];
      if (!m) continue;
      const geo = geometryFromArrays(m);
      const mesh = new THREE.Mesh(geo, Engine.materials[kind]);
      mesh.position.set(ch.ox, 0, ch.oz);
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      mesh.castShadow = kind === 'opaque';
      mesh.receiveShadow = kind === 'opaque';
      mesh.frustumCulled = true;
      mesh.geometry.computeBoundingSphere();
      Engine.chunkGroup.add(mesh);
      entry.meshes[kind] = mesh;
    }
  }
}

// ---------------------------------------------------------------- 天空穹顶（程序化渐变+日轮+星野）
export function buildSky() {
  const geo = new THREE.SphereGeometry(1900, 24, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      topColor: { value: new THREE.Color(0x7fb2e0) },
      midColor: { value: new THREE.Color(0xcfd8e2) },
      botColor: { value: new THREE.Color(0xe8d9b0) },
      sunDir: { value: new THREE.Vector3(-0.4, 0.6, 0.3).normalize() },
      sunColor: { value: new THREE.Color(0xfff3d8) },
      sunSize: { value: 0.9993 },
      nightMix: { value: 0 },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `
      varying vec3 vDir;
      uniform vec3 topColor, midColor, botColor, sunColor;
      uniform vec3 sunDir; uniform float sunSize, nightMix;
      void main(){
        float h = clamp(vDir.y, -0.2, 1.0);
        vec3 col = mix(botColor, midColor, smoothstep(-0.05, 0.25, h));
        col = mix(col, topColor, smoothstep(0.2, 0.9, h));
        float s = dot(normalize(vDir), normalize(sunDir));
        col += sunColor * smoothstep(sunSize, sunSize + 0.0015, s) * 1.6;  // 日轮
        col += sunColor * pow(max(s, 0.0), 24.0) * 0.22;                    // 日晕
        // 星野（夜深时柔和显现，高分辨率避免黄昏方块伪影）
        float starMix = smoothstep(0.5, 0.95, nightMix);
        if (starMix > 0.01) {
          vec3 sp = floor(vDir * 480.0);
          float star = step(0.9991, fract(sin(dot(sp.xy + sp.z * 17.0, vec2(12.9898, 78.233))) * 43758.5453));
          col += vec3(star) * starMix * 0.8 * smoothstep(0.1, 0.5, vDir.y);
        }
        col = mix(col, col * vec3(0.32, 0.38, 0.62), nightMix * 0.86);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.frustumCulled = false;
  Engine.scene.add(sky);
  Engine.sky = sky;
  return sky;
}

// ---------------------------------------------------------------- 帧统计
export function statsTick(dt) {
  Engine._fpsAcc += dt; Engine._fpsN++;
  Engine._fpsT += dt;
  if (Engine._fpsT >= 0.5) {
    Engine.fps = Math.round(Engine._fpsN / Engine._fpsAcc);
    Engine._fpsAcc = 0; Engine._fpsN = 0; Engine._fpsT = 0;
    Engine.drawCalls = Engine.renderer.info.render.calls;
    const e1 = document.getElementById('fps-count'); if (e1) e1.textContent = Engine.fps;
    const e2 = document.getElementById('draw-count'); if (e2) e2.textContent = Engine.drawCalls;
  }
}
