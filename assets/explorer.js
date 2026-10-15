(() => {
  'use strict';

  const historyData = window.NEURON_HISTORY;
  const events = historyData.events;
  const eras = historyData.eras;
  const terms = window.NEURON_TERMS.items;
  const mediaAPI = window.NEURON_MEDIA;
  const research = window.NEURON_RESEARCH;
  const knowledge = window.NEURON_GRAPH;
  const eventsById = new Map(events.map(event => [event.id, event]));
  const termsById = new Map(terms.map(term => [term.id, term]));
  const sorted = new Map(eras.map(era => [era.id, events.filter(event => event.era === era.id).sort((a,b) => a.sort - b.sort)]));
  const branchIndex = new Map(eras.map((era,i) => [era.id,i]));
  const names = { roots:'Early ideas & words',anatomy:'Anatomy & function',electricity:'Bioelectricity',cell:'The neuron doctrine',myelin:'Myelin & conduction',ions:'Membranes & ions' };
  const blurbs = {roots:'Where did the concept of the nerve begin?',anatomy:'How did anatomy reveal its structure?',electricity:'What makes nerves and muscles respond?',cell:'How did separate neurons become visible?',myelin:'How do impulses travel so quickly?',ions:'What produces the electrical spike?'};
  const L=window.NEURON_LAYOUT;
  const ROOT=L.ROOT, BW=L.BW, BH=L.BH, EW=L.EW, EH=L.EH;
  const worldWidth=L.worldSize, worldHeight=L.worldSize;
  const chronological=events.map((event,i)=>({...event,order:i})).sort((a,b)=>a.sort-b.sort||a.order-b.order);
  const relations=window.NEURON_RELATIONS||[];
  const relationKinds=window.NEURON_RELATION_KINDS||{};
  const viewport=document.getElementById('viewport');
  const world=document.getElementById('world');
  const edgeLayer=document.getElementById('edges');
  const nodeLayer=document.getElementById('nodes');
  const modal=document.getElementById('storyOverlay');
  const search=document.getElementById('searchInput');
  const results=document.getElementById('searchResults');
  const routeList=document.getElementById('routeList');
  const status=document.getElementById('statusText');
  const overview=document.getElementById('overviewText');
  const zoomLabel=document.getElementById('zoomLabel');
  const journeyPanel=document.getElementById('journeyPanel');
  const relationInspector=document.getElementById('relationInspector');
  const ns='http://www.w3.org/2000/svg';
  const opened=new Set();
  const visible=Object.fromEntries(eras.map(e=>[e.id,0]));
  let branchesOpen=false,showTerms=false,showRelations=true,activePath=null,lastFocus=null;
  let journeyIndex=-1,modalId=null,selectedRelationId=null;
  let journeyOverview=true;
  let camera={x:0,y:0,scale:1},pointerStart=null,pointers=new Map(),pinch=null;
  const minZoom=.075,maxZoom=2.35;
  const cameraPoint=r=>L.center(r);
  const branchRect=id=>L.branch(branchIndex.get(id));
  const eventRect=event=>L.event(branchIndex.get(event.era),sorted.get(event.era).findIndex(e=>e.id===event.id));
  function esc(value){return String(value==null?'':value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
  function attr(node,values){Object.entries(values).forEach(([key,v])=>node.setAttribute(key,String(v)));return node;}
  function currentNodeBounds(){
    const boxes=[ROOT];
    if(branchesOpen)eras.forEach(era=>{
      boxes.push(branchRect(era.id));
      const list=sorted.get(era.id);
      for(let n=0;n<visible[era.id];n++){
        boxes.push(L.event(branchIndex.get(era.id),n));
        if(showTerms)terms.filter(t=>t.anchor===list[n].id).forEach((t,k)=>boxes.push(L.term(branchIndex.get(era.id),n,k)));
      }
    });
    return L.bounds(boxes);
  }
  // Reserve UI margins when framing the canvas, not just its geometric center.
  // This prevents discoveries from hiding behind the left navigation or tour dock.
  function safeFrame(){
    const r=viewport.getBoundingClientRect(),mobile=r.width<700;
    const left=mobile?16:Math.min(300,Math.max(265,r.width*.19));
    const right=mobile?16:40;
    const top=mobile?80:92;
    const bottom=journeyIndex>=0?(mobile?168:154):(mobile?170:60);
    const w=Math.max(120,r.width-left-right),h=Math.max(120,r.height-top-bottom);
    return {width:w,height:h,cx:left+w/2,cy:top+h/2};
  }
  function transform(animate=false){
    world.style.transition=animate?'transform 450ms cubic-bezier(.19, .8, .22, 1)':'none';
    world.style.transform='translate3d('+camera.x+'px,'+camera.y+'px,0) scale('+camera.scale+')';
    zoomLabel.textContent=Math.round(camera.scale*100)+'%';
  }
  function centerOn(x,y,zoom,animate=true){
    const f=safeFrame();
    camera.scale=Math.max(minZoom,Math.min(maxZoom,zoom));
    camera.x=f.cx-x*camera.scale;camera.y=f.cy-y*camera.scale;
    transform(animate);
  }
  function zoomAt(mult,clientX,clientY,smooth=true){
    const r=viewport.getBoundingClientRect(),px=clientX-r.left,py=clientY-r.top;
    const next=Math.max(minZoom,Math.min(maxZoom,camera.scale*mult));
    const wx=(px-camera.x)/camera.scale,wy=(py-camera.y)/camera.scale;
    camera.scale=next;camera.x=px-wx*next;camera.y=py-wy*next;transform(smooth);
  }
  function frameRects(rects,maxScale=1.06,animate=true){
    const b=L.bounds(rects),f=safeFrame(),pad=28;
    const scale=Math.min(maxScale,(f.width-pad*2)/(b.maxX-b.minX),(f.height-pad*2)/(b.maxY-b.minY));
    centerOn((b.minX+b.maxX)/2,(b.minY+b.maxY)/2,Math.max(minZoom,scale),animate);
  }
  function fit(){
    const b=currentNodeBounds();
    frameRects([{x:b.minX,y:b.minY,w:b.maxX-b.minX,h:b.maxY-b.minY}],.99);
  }
  function overviewJourney(){
    if(journeyIndex<0)return;
    journeyOverview=true;
    // Frame every currently revealed element. Orientation remains visible
    // until the reader explicitly chooses Focus or continues the chronology.
    const bounds=currentNodeBounds();
    frameRects([{x:bounds.minX,y:bounds.minY,w:bounds.maxX-bounds.minX,h:bounds.maxY-bounds.minY}],.96);
    updateJourneyView();
  }
  function focusJourney(){
    if(journeyIndex<0)return;
    journeyOverview=false;
    const e=chronological[journeyIndex],index=sorted.get(e.era).findIndex(t=>t.id===e.id);
    const parent=index===0?branchRect(e.era):L.event(branchIndex.get(e.era),index-1);
    frameRects([eventRect(e),parent],1.12);
    updateJourneyView();
  }
  function updateJourneyView(){
    const label=document.getElementById('journeyViewStatus');
    label.textContent=journeyOverview?'Tree overview':'Focused discovery';
    document.getElementById('journeyOverview').setAttribute('aria-pressed',String(journeyOverview));
    document.getElementById('journeyFocus').setAttribute('aria-pressed',String(!journeyOverview));
  }
  function curveBetween(a,b,side=0){
    const dx=b.x-a.x,dy=b.y-a.y,dist=Math.hypot(dx,dy)||1;
    const nx=-dy/dist,ny=dx/dist,wobble=Math.min(85,dist*.11)*(side||1);
    return 'M '+a.x+' '+a.y+' C '+(a.x+dx*.34+nx*wobble)+' '+(a.y+dy*.34+ny*wobble)+', '+(a.x+dx*.68-nx*wobble*.7)+' '+(a.y+dy*.68-ny*wobble*.7)+', '+b.x+' '+b.y;
  }
  function curve(a,b,cls,color,dashed=false,relation=null){
    const p=document.createElementNS(ns,'path');
    const side=relation?((relations.indexOf(relation)%2)?-1:1):1;
    attr(p,{d:curveBetween(a,b,side),class:cls,fill:'none',stroke:color,
      'stroke-width':relation?2.5:3,
      'stroke-dasharray':dashed?'7 10':'none'});
    if(relation){
      p.setAttribute('data-relation',relation.id);
      p.setAttribute('tabindex','0');
      p.setAttribute('role','button');
      p.setAttribute('aria-label',(relationKinds[relation.type]||relation.type)+': '+relation.note);
      const title=document.createElementNS(ns,'title');title.textContent=(relationKinds[relation.type]||relation.type)+': '+relation.note;p.appendChild(title);
      p.addEventListener('click',()=>showRelation(relation));
      p.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();showRelation(relation);}});
    }
    edgeLayer.appendChild(p);return p;
  }
  function card(kind,x,y,color){
    const e=el('div','graph-node '+kind);
    e.style.left=x+'px';e.style.top=y+'px';e.style.setProperty('--node-accent',color);
    return e;
  }
  function button(cls,label,action){
    const b=el('button',cls,label);b.type='button';
    b.addEventListener('click',e=>{e.stopPropagation();action();});return b;
  }
  function imageFor(entry,isTerm=false){
    const data=isTerm?mediaAPI.term(entry.id):mediaAPI.event(entry.id);
    if(!data)return null;
    const im=el('img','node-image');im.alt='';im.loading='lazy';im.referrerPolicy='no-referrer';im.src=mediaAPI.url(data,230);
    im.addEventListener('error',()=>im.parentNode?.classList.add('image-missing'),{once:true});
    return im;
  }
  function shown(event){return branchesOpen && sorted.get(event.era).findIndex(e=>e.id===event.id)<visible[event.era];}
  function render(){
    nodeLayer.replaceChildren();edgeLayer.replaceChildren();
    const root=card('root-node',ROOT.x,ROOT.y,'#b7e3c7');
    root.setAttribute('role','button');root.tabIndex=0;root.setAttribute('aria-label','Toggle the history of the neuron research tree');
    root.append(el('span','node-kicker','THE ROOT OF THE STORY'),el('h2','root-title','History of the Neuron'),el('p','root-description','Explore the experiments and ideas that shaped neuroscience.'));
    const bottom=el('div','node-foot');
    bottom.append(el('span','root-caption',branchesOpen?'SIX LIVING RESEARCH PATHS':'EXPLORE THE TREE'));
    const trigger=button('expand-button primary-expand',branchesOpen?'−':'＋',()=>{
      branchesOpen=!branchesOpen;
      if(!branchesOpen){eras.forEach(e=>visible[e.id]=0);journeyIndex=-1;updateJourney();}
      render();centerOn(L.CENTER.x,L.CENTER.y,branchesOpen?.62:.94);
    });
    trigger.setAttribute('aria-expanded',String(branchesOpen));
    trigger.setAttribute('aria-label',branchesOpen?'Collapse tree':'Expand six research paths');
    bottom.append(trigger);root.append(bottom);
    root.addEventListener('click',e=>{if(!e.target.closest('button'))trigger.click();});
    root.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();trigger.click();}});
    nodeLayer.append(root);
    if(branchesOpen){
      const centers=new Map();
      eras.forEach((era,i)=>{
        const r=L.branch(i),mid=cameraPoint(r),source=cameraPoint(ROOT);
        curve(source,mid,'main-link',era.color,false);
        const b=card('branch-node'+(activePath===era.id?' selected':''),r.x,r.y,era.color);
        b.tabIndex=0;b.setAttribute('role','button');b.setAttribute('aria-label','Toggle '+names[era.id]);
        b.append(el('span','branch-number','PATH '+String(i+1).padStart(2,'0')),el('h3','branch-name',names[era.id]),el('p','branch-description',blurbs[era.id]));
        const base=el('div','branch-bottom');
        base.append(el('span','node-count',visible[era.id]+' / '+sorted.get(era.id).length+' DISCOVERIES'));
        const control=button('expand-button',visible[era.id]?'−':'＋',()=>toggleBranch(era.id));
        control.setAttribute('aria-expanded',String(visible[era.id]>0));
        base.append(control);b.append(base);
        b.addEventListener('click',e=>{if(!e.target.closest('button'))control.click();});
        b.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();control.click();}});
        nodeLayer.append(b);
        for(let n=0;n<visible[era.id];n++){
          const event=sorted.get(era.id)[n],box=L.event(i,n),middle=cameraPoint(box);
          centers.set(event.id,middle);
          const prev=n===0?mid:cameraPoint(L.event(i,n-1));
          curve(prev,middle,'history-link',era.color,false);
          const isCurrent=journeyIndex>=0&&chronological[journeyIndex].id===event.id;
          const e=card('event-node'+(isCurrent?' journey-current':''),box.x,box.y,era.color);
          e.dataset.id=event.id;e.tabIndex=0;e.setAttribute('role','button');
          e.setAttribute('aria-label','Read '+event.title+' by '+event.person+' '+event.date);
          e.addEventListener('click',()=>openStory('event',event.id));
          e.addEventListener('keydown',key=>{if(key.key==='Enter'||key.key===' '){key.preventDefault();openStory('event',event.id);}});
          const head=el('div','event-head');
          head.append(el('span','event-year',event.date),el('span','event-number',String(n+1).padStart(2,'0')));
          e.append(head);
          const body=el('div','event-body'),copy=el('div','event-copy');
          copy.append(el('h4','event-title',event.title),el('p','event-summary',event.summary));
          const thumb=el('div','node-thumb'),img=imageFor(event);
          if(img)thumb.append(img);else thumb.textContent='✳';
          body.append(copy,thumb);e.append(body);
          const foot=el('div','event-bottom');
          foot.append(el('span','event-person',event.person),el('span','event-read','READ ↗'));e.append(foot);
          if(n===visible[era.id]-1 && visible[era.id]<sorted.get(era.id).length){
            e.classList.add('has-next');
            const more=button('continue-node','＋',()=>revealNext(era.id));
            more.setAttribute('aria-label','Reveal next milestone after '+event.date);
            e.append(more);
          }
          nodeLayer.append(e);
          if(showTerms)terms.filter(t=>t.anchor===event.id).forEach((term,k)=>{
            const tp=L.term(i,n,k);
            curve(middle,cameraPoint(tp),'term-link','#bda178',true);
            const tc=card('term-node',tp.x,tp.y,'#bda178');
            tc.append(el('small','','WORD HISTORY'),el('strong','',term.word),el('span','',term.date));
            tc.setAttribute('role','button');tc.tabIndex=0;
            tc.addEventListener('click',()=>openStory('term',term.id));
            tc.addEventListener('keydown',key=>{if(key.key==='Enter'||key.key===' '){key.preventDefault();openStory('term',term.id);}});
            nodeLayer.append(tc);
          });
        }
      });
      if(showRelations)relations.forEach(relation=>{
        const a=centers.get(relation.from),b=centers.get(relation.to);
        if(!a||!b)return;
        const cross=eventsById.get(relation.from).era!==eventsById.get(relation.to).era;
        const complementary=relation.type==='complemented';
        curve(a,b,'scientific-link '+(cross?'cross-path':'same-path')+' '+(complementary?'complementary':'causal')+
          (relation.id===selectedRelationId?' relation-active':''),complementary?'#b8a1d8':'#62d2bc',complementary,relation);
      });
      if(journeyIndex>0){
        const previous=centers.get(chronological[journeyIndex-1].id);
        const current=centers.get(chronological[journeyIndex].id);
        if(previous&&current)curve(previous,current,'journey-link','#f4c67a',true);
      }
    }
    renderRouteList();updateStatus();
  }
  function focusRect(rect,zoom=.9){const p=cameraPoint(rect);centerOn(p.x,p.y,zoom);}
  function toggleBranch(id){
    journeyIndex=-1;updateJourney();activePath=id;branchesOpen=true;
    visible[id]=visible[id]?0:Math.min(2,sorted.get(id).length);
    render();focusRect(visible[id]?L.event(branchIndex.get(id),0):branchRect(id),.82);
  }
  function revealNext(id){
    const list=sorted.get(id);visible[id]=Math.min(list.length,visible[id]+1);
    render();focusRect(L.event(branchIndex.get(id),visible[id]-1),.96);
  }
  function openPath(id){
    branchesOpen=true;activePath=id;
    if(!visible[id])visible[id]=Math.min(2,sorted.get(id).length);
    render();focusRect(L.event(branchIndex.get(id),0),.8);
  }
  function jumpTo(type,id,read=true){
    const entry=type==='term'?termsById.get(id):eventsById.get(id);
    if(!entry)return;
    const event=type==='term'?eventsById.get(entry.anchor):entry;
    branchesOpen=true;
    visible[event.era]=Math.max(visible[event.era],sorted.get(event.era).findIndex(x=>x.id===event.id)+1);
    activePath=event.era;render();focusRect(eventRect(event),.92);
    if(read)setTimeout(()=>openStory(type,id),350);
  }
  function renderRouteList(){
    routeList.replaceChildren();
    eras.forEach(era=>{
      const b=button('route-item'+(activePath===era.id?' is-active':''),'',()=>openPath(era.id));
      const dot=el('i','route-dot');dot.style.background=era.color;
      const label=el('span','route-label');
      label.append(el('b','',names[era.id]),el('small','',sorted.get(era.id).length+' milestones'));
      b.append(dot,label,el('span','route-arrow','↗'));routeList.append(b);
    });
  }
  function updateStatus(){
    const n=eras.reduce((sum,e)=>sum+visible[e.id],0);
    overview.textContent=branchesOpen?'Six branches · '+n+' of 47 milestones revealed':'Six connected fields of discovery';
    status.textContent=n+' / '+events.length+' discoveries revealed';
  }
  function updateJourney(){
    if(journeyIndex<0){journeyPanel.hidden=true;document.body.classList.remove('tour-active');document.getElementById('journeyLaunch').setAttribute('aria-pressed','false');return;}
    const e=chronological[journeyIndex];
    journeyPanel.hidden=false;
    document.body.classList.add('tour-active');
    document.getElementById('journeyLaunch').setAttribute('aria-pressed','true');
    document.getElementById('journeyProgress').textContent=(journeyIndex+1)+' / '+chronological.length;
    document.getElementById('journeyCategory').textContent=names[e.era];
    document.getElementById('journeyDate').textContent=e.date;
    document.getElementById('journeyTitle').textContent=e.title;
    const earlier=new Set(chronological.slice(0,journeyIndex).map(p=>p.id));
    const links=relations.filter(r=>(r.to===e.id&&earlier.has(r.from)) || (r.type==='complemented'&&r.from===e.id&&earlier.has(r.to)));
    const link=links.find(r=>r.confidence==='documented')||links[0];
    document.getElementById('journeyEvidence').textContent=link?
      (relationKinds[link.type]||'Related inquiry')+': '+link.note:
      'Chronological transition: this research may overlap other branches. No direct scientific influence is asserted.';
    const linkOut=document.getElementById('journeyEvidenceLink');
    linkOut.hidden=!link;
    if(link)linkOut.href=link.sources[0];
    document.getElementById('journeyBar').value=journeyIndex+1;
    document.getElementById('journeyPrevious').disabled=journeyIndex===0;
    document.getElementById('journeyNext').disabled=journeyIndex===chronological.length-1;
    document.getElementById('journeyNext').textContent=journeyIndex===chronological.length-1?'Done ✓':'Next →';
    updateJourneyView();
  }
  function journeyGo(index,showOverview=false){
    if(index<0||index>=chronological.length)return;
    journeyIndex=index;journeyOverview=showOverview;const e=chronological[index];
    branchesOpen=true;activePath=e.era;
    chronological.slice(0,index+1).forEach(step=>{
      visible[step.era]=Math.max(visible[step.era],sorted.get(step.era).findIndex(n=>n.id===step.id)+1);
    });
    render();updateJourney();
    if(showOverview)overviewJourney();else focusJourney();
  }
  function showRelation(relation){
    selectedRelationId=relation.id;
    const a=eventsById.get(relation.from),b=eventsById.get(relation.to);
    document.getElementById('relationKind').textContent=relationKinds[relation.type]||relation.type;
    document.getElementById('relationNames').textContent=a.person+' ↔ '+b.person;
    document.getElementById('relationNote').textContent=relation.note;
    document.getElementById('relationCertainty').textContent=
      relation.confidence==='documented'?'Documented historical relationship':
      relation.confidence==='contextual'?'Contextual historical link':'Complementary evidence — no direct influence claimed';
    const sources=document.getElementById('relationSources');
    sources.replaceChildren();
    relation.sources.forEach((url,i)=>{const a=el('a','relation-source','Research source '+(i+1)+' ↗');a.href=url;a.target='_blank';a.rel='noopener noreferrer';sources.append(a);});
    relationInspector.hidden=false;
    document.getElementById('relationFrom').onclick=()=>jumpTo('event',relation.from,false);
    document.getElementById('relationTo').onclick=()=>jumpTo('event',relation.to,false);
    render();
  }

  function safeUrl(value) {return /^https:\/\//.test(value)?value:'#';}
  function sourceRows(ids,allRefs) {
    return ids.map((id,i)=>{
      const ref=allRefs[id];if(!ref)return '';
      const type=/^(A\d+|G2)$/.test(id)?'PRIMARY PUBLICATION':'HISTORICAL / SCHOLARLY RESOURCE';
      return '<li class="citation"><div class="citation-number">'+String(i+1).padStart(2,'0')+'</div><div><small>'+type+' · '+esc(id)+'</small><a href="'+esc(safeUrl(ref.url))+'" target="_blank" rel="noopener noreferrer">'+esc(ref.label)+' <span>↗</span></a></div></li>';
    }).join('');
  }
  function figure(media) {
    if(!media)return '<div class="story-empty-media">No event-specific archive image is assigned to this milestone.</div>';
    return '<figure class="story-figure"><div class="story-image-frame"><img src="'+esc(mediaAPI.url(media,1100))+'" alt="'+esc(media.caption)+'" referrerpolicy="no-referrer"><span class="media-fallback">Image unavailable · use the source link below</span></div><figcaption><b>'+esc(media.type)+'</b><span>'+esc(media.caption)+'</span><a href="'+esc(safeUrl(mediaAPI.source(media)))+'" target="_blank" rel="noopener noreferrer">Image provenance & reuse terms ↗</a><small>'+esc(media.credit)+'</small></figcaption></figure>';
  }
  function referencesFor(id) {
    return relations.filter(r=>r.from===id||r.to===id)
      .map(r=>({...r,other:eventsById.get(r.from===id?r.to:r.from)}));
  }
  function relatedHtml(items) {
    return items.map(r=>
      '<div class="relation-story-card"><small>'+esc(relationKinds[r.type]||r.type)+' · '+esc(r.confidence)+'</small>'+
      '<button type="button" class="related-link" data-event="'+esc(r.other.id)+'"><span>'+esc(r.other.date)+' · '+esc(r.other.title)+' ↗</span></button>'+
      '<p>'+esc(r.note)+'</p>'+
      '<div class="relation-story-sources">'+r.sources.map((url,i)=>
        '<a target="_blank" rel="noopener noreferrer" href="'+esc(safeUrl(url))+'">Research source '+(i+1)+' ↗</a>').join('')+'</div></div>'
    ).join('');
  }
  function eventHtml(event) {
    const r=research[event.id];
    const era=eras.find(era=>era.id===event.era);
    const media=mediaAPI.event(event.id);
    const refs=sourceRows(event.refs,historyData.references);
    const relatives=referencesFor(event.id);
    const relatedTerms=terms.filter(t=>t.anchor===event.id);
    return '<div class="story-top" style="--story-accent:'+esc(era.color)+'">'+
      '<div class="story-intro"><p class="story-eyebrow">HISTORICAL RESEARCH · '+esc(names[event.era])+'</p>'+
      '<p class="story-date">'+esc(event.date)+' <span>·</span> '+esc(event.person)+'</p>'+
      '<h2 id="storyTitle">'+esc(event.title)+'</h2><p class="story-lead">'+esc(event.summary)+'</p>'+
      '<div class="story-mini-tags"><span>'+esc(r?.kind || 'Historical milestone')+'</span><span>'+event.refs.length+' cited resources</span></div></div>'+
      figure(media)+'</div>'+
      '<nav class="story-nav" aria-label="Sections"><a href="#story-context">Context</a><a href="#story-experiment">The investigation</a><a href="#story-finding">Discovery</a><a href="#story-sources">Sources</a></nav>'+
      '<div class="story-contents">'+
      '<section class="story-section" id="story-context"><span class="chapter-index">01 / THE CONTEXT</span><h3>Why did this question matter?</h3><p>'+esc(r?.background || event.summary)+'</p>'+
      '<div class="question-highlight"><small>THE RESEARCH QUESTION</small><p>'+esc(event.question)+'</p></div></section>'+
      '<section class="story-section" id="story-experiment"><span class="chapter-index">02 / HOW WE KNOW</span><h3>Inside the investigation</h3><p>'+esc(event.method)+'</p>'+
      (r?'<p>'+esc(r.procedure)+'</p>':'')+
      '<ol class="method-list">'+event.steps.map((step,i)=>'<li><span>'+String(i+1).padStart(2,'0')+'</span><p>'+esc(step)+'</p></li>').join('')+'</ol></section>'+
      '<section class="story-section" id="story-finding"><span class="chapter-index">03 / WHAT CHANGED</span><h3>The evidence & discovery</h3>'+
      '<div class="finding-grid"><div><small>OBSERVATION</small><p>'+esc(event.observation)+'</p></div><div><small>INTERPRETATION</small><p>'+esc(r?.answer || event.result)+'</p></div></div>'+
      '<h4>What the research established</h4><p>'+esc(event.result)+'</p>'+
      '<h4>Limits of the evidence</h4><p>'+esc(event.limitation)+'</p>'+
      (r?'<div class="caution-box"><b>EVIDENCE NOTE</b><p>'+esc(r.strength)+'</p><p>'+esc(r.caution)+'</p></div>':'')+
      '<div class="next-question"><small>THE NEXT QUESTION</small><p>'+esc(event.next)+'</p></div></section>'+
      (relatedTerms.length?'<section class="story-section"><span class="chapter-index">LANGUAGE HISTORY</span><h3>The words behind the discovery</h3><div class="related-grid">'+relatedTerms.map(t=>'<button class="related-link" data-term="'+esc(t.id)+'"><small>'+esc(t.date)+'</small><span>'+esc(t.word)+' ↗</span></button>').join('')+'</div></section>':'')+
      (relatives.length?'<section class="story-section"><span class="chapter-index">CONNECTED INQUIRIES</span><h3>Follow the scientific question</h3><p class="detail-aside">Each link identifies its scientific relationship, evidence and source. Complementary evidence does not imply direct influence.</p><div class="related-grid">'+relatedHtml(relatives)+'</div></section>':'')+
      '<section class="story-section" id="story-sources"><span class="chapter-index">04 / SOURCE TRAIL</span><h3>Research references</h3><p class="detail-aside">References are attached to this specific milestone. Open the original publications or historical scholarship to evaluate the claim; a link alone is not proof of independent fact-checking.</p>'+
      (r?'<p class="source-note">Editorial reading notes: '+esc(r.source)+'</p>':'')+
      '<ol class="citations">'+refs+'</ol></section></div>';
  }
  function termHtml(term) {
    const media=mediaAPI.term(term.id);
    return '<div class="story-top term-top"><div class="story-intro"><p class="story-eyebrow">SCIENTIFIC LANGUAGE · WORD HISTORY</p><p class="story-date">'+esc(term.date)+(term.exactDate?'':' · approximate')+'</p><h2 id="storyTitle">'+esc(term.word)+'</h2><p class="story-lead">'+esc(term.transition)+'</p><div class="story-mini-tags"><span>'+esc(term.kind)+'</span></div></div>'+figure(media)+'</div>'+
    '<div class="story-contents"><section class="story-section"><span class="chapter-index">01 / ORIGIN</span><h3>Where did the word come from?</h3><p>'+esc(term.origin)+'</p><p>'+esc(term.story)+'</p></section>'+
    '<section class="story-section"><span class="chapter-index">02 / LANGUAGE TIMELINE</span><h3>How its meaning changed</h3><ol class="method-list">'+term.lineage.map((part,i)=>'<li><span>'+String(i+1).padStart(2,'0')+'</span><p><b>'+esc(part.when)+' · '+esc(part.term)+'</b> — '+esc(part.meaning)+'</p></li>').join('')+'</ol>'+
    '<div class="caution-box"><b>HISTORICAL CAUTION</b><p>'+esc(term.caution)+'</p></div></section>'+
    '<section class="story-section" id="story-sources"><span class="chapter-index">03 / REFERENCES</span><h3>Sources & further reading</h3><ol class="citations">'+sourceRows(term.refs,window.NEURON_TERMS.references)+'</ol></section></div>';
  }
  function openStory(type,id,fromUrl=false) {
    const item=type==='term'?termsById.get(id):eventsById.get(id);
    if(!item)return;
    const key=type+':'+id;modalId=key;lastFocus=document.activeElement;
    document.getElementById('storyContent').innerHTML=type==='term'?termHtml(item):eventHtml(item);
    modal.hidden=false;document.body.classList.add('modal-open');
    const scroll=document.getElementById('storyScroll');scroll.scrollTop=0;
    scroll.querySelector('.story-figure img')?.addEventListener('error',e=>e.target.closest('.story-image-frame').classList.add('failed'),{once:true});
    const close=document.getElementById('closeStory');close.focus();
    try {
      const old=JSON.parse(localStorage.getItem('neuron-reading-v1')||'{}');
      const set=new Set(Array.isArray(old.opened)?old.opened:[]);
      set.add(key);localStorage.setItem('neuron-reading-v1',JSON.stringify({opened:[...set],last:key}));
    } catch (_) { /* private browsing can disable storage */ }
    if(!fromUrl)history.pushState({story:key},'',location.pathname+location.search+'#'+encodeURIComponent(key));
  }
  function closeStory(changeUrl=true) {
    if(modal.hidden)return;
    modal.hidden=true;modalId=null;document.body.classList.remove('modal-open');
    if(changeUrl && location.hash)history.replaceState({},'',location.pathname+location.search);
    if(lastFocus&&lastFocus.isConnected)lastFocus.focus();
  }
  function syncHash() {
    let hash='';
    try { hash=decodeURIComponent(location.hash.slice(1)); } catch (_) { closeStory(false);return; }
    const legacyEvent=hash.startsWith('event-')&&eventsById.has(hash.slice(6));
    const legacyTerm=hash.startsWith('term-')&&termsById.has(hash.slice(5));
    const type=hash.startsWith('event:')||legacyEvent?'event':hash.startsWith('term:')||legacyTerm?'term':null;
    const id=type?hash.slice(6):null;
    if(type && (type==='event'?eventsById:termsById).has(id)) {
      const entry=type==='event'?eventsById.get(id):termsById.get(id);
      const node=type==='event'?entry:eventsById.get(entry.anchor);
      if(!branchesOpen||!visible[node.era])jumpTo(type,id,false);
      openStory(type,id,true);
    } else closeStory(false);
  }
  function searchMatches(value) {
    const term=value.trim().toLocaleLowerCase();if(!term)return [];
    const ev=events.filter(e=>[e.title,e.person,e.date,e.question,e.summary,names[e.era]].join(' ').toLocaleLowerCase().includes(term)).map(e=>({type:'event',item:e}));
    const words=terms.filter(t=>[t.word,t.date,t.origin,t.current,t.former].join(' ').toLocaleLowerCase().includes(term)).map(item=>({type:'term',item}));
    return [...ev,...words].slice(0,12);
  }
  function drawSearch() {
    results.replaceChildren();
    const matches=searchMatches(search.value);
    if(!search.value.trim()){results.hidden=true;return;}
    results.hidden=false;
    if(!matches.length){results.append(el('p','no-results','No matching discoveries. Try a scientist, concept, or year.'));return;}
    matches.forEach(({type,item})=>{
      const btn=button('search-result','',()=>{results.hidden=true;search.value='';jumpTo(type,item.id);});
      btn.append(el('small','',item.date+' · '+(type==='term'?'Word history':names[item.era])),el('strong','',type==='term'?item.word:item.title));
      results.append(btn);
    });
  }
  viewport.addEventListener('wheel',e=>{
    e.preventDefault();
    if(e.ctrlKey||e.metaKey)zoomAt(Math.exp(-e.deltaY*.0032),e.clientX,e.clientY,true);
    else {
      const factor=e.deltaMode===1?15:e.deltaMode===2?100:1;
      if(e.shiftKey){camera.x-=e.deltaY*factor;transform();}
      else {camera.x-=e.deltaX*factor;camera.y-=e.deltaY*factor;transform();}
    }
  },{passive:false});
  viewport.addEventListener('pointerdown',e=>{
    if(e.target.closest('button, .root-node, .branch-node, .event-node, .term-node, a, input, .scientific-link'))return;
    viewport.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pointers.size===1)pointerStart={x:e.clientX,y:e.clientY,camX:camera.x,camY:camera.y};
    if(pointers.size===2){const p=[...pointers.values()];pinch={dist:Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y),scale:camera.scale};pointerStart=null;}
    viewport.classList.add('dragging');
  });
  viewport.addEventListener('pointermove',e=>{
    if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pointers.size===2&&pinch){const p=[...pointers.values()],dist=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);const mx=(p[0].x+p[1].x)/2,my=(p[0].y+p[1].y)/2;zoomAt((pinch.scale*dist/Math.max(1,pinch.dist))/camera.scale,mx,my,false);}
    else if(pointerStart){camera.x=pointerStart.camX+e.clientX-pointerStart.x;camera.y=pointerStart.camY+e.clientY-pointerStart.y;transform();}
  });
  function pointerEnd(e){pointers.delete(e.pointerId);if(pointers.size===0){pointerStart=null;pinch=null;viewport.classList.remove('dragging');}else{pointerStart=null;pinch=null;}}
  viewport.addEventListener('pointerup',pointerEnd);viewport.addEventListener('pointercancel',pointerEnd);
  document.getElementById('zoomIn').addEventListener('click',()=>{const r=viewport.getBoundingClientRect();zoomAt(1.2,r.left+r.width/2,r.top+r.height/2);});
  document.getElementById('zoomOut').addEventListener('click',()=>{const r=viewport.getBoundingClientRect();zoomAt(1/1.2,r.left+r.width/2,r.top+r.height/2);});
  document.getElementById('fitView').addEventListener('click',()=>{if(journeyIndex>=0)overviewJourney();else fit();});
  document.getElementById('startButton').addEventListener('click',()=>{if(!branchesOpen){branchesOpen=true;render();}centerOn(L.CENTER.x,L.CENTER.y,.62);});
  document.getElementById('resetButton').addEventListener('click',()=>{eras.forEach(e=>visible[e.id]=0);branchesOpen=false;activePath=null;journeyIndex=-1;selectedRelationId=null;relationInspector.hidden=true;updateJourney();render();centerOn(L.CENTER.x,L.CENTER.y,.94);});
  document.getElementById('termsToggle').addEventListener('change',e=>{showTerms=e.target.checked;render();});
  document.getElementById('journeyLaunch').addEventListener('click',()=>journeyGo(0,true));
  document.getElementById('journeyPrevious').addEventListener('click',()=>journeyGo(journeyIndex-1));
  document.getElementById('journeyNext').addEventListener('click',()=>journeyGo(journeyIndex+1));
  document.getElementById('journeyRead').addEventListener('click',()=>{if(journeyIndex>=0)openStory('event',chronological[journeyIndex].id);});
  document.getElementById('journeyOverview').addEventListener('click',overviewJourney);
  document.getElementById('journeyFocus').addEventListener('click',focusJourney);
  document.getElementById('journeyExit').addEventListener('click',()=>{journeyIndex=-1;updateJourney();render();});
  document.getElementById('journeyBar').addEventListener('input',e=>journeyGo(Number(e.target.value)-1));
  document.getElementById('relationsToggle').addEventListener('change',e=>{showRelations=e.target.checked;render();});
  document.getElementById('relationClose').addEventListener('click',()=>{relationInspector.hidden=true;selectedRelationId=null;render();});
  document.getElementById('closeStory').addEventListener('click',()=>closeStory());
  modal.addEventListener('click',e=>{
    const jump=e.target.closest('.story-nav a');
    if(jump){e.preventDefault();document.getElementById('storyScroll').querySelector(jump.getAttribute('href'))?.scrollIntoView({behavior:'smooth',block:'start'});return;}
    if(e.target===modal||e.target.closest('[data-dismiss]'))closeStory();const linked=e.target.closest('[data-event], [data-term]');if(linked){const type=linked.dataset.event?'event':'term',id=linked.dataset.event||linked.dataset.term;openStory(type,id);}});
  search.addEventListener('input',drawSearch);
  search.addEventListener('keydown',e=>{if(e.key==='Enter'){const first=searchMatches(search.value)[0];if(first){results.hidden=true;search.value='';jumpTo(first.type,first.item.id);}}if(e.key==='Escape'){results.hidden=true;search.blur();}});
  document.addEventListener('click',e=>{if(!e.target.closest('.search-area'))results.hidden=true;});
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){if(!modal.hidden)closeStory();else results.hidden=true;return;}
    if(!modal.hidden)return;
    if(e.key==='/'&&document.activeElement!==search){e.preventDefault();search.focus();return;}
    if(e.target.matches('input, textarea'))return;
    if(journeyIndex>=0 && e.key==='ArrowRight'){e.preventDefault();journeyGo(journeyIndex+1);}
    if(journeyIndex>=0 && e.key==='ArrowLeft'){e.preventDefault();journeyGo(journeyIndex-1);}
    if(e.key==='+'||e.key==='='){const r=viewport.getBoundingClientRect();zoomAt(1.18,r.left+r.width/2,r.top+r.height/2);}
    if(e.key==='-'){const r=viewport.getBoundingClientRect();zoomAt(1/1.18,r.left+r.width/2,r.top+r.height/2);}
  });
  window.addEventListener('popstate',syncHash);window.addEventListener('hashchange',syncHash);
  window.addEventListener('resize',()=>{if(journeyIndex>=0){if(journeyOverview)overviewJourney();else focusJourney();}else if(!branchesOpen)centerOn(L.CENTER.x,L.CENTER.y,.9,false);});
  edgeLayer.setAttribute('width',String(worldWidth));edgeLayer.setAttribute('height',String(worldHeight));
  world.style.width=worldWidth+'px';world.style.height=worldHeight+'px';
  render();updateJourney();centerOn(L.CENTER.x,L.CENTER.y,.88,false);syncHash();
})();
