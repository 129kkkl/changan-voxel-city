// 精致微缩：同一建筑体素源派生分块、LOD、碰撞和编辑。没有叠加建筑。
'use strict';
CHANGAN.version = 'refined-miniature-1';
CHANGAN.ARCH_SCALE = 4;
CHANGAN.ARCH_CHUNK = 64;
const archDecode = k => { const y = k % 512, t = (k-y)/512, z = t%16384; return [(t-z)/16384-8192,y,z-8192]; };
const archChunkKey = (x,z,s=4) => Math.floor(x/(64*s))+','+Math.floor(z/(64*s));

// 轻薄、连贯的双坡/四阿屋面；短轴统一处理，厢房不再沿错误轴收山。
ARCH.roofTang = function(a,x0,z0,x1,z1,y0,o={}) {
  const over=o.overhang??4, ex0=x0-over, ex1=x1+over, ez0=z0-over, ez1=z1+over;
  const along=x1-x0>=z1-z0, len=along?ex1-ex0:ez1-ez0, dep=along?ez1-ez0:ex1-ex0;
  const half=dep/2, kind=o.kind||'hip', main=o.main||PAL.roofGrey;
  const rise=Math.max(2,Math.min(o.layers||99,Math.round(half*.48)));
  const ridge=o.ridgeC||PAL.roofDark;
  const toXZ=(u,v)=>along?[ex0+u,ez0+v]:[ex0+v,ez0+u];
  const hAt=(u,v)=> {
    let t=Math.max(0,1-Math.abs(v-half)/Math.max(1,half));
    const end=Math.min(u,len-u)/Math.max(1,half);
    if(kind==='hip') t=Math.min(t,end);
    if(kind==='xie' && end<.65) t=Math.min(t,end);
    if(kind==='jian') t=Math.min(t,Math.min(u,len-u)/(len/2));
    return Math.round(rise*Math.pow(Math.max(0,t),1.32));
  };
  for(let u=0;u<=len;u++) for(let v=0;v<=dep;v++) {
    const [x,z]=toXZ(u,v), h=hAt(u,v);
    // 每列仅保留坡壳与台阶连接，消除旧实心层叠内表面。
    const lower=Math.min(h,hAt(Math.max(0,u-1),v),hAt(Math.min(len,u+1),v),hAt(u,Math.max(0,v-1)),hAt(u,Math.min(dep,v+1)));
    for(let y=y0+lower;y<=y0+h;y++) a.set(x,y,z,main);
    if((v===0||v===dep) && u%4===0) a.set(x,y0-1,z,PAL.timber);
    if((kind==='gable'||kind==='xie') && (u===0||u===len)) {
      for(let y=y0;y<y0+h;y++) a.set(x,y,z,PAL.plasterWarm);
    }
  }
  // 屋面和梁架相接的檐下封板，薄于旧整圈深色大梁。
  for(let x=x0;x<=x1;x++) for(const z of [z0,z1]) {
    const h=hAt(along?x-ex0:z-ez0,along?z-ez0:x-ex0);
    for(let y=y0-1;y<=y0+h;y++)a.set(x,y,z,PAL.timber);
  }
  for(let z=z0;z<=z1;z++)for(const x of [x0,x1]){
    const h=hAt(along?x-ex0:z-ez0,along?z-ez0:x-ex0);
    for(let y=y0-1;y<=y0+h;y++)a.set(x,y,z,PAL.timber);
  }
  const end=kind==='gable'?0:Math.min(Math.floor(len/2),Math.round(half*(kind==='xie'?.65:1)));
  for(let u=end;u<=len-end;u++){const [x,z]=toXZ(u,Math.floor(half));a.set(x,y0+rise+1,z,ridge);}
  // 普通房屋只有低矮脊端；殿堂饰件最多半个城市格。
  const fin=(o.finialH||0)>=5?2:0;
  for(const u of [end,len-end]) { const [x,z]=toXZ(u,Math.floor(half)); for(let h=1;h<=fin;h++) a.set(x,y0+rise+1+h,z,ridge); }
  return y0+rise+2+fin;
};

