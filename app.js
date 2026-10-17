const money = new Intl.NumberFormat('ko-KR');
const dateTime = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const providers = { naver: { name: '네이버 항공권', mark: 'N', className: 'naver' }, trip: { name: '트립닷컴', mark: 'T', className: 'trip' } };

function checkedPrice(item) {
  return Number.isInteger(item.priceKrw) && item.priceKrw > 0 && item.checkedAt && item.status === 'checked';
}

function safeLink(item) {
  try {
    const url = new URL(item.url);
    const allowed = item.id === 'naver' ? ['flight.naver.com'] : ['kr.trip.com', 'www.trip.com'];
    return url.protocol === 'https:' && allowed.includes(url.hostname) ? url.href : '#';
  } catch { return '#'; }
}

function renderCard(item) {
  const provider = providers[item.id];
  const link = document.createElement('a');
  link.className = 'provider-card';
  link.href = safeLink(item);
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.setAttribute('aria-label', `${provider.name} 검색 페이지 열기`);
  const top = document.createElement('div'); top.className = 'provider-top';
  const name = document.createElement('div'); name.className = 'provider-name';
  const logo = document.createElement('span'); logo.className = `provider-logo ${provider.className}`; logo.textContent = provider.mark;
  name.append(logo, document.createTextNode(provider.name));
  const arrow = document.createElement('span'); arrow.className = 'arrow'; arrow.textContent = '↗';
  top.append(name, arrow);
  const kicker = document.createElement('p'); kicker.className = 'provider-kicker'; kicker.textContent = 'ROUND TRIP · 1 ADULT';
  const price = document.createElement('div'); price.className = `provider-price${checkedPrice(item) ? '' : ' unavailable'}`;
  price.textContent = checkedPrice(item) ? `${money.format(item.priceKrw)}원~` : '가격 확인 대기';
  const footer = document.createElement('div'); footer.className = 'provider-footer';
  footer.textContent = checkedPrice(item) ? `최근 확인 ${dateTime.format(new Date(item.checkedAt))} KST · ${item.fareNote || '왕복 최저가'}` : (item.note || '해당 날짜의 가격을 확인 중입니다.');
  const badge = document.createElement('span'); badge.className = 'provider-badge'; badge.textContent = '검색 결과 보기';
  link.append(top, kicker, price, footer, badge);
  return link;
}

async function loadPrices() {
  try {
    const response = await fetch(`./data/prices.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('가격 정보를 읽지 못했습니다.');
    const data = await response.json();
    const items = data.providers.filter(item => providers[item.id]);
    const grid = document.getElementById('provider-grid');
    grid.replaceChildren(...items.map(renderCard));
    const valid = items.filter(checkedPrice).sort((a, b) => a.priceKrw - b.priceKrw);
    document.getElementById('overall-price').textContent = valid.length ? `${money.format(valid[0].priceKrw)}원~` : '—';
    document.getElementById('overall-source').textContent = valid.length ? valid[0].name + ' 기준' : '가격 확인 전';
    document.getElementById('refresh-label').textContent = data.lastAttemptAt ? `최근 조회 ${dateTime.format(new Date(data.lastAttemptAt))} KST` : '첫 조회 대기';
  } catch (error) {
    document.getElementById('refresh-label').textContent = '가격 정보를 불러오지 못했습니다';
    document.getElementById('provider-grid').textContent = '잠시 후 새로고침해 주세요.';
  }
}

loadPrices();
