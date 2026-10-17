import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const data = JSON.parse(await readFile('data/prices.json','utf8'));
await mkdir('diagnostics',{recursive:true});
const browser = await chromium.launch({headless:true});
const results = [];
// Trigger a fresh diagnostic run after adding fare-candidate capture.
const supported = new Set(['naver','trip','google','skyscanner','expedia']);
const retryableHttp = new Set([408,429,500,502,503,504]);
for (const route of data.routes) for (const provider of route.providers) {
  if (!supported.has(provider.id)) continue;
  const context = await browser.newContext({locale:'ko-KR',timezoneId:'Asia/Seoul',viewport:{width:1365,height:900}});
  const page = await context.newPage();
  let status='unverified', detail='', elapsedMs=0, fareCandidates=[];
  const started=Date.now();
  try {
    let response;
    for (let attempt=1;attempt<=2;attempt++) {
      response=await page.goto(provider.url,{waitUntil:'domcontentloaded',timeout:60000});
      if (!response || response.status()<400) break;
      if (!retryableHttp.has(response.status()) || attempt===2) break;
      await page.waitForTimeout(3000*attempt);
    }
    if (response && response.status()>=400) {
      status=response.status()===429 || response.status()===432?'blocked':'http-error';
      detail='HTTP '+response.status()+'; no automated bypass attempted';
      throw new Error(detail);
    }
    // Wait for the dynamically rendered page, not a fixed sleep or networkidle.
    await page.locator('body').waitFor({state:'visible',timeout:30000});
    try {
      await page.waitForFunction(() => {
        const text=document.body?.innerText || '';
        return text.length>400 && /항공|항공편|flight|검색|원|₩/i.test(text);
      },null,{timeout:provider.id==='skyscanner'?30000:60000,polling:1000});
    } catch (waitError) {
      // Preserve the rendered page for inspection even when the heuristic fails.
      const visible=(await page.locator('body').innerText().catch(()=>'' )).slice(0,500);
      status='content-not-detected';
      detail='Page loaded but flight content heuristic failed: '+visible.slice(0,180);
      throw waitError;
    }
    const text=(await page.locator('body').innerText()).slice(0,12000);
    // Collect candidate fares for debugging. Never treat arbitrary prices as a
    // verified round-trip quote without confirming dates and itinerary.
    if (provider.id === 'naver' || provider.id === 'google') {
      fareCandidates = await page.evaluate(() => {
        const pricePattern=/(?:₩\\s*|KRW\\s*|)([1-9]\\d{1,2}(?:,\\d{3})+|[1-9]\\d{4,6})\\s*원?/g;
        const candidates=[];
        for (const el of document.querySelectorAll('main *, [role="main"] *')) {
          if (el.children.length > 2) continue;
          const value=(el.innerText||'').trim();
          if (value.length>90 || value.length<5) continue;
          for (const match of value.matchAll(pricePattern)) {
            const amount=Number(match[1].replaceAll(',',''));
            if (amount>=50000 && amount<=3000000) {
              const context=(el.parentElement?.parentElement?.innerText||'').slice(0,400);
              candidates.push({amount,context});
            }
          }
          if (candidates.length>=25) break;
        }
        return candidates;
      });
    }
    if (/captcha|robot|로봇이 아닙니다|접근이 제한|access denied/i.test(text)) {
      status='blocked'; detail='Bot verification or access restriction detected';
    } else {
      status='rendered-unverified';
      detail='Page rendered; '+fareCandidates.length+' candidate fares captured. Round-trip total and exact dates not yet independently verified.';
    }
    const name=provider.id+'-'+route.departureDate+'-'+route.returnDate;
    await page.screenshot({path:'diagnostics/'+name+'.png',fullPage:false,timeout:15000}).catch(()=>{});
  } catch (error) {
    if (status==='unverified') status=/Timeout/i.test(String(error))?'timeout':'error';
    await page.screenshot({path:'diagnostics/'+provider.id+'-'+route.departureDate+'-'+route.returnDate+'-error.png',fullPage:false,timeout:10000}).catch(()=>{});
    if (!detail) detail=String(error).slice(0,300);
  } finally {
    await writeFile('diagnostics/'+provider.id+'-'+route.departureDate+'-'+route.returnDate+'.txt',
      (await page.locator('body').innerText().catch(()=>'' )).slice(0,12000)).catch(()=>{});
    elapsedMs=Date.now()-started;
    results.push({provider:provider.id,origin:route.origin.code,destination:route.destination.code,departureDate:route.departureDate,returnDate:route.returnDate,attemptedAt:new Date().toISOString(),elapsedMs,status,detail,fareCandidates});
    await context.close();
  }
}
await browser.close();
await writeFile('diagnostics/results.json',JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify(results,null,2));
