(()=>{'use strict';
const model=JSON.parse(document.getElementById('model-data').textContent),root=document.getElementById('plan-model'),q=s=>root.querySelector(s),qa=s=>Array.from(root.querySelectorAll(s)),stage=q('.iso-plate'),reduced=matchMedia('(prefers-reduced-motion:reduce)');
const W=1300,H=1050,rad=Math.PI/180,P=model.projection,k=P.scale*Math.sqrt(1.6),az=P.azimuth*rad,el=P.elevation*rad;
const project=(x,y,z=0)=>[P.origin[0]+(x*Math.sin(az)-y*Math.cos(az))*k,P.origin[1]+((x*Math.cos(az)+y*Math.sin(az))*Math.sin(el)-z*Math.cos(el))*k];
const refs={name:q('[data-current-name]'),note:q('[data-current-note]'),readout:q('[data-readout]'),roof:q('[data-roofs]'),label:q('[data-view-label]'),tag:q('[data-view-tag]'),hint:q('[data-hint]'),tour:q('[data-tour]')};
const world=q('[data-world]'),planWorld=q('[data-plan-world]'),roofEls=qa('.roof-assembly').map(el=>({el,owner:el.closest('[data-owner]').dataset.owner,value:0})),cutEls=qa('[data-cut]');
let selected='all',mode='iso',open=false,touring=false,tourTime=0,visible=true,raf=0,last=0,drag=null;
let camera={x:W/2,y:H/2,zoom:1},target={...camera};
let flight=null;const cameraListeners=new Set();
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
function nameRegion(id){root.dispatchEvent(new CustomEvent('model-placechange',{detail:{building:null}}));const r=regionMap.get(id);if(!r||id==='all'){clearName();return;}showName({name:r.name,context:'院落区域',region:r});}
function nameBuilding(id){
 const b=buildingMap.get(id);if(!b)return;const r=regionMap.get(b.owner);
 const type={gate:'门房',gallery:'廊房',tower:'楼房',shed:'棚房',passage:'穿堂'}[b.type]||'房舍';
 showName({name:b.name||'图示'+type,context:r.name+(b.name?'':' · 原图未单独标名'),building:b,region:r});
 refs.readout.textContent=(b.name||'图示'+type)+' · '+r.name;
 root.dispatchEvent(new CustomEvent('model-placechange',{detail:{building:id}}));
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
 cancelTravel();
 if(mode==='plan'){target={x:selected==='all'?502.5:b[0]+b[2]/2,y:selected==='all'?1474:b[1]+b[3]/2,zoom:Math.min((W-150)/(b[2]+35),(H-130)/(b[3]+35))};}
 else if(selected==='all')target={x:W/2,y:H/2,zoom:1};
 else{const points=[];for(const x of[b[0],b[0]+b[2]])for(const y of[b[1],b[1]+b[3]])for(const z of[0,75])points.push(project(x,y,z));const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);target={x:(minX+maxX)/2,y:(minY+maxY)/2,zoom:Math.min((W-150)/(maxX-minX),(H-145)/(maxY-minY),13)};}
 if(reduced.matches){camera={...target};commitCamera();}kick();}
function cameraForBox(b){
 const points=[];for(const x of[b[0],b[0]+b[2]])for(const y of[b[1],b[1]+b[3]])for(const z of[0,65])points.push(project(x,y,z));
 const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),loX=Math.min(...xs),hiX=Math.max(...xs),loY=Math.min(...ys),hiY=Math.max(...ys);
 return{x:(loX+hiX)/2,y:(loY+hiY)/2,zoom:Math.min((W-155)/(hiX-loX),(H-170)/(hiY-loY),13)};
}
function focusBox(b,immediate=false){
 cancelTravel();target=cameraForBox(b);
 if(immediate||reduced.matches){camera={...target};commitCamera();}kick();
}
function cancelTravel(){if(!flight)return;const old=flight;flight=null;target={...camera};old.onCancel?.();}
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
const mixCamera=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,zoom:Math.exp(Math.log(a.zoom)+(Math.log(b.zoom)-Math.log(a.zoom))*t)});
function flyTo(box,options={}){
 cancelTravel();setTour(false);const to=cameraForBox(box);
 if(reduced.matches){camera={...to};target={...to};options.onUpdate?.(1);commitCamera();options.onDone?.();return;}
 flight={from:{...camera},to,via:options.viaBox?cameraForBox(options.viaBox):null,elapsed:0,duration:options.duration||1.1,onUpdate:options.onUpdate,onDone:options.onDone,onCancel:options.onCancel};kick();
}
function cameraFrame(){if(!geometry)measure();return{camera:{...camera},scale:geometry.s};}
function notifyCamera(){if(cameraListeners.size){const frame=cameraFrame();for(const fn of cameraListeners)fn(frame);}}
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
 if(transform!==layerTransform){scenes[mode].style.transform=transform;layerTransform=transform;}positionName();notifyCamera();
}
function commitCamera(){
 (mode==='iso'?world:planWorld).setAttribute('transform',`translate(${(W/2-camera.x*camera.zoom).toFixed(3)} ${(H/2-camera.y*camera.zoom).toFixed(3)}) scale(${camera.zoom.toFixed(6)})`);
 painted={...camera};scenes[mode].style.transform='translate3d(0,0,0)';layerTransform='';positionName();notifyCamera();
}
function applyRoofs(){
 const amounts=new Map();for(const r of roofEls){const goal=open&&(selected==='all'||r.owner===selected)?1:0;amounts.set(r.owner,Math.max(amounts.get(r.owner)||0,goal));if(r.value===goal&&r.painted)continue;r.value=goal;r.painted=true;r.el.style.display=goal?'none':'';r.el.style.opacity=String(1-goal);}
 for(const e of cutEls){const opacity=String(1-(amounts.get(e.dataset.cut)||0)*.86);if(e.style.opacity!==opacity)e.style.opacity=opacity;}positionName();
}
function setRoofs(value){open=!!value;refs.roof.checked=open;applyRoofs();}
function tick(now){const dt=last?Math.min((now-last)/1000,.15):1/60;last=now;let moving=false;
 if(touring&&!document.hidden){tourTime+=dt;if(tourTime>7){const i=model.regions.findIndex(r=>r.id===selected);select(model.regions[(i+1)%model.regions.length].id,false);tourTime=0;}}
 if(flight){
  const f=flight;f.elapsed+=Math.min(dt,.05);const t=reduced.matches?1:Math.min(1,f.elapsed/f.duration);
  camera=f.via?(t<.22?mixCamera(f.from,f.via,smooth(t/.22)):t<.78?{...f.via}:mixCamera(f.via,f.to,smooth((t-.78)/.22))):mixCamera(f.from,f.to,smooth(t));
  target={...camera};f.onUpdate?.(t);moving=t<1;
  if(!moving){flight=null;camera={...f.to};target={...camera};f.onDone?.();}
 }else for(const key of['x','y','zoom']){camera[key]=reduced.matches?target[key]:camera[key]+(target[key]-camera[key])*(1-Math.exp(-dt/.18));if(Math.abs(camera[key]-target[key])<.0001)camera[key]=target[key];else moving=true;}
 if(moving||drag)renderCamera();else if(layerTransform||camera.x!==painted.x||camera.y!==painted.y||camera.zoom!==painted.zoom)commitCamera();
 raf=visible&&(moving||touring)&&!document.hidden?requestAnimationFrame(tick):0;
}
function kick(){if(!raf&&visible&&!document.hidden){last=0;raf=requestAnimationFrame(tick);}}
function point(e){measure();return{x:(e.clientX-geometry.left-geometry.ox)/geometry.s,y:(e.clientY-geometry.top-geometry.oy)/geometry.s};}
function changeZoom(factor,pt={x:W/2,y:H/2}){cancelTravel();const z=Math.max(mode==='plan'?.19:.65,Math.min(mode==='plan'?5:20,target.zoom*factor)),wx=target.x+(pt.x-W/2)/target.zoom,wy=target.y+(pt.y-H/2)/target.zoom;target={x:wx-(pt.x-W/2)/z,y:wy-(pt.y-H/2)/z,zoom:z};setTour(false);if(reduced.matches){camera={...target};commitCamera();}else kick();}
qa('[data-region]').forEach(b=>b.addEventListener('click',()=>select(b.dataset.region)));qa('[data-mode]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));refs.roof.addEventListener('change',()=>{open=refs.roof.checked;setTour(false);applyRoofs();});refs.tour.addEventListener('click',()=>setTour(!touring));q('[data-fit]').addEventListener('click',fit);qa('[data-zoom]').forEach(b=>b.addEventListener('click',()=>changeZoom(b.dataset.zoom==='in'?1.28:1/1.28)));
q('[data-search]').addEventListener('input',e=>{const t=e.target.value.trim();qa('[data-region]').forEach(b=>b.hidden=!b.textContent.includes(t));});
q('#source-opacity').addEventListener('input',e=>{q('.source-image').style.opacity=e.target.value/100;q('[data-opacity-label]').textContent=e.target.value+'%';});q('[data-footprints]').addEventListener('change',e=>root.classList.toggle('footprints-hidden',!e.target.checked));
stage.addEventListener('wheel',e=>{e.preventDefault();changeZoom(Math.exp(-e.deltaY*.0014),point(e));},{passive:false});
stage.addEventListener('pointerdown',e=>{if(e.button!==0)return;cancelTravel();const p=point(e);target={...camera};drag={x:p.x,y:p.y,cx:camera.x,cy:camera.y,moved:0,owner:e.target.closest('[data-owner]')?.dataset.owner,building:e.target.closest('[data-building]')?.dataset.building};stage.setPointerCapture(e.pointerId);setTour(false);});
stage.addEventListener('pointermove',e=>{if(!drag)return;const p=point(e),dx=p.x-drag.x,dy=p.y-drag.y;drag.moved=Math.max(drag.moved,Math.hypot(dx,dy));camera={...camera,x:drag.cx-dx/camera.zoom,y:drag.cy-dy/camera.zoom};target={...camera};renderCamera();});
stage.addEventListener('pointerup',e=>{if(!drag)return;const d=drag;drag=null;commitCamera();if(stage.hasPointerCapture(e.pointerId))stage.releasePointerCapture(e.pointerId);if(d.moved<5){if(d.building)selectBuilding(d.building);else if(mode==='plan'){const p=point(e),x=camera.x+(p.x-W/2)/camera.zoom,y=camera.y+(p.y-H/2)/camera.zoom,b=model.buildings.find(b=>x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.d);if(b)selectBuilding(b.id);else if(d.owner)select(d.owner);else clearName();}else if(d.owner)select(d.owner);else clearName();}});stage.addEventListener('pointercancel',()=>{drag=null;commitCamera();});
root.addEventListener('keydown',e=>{if(/INPUT|TEXTAREA/.test(e.target.tagName)||!stage.contains(e.target))return;const i=model.regions.findIndex(r=>r.id===selected);if(e.key==='Escape'){clearName();}else if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();select(model.regions[(i+(e.key==='ArrowRight'?1:-1)+model.regions.length)%model.regions.length].id);}else if(e.key==='Home'){e.preventDefault();select('all');}else if(e.key.toLowerCase()==='r'&&mode==='iso'){open=!open;refs.roof.checked=open;setTour(false);applyRoofs();}else if(e.key==='1')setMode('iso');else if(e.key==='2')setMode('plan');else if(e.key.toLowerCase()==='f')fit();else if(e.key==='+'||e.key==='=')changeZoom(1.2);else if(e.key==='-')changeZoom(1/1.2);});
const closeLabel=q('[data-close-label]');for(const type of['pointerdown','pointerup'])closeLabel.addEventListener(type,e=>e.stopPropagation());closeLabel.addEventListener('click',()=>{clearName();stage.focus({preventScroll:true});});
new ResizeObserver(()=>{geometry=null;labelSize=null;if(layerTransform)renderCamera();else{positionName();notifyCamera();}}).observe(stage);
new IntersectionObserver(entries=>{visible=entries[entries.length-1].isIntersecting;if(visible)kick();else if(raf){cancelAnimationFrame(raf);raf=0;}},{rootMargin:'80px'}).observe(stage);document.addEventListener('visibilitychange',()=>{if(!document.hidden)kick();else if(raf){cancelAnimationFrame(raf);raf=0;}});reduced.addEventListener('change',()=>{if(reduced.matches)setTour(false);kick();});
select('all');window.__planModel={select,selectBuilding,setMode,fit,focusBox,setRoofs,flyTo,cancelTravel,clearName,project,cameraFrame,onCamera:fn=>{cameraListeners.add(fn);fn(cameraFrame());return()=>cameraListeners.delete(fn);},state:()=>({visible,documentHidden:document.hidden,raf:!!raf,travelling:!!flight,target:{...target},selected,building:pickedBuilding,label:namedPlace?{name:namedPlace.name,context:namedPlace.context}:null,mode,roofOpen:open,touring,camera:{...camera},counts:model.summary,parts:model.components,roofs:roofEls.map(r=>({owner:r.owner,amount:r.value}))}),model};
})();

