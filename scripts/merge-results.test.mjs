import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergePrices, mergeDiagnostics } from './merge-results.mjs';

const route = { origin: { code: 'SEL' }, destination: { code: 'TYO' }, departureDate: '2026-12-30', returnDate: '2027-01-01' };
function quote(priceKrw, observedAt) {
  return { kind: 'live-round-trip-total', origin: 'SEL', destination: 'TYO', departureDate: route.departureDate,
    returnDate: route.returnDate, adults: 1, cabin: 'economy', currency: 'KRW', priceKrw, observedAt,
    evidence: { source: 'visible-search-result', provider: 'google', offerId: `offer-${priceKrw}` } };
}
function snapshot(time, price, status = 'verified') {
  const verification = quote(price, time);
  return { routes: [{ ...route, lastAttemptAt: time, providers: [{ id: 'google',
    status: status === 'verified' ? 'checked' : 'stale', collectionStatus: status,
    note: status, lastAttemptAt: time, priceKrw: price, checkedAt: time,
    verification, history: [{ checkedAt: time, priceKrw: price, evidence: verification }] }] }] };
}

test('concurrent runs keep both verified samples and the newest attempt', () => {
  const first = snapshot('2026-10-17T05:00:00Z', 388001);
  const second = snapshot('2026-10-17T05:15:00Z', 387001);
  const merged = mergePrices(first, second).routes[0].providers[0];
  assert.deepEqual(merged.history.map(sample => sample.priceKrw), [388001, 387001]);
  assert.equal(merged.priceKrw, 387001);
  assert.equal(merged.status, 'checked');
  assert.equal(merged.lastAttemptAt, '2026-10-17T05:15:00Z');
  assert.equal(mergePrices(second, first).routes[0].providers[0].priceKrw, 387001);
});

test('newer failure preserves verified price and its timestamp', () => {
  const first = snapshot('2026-10-17T05:00:00Z', 388001);
  const failed = structuredClone(first);
  const item = failed.routes[0].providers[0];
  item.status = 'stale'; item.collectionStatus = 'blocked'; item.note = 'HTTP 429';
  item.lastAttemptAt = '2026-10-17T05:15:00Z';
  const merged = mergePrices(first, failed).routes[0].providers[0];
  assert.equal(merged.status, 'stale');
  assert.equal(merged.priceKrw, 388001);
  assert.equal(merged.checkedAt, '2026-10-17T05:00:00Z');
  assert.equal(merged.lastAttemptAt, '2026-10-17T05:15:00Z');
  assert.equal(merged.history.length, 1);
});

test('published fare note keeps a payment condition on a verified Trip quote', () => {
  const current = snapshot('2026-10-17T05:15:00Z', 399300);
  const item = current.routes[0].providers[0];
  item.id = 'trip';
  item.verification.paymentMethod = '내통장결제';
  item.verification.evidence.provider = 'trip';
  const merged = mergePrices(current, current).routes[0].providers[0];
  assert.match(merged.fareNote, /내통장결제/);
});

test('diagnostics select newest attempt for each provider', () => {
  const old = { provider: 'google', origin: 'SEL', destination: 'TYO', departureDate: route.departureDate,
    returnDate: route.returnDate, attemptedAt: '2026-10-17T05:00:00Z' };
  const current = { ...old, attemptedAt: '2026-10-17T05:15:00Z' };
  assert.deepEqual(mergeDiagnostics([old], [current]), [current]);
});