// 采用实际屋面构件记录；不把院墙、棚、脊饰计成独立建筑。
const refinedRoof=ARCH.roofTang;
ARCH.roofTang=function(a,...args){
  a.roofs=a.roofs||[];
  const [x0,z0,x1,z1,y,o]=args;
  a.roofs.push({x0,z0,x1,z1,y,kind:o?.kind||'hip'});
  return refinedRoof(a,...args);
};

ARCH.dougongSystem=function(a,cols,y0,colC,douC,reach=2){
  for(const [x,z]of cols){
    a.fill(x-1,y0,z-1,x+1,y0,z+1,colC);
    for(let dy=1;dy<=reach;dy++)a.fill(x,y0+dy,z-dy,x,y0+dy,z+dy,colC);
  }
};

// 连接院门至院心，留开门扇；真实开口参与碰撞。
const oldEnclosure=ARCH.enclosure;
ARCH.enclosure=function(a,x0,z0,x1,z1,base,facing,o={}) {
  const r=oldEnclosure(a,x0,z0,x1,z1,base,facing,o), half=o.gateW||4;
  for(let t=-half+1;t<half;t++) for(let y=base+1;y<=r.capY+1;y++) {
    a.del(r.gx+(r.gAxis==='NS'?t:0),y,r.gz+(r.gAxis==='EW'?t:0));
  }
  return r;
};

// 坊级材质保持安静，细部靠几何和光照读取。
for(const d of CHANGAN.PAL_DEF){
  const colors={roofGrey:'#566166',roofLight:'#626d70',roofGroove:'#536065',roofDark:'#465154',roofSlate:'#4d595f',roofSlateL:'#5a666b',roofSlateG:'#4b585d',roofBrown:'#655d53',roofBrownL:'#70685e',roofBrownG:'#635b52',roofClay:'#716557',roofClayL:'#7b7062',roofClayG:'#6d6256',plaster:'#d4c6a9',plasterWarm:'#dac9ad',zhu:'#994d37',zhuBright:'#ac5840',glazeGreen:'#526f61',glazeBlue:'#526b74'};
  if(colors[d[0]]) d[1]=colors[d[0]];
}

CHANGAN.indexArch=function(a,scale=4){
  const groups=new Map();
  for(const k of a.map.keys()){const [x,y,z]=archDecode(k),id=archChunkKey(x,z,scale);if(!groups.has(id))groups.set(id,new Set());groups.get(id).add(k);}
  return groups;
};

