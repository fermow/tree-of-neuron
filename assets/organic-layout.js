// Deterministic radial, tree-like layout. An event remains on its research branch,
// but its angle varies gently so the result looks like branching growth, not a grid.
// Layout is computed from chronology within each track; no historic date is changed.
(() => {
  const CENTER={x:6900,y:6900};
  const ROOT={x:CENTER.x-150,y:CENTER.y-150,w:300,h:300};
  const BW=232,BH=232,EW=284,EH=178;
  const angles=[-166,-109,-52,11,75,143].map(a=>a*Math.PI/180);
  const spread=[-1,1,-1,1,1,-1];
  const polar=(r,a)=>({x:CENTER.x+r*Math.cos(a),y:CENTER.y+r*Math.sin(a)});
  const branch=(index)=>{
    const pos=polar(640,angles[index]);
    return {x:pos.x-BW/2,y:pos.y-BH/2,w:BW,h:BH,cx:pos.x,cy:pos.y};
  };
  const event=(index,position)=>{
    const swing=(Math.sin((position+1)*1.12+index*.72)*.077)+spread[index]*.028;
    const range=1130+position*388;
    const p=polar(range,angles[index]+swing);
    return {x:p.x-EW/2,y:p.y-EH/2,w:EW,h:EH,cx:p.x,cy:p.y};
  };
  const term=(index,position,termIndex=0)=>{
    const p=event(index,position),theta=angles[index]+Math.PI/2;
    const sign=(termIndex%2===0?1:-1),offset=215+Math.floor(termIndex/2)*145;
    return {x:p.cx+Math.cos(theta)*offset*sign-69,y:p.cy+Math.sin(theta)*offset*sign-38,w:138,h:78};
  };
  const center=rect=>({x:rect.x+rect.w/2,y:rect.y+rect.h/2});
  const bounds=(boxes)=>{
    const left=Math.min(...boxes.map(b=>b.x)),top=Math.min(...boxes.map(b=>b.y));
    const right=Math.max(...boxes.map(b=>b.x+b.w)),bottom=Math.max(...boxes.map(b=>b.y+b.h));
    return {minX:left,minY:top,maxX:right,maxY:bottom};
  };
  window.NEURON_LAYOUT=Object.freeze({CENTER,ROOT,BW,BH,EW,EH,branch,event,term,center,bounds,worldSize:13800});
})();
