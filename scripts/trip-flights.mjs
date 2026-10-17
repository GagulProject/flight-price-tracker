import { createHash } from 'node:crypto';

export async function readTripSnapshot(page) {
  const drawer = page.locator('.ift-drawer__content');
  return {
    url: page.url(),
    searchText: await page.locator('#searchBox-content').innerText(),
    drawerText: await drawer.innerText(),
    price: Number(await drawer.locator('[data-total-price]').first().getAttribute('data-total-price')),
  };
}

function koreanDate(date) {
  const [year, month, day] = date.split('-').map(Number);
  return `${year}년 ${month}월 ${day}일`;
}

export function tripQuoteFromSnapshot(route, snapshot, observedAt) {
  const url = new URL(snapshot.url);
  const params = url.searchParams;
  if (url.hostname !== 'kr.trip.com' || url.pathname !== '/flights/ShowFareNext' ||
      params.get('triptype')?.toUpperCase() !== 'RT' || params.get('dcity')?.toUpperCase() !== route.origin.code ||
      params.get('acity')?.toUpperCase() !== route.destination.code || params.get('ddate') !== route.departureDate ||
      params.get('rdate') !== route.returnDate || params.get('quantity') !== '1' ||
      params.get('class')?.toUpperCase() !== 'Y' || params.get('curr') !== 'KRW') return null;
  if (!/왕복/.test(snapshot.searchText) || !/성인 1명\s*·\s*일반석/.test(snapshot.searchText)) return null;
  const text = snapshot.drawerText;
  const departure = koreanDate(route.departureDate);
  const returning = koreanDate(route.returnDate);
  if (!new RegExp(`서울\\s*\\((?:ICN|GMP)\\)도쿄\\s*\\((?:NRT|HND)\\)${departure}`).test(text) ||
      !new RegExp(`도쿄\\s*\\((?:NRT|HND)\\)서울\\s*\\((?:ICN|GMP)\\)${returning}`).test(text) ||
      !/왕복[\s\S]*일반석/.test(text) || !/운임 선택/.test(text)) return null;
  if (!Number.isInteger(snapshot.price) || snapshot.price < 50000 || snapshot.price > 3000000 ||
      !text.includes(`${snapshot.price.toLocaleString('ko-KR')}원`)) return null;
  const paymentMethod = text.match(/결제 방법:\s*([^\n]+)/)?.[1]?.trim();
  if (!paymentMethod) return null;
  return {
    kind: 'live-round-trip-total', origin: route.origin.code, destination: route.destination.code,
    departureDate: route.departureDate, returnDate: route.returnDate, adults: 1, cabin: 'economy',
    currency: 'KRW', priceKrw: snapshot.price, observedAt, paymentMethod,
    evidence: { source: 'visible-search-result', provider: 'trip',
      offerId: createHash('sha256').update(`${snapshot.price}:${text.slice(0, text.indexOf('운임 선택'))}`).digest('hex').slice(0, 24) }
  };
}
