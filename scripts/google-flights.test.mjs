import { test } from 'node:test';
import assert from 'node:assert/strict';
import { googleQuoteFromSnapshot } from './google-flights.mjs';
import { validQuote } from './quote-state.mjs';

const route = { origin: { code: 'SEL' }, destination: { code: 'TYO' }, departureDate: '2026-12-30', returnDate: '2027-01-01' };
const observedAt = '2026-10-17T05:00:00Z';
const snapshot = {
  tripType: '왕복', passengers: '승객 1명, 승객 수를 변경합니다.', cabin: '이코노미', currency: '통화 KRW',
  origin: '서울특별시', destination: '도쿄도', departureDate: '2026-12-30', returnDate: '2027-01-01',
  resultsReady: true, searchError: false,
  priceLabels: ['왕복 총 가격은 최저 388001 대한민국 원입니다. 에어부산의 직항 항공편입니다. 항공편 선택',
    '왕복 총 가격은 최저 403501 대한민국 원입니다. 에어프레미아 항공편 선택']
};

test('accepts only an exact visible Google round-trip total', () => {
  const quote = googleQuoteFromSnapshot(route, snapshot, observedAt);
  assert.equal(quote.priceKrw, 388001);
  assert.equal(validQuote(route, quote, observedAt), true);
});

test('rejects wrong trip, date, passenger, cabin, currency, route and loading/error states', () => {
  for (const patch of [
    { tripType: '편도' }, { passengers: '승객 2명, 승객 수를 변경합니다.' }, { cabin: '비즈니스' },
    { currency: '통화 USD' }, { origin: '부산' }, { destination: '오사카' },
    { departureDate: '2026-12-31' }, { returnDate: '2027-01-02' },
    { resultsReady: false }, { searchError: true },
    { priceLabels: ['₩388,001부터', '편도 총 가격은 최저 288001 대한민국 원입니다.'] }
  ]) assert.equal(googleQuoteFromSnapshot(route, { ...snapshot, ...patch }, observedAt), null);
});
