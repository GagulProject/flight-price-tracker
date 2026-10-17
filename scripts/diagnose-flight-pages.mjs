import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const data = JSON.parse(await readFile('data/prices.json','utf8'));
await mkdir('diagnostics',{recursive:true});
const browser = await chromium.launch({headless:true});
const results = [];
const supported = new Set(['naver','trip','google','skyscanner','expedia']);
for (const route of data.routes) for (const provider of route.providers) {
  if (!supported.has(provider.id)) continue;
  const context = await browser.newContext({locale:'ko-KR',timezoneId:'Asia/Seoul',viewport:{width:1365,height:900}});
  const page = await context.newPage();
  let status='unverified', detail='', elapsedMs=0;
  const started=Date.now();
  try {
    const response=await page.goto(provider.url,{waitUntil:'domcontentloaded',timeout:90000});
    if (response && response.status()>=400) throw new Error('HTTP '+response.status());
    // Wait for the dynamically rendered page, not a fixed sleep or networkidle.
    await page.locator('body').waitFor({state:'visible',timeout:30000});
    await page.waitForFunction(() => {
      const text=document.body?.innerText || '';
      return text.length>400 && /항공|항공편|flight|검색|원|₩/i.test(text);
    },null,{timeout:90000,polling:1000});
    const text=(await page.locator('body').innerText()).slice(0,5000);
    if (/captcha|robot|로봇이 아닙니다|접근이 제한|access denied/i.test(text)) {
      status='blocked'; detail='Bot verification or access restriction detected';
    } else {
      status='rendered-unverified';
      detail='Page rendered, but no verified itinerary-specific total fare extractor is configured';
    }
    const name=provider.id+'-'+route.departureDate+'-'+route.returnDate;
    await page.screenshot({path:'diagnostics/'+name+'.png',fullPage:false,timeout:15000}).catch(()=>{});
  } catch (error) {
    status=/Timeout/i.test(String(error))?'timeout':'error';
    detail=String(error).slice(0,300);
  } finally {
    elapsedMs=Date.now()-started;
    results.push({provider:provider.id,origin:route.origin.code,destination:route.destination.code,departureDate:route.departureDate,returnDate:route.returnDate,attemptedAt:new Date().toISOString(),elapsedMs,status,detail});
    await context.close();
  }
}
await browser.close();
await writeFile('diagnostics/results.json',JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify(results,null,2));
