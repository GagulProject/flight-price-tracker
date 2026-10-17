import { validQuote } from './quote-state.mjs';
import { readFileSync } from 'node:fs';
const data = JSON.parse(readFileSync(new URL('../data/prices.json', import.meta.url), 'utf8'));
if (!Array.isArray(data.routes) || data.routes.length === 0) throw new Error('At least one route is required');
const seen = new Set();
for (const route of data.routes) {
  for (const city of [route.origin, route.destination]) {
    if (!/^[A-Z]{3}$/.test(city.code) || !city.name || !Array.isArray(city.aliases)) throw new Error('Invalid city');
  }
  if (route.origin.code === route.destination.code) throw new Error('Origin and destination must differ');
  for (const date of [route.departureDate, route.returnDate]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(date).toISOString().slice(0, 10) !== date) throw new Error(`Invalid date: ${date}`);
  }
  if (route.returnDate < route.departureDate) throw new Error('Return date precedes departure date');
  if (route.tripType !== 'round-trip' || route.adults !== 1 || route.cabin !== 'economy') throw new Error('Unsupported itinerary');
  if (route.lastAttemptAt !== null && !Number.isFinite(Date.parse(route.lastAttemptAt))) throw new Error('Invalid last attempt');
  const key = [route.origin.code, route.destination.code, route.departureDate, route.returnDate].join(':');
  if (seen.has(key)) throw new Error(`Duplicate route: ${key}`);
  seen.add(key);
  const requiredProviders = ['naver', 'trip', 'google', 'skyscanner', 'expedia'];
  if (!Array.isArray(route.providers) || route.providers.length !== requiredProviders.length || new Set(route.providers.map(x => x.id)).size !== requiredProviders.length || requiredProviders.some(id => !route.providers.some(item => item.id === id))) throw new Error('Expected five distinct providers');
  for (const item of route.providers) {
    const url = new URL(item.url);
    if (url.protocol !== 'https:') throw new Error(`Invalid protocol: ${item.id}`);
    if (item.id === 'naver') {
      if (url.hostname !== 'flight.naver.com') throw new Error('Invalid Naver link');
      const departure = route.departureDate.replaceAll('-', '');
      const returnDate = route.returnDate.replaceAll('-', '');
      if (!url.pathname.includes(`${route.origin.code}:city-${route.destination.code}:city-${departure}/${route.destination.code}:city-${route.origin.code}:city-${returnDate}`)) throw new Error('Naver itinerary mismatch');
    } else if (item.id === 'trip') {
      if (!['kr.trip.com', 'www.trip.com'].includes(url.hostname)) throw new Error('Invalid Trip.com link');
      if (url.searchParams.get('dcity') !== route.origin.code.toLowerCase() || url.searchParams.get('acity') !== route.destination.code.toLowerCase() || url.searchParams.get('ddate') !== route.departureDate || url.searchParams.get('rdate') !== route.returnDate || url.searchParams.get('triptype') !== 'rt') throw new Error('Trip.com itinerary mismatch');
    } else if (item.id === 'google') {
      if (url.hostname !== 'www.google.com' || url.pathname !== '/travel/flights/search' ||
          !url.searchParams.get('tfs') || url.searchParams.get('hl') !== 'ko' ||
          url.searchParams.get('curr') !== 'KRW' || url.searchParams.get('gl') !== 'KR') throw new Error('Invalid Google Flights link');
    } else if (item.id === 'skyscanner') {
      if (url.hostname !== 'www.skyscanner.co.kr' || !url.pathname.startsWith('/transport/flights/')) throw new Error('Invalid Skyscanner link');
      const parts = url.pathname.split('/').filter(Boolean);
      const dates = [route.departureDate, route.returnDate].map(date => date.slice(2).replaceAll('-', ''));
      const skyCode = code => code === 'TYO' ? 'tyoa' : code.toLowerCase();
      if (parts[2] !== skyCode(route.origin.code) || parts[3] !== skyCode(route.destination.code) || parts[4] !== dates[0] || parts[5] !== dates[1] || url.searchParams.get('adultsv2') !== '1' || url.searchParams.get('cabinclass') !== 'economy' || url.searchParams.get('rtn') !== '1') throw new Error('Skyscanner itinerary mismatch');
    } else if (item.id === 'expedia') {
      if (url.hostname !== 'www.expedia.co.kr' || url.pathname !== '/Flights-Search' || url.searchParams.get('trip') !== 'roundtrip' || url.searchParams.get('passengers') !== 'adults:1' || url.searchParams.get('options') !== 'cabinclass:economy' || url.searchParams.get('currency') !== 'KRW') throw new Error('Invalid Expedia itinerary');
      const legs = url.searchParams.getAll('leg1').concat(url.searchParams.getAll('leg2'));
      const dates = [route.departureDate, route.returnDate].map(d=>d.slice(5,7)+'/'+d.slice(8,10)+'/'+d.slice(0,4));
      if (legs.length !== 2 || !legs[0].includes('from:'+route.origin.code+',to:'+route.destination.code+',departure:'+dates[0]) || !legs[1].includes('from:'+route.destination.code+',to:'+route.origin.code+',departure:'+dates[1])) throw new Error('Expedia dates mismatch');
    } else throw new Error('Unknown provider');
    if (!Array.isArray(item.history)) throw new Error(`Missing price history: ${item.id}`);
    let previousTime = -Infinity;
    for (const sample of item.history) {
      const time = Date.parse(sample.checkedAt);
      if (!Number.isFinite(time) || time <= previousTime || !Number.isInteger(sample.priceKrw) || sample.priceKrw <= 0) throw new Error(`Invalid price history: ${item.id}`);
      if (route.lastAttemptAt && time > Date.parse(route.lastAttemptAt)) throw new Error(`History is newer than last attempt: ${item.id}`);
      previousTime = time;
    }
    if (item.status === 'checked' || item.status === 'stale') {
      if (!Number.isInteger(item.priceKrw) || item.priceKrw <= 0 || !Number.isFinite(Date.parse(item.checkedAt))) throw new Error(`Invalid checked price: ${item.id}`);
      if (item.status === 'checked' && !validQuote(route,item.verification,item.checkedAt)) throw new Error('Checked price lacks verification evidence');
      const latest = item.history.at(-1);
      if (!latest || latest.checkedAt !== item.checkedAt || latest.priceKrw !== item.priceKrw) throw new Error(`Current price must match latest history: ${item.id}`);
    } else if (item.status !== 'unavailable' || item.priceKrw !== null || item.checkedAt !== null) throw new Error(`Unavailable price must not look current: ${item.id}`);
  }
}
console.log(`Price data is valid (${data.routes.length} routes)`);

