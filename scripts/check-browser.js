// Real Chromium smoke test. Run after starting the local Python web server.
// playwright-core is used only in CI; it is not a website dependency.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright-core');
const origin=process.env.TEST_BASE_URL||'http://127.0.0.1:8989';
const chrome=process.env.CHROME_PATH||'/usr/bin/google-chrome';
const path=require('node:path');
const screenshots=path.join(process.cwd(),'screenshots');
fs.mkdirSync(screenshots,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:chrome,args:['--no-sandbox','--disable-dev-shm-usage']});
 try {
  async function run(width,height,label){
   const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1});
   const page=await context.newPage();const exceptions=[];
   page.on('pageerror',e=>exceptions.push(e.message));
   await page.goto(origin+'/index.html',{waitUntil:'domcontentloaded'});
   await page.locator('.root-node').waitFor({timeout:10000});
   assert.equal(await page.locator('.graph-node').count(),1,label+' initially has just the root');
   assert.equal(await page.locator('.route-item').count(),6,label+' shows six paths');
   await page.screenshot({path:path.join(screenshots,label+'-root.png'),animations:'disabled'});
   await page.locator('.root-node').click();
   assert.equal(await page.locator('.branch-node').count(),6,label+' opens six paths');
   await page.locator('.route-item').nth(2).click();
   assert.equal(await page.locator('.event-node').count(),2,label+' shows two dated milestones');
   const event=page.locator('.event-node').first();
   await event.click();
   await page.locator('#storyOverlay:not([hidden])').waitFor();
   assert.equal(await page.locator('#storyTitle').count(),1);
   assert.ok((await page.locator('#storyContent').innerText()).includes('Inside the investigation'));
   assert.ok((await page.locator('#storyContent').innerText()).includes('Research references'));
   assert.ok((await page.locator('#storyContent .story-figure a').first().getAttribute('href')).startsWith('https://commons.wikimedia.org/'));
   await page.screenshot({path:path.join(screenshots,label+'-story.png'),animations:'disabled'});
   await page.locator('#closeStory').click();
   assert.equal(await page.locator('#storyOverlay[hidden]').count(),1,label+' modal closes');
   await page.locator('.continue-node').evaluate(button=>button.click());
   assert.equal(await page.locator('.event-node').count(),3,label+' unfolds another milestone');
   const outside=await page.locator('.graph-node').evaluateAll(cards=>cards.map(card=>{
    const text=[...card.querySelectorAll('h2,h3,h4,p,.node-foot,.branch-bottom,.event-head,.event-body,.event-bottom')];
    return {type:card.className,overflowY:card.scrollHeight-card.clientHeight,overflowX:card.scrollWidth-card.clientWidth,
      children:text.filter(c=>{const a=c.getBoundingClientRect(),b=card.getBoundingClientRect();
        return a.right>b.right+3||a.bottom>b.bottom+3||a.left<b.left-3||a.top<b.top-5;}).map(n=>n.className)};
   }));
   assert.deepEqual(outside.filter(x=>x.overflowY>4||x.overflowX>4||x.children.length>0),[],label+' cards must keep their contents padded and contained: '+JSON.stringify(outside));
   await page.locator('#journeyLaunch').click();
   assert.equal(await page.locator('#journeyPanel:not([hidden])').count(),1,'Journey launches');
   assert.equal((await page.locator('#journeyProgress').innerText()).trim(),'1 / 47');
   await page.locator('#journeyNext').click();
   assert.equal((await page.locator('#journeyProgress').innerText()).trim(),'2 / 47');
   // Advance all historical stages; this must reveal every original milestone
   // while moving between parallel research paths in global date order.
   await page.locator('#journeyNext').evaluate(btn=>{for(let i=2;i<47;i++)btn.click();});
   assert.equal((await page.locator('#journeyProgress').innerText()).trim(),'47 / 47');
   assert.equal(await page.locator('.event-node').count(),47,'The entire research route visits 47 nodes');
   assert.ok(await page.locator('.scientific-link').count()>=25,'Sourced secondary relationships rendered');
   await page.locator('.scientific-link').first().evaluate(n=>n.dispatchEvent(new MouseEvent('click',{bubbles:true})));
   assert.equal(await page.locator('#relationInspector:not([hidden])').count(),1);
   assert.ok((await page.locator('#relationNote').innerText()).length>40);
   assert.ok((await page.locator('#relationSources a').count())>0);
   await page.locator('#relationClose').click();
   await page.locator('#fitView').click();
   await page.screenshot({path:path.join(screenshots,label+'-complete-tree.png'),animations:'disabled'});
   assert.deepEqual(exceptions,[],label+' has no browser JavaScript errors');
   await page.screenshot({path:path.join(screenshots,label+'-graph.png'),animations:'disabled'});
   await context.close();
  }
  await run(1440,900,'desktop');
  await run(390,844,'mobile');
  console.log('Chromium smoke checks passed (desktop & mobile): graph, reveal, story, sources, layout.');
 } finally {await browser.close();}
})().catch(err=>{console.error(err.stack||err);process.exitCode=1;});