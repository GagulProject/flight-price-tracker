import { test } from 'node:test';
import assert from 'node:assert/strict';
import {candidateAmounts, applyAttempt, validQuote, alertCandidates} from './quote-state.mjs';
const route = {origin:{code:'SEL'},destination:{code:'TYO'},departureDate:'2026-12-30',returnDate:'2027-01-01'};
const time = '2026-10-17T05:00:00Z';
const quote = {kind:'live-round-trip-total',currency:'KRW',adults:1,cabin:'economy',origin:'SEL',destination:'TYO',departureDate:route.departureDate,returnDate:route.returnDate,priceKrw:330000,observedAt:time,evidence:{source:'authorized-live-api',provider:'skyscanner',offerId:'fixture-only'}};
test('business identifiers, loading, ads and one-way prices never become candidates', () => {
  for (const t of ['220-81-62517','사업자등록번호 220-81-62517 원','항공권 로딩 중 330,000원','광고 330,000원','편도 330,000원','330000']) assert.deepEqual(candidateAmounts(t), []);
  assert.deepEqual(candidateAmounts('왕복 총액 330,000원'), [330000]);
});
test('reject missing evidence, wrong dates, currency, cabin, passengers and stale quotes', () => {
  assert.equal(validQuote(route,quote,time),true);
  for (const patch of [{evidence:null},{evidence:{...quote.evidence,provider:'google'}},{currency:'USD'},{adults:2},{cabin:'business'},{returnDate:'2027-01-02'},{departureDate:'2026-12-29'},{origin:'PUS'},{kind:'one-way'},{observedAt:'2026-10-16T05:00:00Z'},{observedAt:'2026-10-18T05:00:00Z'}]) assert.equal(validQuote(route,{...quote,...patch},time),false);
});
test('failure preserves last verified price, timestamp and complete history', () => {
  const r=structuredClone(route), p={id:'naver',priceKrw:400000,checkedAt:time,status:'checked',history:[{checkedAt:time,priceKrw:400000}]};
  const before=structuredClone(p);
  applyAttempt(r,p,{status:'blocked',detail:'HTTP 429',attemptedAt:'2026-10-17T05:15:00Z'});
  assert.equal(p.status,'stale'); assert.equal(p.priceKrw,before.priceKrw); assert.equal(p.checkedAt,before.checkedAt); assert.deepEqual(p.history,before.history);
});
test('candidate fare cannot enter history; genuine evidence can, and reruns are idempotent',()=>{
  const r=structuredClone(route),p={id:'naver',priceKrw:null,checkedAt:null,history:[]};
  applyAttempt(r,p,{status:'rendered-unverified',detail:'candidate',attemptedAt:time,fareCandidates:[{amount:330000}]});
  assert.equal(p.history.length,0);
  const result={provider:'naver',status:'verified',detail:'fixture',attemptedAt:time,quote};
  applyAttempt(r,p,result); applyAttempt(r,p,result); r.providers=[p];
  assert.equal(p.history.length,1); assert.equal(alertCandidates({routes:[r]},[result]).length,1);
  assert.equal(alertCandidates({routes:[r]},[{...result,quote:{...quote,priceKrw:330001}}]).length,0);
  assert.equal(alertCandidates({routes:[r]},[{...result,quote:undefined}]).length,0);
});