// 按面方向/平面做贪心矩形合并，邻块仍查完整权威库，边界不重面。
CHANGAN.meshArchPart=function(ctx,a,keys,scale=4){
  const OFF=[8388608,-8388608,1,-1,512,-512];
  const C=[[[1,0,0],[1,1,0],[1,1,1],[1,0,1]],[[0,0,1],[0,1,1],[0,1,0],[0,0,0]],[[0,1,1],[1,1,1],[1,1,0],[0,1,0]],[[0,0,0],[1,0,0],[1,0,1],[0,0,1]],[[1,0,1],[1,1,1],[0,1,1],[0,0,1]],[[0,0,0],[0,1,0],[1,1,0],[1,0,0]]];
  const shade=[.96,.91,1,.82,.97,.9],pos=[],nor=[],col=[],idx=[];
  for(let f=0;f<6;f++){
    const planes=new Map();
    for(const k of keys){if(a.map.has(k+OFF[f]))continue;const [x,y,z]=archDecode(k),p=f<2?x:f<4?y:z,u=f<2?z:x,v=f<2?y:f<4?z:y;
      if(!planes.has(p))planes.set(p,new Map());planes.get(p).set((v+8192)*16384+u+8192,a.map.get(k));}
    for(const [p,cells] of planes){
      for(const k of [...cells.keys()].sort((a,b)=>a-b)){
        const c=cells.get(k);if(!c)continue;
        let w=1,h=1;while(cells.get(k+w)===c)w++;
        outer:while(true){for(let u=0;u<w;u++)if(cells.get(k+h*16384+u)!==c)break outer;h++;}
        for(let v=0;v<h;v++)for(let u=0;u<w;u++)cells.delete(k+v*16384+u);
        const u=k%16384-8192,v=Math.floor(k/16384)-8192;
        const base=f<2?[p,v,u]:f<4?[u,p,v]:[u,v,p],dims=f<2?[1,h,w]:f<4?[w,1,h]:[w,h,1];
        const b=pos.length/3,rgb=ctx.palRGB[c-1];
        for(const q of C[f]){for(let d=0;d<3;d++)pos.push((base[d]+q[d]*dims[d])/scale);nor.push(f);col.push(...rgb.map(n=>Math.round(n*shade[f])));}
        idx.push(b,b+1,b+2,b,b+2,b+3);
      }
    }
  }
  return {pos:new Float32Array(pos),nor:new Uint8Array(nor),col:new Uint8Array(col),idx:new Uint32Array(idx),quads:idx.length/6};
};
CHANGAN.meshArchChunks=function(ctx,dirty){
  const a=ctx.arch;
  if(!ctx.archIndex){
    ctx.archIndex=CHANGAN.indexArch(a);ctx.archCoarse=new CHANGAN.ArchStore();
    for(const [k,c]of a.map){const[x,y,z]=archDecode(k);ctx.archCoarse.set(Math.floor(x/2),Math.floor(y/2),Math.floor(z/2),c);}
    ctx.archLowIndex=CHANGAN.indexArch(ctx.archCoarse,2);
  }
  const groups=ctx.archIndex,coarse=ctx.archCoarse;
  // 远景由同一体素库降采样；保留所有建筑和塔的轮廓，不独立生成第二座城。
  const lowGroups=ctx.archLowIndex,ids=dirty||[...groups.keys()];
  return ids.map(id=>({id,full:CHANGAN.meshArchPart(ctx,a,groups.get(id)||[],4),lod:CHANGAN.meshArchPart(ctx,coarse,lowGroups.get(id)||[],2)}));
};

CHANGAN.updateArchIndex=function(ctx,op){
  if(!ctx.archIndex)return;
  const a=ctx.arch,id=archChunkKey(op.x,op.z),k=a._k(op.x,op.y,op.z);
  if(!ctx.archIndex.has(id))ctx.archIndex.set(id,new Set());
  if(op.c)ctx.archIndex.get(id).add(k);else ctx.archIndex.get(id).delete(k);
  const x=Math.floor(op.x/2),y=Math.floor(op.y/2),z=Math.floor(op.z/2);let color=0;
  for(let dx=0;dx<2;dx++)for(let dz=0;dz<2;dz++)for(let dy=0;dy<2;dy++)color=a.get(x*2+dx,y*2+dy,z*2+dz)||color;
  const lo=ctx.archCoarse,lk=lo._k(x,y,z);
  if(!ctx.archLowIndex.has(id))ctx.archLowIndex.set(id,new Set());
  if(color){lo.set(x,y,z,color);ctx.archLowIndex.get(id).add(lk);}else{lo.del(x,y,z);ctx.archLowIndex.get(id).delete(lk);}
};

CHANGAN.archChecksum=function(a){let h=2166136261;for(const [k,c] of a.map){h=Math.imul(h^(k>>>0),16777619);h=Math.imul(h^Math.floor(k/4294967296)^c,16777619);}return(h>>>0).toString(16);};

// 真正检查所有建筑连通分量是否与城市实体相接。构件可以悬挑，但必须结构相连。
CHANGAN.auditArchFloating=function(ctx,a){
  const rest=new Set(a.map.keys()),OFF=[8388608,-8388608,1,-1,512,-512];
  let floating=0,components=0;const samples=[];
  while(rest.size){const first=rest.values().next().value,queue=[first];rest.delete(first);let supported=false;
    for(let head=0;head<queue.length;head++){
      const k=queue[head],[x,y,z]=archDecode(k);
      if(!supported){const wx=Math.floor(x/4),wz=Math.floor(z/4);if(ctx.store.get(wx,Math.floor(y/4),wz)||ctx.store.get(wx,Math.floor((y-1)/4),wz))supported=true;}
      for(const off of OFF)if(rest.delete(k+off))queue.push(k+off);
    }
    components++;if(!supported){floating+=queue.length;if(samples.length<5)samples.push(archDecode(first));}
  }
  return {pass:floating===0,detail:`${components} 个连通构件，未支承 ${floating} 格；${JSON.stringify(samples)}`};
};

