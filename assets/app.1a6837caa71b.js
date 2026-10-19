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
q('[data-stats]').textContent=model.summary.tracedSourceUnits+' 个屋面单元 · '+model.summary.wallSegments+' 段图线';q('[data-place-count]').textContent=model.regions.length+' 处';
function fit(){const r=model.regions.find(r=>r.id===selected),b=selected==='all'?[23,27,968,2917]:r.box;
 if(mode==='plan'){target={x:selected==='all'?502.5:b[0]+b[2]/2,y:selected==='all'?1474:b[1]+b[3]/2,zoom:Math.min((W-150)/(b[2]+35),(H-130)/(b[3]+35))};}
 else if(selected==='all')target={x:W/2,y:H/2,zoom:1};
 else{const points=[];for(const x of[b[0],b[0]+b[2]])for(const y of[b[1],b[1]+b[3]])for(const z of[0,75])points.push(project(x,y,z));const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);target={x:(minX+maxX)/2,y:(minY+maxY)/2,zoom:Math.min((W-150)/(maxX-minX),(H-145)/(maxY-minY),13)};}
 if(reduced.matches){camera={...target};commitCamera();}kick();}
function setTour(value){touring=value&&!reduced.matches;refs.tour.setAttribute('aria-pressed',String(touring));refs.tour.textContent=touring?'暂停巡览':'循院巡览';tourTime=0;kick();}
function select(id,manual=true){const r=model.regions.find(r=>r.id===id);if(!r)return;const previous=selected;selected=id;root.dataset.selected=id;for(const r of roofEls)if(r.owner===previous||r.owner===id)r.el.classList.toggle('is-selected',id!=='all'&&r.owner===id);for(const e of footprints)if(e.dataset.owner===previous||e.dataset.owner===id)e.classList.toggle('is-selected',id!=='all'&&e.dataset.owner===id);refs.name.textContent=r.name;refs.note.textContent=r.note;refs.label.textContent=r.id==='all'?'全府总览':r.name;refs.readout.textContent=r.name+' · '+(mode==='iso'?'位置照图，标高示意':'原图像素坐标');qa('[data-region]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.region===id)));q('[data-announcement]').textContent=r.name+'。'+r.note;if(manual)setTour(false);applyRoofs();fit();}
function setMode(next){if(next===mode)return;commitCamera();mode=next;const source=q('.source-image');if(mode==='plan'&&!source.hasAttribute('href')&&source.dataset.src)source.setAttribute('href',source.dataset.src);qa('[data-scene]').forEach(el=>el.classList.toggle('active',el.dataset.scene===mode));qa('[data-mode]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.mode===mode)));q('.plan-options').hidden=mode!=='plan';refs.tag.textContent=mode==='plan'?'原图与建模轮廓叠合':'北向右上 · 标高示意';refs.hint.textContent=mode==='plan'?'拖动平移 · 滚轮缩放 · 调节原图显影':'拖动平移 · 滚轮缩放 · R 键揭顶';refs.roof.disabled=mode==='plan';setTour(false);select(selected,false);camera={...target};commitCamera();}
// Move a cached compositor layer during a gesture; repaint the vector camera
// only on settling, preserving its original detail and constant stroke widths.
let painted={...camera},geometry=null,layerTransform='';
const scenes={iso:q('[data-scene="iso"]'),plan:q('[data-scene="plan"]')};
function measure(){const b=stage.getBoundingClientRect(),s=Math.min(b.width/W,b.height/H);geometry={left:b.left,top:b.top,s,ox:(b.width-W*s)/2,oy:(b.height-H*s)/2};}
function renderCamera(){
 if(!geometry)measure();
 const z=camera.zoom/painted.zoom,tx=W/2-camera.x*camera.zoom-z*(W/2-painted.x*painted.zoom),ty=H/2-camera.y*camera.zoom-z*(H/2-painted.y*painted.zoom);
 const transform=`translate3d(${(tx*geometry.s+geometry.ox*(1-z)).toFixed(3)}px,${(ty*geometry.s+geometry.oy*(1-z)).toFixed(3)}px,0) scale(${z.toFixed(7)})`;
 if(transform!==layerTransform){scenes[mode].style.transform=transform;layerTransform=transform;}
}
function commitCamera(){
 (mode==='iso'?world:planWorld).setAttribute('transform',`translate(${(W/2-camera.x*camera.zoom).toFixed(3)} ${(H/2-camera.y*camera.zoom).toFixed(3)}) scale(${camera.zoom.toFixed(6)})`);
 painted={...camera};scenes[mode].style.transform='translate3d(0,0,0)';layerTransform='';
}
function applyRoofs(){
 const amounts=new Map();for(const r of roofEls){const goal=open&&(selected==='all'||r.owner===selected)?1:0;amounts.set(r.owner,Math.max(amounts.get(r.owner)||0,goal));if(r.value===goal&&r.painted)continue;r.value=goal;r.painted=true;r.el.style.display=goal?'none':'';r.el.style.opacity=String(1-goal);}
 for(const e of cutEls){const opacity=String(1-(amounts.get(e.dataset.cut)||0)*.86);if(e.style.opacity!==opacity)e.style.opacity=opacity;}
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
stage.addEventListener('pointerdown',e=>{if(e.button!==0)return;const p=point(e);target={...camera};drag={x:p.x,y:p.y,cx:camera.x,cy:camera.y,moved:0,owner:e.target.closest('[data-owner]')?.dataset.owner};stage.setPointerCapture(e.pointerId);setTour(false);});
stage.addEventListener('pointermove',e=>{if(!drag)return;const p=point(e),dx=p.x-drag.x,dy=p.y-drag.y;drag.moved=Math.max(drag.moved,Math.hypot(dx,dy));camera={...camera,x:drag.cx-dx/camera.zoom,y:drag.cy-dy/camera.zoom};target={...camera};renderCamera();});
stage.addEventListener('pointerup',e=>{if(!drag)return;const d=drag;drag=null;commitCamera();if(stage.hasPointerCapture(e.pointerId))stage.releasePointerCapture(e.pointerId);if(d.moved<5&&d.owner)select(d.owner);});stage.addEventListener('pointercancel',()=>{drag=null;commitCamera();});
root.addEventListener('keydown',e=>{if(/INPUT|TEXTAREA/.test(e.target.tagName))return;const i=model.regions.findIndex(r=>r.id===selected);if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();select(model.regions[(i+(e.key==='ArrowRight'?1:-1)+model.regions.length)%model.regions.length].id);}else if(e.key==='Home'){e.preventDefault();select('all');}else if(e.key.toLowerCase()==='r'&&mode==='iso'){open=!open;refs.roof.checked=open;setTour(false);applyRoofs();}else if(e.key==='1')setMode('iso');else if(e.key==='2')setMode('plan');else if(e.key.toLowerCase()==='f')fit();else if(e.key==='+'||e.key==='=')changeZoom(1.2);else if(e.key==='-')changeZoom(1/1.2);});
new ResizeObserver(()=>{geometry=null;if(layerTransform)renderCamera();}).observe(stage);
new IntersectionObserver(entries=>{visible=entries[entries.length-1].isIntersecting;if(visible)kick();else if(raf){cancelAnimationFrame(raf);raf=0;}},{rootMargin:'80px'}).observe(stage);document.addEventListener('visibilitychange',()=>{if(!document.hidden)kick();else if(raf){cancelAnimationFrame(raf);raf=0;}});reduced.addEventListener('change',()=>{if(reduced.matches)setTour(false);kick();});
select('all');window.__planModel={select,setMode,fit,state:()=>({visible,documentHidden:document.hidden,raf:!!raf,target:{...target},selected,mode,roofOpen:open,touring,camera:{...camera},counts:model.summary,parts:model.components,roofs:roofEls.map(r=>({owner:r.owner,amount:r.value}))}),model};
})();
