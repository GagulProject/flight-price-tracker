# Flight Watch

서울(SEL) ↔ 도쿄(TYO), 2026-12-30 출발·2027-01-01 귀국 왕복 항공권 가격을 비교하는 GitHub Pages 사이트입니다.

`data/prices.json`의 각 가격은 표시된 일정으로 사이트의 실제 검색 결과에서 확인한 값만 기록합니다. 조회 실패 시 `status: "unavailable"`, `priceKrw: null`, `checkedAt: null`로 기록합니다. `lastAttemptAt`은 가격 확인 성공 여부와 관계없이 마지막 조회 시각입니다. `npm run check`로 날짜·가격·링크를 검증합니다.

정적 페이지 배포는 `main` push 시 GitHub Actions가 수행합니다. 6시간 주기 조회는 이 저장소의 외부 Codex automation에서 실행하고, 조회 성공 시 가격 데이터를 갱신합니다. 항공권 사이트의 가격은 예약 단계에서 달라질 수 있습니다.
