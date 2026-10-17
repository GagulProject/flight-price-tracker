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
  assert.equal(await page.locator('.provider-card').count(),expected.routes.reduce((n,r)=>n+r.providers.length,0));
  assert.equal(await page.locator('.provider-attempt').count(),5);
  assert.equal(await page.locator('.provider-verified').count(),5);
  assert.equal(await page.locator('.collection-status').count(),5);
  const text=await page.locator('#results').innerText();
  const verifiedSamples=expected.routes.flatMap(route=>route.providers.flatMap(item=>(item.history||[]).filter(sample=>sample.evidence?.kind==='live-round-trip-total')));
  assert.equal(await page.locator('.trend circle').count(),verifiedSamples.length,'Trend points must match verified history');
  for (const route of expected.routes) {
    assert.ok(text.includes(route.departureDate) && text.includes(route.returnDate));
    for(const item of route.providers) {
      assert.ok(text.includes(item.collectionStatus || '미검증'));
      if(item.status==='stale') assert.ok(text.includes(new Intl.NumberFormat('ko-KR').format(item.priceKrw)+'원 · 과거 기록'));
      if(item.status==='checked') {
        assert.ok(text.includes(new Intl.NumberFormat('ko-KR').format(item.priceKrw)+'원'));
        assert.ok(text.includes('마지막 검증'));
      }
    }
  }
  assert.deepEqual(errors,[]);
  await page.screenshot({path:'diagnostics/published-pages.png',fullPage:true});
  await writeFile('diagnostics/pages-verification.json',JSON.stringify({url:base,checkedAt:new Date().toISOString(),jsonMatches:true,providerCards:5,errors},null,2));
  console.log('PAGES_VERIFIED: published JSON, five provider cards, timestamps, statuses and preserved history');
} finally { await browser.close(); }