// 附属厅房与通廊：服务于庭院的平面关系，不用独立装饰冒充建筑。
ARCH.smallHall=function(a,x0,z0,x1,z1,base,{open=false,height=9,main=PAL.roofGrey}={}){
  if(x1-x0<7||z1-z0<7)return;
  const y=ARCH.platform(a,x0-1,z0-1,x1+1,z1+1,base,2,{steps:!open});
  const f=ARCH.colonnade(a,x0,z0,x1,z1,y,height,3,PAL.timber,1);
  if(!open)ARCH.wallWithOpenings(a,x0,z0,x1,z1,y,height,f.xs,{frameC:PAL.timber,wallC:PAL.plasterWarm});
  ARCH.roofTang(a,x0,z0,x1,z1,y+height,{kind:'gable',main,overhang:2,finialH:0});
};

// 按临街方向转动完整院落（包括门、踏道、房屋和细节）。旧版只转门牌。
CHANGAN.orientedArch=function(a,x0,z0,w,d,facing){
  const proxy=Object.create(a),ax=x0*4,az=z0*4,W=w*4,D=d*4;
  const point=(x,z)=>facing==='N'?[ax+W-1-(x-ax),az+D-1-(z-az)]:facing==='E'?[ax+z-az,az+D-1-(x-ax)]:facing==='W'?[ax+W-1-(z-az),az+x-ax]:[x,z];
  proxy.set=(x,y,z,c)=>{const p=point(x,z);a.set(p[0],y,p[1],c);};
  proxy.get=(x,y,z)=>{const p=point(x,z);return a.get(p[0],y,p[1]);};
  proxy.del=(x,y,z)=>{const p=point(x,z);a.del(p[0],y,p[1]);};
  proxy.roofs=a.roofs||(a.roofs=[]);return proxy;
};
const compoundBase=CHANGAN.buildArchCompound;
CHANGAN.buildArchCompound=function(ctx,x,z,w,d,base,level,rng,facing='S',plan={}){
  ctx.archLog=ctx.archLog||[];
  const a=CHANGAN.orientedArch(ctx.arch,x,z,w,d,facing),side=facing==='E'||facing==='W',cw=side?d:w,cd=side?w:d;
  const top=compoundBase({...ctx,arch:a},x,z,cw,cd,base,level,rng,'S',plan);
  const ax=x*4,az=z*4,W=cw*4,D=cd*4,y=base*4;
  // 门内的转折步道与生活节点，保持中央路线净空。
  const cx=ax+Math.floor(W/2),cz=az+D-11;
  for(let xx=ax+7;xx<=cx;xx++)for(let zz=cz-1;zz<=cz+1;zz++)a.set(xx,y+1,zz,PAL.brickPave);
  if(W>=38&&D>=38){
    const bx=ax+8,bz=az+D-10;
    if(plan.well){
      a.fill(bx-2,y,bz-2,bx+2,y+2,bz+2,PAL.stoneGrey);
      a.set(bx,y+2,bz,PAL.doorDark);
      a.fill(bx-3,y+1,bz,bx-3,y+7,bz,PAL.timber);a.fill(bx+3,y+1,bz,bx+3,y+7,bz,PAL.timber);
      a.fill(bx-3,y+7,bz,bx+3,y+7,bz,PAL.timber);
    }else{
      a.fill(bx-2,y+1,bz,bx-2,y+2,bz,PAL.timber);a.fill(bx+2,y+1,bz,bx+2,y+2,bz,PAL.timber);
      a.fill(bx-2,y+3,bz,bx+2,y+3,bz+1,PAL.timber);
      a.fill(bx-1,y+1,bz+4,bx+1,y+2,bz+6,PAL.rammedDark);
    }
  }
  return top;
};

