// Browser-free interaction checks for the GitHub Pages explorer.
// These cover content integrity and event wiring; manual visual QA is still required.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
class Element {
  constructor(tag='div') {
    this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.listeners={};this.style={setProperty(){}};
    this.classList={add(){},remove(){}};this.innerHTML='';this.textContent='';this.hidden=false;this.value='';this.checked=false;this.isConnected=true;
  }
  append(...items){this.children.push(...items);items.forEach(child=>{child.parentNode=this;});}
  appendChild(item){this.append(item);return item;}
  replaceChildren(...items){this.children=[];this.append(...items);}
  addEventListener(name,fn){this.listeners[name]=fn;}
  setAttribute(name,value){this[name]=value;}
  getBoundingClientRect(){return {left:0,top:0,width:1440,height:900};}
  focus(){}
  querySelector(){return null;}
  closest(){return null;}
  click(){this.listeners.click?.({target:this,stopPropagation(){},preventDefault(){}});}
  dispatch(name,extra={}){this.listeners[name]?.({target:this,stopPropagation(){},preventDefault(){},...extra});}
}
const elements={}, listeners={};
const context={
  window:{addEventListener(type,fn){listeners[type]=fn;}},
  document:{
    body:new Element('body'),activeElement:new Element('body'),
    getElementById(id){return elements[id] ||= new Element(id);},
    createElement:tag=>new Element(tag),
    createElementNS:(_ns,tag)=>new Element(tag),
    addEventListener(type,fn){listeners[type]=fn;}
  },
  localStorage:{getItem(){return null;},setItem(){}},
  location:{pathname:'/tree-of-neuron/',search:'',hash:''},
  history:{pushState(_a,_b,url){context.location.hash=url.includes('#')?url.slice(url.indexOf('#')):'';},replaceState(_a,_b,url){context.location.hash=url.includes('#')?url.slice(url.indexOf('#')):'';}},
  URLSearchParams,setTimeout:fn=>fn()
};
for (const file of ['data','research','terms','graph','visuals','media','organic-layout','relations','explorer']) {
  vm.runInNewContext(fs.readFileSync('assets/'+file+'.js','utf8'),context,{filename:file+'.js'});
}
const data=context.window.NEURON_HISTORY,terms=context.window.NEURON_TERMS.items;
assert.equal(elements.nodes.children.length,1,'Only root at startup');
assert.equal(elements.routeList.children.length,6,'Six parallel paths');
assert.equal(elements.journeyPanel.hidden,true,'Guided chronology begins closed');
const root=elements.nodes.children[0];
root.children.at(-1).children.at(-1).click();
assert.equal(elements.nodes.children.filter(n=>n.className.includes('branch-node')).length,6);
const firstBranch=elements.nodes.children.find(n=>n.className.includes('branch-node'));
firstBranch.children.at(-1).children.at(-1).click();
assert.equal(elements.nodes.children.filter(n=>n.className.includes('event-node')).length,2,'First two chronological discoveries are visible');
let last=elements.nodes.children.filter(n=>n.className.includes('event-node')).at(-1);
last.children.at(-1).click();
assert.equal(elements.nodes.children.filter(n=>n.className.includes('event-node')).length,3,'Next milestone revealed');
const first=elements.nodes.children.find(n=>n.className.includes('event-node'));
first.click();
assert.equal(elements.storyOverlay.hidden,false);
assert.match(elements.storyContent.innerHTML,/THE RESEARCH QUESTION/);
assert.match(elements.storyContent.innerHTML,/Inside the investigation/);
assert.match(elements.storyContent.innerHTML,/Image provenance &amp; reuse terms|Image provenance & reuse terms/);
assert.match(elements.storyContent.innerHTML,/SOURCE TRAIL/);
elements.closeStory.click();assert.equal(elements.storyOverlay.hidden,true);
elements.termsToggle.checked=true;
elements.termsToggle.dispatch('change');
assert.ok(elements.nodes.children.some(n=>n.className.includes('term-node')),'Word history chip attached');
elements.searchInput.value='Hodgkin';
elements.searchInput.dispatch('input');
assert.ok(elements.searchResults.children.length>0,'Search results populated');
elements.searchResults.children[0].click();
assert.equal(elements.storyOverlay.hidden,false,'Search reveals an event and its narrative');
assert.match(elements.storyContent.innerHTML,/Research references/);
elements.closeStory.click();
const allRefs=data.references;
for(const event of data.events){
  assert.ok(event.refs.length,'Missing reference for '+event.id);
  event.refs.forEach(id=>assert.ok(/^https:\/\//.test(allRefs[id].url),'Broken source URL data: '+id));
  assert.ok(context.window.NEURON_MEDIA.event(event.id),'Missing event image '+event.id);
}
for(const term of terms){
  assert.ok(term.refs.length,'Missing term references '+term.id);
  assert.ok(context.window.NEURON_MEDIA.term(term.id),'Missing word history illustration '+term.id);
}
assert.equal(data.events.length,47);assert.equal(terms.length,16);
elements.journeyLaunch.click();
assert.equal(elements.journeyPanel.hidden,false,'Chronological guide opens');
assert.equal(elements.journeyProgress.textContent,'1 / 47');
elements.journeyNext.click();
assert.equal(elements.journeyProgress.textContent,'2 / 47');
elements.journeyBar.value=47;elements.journeyBar.dispatch('input');
assert.equal(elements.journeyProgress.textContent,'47 / 47','All discoveries are reachable');
assert.equal(elements.journeyNext.disabled,true,'Final step stops forward movement');
elements.journeyExit.click();
assert.equal(elements.journeyPanel.hidden,true,'Guide exits without deleting open paths');
assert.ok(context.window.NEURON_RELATIONS.length>=25,'Scientific relationships loaded');
console.log('Explorer checks passed: progressive paths, node stories, search, citations, 47 milestones, 16 word histories.');
