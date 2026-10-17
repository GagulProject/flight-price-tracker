// A price-shaped string is diagnostic evidence only, never a bookable quote.
export function candidateAmounts(text, context = text) {
  if (/사업자|통신판매|전화번호|고객센터|로딩|loading|광고|편도/i.test(context)) return [];
  return [...text.matchAll(/(?:₩\s*|KRW\s*)([1-9]\d{0,2}(?:,\d{3})+|[1-9]\d{4,6})(?![\d-])|(?<![\d-])([1-9]\d{0,2}(?:,\d{3})+|[1-9]\d{4,6})\s*원/g)]
    .map(m => Number((m[1] || m[2]).replaceAll(',', ''))).filter(n => n >= 50000 && n <= 3000000);
}

export function validQuote(route, quote, attemptedAt) {
  if (!quote || quote.kind !== 'live-round-trip-total' || quote.currency !== 'KRW' || quote.adults !== 1 || quote.cabin !== 'economy') return false;
  if (quote.origin !== route.origin.code || quote.destination !== route.destination.code || quote.departureDate !== route.departureDate || quote.returnDate !== route.returnDate) return false;
  const age = Date.parse(attemptedAt) - Date.parse(quote.observedAt);
  return Number.isInteger(quote.priceKrw) && quote.priceKrw > 0 && Number.isFinite(age) && age >= 0 && age < 15 * 60 * 1000
    && ((quote.evidence?.source === 'authorized-live-api' && quote.evidence?.provider === 'skyscanner') ||
      (quote.evidence?.source === 'visible-search-result' && ['google', 'naver', 'skyscanner'].includes(quote.evidence?.provider))) &&
    typeof quote.evidence?.offerId === 'string' && quote.evidence.offerId.length > 0;
}

export function applyAttempt(route, provider, result) {
  provider.lastAttemptAt = result.attemptedAt;
  route.lastAttemptAt = result.attemptedAt;
  provider.collectionStatus = result.status;
  provider.note = result.detail;
  if (validQuote(route, result.quote, result.attemptedAt)) {
    const q = result.quote;
    if (!provider.history.some(s => s.checkedAt === q.observedAt)) provider.history.push({checkedAt:q.observedAt, priceKrw:q.priceKrw, evidence:q});
    provider.status = 'checked';
    provider.priceKrw = q.priceKrw;
    provider.checkedAt = q.observedAt;
    provider.verification = q;
    provider.collectionStatus = 'verified';
    provider.fareNote = '검증된 왕복 총액 · 성인 1명 · 일반석 · KRW';
  } else {
    // Keep the last price and all history, including legacy records without evidence.
    provider.status = provider.priceKrw === null ? 'unavailable' : 'stale';
    provider.fareNote = provider.verification ? '마지막 검증 가격 · 이번 수집 실패' : '과거 기록 · 검증 근거 없음';
  }
}

export function alertCandidates(data, results) {
  return results.filter(r => r.quote && data.routes.some(route =>
    validQuote(route, r.quote, r.attemptedAt) && route.providers.some(p => p.id === r.provider && p.checkedAt === r.quote.observedAt)
  ) && r.quote.priceKrw <= 330000);
}
