const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async()=>{const b=await chromium.launch({headless:true,channel:'chrome'});const p=await b.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});let errors=[];p.on('pageerror',e=>errors.push(e.message));
const base=process.env.TEST_BASE||'http://127.0.0.1:8080';
for(const route of ['/','/projects.html','/about.html','/privacy.html','/404.html','/grid16/','/shooter.html','/horizon.html','/nebula.html','/kinetic.html','/rufus.html']){
 await p.goto(base+route);await p.locator('[data-atlas-open]').first().click();assert(await p.locator('.atlas').evaluate(e=>e.open),route+' atlas opens');assert.equal(await p.locator('.atlas-link').count(),11);
 await p.locator('.atlas-link[data-project="nebula"]').focus();assert.equal(await p.locator('.atlas-name').textContent(),'Nebula');
 await p.keyboard.press('Escape');assert(!await p.locator('.atlas').evaluate(e=>e.open));assert(await p.locator('[data-atlas-open]').first().evaluate(e=>e===document.activeElement));
 await p.setViewportSize({width:390,height:844});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),route+' horizontal overflow');await p.locator('[data-atlas-open]').first().click();await p.locator('.atlas-link[data-project="kinetic"]').focus();assert(await p.locator('.atlas').evaluate(e=>e.scrollHeight>e.clientHeight));await p.keyboard.press('Escape');await p.setViewportSize({width:1440,height:1000});console.log('PASS',route);
}
await p.goto(base+'/projects.html');await p.locator('[data-filter="tools"]').click();assert.equal(await p.locator('.project-item:visible').count(),2);await p.locator('[data-filter="all"]').click();assert.equal(await p.locator('.project-item:visible').count(),11);
await p.goto(base+'/');await p.locator('#grid16').scrollIntoViewIfNeeded();await p.locator('#grid16 img').evaluate(e=>e.decode());await p.waitForFunction(()=>document.querySelector('.chapter-rail [aria-current]')?.hash==='#grid16');await p.screenshot({path:'.verification/navigation-scene-final.png'});
await p.locator('.home-nav [data-atlas-open]').click();await p.locator('.atlas-link[data-project="horizon"]').focus();await p.locator('.atlas-picture img').evaluate(e=>e.decode());await p.screenshot({path:'.verification/navigation-atlas-final.png'});await p.locator('.atlas-link[data-project="horizon"]').click();await p.waitForURL('**/horizon.html');assert(await p.locator('.journey-next').isVisible());await p.goBack();assert(!await p.locator('.atlas').evaluate(e=>e.open));
await p.goto(base+'/');await p.screenshot({path:'.verification/navigation-home-final.png'});await p.setViewportSize({width:390,height:844});await p.screenshot({path:'.verification/navigation-mobile-final.png'});
await p.goto(base+'/shooter.html');await p.locator('[data-atlas-open]').click();await p.screenshot({path:'.verification/navigation-game-atlas-mobile.png'});
assert.deepEqual(errors,[]);console.log('PASS filters, rail, cross-page navigation, Back, desktop/mobile, focus restoration; no runtime errors');await b.close();})();
