const endpoint = 'https://partners.api.skyscanner.net/apiservices/v3/flights/live/search';

function dateParts(date) {
  const [year, month, day] = date.split('-').map(Number);
  return { year, month, day };
}

export function searchQuery(route) {
  const leg = (origin, destination, date) => ({
    originPlaceId: { iata: origin },
    destinationPlaceId: { iata: destination },
    date: dateParts(date)
  });
  return { query: {
    market: 'KR', locale: 'ko-KR', currency: 'KRW', adults: 1,
    cabinClass: 'CABIN_CLASS_ECONOMY',
    queryLegs: [leg(route.origin.code, route.destination.code, route.departureDate),
      leg(route.destination.code, route.origin.code, route.returnDate)]
  } };
}

function amountInKrw(price) {
  const divisor = { PRICE_UNIT_WHOLE: 1, PRICE_UNIT_CENTI: 100, PRICE_UNIT_MILLI: 1000, PRICE_UNIT_MICRO: 1000000 }[price?.unit];
  if (!divisor || !/^\d+$/.test(String(price.amount))) return null;
  const value = Number(price.amount) / divisor;
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function dateOf(value) {
  if (!value || !Number.isInteger(value.year) || !Number.isInteger(value.month) || !Number.isInteger(value.day)) return null;
  return `${value.year}-${String(value.month).padStart(2, '0')}-${String(value.day).padStart(2, '0')}`;
}

export function cheapestVerifiedItinerary(route, response, observedAt) {
  if (response?.status !== 'RESULT_STATUS_COMPLETE') return null;
  const results = response.content?.results;
  const places = results?.places || {};
  const legs = results?.legs || {};
  const airports = { SEL: ['SEL', 'ICN', 'GMP'], TYO: ['TYO', 'NRT', 'HND'] };
  const placeMatches = (id, city) => {
    const place = places[id];
    const parent = places[place?.parentId];
    return [place?.iata, parent?.iata].some(iata => (airports[city] || [city]).includes(iata));
  };
  const candidates = [];
  for (const [itineraryId, itinerary] of Object.entries(results?.itineraries || {})) {
    if (!Array.isArray(itinerary.legIds) || itinerary.legIds.length !== 2) continue;
    const [outbound, inbound] = itinerary.legIds.map(id => legs[id]);
    const matches = (leg, origin, destination, date) => leg &&
      placeMatches(leg.originPlaceId, origin) && placeMatches(leg.destinationPlaceId, destination) &&
      dateOf(leg.departureDateTime) === date;
    if (!matches(outbound, route.origin.code, route.destination.code, route.departureDate) ||
        !matches(inbound, route.destination.code, route.origin.code, route.returnDate)) continue;
    for (const option of itinerary.pricingOptions || []) {
      const priceKrw = amountInKrw(option.price);
      if (priceKrw === null || !option.id || !option.items?.some(item => /^https:\/\//.test(item.deepLink || ''))) continue;
      candidates.push({
        kind: 'live-round-trip-total', origin: route.origin.code, destination: route.destination.code,
        departureDate: route.departureDate, returnDate: route.returnDate, adults: 1, cabin: 'economy',
        currency: 'KRW', priceKrw, observedAt,
        evidence: { source: 'authorized-live-api', provider: 'skyscanner', offerId: `${itineraryId}:${option.id}` }
      });
    }
  }
  return candidates.sort((a, b) => a.priceKrw - b.priceKrw)[0] || null;
}

export async function collectSkyscanner(route, apiKey, request = fetch) {
  if (!apiKey) return { status: 'api-key-missing', detail: 'Skyscanner partner API key is not configured' };
  const post = async (url, body) => {
    const response = await request(url, {
      method: 'POST', headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000)
    });
    if (!response.ok) throw new Error(`Skyscanner partner API HTTP ${response.status}`);
    return response.json();
  };
  let response = await post(`${endpoint}/create`, searchQuery(route));
  const token = response.sessionToken;
  if (!token) throw new Error('Skyscanner partner API did not return a session token');
  for (let attempt = 0; attempt < 3 && response.status !== 'RESULT_STATUS_COMPLETE'; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    const update = await post(`${endpoint}/poll/${encodeURIComponent(token)}`);
    response = update.action === 'RESULT_ACTION_NOT_MODIFIED' && !update.content
      ? { ...response, status: update.status }
      : update;
  }
  const observedAt = new Date().toISOString();
  const quote = cheapestVerifiedItinerary(route, response, observedAt);
  return quote ? { status: 'verified', detail: 'Skyscanner partner API returned an exact round-trip total', quote }
    : { status: response.status === 'RESULT_STATUS_COMPLETE' ? 'no-verified-offer' : 'api-incomplete', detail: 'No complete, exact round-trip offer was verified' };
}
