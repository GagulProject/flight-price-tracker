import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {validQuote} from './quote-state.mjs';
export function eligible(route,p) {
  if(p.status!=='checked' || p.collectionStatus!=='verified' || !validQuote(route,p.verification,p.lastAttemptAt)
    || p.verification.evidence.provider!==p.id || p.checkedAt!==p.verification.observedAt
    || p.priceKrw!==p.verification.priceKrw || p.priceKrw>330000) return false;
  const previous=p.history.filter(s=>s.checkedAt<p.checkedAt && s.evidence && validQuote(route,s.evidence,s.checkedAt)).at(-1);
  return !previous || previous.priceKrw>330000;
}
export async function notify(data,url,send=fetch) {
  if(!url) return {status:'not-configured',sent:0};
  if(new URL(url).protocol!=='https:') throw new Error('Alert webhook must use HTTPS');
  let sent=0;
  for(const route of data.routes) for(const p of route.providers) {
    if(!eligible(route,p)) continue;
    const text='항공권 가격 알림: '+route.origin.code+' ↔ '+route.destination.code+', '+route.departureDate+'~'+route.returnDate+', 성인 1명 일반석 왕복, '+p.name+' '+p.priceKrw.toLocaleString('ko-KR')+'원. 검증 시각 '+p.checkedAt+'. '+p.url;
    const response=await send(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text}),signal:AbortSignal.timeout(15000)});
    if(!response.ok) throw new Error('Alert webhook returned HTTP '+response.status);
    sent++;
  }
  return {status:'configured',sent};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const data=JSON.parse(await readFile('data/prices.json','utf8'));
  const result=await notify(data,process.env.FLIGHT_ALERT_WEBHOOK_URL);
  await writeFile('diagnostics/notification.json',JSON.stringify(result,null,2)+'\n');
  console.log('Alert integration:',result.status,'sent:',result.sent);
}
