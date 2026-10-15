// Research graph and guide integrity checks, independent of the browser.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const c={window:{}};
for(const name of ['data','relations','organic-layout'])vm.runInNewContext(fs.readFileSync('assets/'+name+'.js','utf8'),c,{filename:name+'.js'});
const data=c.window.NEURON_HISTORY,relations=c.window.NEURON_RELATIONS,L=c.window.NEURON_LAYOUT;
const byId=new Map(data.events.map(e=>[e.id,e]));
assert.equal(data.events.length,47,'The guided reading journey must cover all original milestones');
const chrono=[...data.events].sort((a,b)=>a.sort-b.sort);
assert.equal(new Set(chrono.map(e=>e.id)).size,47,'Every milestone appears exactly once');
for(let i=1;i<chrono.length;i++)assert.ok(chrono[i-1].sort<=chrono[i].sort,'Global chronology must be monotonic');
assert.equal(data.eras.length,6,'The root has six research branches');
assert.ok(relations.length>=25,'Cross-path and within-path relationships are expected');
const ids=new Set();
const accepted=new Set(['influenced','built_on','challenged','explained','complemented']);
const causal=new Set(['influenced','built_on','challenged','explained']);
const confidences=new Set(['documented','contextual','complementary']);
let cross=0,intra=0;
for(const link of relations){
 assert.ok(!ids.has(link.id),'Duplicate edge '+link.id);ids.add(link.id);
 const a=byId.get(link.from),b=byId.get(link.to);
 assert.ok(a&&b,'Unknown relation endpoint '+link.id);
 assert.notEqual(link.from,link.to,'Self-edge '+link.id);
 assert.ok(accepted.has(link.type),'Unknown link type '+link.id);
 assert.ok(confidences.has(link.confidence),'Unknown certainty '+link.id);
 assert.ok(link.note.length>42,'Relationship must explain evidence '+link.id);
 assert.ok(link.sources.length,'Missing historical scholarly source '+link.id);
 assert.ok(link.sources.every(x=>/^https:\/\//.test(x)),'Invalid source URL '+link.id);
 if(causal.has(link.type)) assert.ok(a.sort<=b.sort,'Causal relationship must not point back in time: '+link.id);
 if(a.era===b.era)intra++;else cross++;
}
assert.ok(cross>=12&&intra>=8,'Graph needs both intra-path and cross-path links');
const bbox=(a,b)=>a.x<b.x+b.w&&b.x<a.x+a.w&&a.y<b.y+b.h&&b.y<a.y+a.h;
const rects=[L.ROOT];
data.eras.forEach((era,i)=>{
 const parent=L.branch(i);
 assert.ok(!rects.some(r=>bbox(parent,r)),'A main branch collides with another node');
 rects.push(parent);
 const ev=data.events.filter(x=>x.era===era.id).sort((a,b)=>a.sort-b.sort);
 ev.forEach((e,j)=>{
  const box=L.event(i,j);
  assert.ok(!rects.some(r=>bbox(r,box)),'Historical node collision '+e.id);
  rects.push(box);
 });
});
console.log('Research graph passed: '+relations.length+' documented/qualified links ('+cross+' cross-path, '+intra+' within-path), 47 chronological stops, collision-free radial layout.');
