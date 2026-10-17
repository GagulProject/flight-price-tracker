import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchQuery, cheapestVerifiedItinerary, collectSkyscanner } from './skyscanner-live.mjs';

const route = { origin: { code: 'SEL' }, destination: { code: 'TYO' }, departureDate: '2026-12-30', returnDate: '2027-01-01' };
const observedAt = '2026-10-17T05:00:00Z';
const response = {
  status: 'RESULT_STATUS_COMPLETE', content: { results: {
    places: { icn: { iata: 'ICN' }, nrt: { iata: 'NRT' } },
    legs: {
      out: { originPlaceId: 'icn', destinationPlaceId: 'nrt', departureDateTime: { year: 2026, month: 12, day: 30 } },
      back: { originPlaceId: 'nrt', destinationPlaceId: 'icn', departureDateTime: { year: 2027, month: 1, day: 1 } }
    },
    itineraries: { offer: { legIds: ['out', 'back'], pricingOptions: [
      { id: 'bookable', price: { amount: '329000000', unit: 'PRICE_UNIT_MILLI' }, items: [{ deepLink: 'https://example.com/book' }] }
    ] } }
  } }
};

test('partner request contains exact round trip, one adult, economy and KRW', () => {
  const query = searchQuery(route).query;
  assert.equal(query.currency, 'KRW');
  assert.equal(query.adults, 1);
  assert.equal(query.cabinClass, 'CABIN_CLASS_ECONOMY');
  assert.deepEqual(query.queryLegs.map(leg => [leg.originPlaceId.iata, leg.destinationPlaceId.iata, leg.date]), [
    ['SEL', 'TYO', { year: 2026, month: 12, day: 30 }], ['TYO', 'SEL', { year: 2027, month: 1, day: 1 }]
  ]);
});

test('accepts only priced and linked two-leg offers for the exact cities and dates', () => {
  assert.equal(cheapestVerifiedItinerary(route, response, observedAt).priceKrw, 329000);
  const wrong = structuredClone(response);
  wrong.content.results.legs.back.departureDateTime.day = 2;
  assert.equal(cheapestVerifiedItinerary(route, wrong, observedAt), null);
  wrong.content.results.legs.back.departureDateTime.day = 1;
  wrong.content.results.itineraries.offer.legIds = ['out'];
  assert.equal(cheapestVerifiedItinerary(route, wrong, observedAt), null);
  wrong.content.results.itineraries.offer.legIds = ['out', 'back'];
  wrong.content.results.itineraries.offer.pricingOptions[0].items = [];
  assert.equal(cheapestVerifiedItinerary(route, wrong, observedAt), null);
  wrong.content.results.itineraries.offer.pricingOptions[0].items = [{ deepLink: 'https://example.com/book' }];
  wrong.content.results.itineraries.offer.pricingOptions[0].price.unit = 'PRICE_UNIT_UNSPECIFIED';
  assert.equal(cheapestVerifiedItinerary(route, wrong, observedAt), null);
  wrong.content.results.itineraries.offer.pricingOptions[0].price.unit = 'PRICE_UNIT_MILLI';
  wrong.content.results.places.nrt.iata = 'KIX';
  assert.equal(cheapestVerifiedItinerary(route, wrong, observedAt), null);
  wrong.content.results.places.nrt.iata = 'NRT';
  wrong.status = 'RESULT_STATUS_INCOMPLETE';
  assert.equal(cheapestVerifiedItinerary(route, wrong, observedAt), null);
});

test('collector does not request partner API without a key', async () => {
  const result = await collectSkyscanner(route, '', () => { throw new Error('unexpected request'); });
  assert.equal(result.status, 'api-key-missing');
});

test('collector uses the partner endpoint and returns a quote only for a complete response', async () => {
  let called = 0;
  const result = await collectSkyscanner(route, 'fixture-key', async (url, options) => {
    called++;
    assert.match(url, /\/flights\/live\/search\/create$/);
    assert.equal(options.headers['x-api-key'], 'fixture-key');
    assert.deepEqual(JSON.parse(options.body), searchQuery(route));
    return { ok: true, json: async () => ({ ...response, sessionToken: 'fixture-session' }) };
  });
  assert.equal(called, 1);
  assert.equal(result.status, 'verified');
  assert.equal(result.quote.priceKrw, 329000);
});
