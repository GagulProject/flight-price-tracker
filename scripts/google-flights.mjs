import { createHash } from 'node:crypto';

export function googleQuoteFromSnapshot(route, snapshot, observedAt) {
  if (!snapshot || snapshot.tripType !== '왕복' || snapshot.passengers !== '승객 1명, 승객 수를 변경합니다.' ||
      snapshot.cabin !== '이코노미' || snapshot.currency !== '통화 KRW' ||
      snapshot.departureDate !== route.departureDate || snapshot.returnDate !== route.returnDate ||
      !['서울특별시', '서울', 'Seoul'].includes(snapshot.origin) ||
      !['도쿄도', '도쿄', 'Tokyo'].includes(snapshot.destination) ||
      snapshot.searchError || !snapshot.resultsReady) return null;
  const fares = (snapshot.priceLabels || []).flatMap(label => {
    const match = /^왕복 총 가격은 최저 ([1-9]\d{4,6}) 대한민국 원입니다\./.exec(label);
    return match ? [{ priceKrw: Number(match[1]), label }] : [];
  }).filter(fare => fare.priceKrw >= 50000 && fare.priceKrw <= 3000000);
  const selected = fares.sort((a, b) => a.priceKrw - b.priceKrw)[0];
  if (!selected) return null;
  return {
    kind: 'live-round-trip-total', origin: route.origin.code, destination: route.destination.code,
    departureDate: route.departureDate, returnDate: route.returnDate, adults: 1, cabin: 'economy',
    currency: 'KRW', priceKrw: selected.priceKrw, observedAt,
    evidence: { source: 'visible-search-result', provider: 'google',
      offerId: createHash('sha256').update(selected.label).digest('hex').slice(0, 24) }
  };
}

export async function readGoogleSnapshot(page) {
  return page.evaluate(() => {
    const field = label => document.querySelector(`input[aria-label="${label}"]`);
    const date = label => field(label)?.closest('[data-value]')?.getAttribute('data-value');
    const selected = [...document.querySelectorAll('div[role="combobox"]')].slice(0, 2);
    const buttonLabel = prefix => [...document.querySelectorAll('button[aria-label]')]
      .map(button => button.getAttribute('aria-label')).find(label => label.startsWith(prefix));
    const content = document.body?.innerText || '';
    return {
      tripType: selected[0]?.innerText.trim(), cabin: selected[1]?.innerText.trim(),
      passengers: buttonLabel('승객 '), currency: buttonLabel('통화 '),
      origin: field('출발지가 어디인가요?')?.value, destination: field('목적지가 어디인가요?')?.value,
      departureDate: date('출발'), returnDate: date('도착'),
      resultsReady: /결과 \d+개가 반환되었습니다\./.test(content),
      searchError: /반환된 결과가 없습니다|죄송합니다\. 오류가 발생했습니다/.test(content),
      priceLabels: [...document.querySelectorAll('[role="link"][aria-label]')]
        .map(element => element.getAttribute('aria-label'))
        .filter(label => label.startsWith('왕복 총 가격은')).slice(0, 100)
    };
  });
}