(()=>{'use strict';
const api=window.__planModel,q=s=>document.querySelector(s),svg=q('[data-journey-map]'),world=q('[data-journey-world]'),trace=q('[data-journey-trace]'),track=q('[data-journey-track]'),halo=q('[data-journey-halo]'),pins=q('[data-journey-pins]'),cursor=q('[data-journey-cursor]'),panel=q('[data-journey-summary]'),heading=q('[data-journey-title]'),chain=q('[data-journey-nodes]'),phase=q('[data-journey-phase]'),note=q('[data-journey-note]'),mini=q('[data-locator-focus]');
const NS='http://www.w3.org/2000/svg',readout=q('[data-readout]');let active=null,projected=[],lengths=[],total=0,progress=1,point=[0,0],pinEls=[],nodeEls=[],node=-1,running=false,enabled=false;
function at(t){const d=t*total;let i=1;while(i<lengths.length-1&&lengths[i]<d)i++;const a=projected[i-1],b=projected[i],u=(d-lengths[i-1])/(lengths[i]-lengths[i-1]||1);return[a[0]+(b[0]-a[0])*u,a[1]+(b[1]-a[1])*u];}
function render({camera:c,scale}){
 if(!enabled||!active)return;
 world.setAttribute('transform',`translate(${650-c.x*c.zoom} ${525-c.y*c.zoom}) scale(${c.zoom})`);
 const inverse=1/(c.zoom*scale);cursor.setAttribute('transform',`translate(${point[0]} ${point[1]}) scale(${inverse})`);
 for(const pin of pinEls)pin.el.setAttribute('transform',`translate(${pin.p[0]} ${pin.p[1]}) scale(${inverse})`);
}
function setProgress(t){
 if(!active)return;progress=Math.max(0,Math.min(1,t));point=at(progress);
 let end=1;while(end<lengths.length-1&&lengths[end]<progress*total)end++;
 trace.setAttribute('d',[...projected.slice(0,end),point].map((p,i)=>(i?'L':'M')+p.join(' ')).join(''));
 let next=0;for(let n=0;n<active.nodes.length;n++)if(lengths[active.nodes[n].at]<=progress*total+.01)next=n;
 if(next!==node){node=next;nodeEls.forEach((el,n)=>el.classList.toggle('is-passed',n<=node));}
 const status=progress<1?(running?'沿线前行':'暂停于此'):'本段路线';if(phase.textContent!==status)phase.textContent=status;render(api.cameraFrame());
}
function show(journey,initial=1){
 active=journey;enabled=true;running=false;progress=initial;node=-1;svg.removeAttribute('hidden');panel.hidden=false;
 projected=journey.points.map(([x,y])=>api.project(x,y,3));lengths=[0];for(let i=1;i<projected.length;i++)lengths.push(lengths[i-1]+Math.hypot(projected[i][0]-projected[i-1][0],projected[i][1]-projected[i-1][1]));total=lengths.at(-1);
 const d=projected.map((p,i)=>(i?'L':'M')+p.join(' ')).join('');for(const path of[trace,track,halo])path.setAttribute('d',d);
 heading.textContent=journey.title;note.textContent=journey.partial?'回府通路原文未详，从穿堂起示意':'按原著次序串联 · 路径示意';note.title=journey.note;chain.replaceChildren();pins.replaceChildren();nodeEls=[];pinEls=[];
 journey.nodes.forEach((n,i)=>{
  if(i){const arrow=document.createElement('i');arrow.textContent='→';chain.append(arrow);}const text=document.createElement('span');text.textContent=n.name;chain.append(text);nodeEls.push(text);
  const g=document.createElementNS(NS,'g'),circle=document.createElementNS(NS,'circle');circle.setAttribute('r',i===0||i===journey.nodes.length-1?'5':'3');g.append(circle);pins.append(g);pinEls.push({el:g,p:projected[n.at]});
 });
 setProgress(initial);
}
function setBox(box){for(const [key,value]of Object.entries({x:box[0],y:box[1],width:box[2],height:box[3]}))mini.setAttribute(key,value);}
function frameBox(from,to,j){const xs=[from[0],from[0]+from[2],to[0],to[0]+to[2],...j.points.map(p=>p[0])],ys=[from[1],from[1]+from[3],to[1],to[1]+to[3],...j.points.map(p=>p[1])];const x=Math.min(...xs)-22,y=Math.min(...ys)-22;return[x,y,Math.max(...xs)-x+22,Math.max(...ys)-y+22];}
function reverse(j){const last=j.points.length-1;return{...j,title:j.nodes.at(-1).name+' → '+j.nodes[0].name,points:[...j.points].reverse(),nodes:[...j.nodes].reverse().map(n=>({...n,at:last-n.at}))};}
function travel(j,from,to,done){
 show(j,0);running=true;phase.textContent='沿线前行';readout.textContent='沿线前行 · '+j.title;const bounds=frameBox(from,to,j);setBox(bounds);
 api.flyTo(to,{viaBox:bounds,duration:j.duration||3.4,onUpdate:t=>setProgress(Math.max(0,Math.min(1,(t-.22)/.56))),onDone:()=>{running=false;setProgress(1);setBox(to);done?.();},onCancel:()=>{running=false;setProgress(progress);readout.textContent='路线已暂停 · 可重走这段';}});
}
function hide(){enabled=false;active=null;running=false;svg.setAttribute('hidden','');panel.hidden=true;}
api.onCamera(render);
window.__journey={show,travel,hide,setBox,reverse,state:()=>({visible:enabled,running,progress,node,title:active?.title||null,points:active?.points||[],cursor:[...point],nodes:active?.nodes||[]})};
})();

