const money = new Intl.NumberFormat('ko-KR');
const dateTime = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const providers = { naver: { name: '네이버 항공권', mark: 'N', className: 'naver', color: '#03a84e' }, trip: { name: '트립닷컴', mark: 'T', className: 'trip', color: '#2874e8' }, google: { name: 'Google 항공편', mark: 'G', className: 'google', color: '#d75b47' }, skyscanner: { name: '스카이스캐너', mark: 'S', className: 'skyscanner', color: '#0770e3' }, expedia: { name: '익스피디아', mark: 'E', className: 'expedia', color: '#f3a000' } };
const form = document.getElementById('route-form');
const results = document.getElementById('results');
let routes = [];
let currentQuery = null;

function checkedPrice(item) {
  return Number.isInteger(item.priceKrw) && item.priceKrw > 0 && Number.isFinite(Date.parse(item.checkedAt)) && item.status === 'checked' && item.collectionStatus === 'verified' && item.verification?.kind === 'live-round-trip-total';
}

function safeLink(item) {
  try {
    const url = new URL(item.url);
    const allowed = { naver: ['flight.naver.com'], trip: ['kr.trip.com', 'www.trip.com'], google: ['www.google.com'], skyscanner: ['www.skyscanner.co.kr'], expedia: ['www.expedia.co.kr'] }[item.id] || [];
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
  const price = makeElement('div', `provider-price${checkedPrice(item) ? '' : ' unavailable'}`, checkedPrice(item) ? `${money.format(item.priceKrw)}원` : Number.isInteger(item.priceKrw) ? `${money.format(item.priceKrw)}원 · 과거 기록` : '검증 가격 없음');
  const footer = makeElement('div', 'provider-footer', checkedPrice(item) ? `가격 확인 ${dateTime.format(new Date(item.checkedAt))} KST · ${item.fareNote || '왕복 최저가'}` : (item.note || '해당 날짜의 가격을 확인 중입니다.'));
  const status = makeElement('p', 'collection-status', `수집 상태: ${item.collectionStatus || '미검증'} · ${item.note || ''}`);
  const attempt = makeElement('p', 'provider-attempt', item.lastAttemptAt ? `최근 시도 ${dateTime.format(new Date(item.lastAttemptAt))} KST` : '최근 시도 없음');
  const verified = makeElement('p', 'provider-verified', item.verification ? `마지막 검증 ${dateTime.format(new Date(item.checkedAt))} KST` : '마지막 검증: 없음 · 기존 기록은 검증 근거 없음');
  link.append(status, attempt, verified);
  link.append(top, makeElement('p', 'provider-kicker', 'ROUND TRIP · 1 ADULT'), price, footer, makeElement('span', 'provider-badge', '검색 결과 보기'));
  return link;
}

function makeSvgElement(tag, attributes) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
  return element;
}

