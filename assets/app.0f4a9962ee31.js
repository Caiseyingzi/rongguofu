(()=>{'use strict';
const model=JSON.parse(document.getElementById('model-data').textContent),root=document.getElementById('plan-model'),q=s=>root.querySelector(s),qa=s=>Array.from(root.querySelectorAll(s)),stage=q('.iso-plate'),reduced=matchMedia('(prefers-reduced-motion:reduce)');
const W=1300,H=1050,rad=Math.PI/180,P=model.projection,k=P.scale*Math.sqrt(1.6),az=P.azimuth*rad,el=P.elevation*rad;
const project=(x,y,z=0)=>[P.origin[0]+(x*Math.sin(az)-y*Math.cos(az))*k,P.origin[1]+((x*Math.cos(az)+y*Math.sin(az))*Math.sin(el)-z*Math.cos(el))*k];
const refs={name:q('[data-current-name]'),note:q('[data-current-note]'),readout:q('[data-readout]'),roof:q('[data-roofs]'),label:q('[data-view-label]'),tag:q('[data-view-tag]'),hint:q('[data-hint]'),tour:q('[data-tour]')};
const world=q('[data-world]'),planWorld=q('[data-plan-world]'),roofEls=qa('.roof-assembly').map(el=>({el,owner:el.closest('[data-owner]').dataset.owner,value:0})),cutEls=qa('[data-cut]');
let selected='all',mode='iso',open=false,touring=false,tourTime=0,visible=true,raf=0,last=0,drag=null;
let camera={x:W/2,y:H/2,zoom:1},target={...camera};
const selectStyle=document.createElement('style');selectStyle.textContent='.roof-assembly.is-selected .roof-front{fill:#9e664a;stroke:#83543e}.roof-assembly.is-selected .roof-back{fill:#bd9973;stroke:#a8865f}.roof-assembly.is-selected .roof-hip{fill:#88563f;stroke:#754c38}.plan-building.is-selected{fill:#ad6245;fill-opacity:.55;stroke:#a04e32;stroke-width:3}';document.head.append(selectStyle);
const footprints=qa('.plan-building');
const buildingMap=new Map(model.buildings.map(b=>[b.id,b])),regionMap=new Map(model.regions.map(r=>[r.id,r]));
const buildingRoofs=new Map(roofEls.map(r=>[r.el.closest('[data-building]')?.dataset.building,r.el]));
const buildingPlans=new Map(footprints.map(e=>[e.dataset.building,e]));
const annotation=q('[data-annotation]'),nameTag=q('[data-building-label]'),nameText=q('[data-building-name]'),nameContext=q('[data-building-context]'),labelWire=q('[data-label-wire]'),labelDot=q('[data-label-dot]');
let namedPlace=null,pickedBuilding=null,labelSize=null;
function clearName(){if(pickedBuilding){buildingRoofs.get(pickedBuilding)?.classList.remove('is-picked');buildingPlans.get(pickedBuilding)?.classList.remove('is-picked');}pickedBuilding=null;namedPlace=null;annotation.hidden=true;}
function showName(place){
 clearName();namedPlace=place;pickedBuilding=place.building?.id||null;
 if(pickedBuilding){buildingRoofs.get(pickedBuilding)?.classList.add('is-picked');buildingPlans.get(pickedBuilding)?.classList.add('is-picked');}
 nameText.textContent=place.name;nameContext.textContent=place.context;annotation.hidden=false;
 labelSize=null;positionName();q('[data-announcement]').textContent=place.name+'。'+place.context;
}
function nameRegion(id){const r=regionMap.get(id);if(!r||id==='all'){clearName();return;}showName({name:r.name,context:'院落区域',region:r});}
function nameBuilding(id){
 const b=buildingMap.get(id);if(!b)return;const r=regionMap.get(b.owner);
 const type={gate:'门房',gallery:'廊房',tower:'楼房',shed:'棚房',passage:'穿堂'}[b.type]||'房舍';
 showName({name:b.name||'图示'+type,context:r.name+(b.name?'':' · 原图未单独标名'),building:b,region:r});
 refs.readout.textContent=(b.name||'图示'+type)+' · '+r.name;
}
function selectBuilding(id){const b=buildingMap.get(id);if(!b)return;if(selected!==b.owner)select(b.owner);else setTour(false);nameBuilding(id);}
function positionName(){
 if(!namedPlace)return;if(!geometry)measure();
 const b=namedPlace.building,r=namedPlace.region,cx=b?b.x+b.w/2:r.box[0]+r.box[2]/2,cy=b?b.y+b.d/2:r.box[1]+r.box[3]/2;
 const z=b?(open&&(selected==='all'||selected===b.owner)?2:b.h+13):0;
 const p=mode==='plan'?[cx,cy]:project(cx,cy,z),x=geometry.ox+(W/2+(p[0]-camera.x)*camera.zoom)*geometry.s,y=geometry.oy+(H/2+(p[1]-camera.y)*camera.zoom)*geometry.s;
 const width=stage.clientWidth,height=stage.clientHeight;
 if(x<0||x>width||y<0||y>height){annotation.hidden=true;return;}
 annotation.hidden=false;
 if(!labelSize)labelSize={width:nameTag.offsetWidth,height:nameTag.offsetHeight};
 const left=Math.max(8,Math.min(width-labelSize.width-8,x-labelSize.width/2)),top=Math.max(38,Math.min(height-labelSize.height-38,y-labelSize.height-18));
 nameTag.style.transform=`translate3d(${left.toFixed(2)}px,${top.toFixed(2)}px,0)`;
 const endX=Math.max(left+12,Math.min(left+labelSize.width-12,x)),endY=top+labelSize.height<y?top+labelSize.height:top;
 labelWire.setAttribute('d',`M${x.toFixed(2)} ${y.toFixed(2)}L${endX.toFixed(2)} ${endY.toFixed(2)}`);labelDot.setAttribute('cx',x.toFixed(2));labelDot.setAttribute('cy',y.toFixed(2));
}
q('[data-stats]').textContent=model.summary.tracedSourceUnits+' 个屋面单元 · '+model.summary.wallSegments+' 段图线';q('[data-place-count]').textContent=model.regions.length+' 处';
function fit(){const r=model.regions.find(r=>r.id===selected),b=selected==='all'?[23,27,968,2917]:r.box;
 if(mode==='plan'){target={x:selected==='all'?502.5:b[0]+b[2]/2,y:selected==='all'?1474:b[1]+b[3]/2,zoom:Math.min((W-150)/(b[2]+35),(H-130)/(b[3]+35))};}
 else if(selected==='all')target={x:W/2,y:H/2,zoom:1};
 else{const points=[];for(const x of[b[0],b[0]+b[2]])for(const y of[b[1],b[1]+b[3]])for(const z of[0,75])points.push(project(x,y,z));const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);target={x:(minX+maxX)/2,y:(minY+maxY)/2,zoom:Math.min((W-150)/(maxX-minX),(H-145)/(maxY-minY),13)};}
 if(reduced.matches){camera={...target};commitCamera();}kick();}
function setTour(value){touring=value&&!reduced.matches;refs.tour.setAttribute('aria-pressed',String(touring));refs.tour.textContent=touring?'暂停巡览':'循院巡览';tourTime=0;kick();}
function select(id,manual=true){const r=model.regions.find(r=>r.id===id);if(!r)return;const previous=selected;selected=id;root.dataset.selected=id;for(const r of roofEls)if(r.owner===previous||r.owner===id)r.el.classList.toggle('is-selected',id!=='all'&&r.owner===id);for(const e of footprints)if(e.dataset.owner===previous||e.dataset.owner===id)e.classList.toggle('is-selected',id!=='all'&&e.dataset.owner===id);refs.name.textContent=r.name;refs.note.textContent=r.note;refs.label.textContent=r.id==='all'?'全府总览':r.name;refs.readout.textContent=r.name+' · '+(mode==='iso'?'位置照图，标高示意':'原图像素坐标');qa('[data-region]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.region===id)));q('[data-announcement]').textContent=r.name+'。'+r.note;if(manual)setTour(false);nameRegion(id);applyRoofs();fit();}
function setMode(next){if(next===mode)return;const keepBuilding=pickedBuilding;commitCamera();mode=next;const source=q('.source-image');if(mode==='plan'&&!source.hasAttribute('href')&&source.dataset.src)source.setAttribute('href',source.dataset.src);qa('[data-scene]').forEach(el=>el.classList.toggle('active',el.dataset.scene===mode));qa('[data-mode]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.mode===mode)));q('.plan-options').hidden=mode!=='plan';refs.tag.textContent=mode==='plan'?'原图与建模轮廓叠合':'北向右上 · 标高示意';refs.hint.textContent=mode==='plan'?'点击房舍看名称 · 拖动平移 · 调节原图显影':'点击房舍看名称 · 拖动平移 · 滚轮缩放';refs.roof.disabled=mode==='plan';setTour(false);select(selected,false);camera={...target};commitCamera();if(keepBuilding)nameBuilding(keepBuilding);}
// Move a cached compositor layer during a gesture; repaint the vector camera
// only on settling, preserving its original detail and constant stroke widths.
let painted={...camera},geometry=null,layerTransform='';
const scenes={iso:q('[data-scene="iso"]'),plan:q('[data-scene="plan"]')};
function measure(){const b=stage.getBoundingClientRect(),width=stage.clientWidth,height=stage.clientHeight,s=Math.min(width/W,height/H);geometry={left:b.left+stage.clientLeft,top:b.top+stage.clientTop,s,ox:(width-W*s)/2,oy:(height-H*s)/2};}
function renderCamera(){
 if(!geometry)measure();
 const z=camera.zoom/painted.zoom,tx=W/2-camera.x*camera.zoom-z*(W/2-painted.x*painted.zoom),ty=H/2-camera.y*camera.zoom-z*(H/2-painted.y*painted.zoom);
 const transform=`translate3d(${(tx*geometry.s+geometry.ox*(1-z)).toFixed(3)}px,${(ty*geometry.s+geometry.oy*(1-z)).toFixed(3)}px,0) scale(${z.toFixed(7)})`;
 if(transform!==layerTransform){scenes[mode].style.transform=transform;layerTransform=transform;}positionName();
}
function commitCamera(){
 (mode==='iso'?world:planWorld).setAttribute('transform',`translate(${(W/2-camera.x*camera.zoom).toFixed(3)} ${(H/2-camera.y*camera.zoom).toFixed(3)}) scale(${camera.zoom.toFixed(6)})`);
 painted={...camera};scenes[mode].style.transform='translate3d(0,0,0)';layerTransform='';positionName();
}
function applyRoofs(){
 const amounts=new Map();for(const r of roofEls){const goal=open&&(selected==='all'||r.owner===selected)?1:0;amounts.set(r.owner,Math.max(amounts.get(r.owner)||0,goal));if(r.value===goal&&r.painted)continue;r.value=goal;r.painted=true;r.el.style.display=goal?'none':'';r.el.style.opacity=String(1-goal);}
 for(const e of cutEls){const opacity=String(1-(amounts.get(e.dataset.cut)||0)*.86);if(e.style.opacity!==opacity)e.style.opacity=opacity;}positionName();
}
function tick(now){const dt=last?Math.min((now-last)/1000,.15):1/60;last=now;let moving=false;
 if(touring&&!document.hidden){tourTime+=dt;if(tourTime>7){const i=model.regions.findIndex(r=>r.id===selected);select(model.regions[(i+1)%model.regions.length].id,false);tourTime=0;}}
 for(const key of['x','y','zoom']){camera[key]=reduced.matches?target[key]:camera[key]+(target[key]-camera[key])*(1-Math.exp(-dt/.18));if(Math.abs(camera[key]-target[key])<.0001)camera[key]=target[key];else moving=true;}
 if(moving||drag)renderCamera();else if(layerTransform||camera.x!==painted.x||camera.y!==painted.y||camera.zoom!==painted.zoom)commitCamera();
 raf=visible&&(moving||touring)&&!document.hidden?requestAnimationFrame(tick):0;
}
function kick(){if(!raf&&visible&&!document.hidden){last=0;raf=requestAnimationFrame(tick);}}
function point(e){measure();return{x:(e.clientX-geometry.left-geometry.ox)/geometry.s,y:(e.clientY-geometry.top-geometry.oy)/geometry.s};}
function changeZoom(factor,pt={x:W/2,y:H/2}){const z=Math.max(mode==='plan'?.19:.65,Math.min(mode==='plan'?5:20,target.zoom*factor)),wx=target.x+(pt.x-W/2)/target.zoom,wy=target.y+(pt.y-H/2)/target.zoom;target={x:wx-(pt.x-W/2)/z,y:wy-(pt.y-H/2)/z,zoom:z};setTour(false);if(reduced.matches){camera={...target};commitCamera();}else kick();}
qa('[data-region]').forEach(b=>b.addEventListener('click',()=>select(b.dataset.region)));qa('[data-mode]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));refs.roof.addEventListener('change',()=>{open=refs.roof.checked;setTour(false);applyRoofs();});refs.tour.addEventListener('click',()=>setTour(!touring));q('[data-fit]').addEventListener('click',fit);qa('[data-zoom]').forEach(b=>b.addEventListener('click',()=>changeZoom(b.dataset.zoom==='in'?1.28:1/1.28)));
q('[data-search]').addEventListener('input',e=>{const t=e.target.value.trim();qa('[data-region]').forEach(b=>b.hidden=!b.textContent.includes(t));});
q('#source-opacity').addEventListener('input',e=>{q('.source-image').style.opacity=e.target.value/100;q('[data-opacity-label]').textContent=e.target.value+'%';});q('[data-footprints]').addEventListener('change',e=>root.classList.toggle('footprints-hidden',!e.target.checked));
stage.addEventListener('wheel',e=>{e.preventDefault();changeZoom(Math.exp(-e.deltaY*.0014),point(e));},{passive:false});
stage.addEventListener('pointerdown',e=>{if(e.button!==0)return;const p=point(e);target={...camera};drag={x:p.x,y:p.y,cx:camera.x,cy:camera.y,moved:0,owner:e.target.closest('[data-owner]')?.dataset.owner,building:e.target.closest('[data-building]')?.dataset.building};stage.setPointerCapture(e.pointerId);setTour(false);});
stage.addEventListener('pointermove',e=>{if(!drag)return;const p=point(e),dx=p.x-drag.x,dy=p.y-drag.y;drag.moved=Math.max(drag.moved,Math.hypot(dx,dy));camera={...camera,x:drag.cx-dx/camera.zoom,y:drag.cy-dy/camera.zoom};target={...camera};renderCamera();});
stage.addEventListener('pointerup',e=>{if(!drag)return;const d=drag;drag=null;commitCamera();if(stage.hasPointerCapture(e.pointerId))stage.releasePointerCapture(e.pointerId);if(d.moved<5){if(d.building)selectBuilding(d.building);else if(mode==='plan'){const p=point(e),x=camera.x+(p.x-W/2)/camera.zoom,y=camera.y+(p.y-H/2)/camera.zoom,b=model.buildings.find(b=>x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.d);if(b)selectBuilding(b.id);else if(d.owner)select(d.owner);else clearName();}else if(d.owner)select(d.owner);else clearName();}});stage.addEventListener('pointercancel',()=>{drag=null;commitCamera();});
root.addEventListener('keydown',e=>{if(/INPUT|TEXTAREA/.test(e.target.tagName))return;const i=model.regions.findIndex(r=>r.id===selected);if(e.key==='Escape'){clearName();}else if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();select(model.regions[(i+(e.key==='ArrowRight'?1:-1)+model.regions.length)%model.regions.length].id);}else if(e.key==='Home'){e.preventDefault();select('all');}else if(e.key.toLowerCase()==='r'&&mode==='iso'){open=!open;refs.roof.checked=open;setTour(false);applyRoofs();}else if(e.key==='1')setMode('iso');else if(e.key==='2')setMode('plan');else if(e.key.toLowerCase()==='f')fit();else if(e.key==='+'||e.key==='=')changeZoom(1.2);else if(e.key==='-')changeZoom(1/1.2);});
const closeLabel=q('[data-close-label]');for(const type of['pointerdown','pointerup'])closeLabel.addEventListener(type,e=>e.stopPropagation());closeLabel.addEventListener('click',()=>{clearName();stage.focus({preventScroll:true});});
new ResizeObserver(()=>{geometry=null;labelSize=null;if(layerTransform)renderCamera();else positionName();}).observe(stage);
new IntersectionObserver(entries=>{visible=entries[entries.length-1].isIntersecting;if(visible)kick();else if(raf){cancelAnimationFrame(raf);raf=0;}},{rootMargin:'80px'}).observe(stage);document.addEventListener('visibilitychange',()=>{if(!document.hidden)kick();else if(raf){cancelAnimationFrame(raf);raf=0;}});reduced.addEventListener('change',()=>{if(reduced.matches)setTour(false);kick();});
select('all');window.__planModel={select,selectBuilding,setMode,fit,state:()=>({visible,documentHidden:document.hidden,raf:!!raf,target:{...target},selected,building:pickedBuilding,label:namedPlace?{name:namedPlace.name,context:namedPlace.context}:null,mode,roofOpen:open,touring,camera:{...camera},counts:model.summary,parts:model.components,roofs:roofEls.map(r=>({owner:r.owner,amount:r.value}))}),model};
})();
