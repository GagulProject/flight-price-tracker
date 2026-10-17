import { readFileSync } from 'node:fs';
const data = JSON.parse(readFileSync(new URL('../data/prices.json', import.meta.url), 'utf8'));
const expected = { origin: 'SEL', destination: 'TYO', departureDate: '2026-12-30', returnDate: '2027-01-01', tripType: 'round-trip', adults: 1, cabin: 'economy' };
for (const [key, value] of Object.entries(expected)) if (data.route[key] !== value) throw new Error(`route.${key} does not match tracked itinerary`);
if (!Number.isFinite(Date.parse(data.lastAttemptAt))) throw new Error('lastAttemptAt must be a timestamp');
if (data.providers.length !== 2 || new Set(data.providers.map(x => x.id)).size !== 2) throw new Error('Expected two distinct providers');
for (const item of data.providers) {
  const url = new URL(item.url);
  const host = url.hostname;
  if (url.protocol !== 'https:') throw new Error(`Invalid protocol: ${item.id}`);
  if (item.id === 'naver' && host !== 'flight.naver.com') throw new Error('Invalid Naver link');
  if (item.id === 'trip' && !['kr.trip.com', 'www.trip.com'].includes(host)) throw new Error('Invalid Trip.com link');
  if (item.id === 'naver' && !url.pathname.includes('SEL:city-TYO:city-20261230/TYO:city-SEL:city-20270101')) throw new Error('Naver itinerary mismatch');
  if (item.id === 'trip' && (url.searchParams.get('ddate') !== '2026-12-30' || url.searchParams.get('rdate') !== '2027-01-01' || url.searchParams.get('triptype') !== 'rt')) throw new Error('Trip.com itinerary mismatch');
  if (item.status === 'checked') {
    if (!Number.isInteger(item.priceKrw) || item.priceKrw <= 0 || !Number.isFinite(Date.parse(item.checkedAt))) throw new Error(`Invalid checked price: ${item.id}`);
  } else if (item.priceKrw !== null || item.checkedAt !== null) throw new Error(`Unavailable price must not look current: ${item.id}`);
}
console.log('Price data is valid');