const shopBase=CHANGAN.buildArchShop;
CHANGAN.buildArchShop=function(ctx,x,z,w,d,base,trade,east,rng,facing='S'){
  const side=facing==='E'||facing==='W',cw=side?d:w,cd=side?w:d;
  const a=CHANGAN.orientedArch(ctx.arch,x,z,w,d,facing);
  const localFields={...ctx.fields,topH:{},topColor:{}};
  const top=shopBase({...ctx,arch:a,fields:localFields},x,z,cw,cd,base,trade,east,rng,'S');
  for(let xx=x;xx<x+w;xx++)for(let zz=z;zz<z+d;zz++){
    const i=CHANGAN.fieldIndex(xx,zz);if(i>=0&&top){ctx.fields.topH[i]=Math.ceil(top/4);ctx.fields.topColor[i]=east?PAL.roofSlate:PAL.roofClay;}
  }
  const x0=x*4+3,x1=(x+cw)*4-4,z1=(z+cd)*4-1,y=base*4;
  if(x1-x0>=8){
    // 营业面打开中央入口，檐下摊台分居两侧。
    const cx=Math.floor((x0+x1)/2);
    for(let xx=cx-2;xx<=cx+2;xx++)for(let yy=y+1;yy<=y+7;yy++)for(let zz=z1-3;zz<=z1;zz++)a.del(xx,yy,zz);
    for(const xx of [x0,x1-3]){
      a.fill(xx,y+1,z1-1,xx+2,y+2,z1,PAL.timber);
      a.fill(xx,y+3,z1-1,xx+2,y+3,z1,east?PAL.clothHu:PAL.rammedDark);
    }
  }
  return top;
};

for(const [name,temple] of [['buildArchOffice',false],['buildArchTemple',true]]){
  const original=CHANGAN[name];
  CHANGAN[name]=function(ctx,x0,z0,x1,z1,base,...rest){
    const result=original(ctx,x0,z0,x1,z1,base,...rest),a=ctx.arch;
    const W=(x1-x0+1)*4,D=(z1-z0+1)*4,ax=x0*4,az=z0*4,y=base*4;
    if(W>=72&&D>=80){
      for(const x of [ax+7,ax+W-18])ARCH.smallHall(a,x,az+Math.round(D*.62),x+10,az+D-12,y,{open:!temple,height:temple?10:8});
      // 殿前甬道保持贯通，侧翼以低廊衬托主殿。
      const cx=ax+(W>>1);for(let x=cx-3;x<=cx+3;x++)for(let z=az+Math.round(D*.6);z<az+D-1;z++)a.set(x,y+1,z,PAL.brickPave);
    }
    return result;
  };
}

// 细尺度树干与相互连接的切面树冠，替代粗方柱、两片方板冠。
CHANGAN.proto.tree=function(ctx,x,z,base,kind,rng){
  if(x==null||z==null)return;
  const i=CHANGAN.fieldIndex(x,z);if(i<0||ctx.fields.canopy[i])return;
  ctx.fields.canopy[i]=1;
  const a=ctx.arch,ax=x*4+2,az=z*4+2,y=(base??ctx.fields.groundH[i])*4+4;
  const h=kind==='pine'?19:kind==='bamboo'?12:13+Math.abs((x*17+z*11)%4);
  const leaf=kind==='apricot'?PAL.apricotPink:kind==='pine'?PAL.pineGreen:kind==='willow'?PAL.willowGreen:PAL.huaiGreen;
  const put=(x,y,z,c)=>{if(!a.get(x,y,z))a.set(x,y,z,c);};
  for(let yy=y;yy<=y+h;yy++)put(ax,yy,az,PAL.timber);
  const crowns=kind==='pine'?[[0,h-5,0,6,2],[0,h,0,4,3]]:[[0,h,0,5,4],[-3,h-2,1,4,3],[3,h-1,-1,4,3]];
  for(const [dx,dy,dz,r,ry]of crowns){
    for(let xx=Math.min(0,dx);xx<=Math.max(0,dx);xx++)put(ax+xx,y+dy,az,PAL.timber);
    for(let zz=Math.min(0,dz);zz<=Math.max(0,dz);zz++)put(ax+dx,y+dy,az+zz,PAL.timber);
    for(let xx=-r;xx<=r;xx++)for(let zz=-r;zz<=r;zz++)for(let yy=-ry;yy<=ry;yy++){
      if(xx*xx/(r*r)+zz*zz/(r*r)+yy*yy/(ry*ry)>1)continue;
      put(ax+dx+xx,y+dy+yy,az+dz+zz,yy>=ry-1&&kind!=='pine'?PAL.huaiLight:leaf);
    }
  }
  ctx.fields.topH[i]=Math.max(ctx.fields.topH[i],Math.ceil((y+h+4)/4));ctx.counters.trees++;
};