(()=>{'use strict';
const api=window.__planModel,root=document.getElementById('plan-model'),data=JSON.parse(document.getElementById('reader-data').textContent),steps=[...document.querySelectorAll('[data-step]')],layout=root.querySelector('.main-layout'),header=root.querySelector('.topbar'),stage=root.querySelector('.iso-plate'),q=s=>root.querySelector(s),qa=s=>[...root.querySelectorAll(s)];
const journey=window.__journey,drawing=q('.drawing-area');
let experience='story',current=-1,scrollFrame=0,replay=null;
const count=q('[data-guide-count]'),place=q('[data-guide-place]'),locator=q('[data-locator-focus]'),dots=qa('[data-step-jump]');
function updateLocator(box){const [x,y,w,h]=box;for(const [a,v]of Object.entries({x,y,width:w,height:h}))locator.setAttribute(a,v);}
function runLeg(j,from,s,i){
 api.cancelTravel();api.selectBuilding(s.building);api.clearName();
 journey.travel(j,from,s.box,()=>{if(current===i&&experience==='story')api.selectBuilding(s.building);});
}
function applyStep(i,force=false){
 if(current===i&&!force)return;const previous=current;api.cancelTravel();current=i;replay=null;
 steps.forEach((e,n)=>{e.classList.toggle('is-current',n===i);if(n===i)e.setAttribute('aria-current','step');else e.removeAttribute('aria-current');});
 dots.forEach((e,n)=>{e.classList.toggle('is-current',n===i);e.setAttribute('aria-pressed',String(n===i));});
 count.textContent=i<0?'序':'0'+(i+1);place.textContent=i<0?'先看全府，再从西角门出发':data[i].place;
 q('[data-step-prev]').disabled=i<=0;q('[data-step-next]').disabled=i>=data.length-1;
 api.setMode('iso');api.setRoofs(false);
 if(i<0){journey.hide();api.select('all');updateLocator([23,27,968,2917]);return;}
 const s=data[i],sequential=previous>=0&&Math.abs(i-previous)===1,reverse=i<previous,leg=sequential?(reverse?data[previous].journey:s.journey):s.journey;
 if(sequential&&leg&&!(reverse&&leg.partial)){
  const j=reverse?journey.reverse(leg):leg,from=data[previous].box;replay=()=>runLeg(j,from,s,i);replay();
 }else{
  if(s.journey){journey.show(s.journey);replay=()=>runLeg(s.journey,data[i-1].box,s,i);}else journey.hide();
  api.selectBuilding(s.building);api.clearName();updateLocator(s.box);api.flyTo(s.box,{duration:.95,onDone:()=>{if(current===i&&experience==='story')api.selectBuilding(s.building);}});
 }
}
function readingLine(){return innerWidth<=850?drawing.getBoundingClientRect().bottom+Math.max(36,(innerHeight-header.offsetHeight-drawing.offsetHeight)*.25):header.offsetHeight+(innerHeight-header.offsetHeight)*.43;}
function sync(){scrollFrame=0;if(experience!=='story')return;if(layout.getBoundingClientRect().top>header.offsetHeight+40){applyStep(-1);return;}const line=readingLine();let i=-1;for(let n=0;n<steps.length;n++)if(steps[n].getBoundingClientRect().top<=line)i=n;applyStep(i);}
function schedule(){if(!scrollFrame)scrollFrame=requestAnimationFrame(sync);}
function go(i){
 if(experience!=='story')setExperience('story',false);
 i=Math.max(0,Math.min(data.length-1,i));
 // The route summary changes the sticky column's height on the first leg.
 // Reserve its final height before calculating a mobile chapter position.
 if(innerWidth<=850&&i>0)q('[data-journey-summary]').hidden=false;
 const y=steps[i].getBoundingClientRect().top+scrollY-(innerWidth<=850?header.offsetHeight+drawing.offsetHeight+12:header.offsetHeight+32);
 history.replaceState(null,'','#story-'+(i+1));window.scrollTo({top:Math.max(0,y),behavior:'instant'});applyStep(i,true);
}
function setExperience(next,scroll=true){
 experience=next;root.dataset.experience=next;document.documentElement.dataset.experience=next;
 qa('[data-experience]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.experience===next)));
 if(next==='explore'){
  api.cancelTravel();journey.hide();history.replaceState(null,'','#explore');api.select('all');
  if(scroll)window.scrollTo({top:0,behavior:'instant'});
 }else{
  history.replaceState(null,'',current<0?location.pathname+location.search:'#story-'+(current+1));
  if(scroll){if(current>=0)go(current);else window.scrollTo({top:0,behavior:'instant'});}
  applyStep(current,true);
 }
 requestAnimationFrame(()=>window.dispatchEvent(new Event('resize')));
}
qa('[data-experience]').forEach(b=>b.addEventListener('click',()=>setExperience(b.dataset.experience)));
q('.brand').addEventListener('click',e=>{e.preventDefault();current=-1;setExperience('story');});
qa('[data-start-reading]').forEach(b=>b.addEventListener('click',()=>go(0)));
dots.forEach(b=>b.addEventListener('click',()=>go(Number(b.dataset.stepJump))));
q('[data-step-prev]').addEventListener('click',()=>go(current-1));q('[data-step-next]').addEventListener('click',()=>go(current+1));
q('[data-recenter]').addEventListener('click',()=>applyStep(current,true));
q('[data-replay-journey]').addEventListener('click',()=>replay?.());
window.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',schedule);
window.addEventListener('modelready',()=>{q('[data-step-prev]').disabled=current<=0;q('[data-step-next]').disabled=current>=data.length-1;});
// Only the focused model consumes horizontal arrows. Reading controls and text
// retain normal browser keyboard behavior.
const exploreNote=q('[data-related-story]');
root.addEventListener('model-placechange',e=>{
 const b=api.model.buildings.find(b=>b.id===e.detail.building),i=b?data.findIndex(s=>s.building===b.id||s.labels.includes(b.id)):-1;
 exploreNote.hidden=i<0;if(i<0)return;
 q('[data-related-title]').textContent=data[i].place+' · 第三回';q('[data-related-body]').textContent=data[i].body;
 q('[data-related-link]').onclick=()=>go(i);
});
function fromHash(){if(location.hash==='#explore')setExperience('explore');else{const m=location.hash.match(/^#story-([1-8])$/);if(m)go(Number(m[1])-1);}}
window.addEventListener('hashchange',fromHash);
applyStep(-1,true);fromHash();schedule();
window.__reader={go,setExperience,state:()=>({experience,current}),stops:data};
})();
