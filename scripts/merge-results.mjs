import { validQuote } from './quote-state.mjs';

function newer(left, right, field) {
  return (left?.[field] || '') >= (right?.[field] || '') ? left : right;
}

export function mergePrices(remote, collected) {
  const merged = structuredClone(remote);
  const collectedRoutes = new Map(collected.routes.map(route => [
    [route.origin.code, route.destination.code, route.departureDate, route.returnDate].join(':'), route
  ]));
  for (const route of merged.routes) {
    const key = [route.origin.code, route.destination.code, route.departureDate, route.returnDate].join(':');
    const other = collectedRoutes.get(key);
    if (!other) continue;
    const byId = new Map(other.providers.map(provider => [provider.id, provider]));
    for (const provider of route.providers) {
      const candidate = byId.get(provider.id);
      if (!candidate) continue;
      const latestAttempt = newer(provider, candidate, 'lastAttemptAt');
      const samples = new Map();
      for (const sample of [...provider.history, ...candidate.history]) {
        const previous = samples.get(sample.checkedAt);
        if (!previous?.evidence || sample.evidence) samples.set(sample.checkedAt, sample);
      }
      provider.history = [...samples.values()].sort((a, b) => a.checkedAt.localeCompare(b.checkedAt));
      const latestSample = provider.history.at(-1);
      const verified = [provider.verification, candidate.verification]
        .filter(quote => validQuote(route, quote, quote?.observedAt))
        .sort((a, b) => b.observedAt.localeCompare(a.observedAt))[0];
      provider.lastAttemptAt = latestAttempt.lastAttemptAt;
      provider.collectionStatus = latestAttempt.collectionStatus;
      provider.note = latestAttempt.note;
      if (latestSample) {
        provider.priceKrw = latestSample.priceKrw;
        provider.checkedAt = latestSample.checkedAt;
        provider.verification = verified?.observedAt === latestSample.checkedAt ? verified : undefined;
        provider.status = latestAttempt.collectionStatus === 'verified' && provider.verification ? 'checked' : 'stale';
        provider.fareNote = provider.verification ?
          (provider.status === 'checked'
            ? `검증된 왕복 총액 · 성인 1명 · 일반석 · KRW${provider.verification.paymentMethod ? ` · ${provider.verification.paymentMethod}` : ''}`
            : '마지막 검증 가격 · 이번 수집 실패') :
          '과거 기록 · 검증 근거 없음';
      } else {
        provider.priceKrw = null;
        provider.checkedAt = null;
        provider.verification = undefined;
        provider.status = 'unavailable';
        provider.fareNote = '과거 기록 · 검증 근거 없음';
      }
    }
    route.lastAttemptAt = route.providers.map(provider => provider.lastAttemptAt).filter(Boolean).sort().at(-1) || null;
  }
  return merged;
}

export function mergeDiagnostics(remote, collected) {
  const entries = new Map();
  for (const result of [...remote, ...collected]) {
    const key = [result.origin, result.destination, result.departureDate, result.returnDate, result.provider].join(':');
    const previous = entries.get(key);
    if (!previous || result.attemptedAt > previous.attemptedAt) entries.set(key, result);
  }
  return [...entries.values()];
}
