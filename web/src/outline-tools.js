import {MAX_OUTLINE_POINTS,validOutline} from './outlines.js';

const SVG_NS='http://www.w3.org/2000/svg';
const coordinates=points=>points.map(p=>`${p.x*1000},${p.y*1000}`).join(' ');

export function outlineSvg(document,outlines) {
  const svg=document.createElementNS(SVG_NS,'svg');
  svg.setAttribute('class','outline-layer');svg.setAttribute('viewBox','0 0 1000 1000');
  svg.setAttribute('preserveAspectRatio','none');svg.setAttribute('aria-hidden','true');
  for(const outline of outlines) {
    const polygon=document.createElementNS(SVG_NS,'polygon');
    polygon.setAttribute('points',coordinates(outline.points));
    polygon.setAttribute('class',`object-outline ${outline.state??''}`);
    polygon.setAttribute('vector-effect','non-scaling-stroke');svg.append(polygon);
  }
  return svg;
}

/** Owns gestures and preview; the caller owns saved annotations and undo state. */
export function mountOutlineTools(stage,{onOutline,onPoint,onUndo,onClear,getBounds=()=>stage.getBoundingClientRect()}={}) {
  const document=stage.ownerDocument;
  const events=new document.defaultView.AbortController(),options={signal:events.signal};
  let enabled=true,mode='draw',active=null,outlines=[];
  const oldTouchAction=stage.style.touchAction;
  const toolbar=document.createElement('div');toolbar.className='outline-tools';
  const buttons=document.createElement('div');buttons.className='button-row outline-buttons';
  const status=document.createElement('p');status.className='outline-help';status.setAttribute('role','status');
  const makeButton=(text,action)=>{
    const button=document.createElement('button');button.type='button';button.className='button button-secondary';
    button.textContent=text;button.addEventListener('click',action,options);buttons.append(button);return button;
  };
  const draw=makeButton('Draw outline',()=>setMode('draw'));
  const point=makeButton('Point / select',()=>setMode('point'));
  const undo=makeButton('Undo outline',()=>{cancel();onUndo?.();});
  const clear=makeButton('Clear outlines',()=>{cancel();onClear?.();});
  toolbar.append(buttons,status);
  let savedLayer=outlineSvg(document,[]);stage.append(savedLayer);
  const live=outlineSvg(document,[]),preview=document.createElementNS(SVG_NS,'polyline');
  preview.setAttribute('class','outline-preview');preview.setAttribute('vector-effect','non-scaling-stroke');
  live.append(preview);stage.append(live);
  function sync() {
    stage.dataset.annotationMode=mode;
    stage.style.touchAction=enabled&&mode==='draw'?'none':oldTouchAction;
    draw.setAttribute('aria-pressed',String(mode==='draw'));point.setAttribute('aria-pressed',String(mode==='point'));
    draw.disabled=point.disabled=!enabled;
    undo.disabled=clear.disabled=!enabled||!outlines.length;
  }
  function setMode(value) {
    cancel();mode=value;sync();
    status.textContent=mode==='draw'?'Drag around one object. Release to close the outline. Esc cancels.':'Click an object or use the keyboard controls beside the photo.';
  }
  function cancel() {
    const id=active?.id;active=null;preview.removeAttribute('points');
    if(id!==undefined&&stage.hasPointerCapture?.(id))stage.releasePointerCapture(id);
  }
  function position(event,clamp=false) {
    const bounds=getBounds();if(!bounds.width||!bounds.height)return null;
    const x=(event.clientX-bounds.left)/bounds.width,y=(event.clientY-bounds.top)/bounds.height;
    if(!Number.isFinite(x)||!Number.isFinite(y)||(!clamp&&(x<0||x>1||y<0||y>1)))return null;
    return {x:Math.round(Math.max(0,Math.min(1,x))*1e6)/1e6,y:Math.round(Math.max(0,Math.min(1,y))*1e6)/1e6};
  }
  function append(event,force=false) {
    const p=position(event,true);if(!p||!active)return;
    const previous=active.points.at(-1),bounds=getBounds();
    if(previous&&Math.hypot((p.x-previous.x)*bounds.width,(p.y-previous.y)*bounds.height)<(force?.1:2))return;
    // Thin very long strokes while retaining the complete object's extent.
    if(active.points.length>=MAX_OUTLINE_POINTS-1)active.points=active.points.filter((_,i)=>i%2===0);
    active.points.push(p);preview.setAttribute('points',coordinates(active.points));
  }
  stage.addEventListener('pointerdown',event=>{
    if(!enabled||mode!=='draw'||active||event.isPrimary===false||event.button!==0)return;
    const p=position(event);if(!p)return;
    event.preventDefault();active={id:event.pointerId,points:[p]};
    stage.setPointerCapture?.(event.pointerId);preview.setAttribute('points',coordinates(active.points));
    status.textContent='Drawing… release to close, or press Esc to cancel.';
  },options);
  stage.addEventListener('pointermove',event=>{
    if(active?.id!==event.pointerId)return;event.preventDefault();append(event);
  },options);
  stage.addEventListener('pointerup',event=>{
    if(active?.id!==event.pointerId)return;event.preventDefault();append(event,true);
    const points=validOutline(active.points);cancel();
    if(!points){status.textContent='Draw a loop around an object; a tap or line is too small.';return;}
    status.textContent='Outline added. Draw another object, or undo to try again.';onOutline?.(points);
  },options);
  for(const name of ['pointercancel','lostpointercapture'])stage.addEventListener(name,event=>{
    if(active?.id!==event.pointerId)return;cancel();status.textContent='Drawing cancelled. Try the outline again.';
  },options);
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&active){cancel();status.textContent='Drawing cancelled.';}
  },options);
  stage.addEventListener('dragstart',event=>event.preventDefault(),options);
  stage.addEventListener('click',event=>{
    if(!enabled||mode!=='point')return;const p=position(event);if(p)onPoint?.(p,event);
  },options);
  setMode('draw');
  return {
    toolbar,cancel,
    setEnabled(value){enabled=Boolean(value);if(!enabled)cancel();sync();},
    setOutlines(value){outlines=value;const layer=outlineSvg(document,value);savedLayer.replaceWith(layer);savedLayer=layer;sync();},
    setStatus(text){status.textContent=text;},
    destroy(){cancel();events.abort();savedLayer.remove();live.remove();toolbar.remove();delete stage.dataset.annotationMode;stage.style.touchAction=oldTouchAction;},
  };
}
