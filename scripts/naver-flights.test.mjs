import { test } from 'node:test';
import assert from 'node:assert/strict';
import { naverQuoteFromSnapshot } from './naver-flights.mjs';
import { validQuote } from './quote-state.mjs';

const route = { origin: { code: 'SEL' }, destination: { code: 'TYO' }, departureDate: '2026-12-30', returnDate: '2027-01-01' };
const observedAt = '2026-10-17T07:00:00Z';
const snapshot = {
  url: 'https://flight.naver.com/flights/international/detail/SEL:city-TYO:city-20261230/TYO:city-SEL:city-20270101?adult=1&fareType=Y&selectedFlight=1%3A20261230ICNNRTBX0223%3AA01%3AHK%3ABX%3A%2C2%3A20270101NRTICNZG0045%3AA01%3AHK%3ABX%3A',
  itinerary: '선택한 항공권\n가는편\n인천\nICN\n도쿄\nNRT\n12.30.(수)\n오는편\n도쿄\nNRT\n인천\nICN\n1.1.(금)',
  paymentType: '성인/모든 결제수단', sellerRows: ['부킹닷컴\n해외업체\n392,407원', 'mytrip\n해외업체\n411,928원']
};

test('accepts selected Naver round trip seller total', () => {
  const quote = naverQuoteFromSnapshot(route, snapshot, observedAt);
  assert.equal(quote?.priceKrw, 392407);
  assert.equal(validQuote(route, quote, observedAt), true);
});

test('rejects mismatched search and non-seller amounts', () => {
  for (const patch of [
    { url: snapshot.url.replace('20261230', '20261231') },
    { url: snapshot.url.replace('adult=1', 'adult=2') },
    { url: snapshot.url.replace('fareType=Y', 'fareType=C') },
    { url: snapshot.url.replace('20270101NRTICN', '20270101ICNNRT') },
    { itinerary: snapshot.itinerary.replace('1.1.', '1.2.') },
    { paymentType: '성인/제휴카드 할인' },
    { sellerRows: ['광고\n392,407원', '사업자등록번호 220-81-62517', '392,407원~'] }
  ]) assert.equal(naverQuoteFromSnapshot(route, { ...snapshot, ...patch }, observedAt), null);
});