function makeTrend(route) {
  const section = makeElement('section', 'trend');
  section.append(makeElement('h3', '', '가격 추이'));
  const series = route.providers.filter(item => providers[item.id]).map(item => ({
    id: item.id,
    points: (item.history || []).filter(sample => sample.evidence?.kind === 'live-round-trip-total').map(sample => ({ time: Date.parse(sample.checkedAt), price: sample.priceKrw })).filter(sample => Number.isFinite(sample.time) && Number.isInteger(sample.price) && sample.price > 0)
  })).filter(item => item.points.length);
  const samples = series.flatMap(item => item.points);
  if (!samples.length) {
    section.append(makeElement('p', 'trend-note', '검증된 가격 이력이 없습니다. 기존 기록은 아래에 보존합니다.'));
    const list=makeElement('ul','legacy-history');
    for (const item of route.providers) for (const sample of item.history || []) list.append(makeElement('li','',`${providers[item.id]?.name || item.id} · ${money.format(sample.priceKrw)}원 · ${dateTime.format(new Date(sample.checkedAt))} KST · ${sample.evidence ? '검증 기록' : '검증 근거 없는 과거 기록'}`));
    section.append(list);
    return section;
  }

  const times = samples.map(sample => sample.time);
  const prices = samples.map(sample => sample.price);
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const margin = Math.max(5000, Math.round((maxPrice - minPrice) * 0.15));
  const low = Math.max(0, minPrice - margin);
  const high = maxPrice + margin;
  const left = 72;
  const right = 740;
  const top = 18;
  const bottom = 188;
  const x = time => minTime === maxTime ? (left + right) / 2 : left + (time - minTime) / (maxTime - minTime) * (right - left);
  const y = price => bottom - (price - low) / (high - low) * (bottom - top);
  const svg = makeSvgElement('svg', { viewBox: '0 0 760 220', role: 'img', 'aria-label': `${route.origin.name}에서 ${route.destination.name}까지 왕복 항공권의 사이트별 확인 가격 추이` });
  for (const fraction of [0, 0.5, 1]) {
    const price = low + (high - low) * fraction;
    const height = y(price);
    svg.append(makeSvgElement('line', { x1: left, y1: height, x2: right, y2: height, class: 'trend-grid-line' }));
    const label = makeSvgElement('text', { x: left - 10, y: height + 4, 'text-anchor': 'end', class: 'trend-axis-label' });
    label.textContent = `${Math.round(price / 1000)}천`;
    svg.append(label);
  }
  for (const item of series) {
    const color = providers[item.id].color;
    if (item.points.length > 1) svg.append(makeSvgElement('polyline', { points: item.points.map(point => `${x(point.time)},${y(point.price)}`).join(' '), fill: 'none', stroke: color, 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    for (const point of item.points) {
      const dot = makeSvgElement('circle', { cx: x(point.time), cy: y(point.price), r: 5, fill: color, stroke: '#fff', 'stroke-width': 2 });
      const title = makeSvgElement('title', {});
      title.textContent = `${providers[item.id].name} · ${dateTime.format(new Date(point.time))} KST · ${money.format(point.price)}원`;
      dot.append(title);
      svg.append(dot);
    }
  }
  const timeLabel = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  for (const [time, anchor, position] of [[minTime, 'start', left], [maxTime, 'end', right]]) {
    const label = makeSvgElement('text', { x: position, y: 214, 'text-anchor': anchor, class: 'trend-axis-label' });
    label.textContent = timeLabel.format(new Date(time));
    svg.append(label);
  }
  section.append(svg);
  const legend = makeElement('div', 'trend-legend');
  for (const item of series) {
    const label = makeElement('span', '', `${providers[item.id].name} · ${item.points.length}회`);
    const swatch = makeElement('i', 'trend-swatch');
    swatch.style.backgroundColor = providers[item.id].color;
    label.prepend(swatch);
    legend.append(label);
  }
  section.append(legend);
  if (series.every(item => item.points.length === 1)) section.append(makeElement('p', 'trend-note', '첫 가격을 기록했습니다. 다음 확인부터 사이트별 변화가 선으로 이어집니다.'));
  return section;
}

function makeRouteCard(route) {
  const wrapper = makeElement('article', 'itinerary');
  const heading = makeElement('div', 'itinerary-heading');
  const path = makeElement('div', 'itinerary-path');
  path.append(makeElement('strong', '', `${route.origin.name} (${route.origin.code})`), makeElement('span', 'path-arrow', '↔'), makeElement('strong', '', `${route.destination.name} (${route.destination.code})`));
  heading.append(path, makeElement('span', 'dates', `${route.departureDate} → ${route.returnDate} · 왕복`));
  const valid = route.providers.filter(checkedPrice).sort((a, b) => a.priceKrw - b.priceKrw);
  const summary = makeElement('div', 'price-summary');
  summary.append(makeElement('span', '', '이번 수집에서 검증된 최저가'), makeElement('strong', '', valid.length ? `${money.format(valid[0].priceKrw)}원` : '검증 가격 없음'));
  if (valid.length) summary.append(makeElement('small', '', `${providers[valid[0].id].name} 기준`));
  const update = makeElement('p', 'route-updated', route.lastAttemptAt ? `최근 조회 ${dateTime.format(new Date(route.lastAttemptAt))} KST` : '첫 조회 대기');
  const grid = makeElement('div', 'provider-grid');
  grid.append(...route.providers.filter(item => providers[item.id]).map(makeProviderCard));
  wrapper.append(heading, summary, update, grid, makeTrend(route));
  return wrapper;
}

function requestLink(query) {
  const title = `[항공권 추적 요청] ${query.origin} → ${query.destination} ${query.departureDate}~${query.returnDate}`;
  const body = `출발 도시 또는 공항: ${query.origin}\n도착 도시 또는 공항: ${query.destination}\n가는 날: ${query.departureDate}\n오는 날: ${query.returnDate}\n여정: 왕복\n인원: 성인 1명\n좌석: 일반석\n\n네이버 항공권·트립닷컴·Google 항공편·스카이스캐너 가격을 추적해 주세요.`;
  const url = new URL('https://github.com/GagulProject/flight-price-tracker/issues/new');
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
  empty.append(makeElement('h3', '', '아직 추적 중인 일정이 없습니다.'), makeElement('p', '', '새 일정을 요청하면 요청 검토 후 등록합니다. 등록되면 이 화면에서 가격을 볼 수 있습니다.'));
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

