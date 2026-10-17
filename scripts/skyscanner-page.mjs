import { createHash } from 'node:crypto';

export async function readSkyscannerSnapshot(page) {
  return page.evaluate(() => ({
    url: location.href,
    header: (document.body?.innerText || '').slice(0, 350),
    cards: [...document.querySelectorAll('[role="listitem"]')]
      .map(element => element.innerText)
      .filter(text => text.includes('항공편 옵션 설정') && text.includes('귀국 항공편:'))
      .slice(0, 100)
  }));
}

export function skyscannerPageQuoteFromSnapshot(route, snapshot, observedAt) {
  if (!snapshot) return null;
  let url;
  try { url = new URL(snapshot.url); } catch { return null; }
  const departure = route.departureDate.slice(2).replaceAll('-', '');
  const returning = route.returnDate.slice(2).replaceAll('-', '');
  if (url.hostname !== 'www.skyscanner.co.kr' ||
      url.pathname !== `/transport/flights/sel/tyoa/${departure}/${returning}/` ||
      url.searchParams.get('adultsv2') !== '1' ||
      url.searchParams.get('cabinclass') !== 'economy' || url.searchParams.get('rtn') !== '1') return null;
  const header = snapshot.header || '';
  if (!/서울 \(모두\)[\s\S]*도쿄 \(모두\)/.test(header) ||
      !header.includes('성인 1명, 일반석') || !header.includes('₩ KRW') ||
      !header.includes('12월 30일') || !header.includes('1월 1일')) return null;
  const fares = (snapshot.cards || []).flatMap(card => {
    const match = /항공편 옵션 설정\d+: 총 금액 ₩([1-9]\d{0,2}(?:,\d{3})+)\./.exec(card);
    if (!match || /광고|스폰서|편도/.test(card) || !card.includes('세금과 수수료 포함 가격') ||
        !/출국 항공편:[\s\S]*출발지: (?:인천|서울 김포)[\s\S]*도착지: 도쿄/.test(card) ||
        !/귀국 항공편:[\s\S]*출발지: 도쿄[\s\S]*도착지: (?:인천|서울 김포)/.test(card)) return [];
    const priceKrw = Number(match[1].replaceAll(',', ''));
    return priceKrw >= 50000 && priceKrw <= 3000000 ? [{ priceKrw, card }] : [];
  }).sort((a, b) => a.priceKrw - b.priceKrw);
  const best = fares[0];
  if (!best) return null;
  return {
    kind: 'live-round-trip-total', origin: route.origin.code, destination: route.destination.code,
    departureDate: route.departureDate, returnDate: route.returnDate, adults: 1, cabin: 'economy',
    currency: 'KRW', priceKrw: best.priceKrw, observedAt,
    evidence: { source: 'visible-search-result', provider: 'skyscanner',
      offerId: createHash('sha256').update(best.card).digest('hex').slice(0, 24) }
  };
}