CHANGAN.proto.marketTower=function(ctx,cx,cz,base){
  const a=ctx.arch,x=cx*4,z=cz*4,b=base*4;
  const y=ARCH.platform(a,x-15,z-15,x+15,z+15,b,3,{stepHalf:5});
  const f=ARCH.colonnade(a,x-12,z-12,x+12,z+12,y,13,3,PAL.zhu,2);
  ARCH.wallWithOpenings(a,x-12,z-12,x+12,z+12,y,13,f.xs,{frameC:PAL.zhu,wallC:PAL.plasterWarm});
  // 下檐为环形檐裙，中央楼身连续支承上层。
  for(let xx=x-16;xx<=x+16;xx++)for(let zz=z-16;zz<=z+16;zz++){
    if(Math.abs(xx-x)>9||Math.abs(zz-z)>9)a.set(xx,y+13,zz,PAL.roofSlate);
  }
  const upper=ARCH.colonnade(a,x-9,z-9,x+9,z+9,y+13,12,3,PAL.zhu,1);
  ARCH.wallWithOpenings(a,x-9,z-9,x+9,z+9,y+13,12,upper.xs,{frameC:PAL.timber,hasDoor:false});
  ARCH.roofTang(a,x-9,z-9,x+9,z+9,y+25,{kind:'hip',main:PAL.roofSlate,overhang:4,finialH:0});
  ctx.counters.towers++;
};

ARCH.pavilion=function(a,x0,z0,x1,z1,base,bays=7,floors=1){
  let y=base*4,ax=x0*4,az=z0*4,bx=(x1+1)*4-1,bz=(z1+1)*4-1;
  for(let floor=0;floor<floors;floor++){
    a.slab(ax,y,az,bx,bz,PAL.brickPave);y++;
    const h=floor?12:15,f=ARCH.colonnade(a,ax+1,az+1,bx-1,bz-1,y,h,bays,PAL.zhu,2);
    ARCH.wallWithOpenings(a,ax+1,az+1,bx-1,bz-1,y,h,f.xs,{frameC:PAL.zhu,wallC:PAL.plasterWarm});
    y+=h;
    if(floor<floors-1){
      for(let x=ax-4;x<=bx+4;x++)for(let z=az-4;z<=bz+4;z++)a.set(x,y,z,PAL.roofSlate);
      ax+=4;bx-=4;az+=1;bz-=1;y++;
    }
  }
  return ARCH.roofTang(a,ax,az,bx,bz,y,{kind:'hip',main:PAL.roofSlate,overhang:5,finialH:5})/4;
};

CHANGAN.proto.gateTower = function (ctx, g) {
  g = g || {};
  const b = g.towerBase;
  if (!b) return;
  const { store, fields } = ctx;
  const cfg = ctx.CFG || CHANGAN.CFG;
  const gy = fields.groundH[CHANGAN.fieldIndex(g.x, g.z)] + cfg.Y.WALL_H + 1;
  const pad = 1;
  const x0 = b.x0 + pad, x1 = b.x1 - pad, z0 = b.z0 + pad, z1 = b.z1 - pad;
  if (x1 <= x0 || z1 <= z0) return;
  store.fill(x0 - 1, gy, z0 - 1, x1 + 1, gy, z1 + 1, PAL.stoneGrey);
  const bays = Math.max(3, Math.min(5, Math.floor((x1 - x0) / 2)));
  ARCH.pavilion(ctx.arch, x0, z0, x1, z1, gy, bays, 2);
  ctx.counters.towers++;
};

