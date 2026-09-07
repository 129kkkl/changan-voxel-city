// diag2.js — 高空泄漏身份 + 无细建筑接管的整栋残留 + 近景LOD判定验算
const fs = require('fs'), path = require('path'), vm = require('vm');
const SRC = __dirname;
const GEN_FILES = ['gen/g01_core.js','gen/g02_skeleton.js','gen/g03_wards.js','gen/g04_proto.js','gen/g04_landmark.js','gen/g04_fine.js','gen/g05_detail.js','gen/g06_audit_mesh.js','gen/g07_pipeline.js'];
const sandbox = { console }; sandbox.globalThis = sandbox; vm.createContext(sandbox);
for (const f of GEN_FILES) vm.runInContext(fs.readFileSync(path.join(SRC,f),'utf8'),sandbox,{filename:f});
const CHANGAN = vm.runInContext('CHANGAN',sandbox);
const PAL_DEF = CHANGAN.PAL_DEF;
const nameOf = {}; PAL_DEF.forEach((d,i)=>nameOf[i+1]=d[0]);
const BUILD_COLORS = new Set(['roofGrey','roofLight','roofDark','timber','timberDark','zhu','zhuDeep','zhuBright','plaster','plasterWarm','doorDark','glazeGreen','glazeBlue','gold','bronze','stoneWhite','brickPave','iron']);
const seed = process.argv[2]?parseInt(process.argv[2],16):0x5a17c4a9;
const r = CHANGAN.generate(seed>>>0); const ctx=r._ctx;

// 1) 高空(y>=12)泄漏：颜色 + 平面区域(按64格大格)
const highColor={}, region={};
for (const [k,c] of ctx.store.map){
  const x=CHANGAN.unpackX(k),y=CHANGAN.unpackY(k),z=CHANGAN.unpackZ(k);
  const cn=nameOf[c]; if(!BUILD_COLORS.has(cn))continue;
  if(CHANGAN.isArchMasked(ctx,x,y,z))continue;
  if(y<12)continue;
  highColor[cn]=(highColor[cn]||0)+1;
  const rx=Math.floor((x+400)/80), rz=Math.floor((z+368)/80);
  region[rx+','+rz]=(region[rx+','+rz]||0)+1;
}
console.log('高空泄漏(y>=12)颜色:',Object.entries(highColor).sort((a,b)=>b[1]-a[1]).map(e=>e[0]+':'+e[1]).join(' '));
console.log('高空泄漏最密区域top10:',Object.entries(region).sort((a,b)=>b[1]-a[1]).slice(0,10).map(e=>'格['+e[0]+']='+e[1]).join(' '));

// 2) 泄漏列：是否落在任一 BuildingAssembly footprint(不扩) 内
let inFoot=0, outFoot=0; const outColor={};
const footList=ctx.buildings.map(b=>({x0:Math.floor(b.footprint.x0),x1:Math.ceil(b.footprint.x1),z0:Math.floor(b.footprint.z0),z1:Math.ceil(b.footprint.z1)}));
for (const [k,c] of ctx.store.map){
  const x=CHANGAN.unpackX(k),y=CHANGAN.unpackY(k),z=CHANGAN.unpackZ(k);
  const cn=nameOf[c]; if(!BUILD_COLORS.has(cn))continue;
  if(CHANGAN.isArchMasked(ctx,x,y,z))continue;
  const inside=footList.some(p=>x>=p.x0&&x<=p.x1&&z>=p.z0&&z<=p.z1);
  if(inside)inFoot++;else{outFoot++;outColor[cn]=(outColor[cn]||0)+1;}
}
console.log('泄漏体素: 落在fine院落footprint内(包络没遮满)=',inFoot,' 完全在footprint外(整栋无接管)=',outFoot);
console.log('footprint外残留颜色:',Object.entries(outColor).sort((a,b)=>b[1]-a[1]).map(e=>e[0]+':'+e[1]).join(' '));

// 3) 近景LOD验算：行人机位 lane=(131,40)，块心距/投影直径/activeLevel
const Q=CHANGAN.FINE_Q, AC=CHANGAN.ARCH_CHUNK, W=CHANGAN.CFG.WORLD;
const nx=Math.ceil((W.x1-W.x0+1)/AC);
function lodAt(camX,camY,camZ){
  const focalPx=1080/(2*Math.tan(48*Math.PI/180/2)); // 1080高 fov48
  let lv={0:0,1:0,2:0};
  for(let cx=0;cx<nx;cx++)for(let cz=0;cz<nx;cz++){
    const ox=W.x0+cx*AC, oz=W.z0+cz*AC;
    const ccx=ox+AC/2, ccz=oz+AC/2;
    const d=Math.hypot(ccx-camX,12-camY,ccz-camZ)||1;
    const proj=5/d*focalPx*2;
    const lvl=proj>80?0:proj>20?1:2; lv[lvl]++;
  }
  return lv;
}
console.log('行人机位(131,2,40)周边建筑块LOD分布:',JSON.stringify(lodAt(131,2,40)),'(总块数nx*nx)');
console.log('鸟瞰机位(-90,210,480)LOD分布:',JSON.stringify(lodAt(-90,210,480)));

// 4) 瓦色顶点色实际输出：roofGrey(#4a5358=74,83,88) 各面向乘shade后
const rgb=[74,83,88]; const shades={顶:1.0,南:.92,东:.86,北:.78,西:.72,底:.52};
console.log('roofGrey 各面向烘焙色:',Object.entries(shades).map(([k,s])=>k+':rgb('+rgb.map(v=>Math.round(v*s)).join(',')+')').join(' '));
const rd=[50,56,60]; console.log('roofDark 各面向:',Object.entries(shades).map(([k,s])=>k+':rgb('+rd.map(v=>Math.round(v*s)).join(',')+')').join(' '));
