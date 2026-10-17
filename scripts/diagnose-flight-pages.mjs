import { candidateAmounts, applyAttempt } from './quote-state.mjs';
import { collectSkyscanner } from './skyscanner-live.mjs';
import { readGoogleSnapshot, googleQuoteFromSnapshot } from './google-flights.mjs';
import { readNaverSnapshot, naverQuoteFromSnapshot } from './naver-flights.mjs';
import { readSkyscannerSnapshot, skyscannerPageQuoteFromSnapshot } from './skyscanner-page.mjs';
import { readTripSnapshot, tripQuoteFromSnapshot } from './trip-flights.mjs';
import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const data = JSON.parse(await readFile('data/prices.json','utf8'));
await mkdir('diagnostics',{recursive:true});
const headless = process.env.FLIGHT_BROWSER_HEADLESS !== 'false';
const browser = await chromium.launch(headless ? { headless: true } : { headless: false, channel: 'chrome' });
const results = [];
// Ordinary browser access only: no stealth, CAPTCHA solving, proxy rotation or retries on blocks.
const supported = new Set(['naver','trip','google','skyscanner']);
const retryableHttp = new Set([408,500,502,503,504]);
const botPattern=/captcha|robot|로봇이 아닙니다|접근이 제한|access denied|are you a person|verify you are human/i;
for (const route of data.routes) for (const provider of route.providers) {
  if (!supported.has(provider.id)) continue;
  if (provider.id === 'skyscanner' && process.env.SKYSCANNER_API_KEY) {
    const started = Date.now();
    let result;
    try {
      result = await collectSkyscanner(route, process.env.SKYSCANNER_API_KEY);
    } catch (error) {
      result = { status: 'api-error', detail: String(error).slice(0, 300) };
    }
    result = { provider: provider.id, origin: route.origin.code, destination: route.destination.code,
      departureDate: route.departureDate, returnDate: route.returnDate,
      attemptedAt: new Date().toISOString(), elapsedMs: Date.now() - started, ...result };
    results.push(result);
    applyAttempt(route, provider, result);
    await writeFile('data/prices.json', JSON.stringify(data, null, 2) + '\n');
    await writeFile('diagnostics/results.json', JSON.stringify(results, null, 2) + '\n');
    continue;
  }
  const context = await browser.newContext({locale:'ko-KR',timezoneId:'Asia/Seoul',viewport:{width:1365,height:900}});
  const page = await context.newPage();
  const network = [];
  page.on('requestfailed', request => {
    if (network.length < 40) network.push({url:request.url().split('?')[0],failure:request.failure()?.errorText});
  });
  page.on('response', response => {
    if (response.status() >= 400 && network.length < 40) network.push({url:response.url().split('?')[0],httpStatus:response.status()});
  });
  let status='unverified', detail='', elapsedMs=0, fareCandidates=[], pagePreview='', quote;
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
    const initialText=(await page.locator('body').innerText().catch(()=>'' )).slice(0,12000);
    if (botPattern.test(initialText)) {
      status='blocked';
      detail='Bot verification page detected before waiting for flight results';
      throw new Error(detail);
    }
    try {
      if (provider.id === 'trip') {
        // The first page lists outbound flights. Its fare is not a selected two-leg booking.
        await page.getByRole('button', { name: '이 운임 선택' }).first()
          .waitFor({ state: 'visible', timeout: 60000 });
        for (let clickAttempt = 0; clickAttempt < 2; clickAttempt++) {
          await page.getByRole('button', { name: '이 운임 선택' }).first().click();
          const opened = await page.waitForURL(/\/flights\/ShowFareNext/i, { timeout: 10000 })
            .then(() => true).catch(() => false);
          if (opened) break;
        }
        if (!/\/flights\/ShowFareNext/i.test(page.url()))
          throw new Error('Trip outbound fare did not open the return-flight list');
        await page.getByRole('button', { name: '이 항공편 선택' }).first()
          .waitFor({ state: 'visible', timeout: 60000 });
        await page.getByRole('button', { name: '이 항공편 선택' }).first().click();
        await page.locator('.ift-drawer__content [data-total-price]').first()
          .waitFor({ state: 'visible', timeout: 30000 });
      } else if (provider.id === 'naver') {
        // Naver's deep link initially renders a search shell; its Search button starts the actual fare request.
        const search = page.getByRole('button', { name: '검색', exact: true });
        if (await search.isVisible()) await search.click();
        await page.locator('[class*="combination_ConcurrentItemContainer"] [class*="defaultSummary"]')
          .first().waitFor({ state: 'visible', timeout: 60000 });
        const cards = page.locator('[class*="combination_ConcurrentItemContainer"]');
        let selected = false;
        for (let index = 0, count = await cards.count(); index < count; index++) {
          const card = cards.nth(index);
          const summary = card.locator('[class*="defaultSummary"]');
          if (!await summary.count()) continue;
          const label = await summary.innerText();
          if (!/성인\/모든 결제수단[\s\S]*왕복[\s\S]*[0-9,]+\s*원/.test(label)) continue;
          const selectFare = card.locator('[class*="combination_select_schedule"]');
          for (let clickAttempt = 0; clickAttempt < 2; clickAttempt++) {
            await selectFare.click();
            const opened = await page.waitForURL(/\/flights\/international\/detail\//, { timeout: 10000 })
              .then(() => true).catch(() => false);
            if (opened) break;
          }
          selected = true;
          break;
        }
        if (!selected) throw new Error('No ordinary all-payment round-trip card available');
        if (!page.url().includes('/flights/international/detail/'))
          throw new Error('Naver result card did not open its selected itinerary');
        await page.locator('[class*="international_selected_flights"]').waitFor({ state: 'visible', timeout: 30000 });
        await page.waitForFunction(() => [...document.querySelectorAll('[class*="detail_row"]')]
          .some(element => /해외업체|국내업체/.test(element.innerText) && /[0-9,]+\s*원/.test(element.innerText)),
        null, { timeout: 30000, polling: 500 });
      } else if (provider.id === 'google') {
        for (let retry = 0; retry < 3; retry++) {
          await page.waitForFunction(() => document.querySelector('[role="link"][aria-label^="왕복 총 가격은"]') ||
            /반환된 결과가 없습니다|죄송합니다\. 오류가 발생했습니다/.test(document.body?.innerText || ''),
          null, { timeout: 45000, polling: 1000 });
          const searchError = await page.locator('body').innerText().then(text =>
            /반환된 결과가 없습니다|죄송합니다\. 오류가 발생했습니다/.test(text));
          if (!searchError || retry === 2) break;
          const refresh = page.getByRole('button', { name: '새로고침' });
          if (!await refresh.isVisible()) break;
          await refresh.click();
          await page.waitForFunction(() => !/죄송합니다\. 오류가 발생했습니다/.test(document.body?.innerText || ''),
            null, { timeout: 10000, polling: 500 }).catch(() => {});
        }
        const afterRefresh = await page.locator('body').innerText();
        if (/반환된 결과가 없습니다|죄송합니다\. 오류가 발생했습니다/.test(afterRefresh) &&
            !botPattern.test(afterRefresh)) {
          // A fresh page load can recover a transient search error that the page's refresh button did not clear.
          await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
          await page.waitForFunction(() => document.querySelector('[role="link"][aria-label^="왕복 총 가격은"]') ||
            /반환된 결과가 없습니다|죄송합니다\. 오류가 발생했습니다/.test(document.body?.innerText || ''),
          null, { timeout: 45000, polling: 1000 });
        }
      } else if (provider.id === 'skyscanner') {
        await page.waitForFunction(() => [...document.querySelectorAll('[role="listitem"]')].some(element => element.innerText.includes('항공편 옵션 설정')) ||
          /로봇|robot|captcha/i.test(document.body?.innerText || ''), null, { timeout: 45000, polling: 1000 });
      } else {
        await page.waitForFunction(() => {
          const text=document.body?.innerText || '';
          return text.length>400 && /항공|항공편|flight|검색|원|₩/i.test(text);
        },null,{timeout:provider.id==='skyscanner'?30000:60000,polling:1000});
      }
    } catch (waitError) {
      // Preserve the rendered page for inspection even when the heuristic fails.
      const visible=(await page.locator('body').innerText().catch(()=>'' )).slice(0,12000);
      const hasSellerFare = provider.id === 'naver' && /항공권 판매사 선택[\s\S]*성인\/모든 결제수단[\s\S]*[0-9,]+\s*원/.test(visible);
      const hasResultCards = provider.id === 'naver' && /왕복 항공편 선택[\s\S]*성인\/모든 결제수단/.test(visible);
      const failedFareApi = provider.id === 'naver' && !hasSellerFare && !hasResultCards && network.some(item =>
        item.failure && /flight-api\.naver\.com\/(flight\/international\/searchFlights|graphql)/.test(item.url));
      status=botPattern.test(visible)?'blocked':failedFareApi?'fare-api-unavailable':'content-not-detected';
      detail=failedFareApi
        ? 'Naver search was clicked, but its flight search API requests failed in this browser; no fare results rendered'
        : (status==='blocked'?'Bot verification page: ':'Flight content not detected: ')+String(waitError).slice(0,180)+'; '+visible.slice(0,100);
      throw waitError;
    }
    // A shell page is not a loaded search result. Wait for a fare or a clear terminal state.
    if (provider.id==='naver' || provider.id==='google') {
      await page.waitForFunction(() => {
        const t=document.body?.innerText||'';
        return /(?:₩\s*|KRW\s*|[0-9,]+\s*원)|반환된 결과가 없습니다|오류가 발생했습니다|검색 결과가 없습니다|검색 결과 없음|whaleguard block/i.test(t)
          && !/항공권 가격 변동 그래프 로딩 중/.test(t);
      },null,{timeout:45000,polling:1500}).catch(()=>{});
    }
    if (provider.id === 'trip') {
      const snapshot = await readTripSnapshot(page);
      quote = tripQuoteFromSnapshot(route, snapshot, new Date().toISOString());
      await writeFile('diagnostics/trip-snapshot.json', JSON.stringify(snapshot, null, 2) + '\n');
    } else if (provider.id === 'google') {
      await page.waitForFunction(() => document.querySelector('[role="link"][aria-label^="왕복 총 가격은"]') ||
        /반환된 결과가 없습니다|죄송합니다\. 오류가 발생했습니다/.test(document.body?.innerText || ''),
      null, { timeout: 45000, polling: 1000 }).catch(() => {});
      const snapshot = await readGoogleSnapshot(page);
      quote = googleQuoteFromSnapshot(route, snapshot, new Date().toISOString());
      await writeFile('diagnostics/google-snapshot.json', JSON.stringify(snapshot, null, 2) + '\n');
    } else if (provider.id === 'naver') {
      const snapshot = await readNaverSnapshot(page);
      quote = naverQuoteFromSnapshot(route, snapshot, new Date().toISOString());
      await writeFile('diagnostics/naver-snapshot.json', JSON.stringify(snapshot, null, 2) + '\n');
    } else if (provider.id === 'skyscanner') {
      const snapshot = await readSkyscannerSnapshot(page);
      quote = skyscannerPageQuoteFromSnapshot(route, snapshot, new Date().toISOString());
      await writeFile('diagnostics/skyscanner-snapshot.json', JSON.stringify(snapshot, null, 2) + '\n');
    }
    const text=(await page.locator('body').innerText()).slice(0,12000);
    // Collect candidate fares for debugging. Never treat arbitrary prices as a
    // verified round-trip quote without confirming dates and itinerary.
    if (provider.id === 'naver' || provider.id === 'google') {
      const snippets = await page.evaluate(() => {
        const out=[];
        for (const el of document.querySelectorAll('main *, [role="main"] *, [class*="flight"] *, [class*="result"] *')) {
          if (el.children.length > 2 || el.closest('footer, [class*="footer"], [class*="Footer"]')) continue;
          const value=(el.innerText||'').trim();
          if (value.length < 5 || value.length > 90) continue;
          out.push({value,context:(el.parentElement?.parentElement?.innerText||'').slice(0,600)});
          if (out.length >= 1000) break;
        }
        return out;
      });
      fareCandidates = snippets.flatMap(s => candidateAmounts(s.value,s.context).map(amount=>({amount,context:s.context}))).slice(0,25);
    }
    if (quote) {
      status='verified'; detail=`Exact round-trip total verified from visible ${provider.id} seller result`;
    } else if (/반환된 결과가 없습니다|오류가 발생했습니다/.test(text)) {
      status='search-error'; detail='Search results page returned no results or an error';
    } else if (/항공권 가격 변동 그래프 로딩 중/.test(text) && fareCandidates.length===0) {
      status='results-loading'; detail='Search shell rendered but fare results did not load';
    } else if (botPattern.test(text)) {
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
    pagePreview=(await page.locator('body').innerText().catch(()=>'' )).slice(0,1000);
    elapsedMs=Date.now()-started;
    results.push({provider:provider.id,origin:route.origin.code,destination:route.destination.code,departureDate:route.departureDate,returnDate:route.returnDate,attemptedAt:new Date().toISOString(),elapsedMs,status,detail,quote,fareCandidates,pagePreview,network});
    applyAttempt(route,provider,results.at(-1));
    await writeFile('data/prices.json',JSON.stringify(data,null,2)+'\n');
    await writeFile('diagnostics/results.json',JSON.stringify(results,null,2)+'\n');
    await context.close();
  }
}
await browser.close();
await writeFile('diagnostics/results.json',JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify(results,null,2));
const verified=results.filter(r=>r.status==='verified').length;
await writeFile('diagnostics/collection-summary.json',JSON.stringify({verified,attempted:results.length,completedAt:new Date().toISOString()},null,2)+'\n');
if (!verified) { console.error('NO_VERIFIED_QUOTES: diagnostic execution is not collection success'); process.exitCode=2; }