CHANGAN.proto.cornerTower = function (ctx, x, z, base) {
  ctx.store.fill(x - 2, base + 1, z - 2, x + 2, base + 3, z + 2, PAL.rammedDark);
  ARCH.pavilion(ctx.arch, x - 2, z - 2, x + 2, z + 2, base + 3, 3, 1);
  ctx.counters.towers++;
};

// 通用殿堂也使用细构件，移除曾在街景中形成巨大板叠顶的旧建筑分支。
CHANGAN.proto.hall=function(ctx,x0,z0,x1,z1,base,o={}){
  if(x1-x0<3||z1-z0<3)return base;
  CHANGAN._noteGeneric(ctx,'proto.hall');
  const a=ctx.arch,ax=x0*4,az=z0*4,bx=(x1+1)*4-1,bz=(z1+1)*4-1;
  const y=ARCH.platform(a,ax,az,bx,bz,base*4,Math.max(2,(o.platform||0)*4),{stepHalf:4});
  const h=(o.wallH||4)*3,f=ARCH.colonnade(a,ax+2,az+2,bx-2,bz-2,y,h,Math.max(3,Math.min(9,Math.floor((bx-ax)/9))),o.col||PAL.timber,1);
  ARCH.wallWithOpenings(a,ax+2,az+2,bx-2,bz-2,y,h,f.xs,{wallC:o.wall||PAL.plasterWarm,frameC:o.col||PAL.timber});
  const top=ARCH.roofTang(a,ax+2,az+2,bx-2,bz-2,y+h,{kind:o.roof==='hip'?'hip':o.roof==='xie'?'xie':'gable',main:PAL.roofGrey,overhang:4,finialH:0});
  ctx.counters.halls++;return top/4;
};

for(const [fn,name,floors]of [['buildDayanPagoda','dayan',7],['buildXiaoyanPagoda','xiaoyan',13]]){
  CHANGAN[fn]=function(ctx,cx,cz,base){
    CHANGAN.enterLandmark(ctx,name);
    const a=ctx.arch,x=cx*4,z=cz*4,b=(base+1)*4,big=floors===7;
    let y=ARCH.platform(a,x-(big?25:18),z-(big?25:18),x+(big?25:18),z+(big?25:18),b,5,{stepHalf:6});
    for(let level=0;level<floors;level++){
      const r=big?22-level*2:15-Math.floor(level*.7),h=big?(level===0?20:13):level===0?18:4;
      a.shellBox(x-r,y,z-r,x+r,y+h-1,z+r,PAL.rammedLight);
      // 四面券洞：退入壁面，中央通道不做贯穿塔身的大洞。
      if(big||level===0)for(const side of [-1,1])for(let u=-2;u<=2;u++)for(let dy=2;dy<h-2-Math.abs(u);dy++){
        a.set(x+u,y+dy,z+side*r,PAL.timberDark);a.set(x+side*r,y+dy,z+u,PAL.timberDark);
      }
      y+=h;
      for(let step=0;step<2;step++)a.slab(x-r-2+step,y+step,z-r-2+step,x+r+2-step,z+r+2-step,PAL.roofSlate);
      y+=2;
    }
    a.fill(x-1,y,z-1,x+1,y+3,z+1,PAL.bronze);a.fill(x,y+4,z,x,y+8,z,PAL.bronze);
    const top=(y+9)/4;
    CHANGAN.logBuild(ctx,{kind:'pagoda',name,x0:cx-7,z0:cz-7,x1:cx+7,z1:cz+7,h:top-base,roof:big?'louge7':'miyan13',rank:4,generic:false,bays:big?'seven-storey':'thirteen-eaves',towerProfile:big?'tapered-brick7':'dense-eaves13'});
    ctx.landmarkLODs=ctx.landmarkLODs||{};ctx.landmarkLODs[name]={x0:cx-7,z0:cz-7,x1:cx+7,z1:cz+7,hMax:top,base,cx,cz};
    ctx.counters.towers++;CHANGAN.exitLandmark(ctx);return top;
  };
}
