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
  const ROW = 314, FIRST_Y = 170, ROOT = {x:120,y:FIRST_Y+ROW*2.5-85,w:304,h:220};
  const BX = 620, BW = 286, BH = 163, EX = 1040, EW = 292, EH = 180, STEP = 352;
  const worldWidth = 6500, worldHeight = 2260;
  const viewport = document.getElementById('viewport');
  const world = document.getElementById('world');
  const edgeLayer = document.getElementById('edges');
  const nodeLayer = document.getElementById('nodes');
  const modal = document.getElementById('storyOverlay');
  const search = document.getElementById('searchInput');
  const results = document.getElementById('searchResults');
  const routeList = document.getElementById('routeList');
  const status = document.getElementById('statusText');
  const overview = document.getElementById('overviewText');
  const zoomLabel = document.getElementById('zoomLabel');
  const ns = 'http://www.w3.org/2000/svg';
  const opened = new Set();
  const visible = Object.fromEntries(eras.map(era => [era.id,0]));
  let branchesOpen = false, showTerms = false, activePath = null, lastFocus = null;
  let camera = {x:0,y:0,scale:1};
  let pointerStart = null, pointers = new Map(), pinch = null;
  let modalId = null;
  const minZoom=.34, maxZoom=1.55;

  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','&#39;':'&#39;'}[ch] || (ch === "'" ? '&#39;' : ch))); }
  function el(tag, cls, text) { const node=document.createElement(tag); if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node; }
  function attr(node,values) { Object.entries(values).forEach(([key,val])=>node.setAttribute(key,String(val)));return node; }
  function trackY(i) { return FIRST_Y+i*ROW; }
  function eventX(i) { return EX+STEP*i; }
  function currentNodeBounds() {
    const rectangles=[ROOT];
    if(branchesOpen) eras.forEach((era,i)=>{const y=trackY(i);rectangles.push({x:BX,y,w:BW,h:BH});for(let n=0;n<visible[era.id];n++)rectangles.push({x:eventX(n),y,w:EW,h:EH});});
    return {minX:Math.min(...rectangles.map(r=>r.x)),maxX:Math.max(...rectangles.map(r=>r.x+r.w)),minY:Math.min(...rectangles.map(r=>r.y)),maxY:Math.max(...rectangles.map(r=>r.y+r.h))};
  }
  function transform(animate=false) {
    world.style.transition=animate?'transform 520ms cubic-bezier(.22,.68,.1,1)':'none';
    world.style.transform='translate('+camera.x+'px,'+camera.y+'px) scale('+camera.scale+')';
    zoomLabel.textContent=Math.round(camera.scale*100)+'%';
  }
  function centerOn(x,y,zoom,animate=true) {
    const rect=viewport.getBoundingClientRect();
    camera.scale=Math.max(minZoom,Math.min(maxZoom,zoom));
    camera.x=rect.width/2-x*camera.scale;
    camera.y=rect.height/2-y*camera.scale;
    transform(animate);
  }
  function zoomAt(mult,clientX,clientY) {
    const rect=viewport.getBoundingClientRect(),px=clientX-rect.left,py=clientY-rect.top;
    const next=Math.max(minZoom,Math.min(maxZoom,camera.scale*mult));
    const wx=(px-camera.x)/camera.scale,wy=(py-camera.y)/camera.scale;
    camera.scale=next;camera.x=px-wx*next;camera.y=py-wy*next;transform();
  }
  function fit() {
    const r=currentNodeBounds(), rect=viewport.getBoundingClientRect(),pad=110;
    const scale=Math.min(1.02,(rect.width-pad)/(r.maxX-r.minX),(rect.height-pad)/(r.maxY-r.minY));
    centerOn((r.minX+r.maxX)/2,(r.minY+r.maxY)/2,Math.max(minZoom,scale));
  }
  function path(a,b,cls,color,dashed) {
    const p=document.createElementNS(ns,'path');
    const bend=Math.max(75,(b.x-a.x)*.44);
    const d='M '+a.x+' '+a.y+' C '+(a.x+bend)+' '+a.y+', '+(b.x-bend)+' '+b.y+', '+b.x+' '+b.y;
    attr(p,{d,class:cls,fill:'none','stroke':color,'stroke-width':dashed?2:2.6,'stroke-dasharray':dashed?'5 10':'none'});
    edgeLayer.appendChild(p);
  }
  function arc(sx,sy,tx,ty,cls,color,dashed=false) {path({x:sx,y:sy},{x:tx,y:ty},cls,color,dashed);}
  function card(kind,x,y,color) {
    const node=el('div','graph-node '+kind);
    node.style.left=x+'px';node.style.top=y+'px';node.style.setProperty('--node-accent',color);
    return node;
  }
  function button(cls,label,action) {
    const b=el('button',cls,label);b.type='button';b.addEventListener('click',event=>{event.stopPropagation();action();});return b;
  }
  function imageFor(entry,isTerm=false) {
    const data=isTerm?mediaAPI.term(entry.id):mediaAPI.event(entry.id);
    if(!data)return null;
    const image=el('img','node-image');
    image.alt='';
    image.loading='lazy';image.referrerPolicy='no-referrer';
    image.src=mediaAPI.url(data,230);
    image.addEventListener('error',()=>image.parentNode?.classList.add('image-missing'),{once:true});
    return image;
  }
  function render() {
    nodeLayer.replaceChildren();edgeLayer.replaceChildren();
    const root=card('root-node',ROOT.x,ROOT.y,'#426e60');
    root.setAttribute('aria-label','History of the neuron: expand main research paths');
    root.setAttribute('role','button');root.tabIndex=0;
    const k=el('span','node-kicker','THE ROOT OF THE STORY');
    const h=el('h2','root-title','History of the Neuron');
    const p=el('p','root-description','From ancient questions to the modern electrical cell.');
    const bottom=el('div','node-foot');bottom.append(el('span','root-caption',branchesOpen?'6 RESEARCH PATHS':'START THE EXPLORATION'));
    const trigger=button('expand-button primary-expand',branchesOpen?'−':'＋',()=>{branchesOpen=!branchesOpen;if(!branchesOpen)eras.forEach(era=>visible[era.id]=0);render();if(branchesOpen)centerOn(640,ROOT.y+90,.71);else centerOn(ROOT.x+ROOT.w/2,ROOT.y+ROOT.h/2,.98);});
    trigger.setAttribute('aria-label',branchesOpen?'Collapse all research paths':'Reveal the six research paths');
    trigger.setAttribute('aria-expanded',String(branchesOpen));bottom.append(trigger);
    root.append(k,h,p,bottom);
    root.addEventListener('click',e=>{if(!e.target.closest('button'))trigger.click();});
    root.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();trigger.click();}});
    nodeLayer.append(root);
    if(branchesOpen) {
      eras.forEach((era,i)=>{
        const y=trackY(i),selected=activePath===era.id, count=visible[era.id], list=sorted.get(era.id);
        arc(ROOT.x+ROOT.w,ROOT.y+ROOT.h/2,BX,y+BH/2,'main-link',era.color);
        const b=card('branch-node'+(selected?' selected':''),BX,y,era.color);
        b.tabIndex=0;b.setAttribute('role','button');b.setAttribute('aria-label','Toggle '+names[era.id]);
        const top=el('div','branch-top');top.append(el('span','branch-number','PATH '+String(i+1).padStart(2,'0')),el('span','branch-years',era.range));
        b.append(top,el('h3','branch-name',names[era.id]),el('p','branch-description',blurbs[era.id]));
        const base=el('div','branch-bottom');base.append(el('span','node-count',count+' / '+list.length+' MILESTONES'));
        const control=button('expand-button',count?'−':'＋',()=>toggleBranch(era.id));
        control.setAttribute('aria-expanded',String(count>0));control.setAttribute('aria-label',(count?'Collapse ':'Expand ')+names[era.id]);
        base.append(control);b.append(base);
        b.addEventListener('click',e=>{if(!e.target.closest('button'))control.click();});
        b.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();control.click();}});
        nodeLayer.append(b);
        if(!count)return;
        for(let n=0;n<count;n++){
          const event=list[n],x=eventX(n),last=n===count-1;
          if(n===0)arc(BX+BW,y+BH/2,x,y+EH/2,'history-link',era.color);
          else arc(eventX(n-1)+EW,y+EH/2,x,y+EH/2,'history-link',era.color);
          const e=card('event-node',x,y,era.color);
          e.tabIndex=0;e.setAttribute('role','button');
          e.setAttribute('aria-label','Read about '+event.person+', '+event.date+': '+event.title);
          e.addEventListener('click',()=>openStory('event',event.id));
          e.addEventListener('keydown',key=>{if(key.key==='Enter'||key.key===' '){key.preventDefault();openStory('event',event.id);}});
          const top=el('div','event-head');top.append(el('span','event-year',event.date),el('span','event-number',String(n+1).padStart(2,'0')));
          e.append(top);
          const body=el('div','event-body');
          const copy=el('div','event-copy');
          copy.append(el('h4','event-title',event.title),el('p','event-summary',event.summary));
          body.append(copy);
          const thumb=el('div','node-thumb');const img=imageFor(event);if(img)thumb.append(img);else thumb.textContent='✳';body.append(thumb);
          e.append(body);
          const foot=el('div','event-bottom');foot.append(el('span','event-person',event.person),el('span','event-read','READ STORY ↗'));
          e.append(foot);
          if(last&&count<list.length){
            e.classList.add('has-next');
            const more=button('continue-node','＋',()=>revealNext(era.id));
            more.setAttribute('aria-label','Reveal next milestone after '+event.date);
            more.title='Reveal the next milestone';
            e.append(more);
          }
          nodeLayer.append(e);
          if(showTerms) {
            const matches=terms.filter(term=>term.anchor===event.id);
            matches.forEach((term,termIndex)=>{
              const tx=x+6+termIndex*145, ty=y+EH+46;
              arc(x+EW/2,y+EH,tx+67,ty,'term-link','#9b8064',true);
              const tc=card('term-node',tx,ty,'#a68e74');
              tc.append(el('small','','WORD HISTORY'),el('strong','',term.word),el('span','',term.date));
              tc.setAttribute('role','button');tc.tabIndex=0;
              tc.setAttribute('aria-label','Open word history for '+term.word);
              tc.addEventListener('click',()=>openStory('term',term.id));
              tc.addEventListener('keydown',key=>{if(key.key==='Enter'||key.key===' '){key.preventDefault();openStory('term',term.id);}});
              nodeLayer.append(tc);
            });
          }
        }
      });
      // Dotted lines mark conceptual relationships, never asserted direct historical influence.
      const links=[...knowledge.bridges];
      links.forEach(([from,to])=>{
        const a=eventsById.get(from),b=eventsById.get(to);
        if(!a||!b)return;
        const ai=sorted.get(a.era).indexOf(a),bi=sorted.get(b.era).indexOf(b);
        if(ai>=visible[a.era]||bi>=visible[b.era])return;
        const ay=trackY(branchIndex.get(a.era)),by=trackY(branchIndex.get(b.era));
        const ax=eventX(ai)+EW/2,bx=eventX(bi)+EW/2;
        if(Math.abs(ay-by)<10)return;
        arc(ax,ay+EH/2,bx,by+EH/2,'concept-link','#b5aaa0',true);
      });
    }
    renderRouteList();updateStatus();
  }
  function toggleBranch(id) {
    activePath=id;
    visible[id]=visible[id]?0:Math.min(2,sorted.get(id).length);
    render();
    const n=visible[id]?EX+EW/2:BX+BW/2;
    centerOn((BX+n)/2,trackY(branchIndex.get(id))+BH/2,.86);
  }
  function revealNext(id) {
    const list=sorted.get(id);
    visible[id]=Math.min(list.length,visible[id]+1);
    render();
    centerOn(eventX(visible[id]-1)+EW/2,trackY(branchIndex.get(id))+EH/2,.96);
  }
  function openPath(id) {
    branchesOpen=true;activePath=id;if(!visible[id])visible[id]=Math.min(2,sorted.get(id).length);
    render();centerOn((BX+EX+EW/2)/2,trackY(branchIndex.get(id))+EH/2,.88);
  }
  function jumpTo(type,id,read=true) {
    let entry=type==='term'?termsById.get(id):eventsById.get(id);
    if(!entry)return;
    let event=type==='term'?eventsById.get(entry.anchor):entry;
    branchesOpen=true;visible[event.era]=Math.max(visible[event.era],sorted.get(event.era).indexOf(event)+1);
    activePath=event.era;render();
    centerOn(eventX(sorted.get(event.era).indexOf(event))+EW/2,trackY(branchIndex.get(event.era))+EH/2,.98);
    if(read)setTimeout(()=>openStory(type,id),390);
  }
  function renderRouteList() {
    routeList.replaceChildren();
    eras.forEach((era,i)=>{
      const b=button('route-item'+(activePath===era.id?' is-active':''),'',()=>openPath(era.id));
      const dot=el('i','route-dot');dot.style.background=era.color;
      const label=el('span','route-label');label.append(el('b','',names[era.id]),el('small','',sorted.get(era.id).length+' milestones'));
      b.append(dot,label,el('span','route-arrow','↗'));routeList.append(b);
    });
  }
  function updateStatus() {
    const shown=eras.reduce((s,e)=>s+visible[e.id],0);
    overview.textContent=branchesOpen?'6 research paths · '+shown+' of '+events.length+' discoveries revealed':'One story. Six parallel paths.';
    status.textContent=shown+' / '+events.length+' discoveries on canvas';
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
    const all=[...knowledge.strands.flatMap(s=>s.links),...knowledge.bridges,...knowledge.fork.branches.map(from=>[from,knowledge.fork.join])];
    const set=new Map();
    all.forEach(([a,b])=>{if(a===id&&eventsById.has(b))set.set(b,eventsById.get(b));if(b===id&&eventsById.has(a))set.set(a,eventsById.get(a));});
    return [...set.values()].slice(0,7);
  }
  function relatedHtml(events) {
    return events.map(e=>'<button type="button" class="related-link" data-event="'+esc(e.id)+'"><small>'+esc(e.date)+' · '+esc(e.person)+'</small><span>'+esc(e.title)+' <b>↗</b></span></button>').join('');
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
      (relatives.length?'<section class="story-section"><span class="chapter-index">CONNECTED INQUIRIES</span><h3>Follow the scientific question</h3><p class="detail-aside">These links mean related ideas or evidence, not necessarily direct personal influence.</p><div class="related-grid">'+relatedHtml(relatives)+'</div></section>':'')+
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
    e.preventDefault();if(e.ctrlKey||e.metaKey){zoomAt(Math.exp(-e.deltaY*.005),e.clientX,e.clientY);}
    else if(e.shiftKey){camera.x-=e.deltaY;transform();}
    else {camera.x-=e.deltaX;camera.y-=e.deltaY;transform();}
  },{passive:false});
  viewport.addEventListener('pointerdown',e=>{
    if(e.target.closest('button, .root-node, .branch-node, .event-node, .term-node, a, input'))return;
    viewport.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pointers.size===1)pointerStart={x:e.clientX,y:e.clientY,camX:camera.x,camY:camera.y};
    if(pointers.size===2){const p=[...pointers.values()];pinch={dist:Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y),scale:camera.scale};pointerStart=null;}
    viewport.classList.add('dragging');
  });
  viewport.addEventListener('pointermove',e=>{
    if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pointers.size===2&&pinch){const p=[...pointers.values()],dist=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);const mx=(p[0].x+p[1].x)/2,my=(p[0].y+p[1].y)/2;zoomAt((pinch.scale*dist/Math.max(1,pinch.dist))/camera.scale,mx,my);}
    else if(pointerStart){camera.x=pointerStart.camX+e.clientX-pointerStart.x;camera.y=pointerStart.camY+e.clientY-pointerStart.y;transform();}
  });
  function pointerEnd(e){pointers.delete(e.pointerId);if(pointers.size===0){pointerStart=null;pinch=null;viewport.classList.remove('dragging');}else{pointerStart=null;pinch=null;}}
  viewport.addEventListener('pointerup',pointerEnd);viewport.addEventListener('pointercancel',pointerEnd);
  document.getElementById('zoomIn').addEventListener('click',()=>{const r=viewport.getBoundingClientRect();zoomAt(1.2,r.left+r.width/2,r.top+r.height/2);});
  document.getElementById('zoomOut').addEventListener('click',()=>{const r=viewport.getBoundingClientRect();zoomAt(1/1.2,r.left+r.width/2,r.top+r.height/2);});
  document.getElementById('fitView').addEventListener('click',fit);
  document.getElementById('startButton').addEventListener('click',()=>{if(!branchesOpen){branchesOpen=true;render();}centerOn(660,ROOT.y+95,.71);});
  document.getElementById('resetButton').addEventListener('click',()=>{eras.forEach(e=>visible[e.id]=0);branchesOpen=false;activePath=null;render();centerOn(ROOT.x+ROOT.w/2,ROOT.y+ROOT.h/2,.98);});
  document.getElementById('termsToggle').addEventListener('change',e=>{showTerms=e.target.checked;render();});
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
    if(e.key==='+'||e.key==='='){const r=viewport.getBoundingClientRect();zoomAt(1.18,r.left+r.width/2,r.top+r.height/2);}
    if(e.key==='-'){const r=viewport.getBoundingClientRect();zoomAt(1/1.18,r.left+r.width/2,r.top+r.height/2);}
  });
  window.addEventListener('popstate',syncHash);window.addEventListener('hashchange',syncHash);
  window.addEventListener('resize',()=>{if(!branchesOpen)centerOn(ROOT.x+ROOT.w/2,ROOT.y+ROOT.h/2,.95,false);});
  edgeLayer.setAttribute('width',String(worldWidth));edgeLayer.setAttribute('height',String(worldHeight));
  world.style.width=worldWidth+'px';world.style.height=worldHeight+'px';
  render();centerOn(ROOT.x+ROOT.w/2,ROOT.y+ROOT.h/2,.95,false);syncHash();
})();
