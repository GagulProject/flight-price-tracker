import { test } from 'node:test';
import assert from 'node:assert/strict';
import { skyscannerPageQuoteFromSnapshot } from './skyscanner-page.mjs';
import { validQuote } from './quote-state.mjs';

const route = { origin: { code: 'SEL' }, destination: { code: 'TYO' }, departureDate: '2026-12-30', returnDate: '2027-01-01' };
const observedAt = '2026-10-17T07:00:00Z';
const snapshot = {
  url: 'https://www.skyscanner.co.kr/transport/flights/sel/tyoa/261230/270101/?adultsv2=1&cabinclass=economy&rtn=1',
  header: '₩ KRW\n서울 (모두)\n - \n도쿄 (모두)\n성인 1명, 일반석\n가는 날\n12월 30일 (수)\n오는 날\n1월 1일 (금)',
  cards: ['항공편 옵션 설정1: 총 금액 ₩435,100.\n출국 항공편: 이스타항공.\n출발지: 인천 국제 출발 시간: 오전 7:00, 도착지: 도쿄 나리타 도착 시간: 오전 10:00\n귀국 항공편: 이스타항공.\n출발지: 도쿄 나리타 출발 시간: 오전 11:00, 도착지: 인천 국제 도착 시간: 오후 1:30\n세금과 수수료 포함 가격']
};

test('accepts visible Skyscanner round-trip total', () => {
  const quote = skyscannerPageQuoteFromSnapshot(route, snapshot, observedAt);
  assert.equal(quote?.priceKrw, 435100);
  assert.equal(validQuote(route, quote, observedAt), true);
});

test('rejects wrong search and non-round-trip cards', () => {
  for (const patch of [
    { url: snapshot.url.replace('270101', '270102') },
    { url: snapshot.url.replace('adultsv2=1', 'adultsv2=2') },
    { header: snapshot.header.replace('1월 1일', '1월 2일') },
    { cards: [snapshot.cards[0].replace('귀국 항공편:', '편도 항공편:')] },
    { cards: [snapshot.cards[0].replace('총 금액', '최저가')] }
  ]) assert.equal(skyscannerPageQuoteFromSnapshot(route, { ...snapshot, ...patch }, observedAt), null);
});
