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
  const requiredProviders = ['naver', 'trip', 'google', 'skyscanner'];
  if (!Array.isArray(route.providers) || route.providers.length !== requiredProviders.length || new Set(route.providers.map(x => x.id)).size !== requiredProviders.length || requiredProviders.some(id => !route.providers.some(item => item.id === id))) throw new Error('Expected four distinct providers');
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
      if (url.hostname !== 'www.google.com' || url.pathname !== '/travel/flights' || url.searchParams.get('curr') !== 'KRW') throw new Error('Invalid Google Flights link');
      const query = url.searchParams.get('q') || '';
      const dates = [route.departureDate, route.returnDate].map(date => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(`${date}T00:00:00Z`)).replace(',', ''));
      if (![route.origin, route.destination].every(city => [city.name, ...city.aliases].some(name => query.toLowerCase().includes(name.toLowerCase()))) || dates.some(date => !query.includes(date))) throw new Error('Google Flights itinerary mismatch');
    } else if (item.id === 'skyscanner') {
      if (url.hostname !== 'www.skyscanner.co.kr' || !url.pathname.startsWith('/transport/flights/')) throw new Error('Invalid Skyscanner link');
      const parts = url.pathname.split('/').filter(Boolean);
      const dates = [route.departureDate, route.returnDate].map(date => date.slice(2).replaceAll('-', ''));
      const skyCode = code => code === 'TYO' ? 'tyoa' : code.toLowerCase();
      if (parts[2] !== skyCode(route.origin.code) || parts[3] !== skyCode(route.destination.code) || parts[4] !== dates[0] || parts[5] !== dates[1] || url.searchParams.get('adultsv2') !== '1' || url.searchParams.get('cabinclass') !== 'economy' || url.searchParams.get('rtn') !== '1') throw new Error('Skyscanner itinerary mismatch');
    } else throw new Error('Unknown provider');
    if (item.status === 'checked') {
      if (!Number.isInteger(item.priceKrw) || item.priceKrw <= 0 || !Number.isFinite(Date.parse(item.checkedAt))) throw new Error(`Invalid checked price: ${item.id}`);
    } else if (item.status !== 'unavailable' || item.priceKrw !== null || item.checkedAt !== null) throw new Error(`Unavailable price must not look current: ${item.id}`);
  }
}
console.log(`Price data is valid (${data.routes.length} routes)`);
