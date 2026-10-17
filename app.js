const money = new Intl.NumberFormat('ko-KR');
const dateTime = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const providers = { naver: { name: '네이버 항공권', mark: 'N', className: 'naver' }, trip: { name: '트립닷컴', mark: 'T', className: 'trip' } };
const form = document.getElementById('route-form');
const results = document.getElementById('results');
let routes = [];
let currentQuery = null;

function checkedPrice(item) {
  return Number.isInteger(item.priceKrw) && item.priceKrw > 0 && Number.isFinite(Date.parse(item.checkedAt)) && item.status === 'checked';
}

function safeLink(item) {
  try {
    const url = new URL(item.url);
    const allowed = item.id === 'naver' ? ['flight.naver.com'] : ['kr.trip.com', 'www.trip.com'];
    return url.protocol === 'https:' && allowed.includes(url.hostname) ? url.href : '#';
  } catch { return '#'; }
}

function cityMatches(query, city) {
  const value = query.trim().toLocaleLowerCase('ko-KR');
  return [city.name, city.code, ...(city.aliases || [])].some(name => name.toLocaleLowerCase('ko-KR') === value);
}

function makeElement(tag, className, content) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (content !== undefined) element.textContent = content;
  return element;
}

function makeProviderCard(item) {
  const provider = providers[item.id];
  const link = makeElement('a', 'provider-card');
  link.href = safeLink(item);
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.setAttribute('aria-label', `${provider.name} 검색 페이지 열기`);
  const top = makeElement('div', 'provider-top');
  const name = makeElement('div', 'provider-name');
  name.append(makeElement('span', `provider-logo ${provider.className}`, provider.mark), document.createTextNode(provider.name));
  top.append(name, makeElement('span', 'arrow', '↗'));
  const price = makeElement('div', `provider-price${checkedPrice(item) ? '' : ' unavailable'}`, checkedPrice(item) ? `${money.format(item.priceKrw)}원~` : '가격 확인 대기');
  const footer = makeElement('div', 'provider-footer', checkedPrice(item) ? `가격 확인 ${dateTime.format(new Date(item.checkedAt))} KST · ${item.fareNote || '왕복 최저가'}` : (item.note || '해당 날짜의 가격을 확인 중입니다.'));
  link.append(top, makeElement('p', 'provider-kicker', 'ROUND TRIP · 1 ADULT'), price, footer, makeElement('span', 'provider-badge', '검색 결과 보기'));
  return link;
}

function makeRouteCard(route) {
  const wrapper = makeElement('article', 'itinerary');
  const heading = makeElement('div', 'itinerary-heading');
  const path = makeElement('div', 'itinerary-path');
  path.append(makeElement('strong', '', `${route.origin.name} (${route.origin.code})`), makeElement('span', 'path-arrow', '↔'), makeElement('strong', '', `${route.destination.name} (${route.destination.code})`));
  heading.append(path, makeElement('span', 'dates', `${route.departureDate} → ${route.returnDate} · 왕복`));
  const valid = route.providers.filter(checkedPrice).sort((a, b) => a.priceKrw - b.priceKrw);
  const summary = makeElement('div', 'price-summary');
  summary.append(makeElement('span', '', '확인된 최저가'), makeElement('strong', '', valid.length ? `${money.format(valid[0].priceKrw)}원~` : '가격 확인 대기'));
  if (valid.length) summary.append(makeElement('small', '', `${providers[valid[0].id].name} 기준`));
  const update = makeElement('p', 'route-updated', route.lastAttemptAt ? `최근 조회 ${dateTime.format(new Date(route.lastAttemptAt))} KST` : '첫 조회 대기');
  const grid = makeElement('div', 'provider-grid');
  grid.append(...route.providers.filter(item => providers[item.id]).map(makeProviderCard));
  wrapper.append(heading, summary, update, grid);
  return wrapper;
}

function requestLink(query) {
  const title = `[항공권 추적 요청] ${query.origin} → ${query.destination} ${query.departureDate}~${query.returnDate}`;
  const body = `출발 도시 또는 공항: ${query.origin}\n도착 도시 또는 공항: ${query.destination}\n가는 날: ${query.departureDate}\n오는 날: ${query.returnDate}\n여정: 왕복\n인원: 성인 1명\n좌석: 일반석\n\n네이버 항공권과 트립닷컴 가격을 6시간마다 추적해 주세요.`;
  const url = new URL('https://github.com/horace-velmont/flight-price-tracker/issues/new');
  url.searchParams.set('title', title);
  url.searchParams.set('body', body);
  return url.href;
}

function showRoutes(items, query) {
  currentQuery = query || null;
  results.replaceChildren();
  document.getElementById('result-count').textContent = `TRACKED ROUTES / ${String(items.length).padStart(2, '0')}`;
  document.getElementById('show-all').hidden = !query;
  if (items.length) {
    results.append(...items.map(makeRouteCard));
    return;
  }
  const empty = makeElement('div', 'empty-state');
  empty.append(makeElement('h3', '', '아직 추적 중인 일정이 없습니다.'), makeElement('p', '', '새 일정을 요청하면 다음 6시간 갱신 작업에서 확인합니다. 등록되면 이 화면에서 가격을 볼 수 있습니다.'));
  const link = makeElement('a', 'request-button', '이 일정 추적 요청하기 ↗');
  link.href = requestLink(query);
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  empty.append(link);
  results.append(empty);
}

function readQuery() {
  return { origin: document.getElementById('origin').value.trim(), destination: document.getElementById('destination').value.trim(), departureDate: document.getElementById('departure-date').value, returnDate: document.getElementById('return-date').value };
}

form.addEventListener('submit', event => {
  event.preventDefault();
  const query = readQuery();
  const error = document.getElementById('form-error');
  if (query.returnDate < query.departureDate) {
    error.textContent = '오는 날은 가는 날 이후로 선택해 주세요.';
    error.hidden = false;
    return;
  }
  error.hidden = true;
  const matches = routes.filter(route => cityMatches(query.origin, route.origin) && cityMatches(query.destination, route.destination) && route.departureDate === query.departureDate && route.returnDate === query.returnDate);
  showRoutes(matches, query);
});

document.getElementById('show-all').addEventListener('click', () => showRoutes(routes));

async function loadPrices() {
  const button = document.getElementById('refresh-data');
  button.disabled = true;
  button.textContent = '불러오는 중…';
  try {
    const response = await fetch(`./data/prices.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('가격 정보를 읽지 못했습니다.');
    const data = await response.json();
    routes = data.routes;
    if (currentQuery) {
      const query = currentQuery;
      const matches = routes.filter(route => cityMatches(query.origin, route.origin) && cityMatches(query.destination, route.destination) && route.departureDate === query.departureDate && route.returnDate === query.returnDate);
      showRoutes(matches, query);
    } else showRoutes(routes);
    const latest = routes.map(route => route.lastAttemptAt).filter(Boolean).sort().at(-1);
    document.getElementById('refresh-label').textContent = latest ? `최근 조회 ${dateTime.format(new Date(latest))} KST` : '첫 조회 대기';
  } catch {
    document.getElementById('refresh-label').textContent = '가격 정보를 불러오지 못했습니다';
    results.textContent = '잠시 후 새로고침해 주세요.';
  } finally {
    button.disabled = false;
    button.textContent = '↻ 게시 데이터 새로고침';
  }
}

document.getElementById('refresh-data').addEventListener('click', loadPrices);
loadPrices();
