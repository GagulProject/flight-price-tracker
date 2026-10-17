import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

export const refreshTitle = '항공권 가격 새 수집 요청';
export const refreshMarker = 'flight-refresh:v1';

export function pendingRefreshRequests(issues, startedAt) {
  const cutoff = Date.parse(startedAt);
  if (!Number.isFinite(cutoff)) throw new Error('Invalid collection start time');
  return issues.filter(issue =>
    !issue.pull_request && issue.state === 'open' && issue.title === refreshTitle &&
    issue.body?.startsWith(`${refreshMarker}\n`) &&
    issue.body.includes('SEL → TYO') &&
    issue.body.includes('2026-12-30 → 2027-01-01') &&
    Date.parse(issue.created_at) <= cutoff
  );
}

function githubApi(args) {
  return execFileSync('gh', ['api', ...args], { encoding: 'utf8' });
}

function run() {
  const startedAt = process.argv[2];
  const results = JSON.parse(readFileSync(process.argv[3], 'utf8'));
  const issues = JSON.parse(githubApi(['repos/GagulProject/flight-price-tracker/issues?state=open&per_page=100']));
  const pending = pendingRefreshRequests(issues, startedAt);
  const verified = results.filter(item => item.status === 'verified' && item.quote?.priceKrw).map(item => `${item.provider}: ${item.quote.priceKrw.toLocaleString('ko-KR')}원`);
  const body = verified.length
    ? `PC 브라우저 수집과 게시를 마쳤습니다. 이번 실행에서 확인한 왕복 총액: ${verified.join(', ')}. 최신 가격과 검증 시각은 https://gagulproject.github.io/flight-price-tracker/ 에서 확인할 수 있습니다.`
    : 'PC 브라우저 수집과 게시를 마쳤지만, 이번 실행에서 새 왕복 총액을 검증하지 못했습니다. 기존 검증 가격과 이력은 유지했습니다. https://gagulproject.github.io/flight-price-tracker/ 에서 최근 시도 상태를 확인할 수 있습니다.';
  for (const issue of pending) {
    githubApi([`repos/GagulProject/flight-price-tracker/issues/${issue.number}/comments`, '-f', `body=${body}`]);
    githubApi([`repos/GagulProject/flight-price-tracker/issues/${issue.number}`, '-X', 'PATCH', '-f', 'state=closed']);
    console.log(`Completed refresh request #${issue.number}`);
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) run();
