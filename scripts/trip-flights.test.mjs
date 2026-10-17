import test from 'node:test';
import assert from 'node:assert/strict';
import { tripQuoteFromSnapshot } from './trip-flights.mjs';

const route = { origin:{code:'SEL'}, destination:{code:'TYO'}, departureDate:'2026-12-30', returnDate:'2027-01-01' };
const snapshot = {
  url:'https://kr.trip.com/flights/ShowFareNext?triptype=RT&dcity=sel&acity=tyo&ddate=2026-12-30&rdate=2027-01-01&quantity=1&class=Y&curr=KRW',
  searchText:'왕복 편도 다구간 서울 도쿄 성인 1명 · 일반석',
  drawerText:'서울 (ICN)도쿄 (NRT)2026년 12월 30일(수)\n에어부산\n도쿄 (NRT)서울 (ICN)2027년 1월 1일(금)\n집에어\n운임 선택\n399,300원\n왕복\n일반석\n결제 방법: 내통장결제',
  price:399300
};

test('accepts selected two-leg Trip.com total with payment method', () => {
  const quote = tripQuoteFromSnapshot(route, snapshot, '2026-10-17T07:25:00Z');
  assert.equal(quote.priceKrw, 399300);
  assert.equal(quote.paymentMethod, '내통장결제');
});

test('rejects wrong dates, passengers, cabin, currency, one-way, and unselected prices', () => {
  for (const changed of [
    {url:snapshot.url.replace('rdate=2027-01-01','rdate=2027-01-02')},
    {url:snapshot.url.replace('quantity=1','quantity=2')},
    {url:snapshot.url.replace('class=Y','class=C')},
    {url:snapshot.url.replace('curr=KRW','curr=USD')},
    {url:snapshot.url.replace('triptype=RT','triptype=OW')},
    {drawerText:snapshot.drawerText.replace('2027년 1월 1일','2027년 1월 2일')},
    {drawerText:snapshot.drawerText.replace('399,300원','429,300원')},
    {drawerText:snapshot.drawerText.replace('결제 방법: 내통장결제','')},
  ]) assert.equal(tripQuoteFromSnapshot(route, {...snapshot,...changed}, '2026-10-17T07:25:00Z'), null);
});
