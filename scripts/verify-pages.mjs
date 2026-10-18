import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const expected=JSON.parse(await readFile('data/prices.json','utf8'));
const browser=await chromium.launch({headless:true});
await mkdir('diagnostics',{recursive:true});
try {
  const page=await browser.newPage({viewport:{width:1440,height:1100}});
  const errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  const base=process.env.PAGES_URL || 'https://gagulproject.github.io/flight-price-tracker/';
  let actual;
  for (let i=0;i<24;i++) {
    const response=await page.request.get(base+'data/prices.json?t='+Date.now());
    if(response.ok()) actual=await response.json();
    if(JSON.stringify(actual)===JSON.stringify(expected)) break;
    await page.waitForTimeout(10000);
  }
  assert.deepEqual(actual,expected,'Published JSON must match this collection run');
  await page.goto(base+'?verify='+Date.now(),{waitUntil:'networkidle'});
  await page.locator('.provider-card').first().waitFor();
  const providerCount=expected.routes.reduce((n,r)=>n+r.providers.length,0);
  assert.equal(await page.locator('.provider-card').count(),providerCount);
  assert.equal(await page.locator('.provider-attempt').count(),providerCount);
  assert.equal(await page.locator('.provider-verified').count(),providerCount);
  assert.equal(await page.locator('.collection-status').count(),providerCount);
  const text=await page.locator('#results').innerText();
  const verifiedSamples=expected.routes.flatMap(route=>route.providers.flatMap(item=>(item.history||[]).filter(sample=>sample.evidence?.kind==='live-round-trip-total')));
  assert.equal(await page.locator('.trend circle').count(),verifiedSamples.length,'Trend points must match verified history');
  for (const route of expected.routes) {
    assert.ok(text.includes(route.departureDate) && text.includes(route.returnDate));
    for(const item of route.providers) {
      assert.equal(await page.locator('.provider-card').nth(route.providers.indexOf(item)).getAttribute('data-status'),item.collectionStatus || 'unverified');
      if(item.status==='stale') assert.ok(text.includes(new Intl.NumberFormat('ko-KR').format(item.priceKrw)+'원'));
      if(item.status==='checked') {
        assert.ok(text.includes(new Intl.NumberFormat('ko-KR').format(item.priceKrw)+'원'));
        assert.ok(text.includes('마지막 검증'));
      }
    }
  }
  for (const width of [320,390,588]) {
    await page.setViewportSize({width,height:844});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow at '+width);
    for(const price of await page.locator('.price-summary strong, .provider-price').all()) {
      assert.equal(await price.evaluate(el=>getComputedStyle(el).whiteSpace),'nowrap');
      assert.ok(await price.evaluate(el=>el.scrollWidth<=el.clientWidth),'Price must fit at '+width);
    }
    assert.equal(await page.locator('.collection-details[open]').count(),0);
    const visible=await page.locator('#results').innerText();
    assert.ok(!/fare-api-unavailable|HTTP 432|no automated bypass|Naver search was clicked/.test(visible),'Technical diagnostics are collapsed');
    const first=page.locator('.provider-card').first();
    const children=await first.evaluate(el=>[...el.children].map(x=>x.className));
    assert.equal(children[0],'provider-top');
    await page.locator('.itinerary').first().scrollIntoViewIfNeeded();
    await page.screenshot({path:'diagnostics/mobile-'+width+'.png',fullPage:true});
  }
  const details=page.locator('.collection-details').first();
  await details.locator('summary').click();
  assert.equal(await details.getAttribute('open'),'');
  assert.ok(await details.locator('.provider-attempt').isVisible());
  await details.locator('summary').click();
  await page.setViewportSize({width:1440,height:1100});
  assert.deepEqual(errors,[]);
  await page.screenshot({path:'diagnostics/published-pages.png',fullPage:true});
  await writeFile('diagnostics/pages-verification.json',JSON.stringify({url:base,checkedAt:new Date().toISOString(),jsonMatches:true,providerCards:providerCount,errors},null,2));
  console.log('PAGES_VERIFIED: published JSON, provider cards, timestamps, statuses and preserved history');
} finally { await browser.close(); }
