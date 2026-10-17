import { createHash } from 'node:crypto';

// Read only the selected round-trip itinerary and its ordinary seller prices.
export async function readNaverSnapshot(page) {
  return page.evaluate(() => ({
    url: location.href,
    itinerary: document.querySelector('[class*="international_selected_flights"]')?.innerText || '',
    paymentType: [...document.querySelectorAll('*')]
      .filter(element => element.children.length === 0 && element.textContent?.trim() === '성인/모든 결제수단')
      .map(element => element.textContent.trim()).slice(0, 1)[0] || '',
    sellerRows: [...document.querySelectorAll('[class*="detail_row"]')]
      .map(element => element.innerText.trim()).slice(0, 40)
  }));
}

export function naverQuoteFromSnapshot(route, snapshot, observedAt) {
  if (!snapshot || snapshot.paymentType !== '성인/모든 결제수단') return null;
  let url;
  try { url = new URL(snapshot.url); } catch { return null; }
  const departure = route.departureDate.replaceAll('-', '');
  const returning = route.returnDate.replaceAll('-', '');
  if (url.hostname !== 'flight.naver.com' ||
      url.pathname !== `/flights/international/detail/SEL:city-TYO:city-${departure}/TYO:city-SEL:city-${returning}` ||
      url.searchParams.get('adult') !== '1' || url.searchParams.get('fareType') !== 'Y') return null;
  const flights = url.searchParams.get('selectedFlight') || '';
  if (!new RegExp(`^1:${departure}(ICN|GMP)(NRT|HND)[^,]*,2:${returning}(NRT|HND)(ICN|GMP)`).test(flights)) return null;
  const itinerary = snapshot.itinerary || '';
  if (!/가는편[\s\S]*인천|가는편[\s\S]*김포/.test(itinerary) ||
      !/오는편[\s\S]*도쿄/.test(itinerary) ||
      !itinerary.includes('12.30.') || !itinerary.includes('1.1.')) return null;
  const fares = (snapshot.sellerRows || []).flatMap(row => {
    const match = /^([^\d\n]+?)(?:\n|해외업체|국내업체)[\s\S]*?([1-9]\d{0,2}(?:,\d{3})+)\s*원$/.exec(row);
    if (!match || /광고|할인|카드|사업자|편도|~/i.test(row)) return [];
    const priceKrw = Number(match[2].replaceAll(',', ''));
    return priceKrw >= 50000 && priceKrw <= 3000000 ? [{ seller: match[1].trim(), priceKrw }] : [];
  }).sort((a, b) => a.priceKrw - b.priceKrw);
  const best = fares[0];
  if (!best) return null;
  return {
    kind: 'live-round-trip-total', origin: route.origin.code, destination: route.destination.code,
    departureDate: route.departureDate, returnDate: route.returnDate, adults: 1, cabin: 'economy',
    currency: 'KRW', priceKrw: best.priceKrw, observedAt,
    evidence: { source: 'visible-search-result', provider: 'naver', seller: best.seller,
      offerId: createHash('sha256').update(`${flights}:${best.seller}:${best.priceKrw}`).digest('hex').slice(0, 24) }
  };
}
