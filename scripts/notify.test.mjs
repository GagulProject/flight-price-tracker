import {test} from 'node:test';
import assert from 'node:assert/strict';
import {eligible,notify} from './notify.mjs';
const route={origin:{code:'SEL'},destination:{code:'TYO'},departureDate:'2026-12-30',returnDate:'2027-01-01'};
const quote={kind:'live-round-trip-total',origin:'SEL',destination:'TYO',departureDate:'2026-12-30',returnDate:'2027-01-01',adults:1,cabin:'economy',currency:'KRW',priceKrw:330000,observedAt:'2026-10-17T05:00:00Z',evidence:{source:'visible-search-result',provider:'google',offerId:'test-only'}};
const provider={id:'google',name:'Google',status:'checked',collectionStatus:'verified',priceKrw:330000,checkedAt:quote.observedAt,lastAttemptAt:quote.observedAt,verification:quote,history:[],url:'https://www.google.com/travel/flights'};
test('330000 boundary, historical price rejection and repeated threshold suppression',()=>{
  assert.equal(eligible(route,provider),true);
  for(const patch of [{status:'stale'},{collectionStatus:'blocked'},{priceKrw:330001},{id:'naver'},{verification:null}]) assert.equal(eligible(route,{...provider,...patch}),false);
  const previous={checkedAt:'2026-10-17T04:00:00Z',priceKrw:329000,evidence:{...quote,priceKrw:329000,observedAt:'2026-10-17T04:00:00Z'}};
  assert.equal(eligible(route,{...provider,history:[previous]}),false);
});
test('optional webhook emits text only for a qualifying quote',async()=>{
  const data={routes:[{...route,providers:[provider]}]};
  assert.deepEqual(await notify(data,undefined,()=>assert.fail('must not send')),{status:'not-configured',sent:0});
  let calls=0;
  assert.deepEqual(await notify(data,'https://example.org/test',async(url,options)=>{calls++;assert.ok(JSON.parse(options.body).text.includes('330,000'));return {ok:true};}),{status:'configured',sent:1});
  assert.equal(calls,1);
});
