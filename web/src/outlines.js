// Image-space geometry only. These outlines are observations, not physical measurements.
export const MAX_OUTLINE_POINTS = 600;

export function outlineArea(points) {
  return Math.abs(points.reduce((sum,p,i) => {
    const q=points[(i+1)%points.length];
    return sum+p.x*q.y-q.x*p.y;
  },0))/2;
}

export function validOutline(points) {
  if (!Array.isArray(points) || points.length<3 || points.length>MAX_OUTLINE_POINTS ||
      points.some(p=>!p || ![p.x,p.y].every(v=>Number.isFinite(v)&&v>=0&&v<=1)) ||
      outlineArea(points)<1e-7) return null;
  return points.map(({x,y})=>({x,y}));
}

export function outlineBounds(points) {
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
  const x=Math.min(...xs),y=Math.min(...ys);
  return {x,y,width:Math.max(...xs)-x,height:Math.max(...ys)-y};
}

export function pointInOutline(point,points) {
  let inside=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++) {
    const a=points[j],b=points[i];
    const cross=(point.x-a.x)*(b.y-a.y)-(point.y-a.y)*(b.x-a.x);
    if(Math.abs(cross)<1e-10 && point.x>=Math.min(a.x,b.x)-1e-10 && point.x<=Math.max(a.x,b.x)+1e-10 &&
      point.y>=Math.min(a.y,b.y)-1e-10 && point.y<=Math.max(a.y,b.y)+1e-10) return true;
    if((a.y>point.y)!==(b.y>point.y) && point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x) inside=!inside;
  }
  return inside;
}

export function containsPoint(item,point) {
  if(item.outline) return pointInOutline(point,item.outline);
  if(item.bbox) {
    const [x,y,w,h]=item.bbox;
    return point.x>=x&&point.x<=x+w&&point.y>=y&&point.y<=y+h;
  }
  return Math.hypot(point.x-item.x,point.y-item.y)<=item.radius;
}

// Sutherland–Hodgman clipping against a reference rectangle, in normalized image space.
function clipToBox(points,box) {
  let result=points;
  for(const [axis,edge,sign] of [['x',box.x,1],['x',box.x+box.width,-1],['y',box.y,1],['y',box.y+box.height,-1]]) {
    const input=result;result=[];
    for(let i=0;i<input.length;i++) {
      const a=input[i],b=input[(i+1)%input.length];
      const aIn=sign*(a[axis]-edge)>=0,bIn=sign*(b[axis]-edge)>=0;
      if(aIn)result.push(a);
      if(aIn!==bIn) {
        const t=(edge-a[axis])/(b[axis]-a[axis]);
        result.push({x:a.x+t*(b.x-a.x),y:a.y+t*(b.y-a.y)});
      }
    }
  }
  return result;
}

/** Approximate practice match to reference region bounds; never a segmentation score. */
export function matchOutline(caseData,points) {
  if(!validOutline(points))return null;
  const area=outlineArea(points);let best=null,bestScore=.18;
  for(const [kind,items] of [['target',caseData.targets],['distractor',caseData.distractors]]) {
    for(const item of items??[]) {
      const box=item.outline?outlineBounds(item.outline):item.bbox?
        {x:item.bbox[0],y:item.bbox[1],width:item.bbox[2],height:item.bbox[3]}:
        {x:item.x-item.radius,y:item.y-item.radius,width:item.radius*2,height:item.radius*2};
      const intersection=outlineArea(clipToBox(points,box));
      const score=intersection/(area+box.width*box.height-intersection);
      if(score>=bestScore) {bestScore=score;best={...item,kind};}
    }
  }
  return best;
}
