'use strict';

// ─── 定数 ────────────────────────────────────────────────────────────────────

const COUNTRIES_ORDER = [
  '韓国', '台湾', '中国', '香港', 'タイ', 'シンガポール', 'マレーシア',
  'インドネシア', 'フィリピン', 'ベトナム', 'インド', '中東地域',
  '英国', 'フランス', 'ドイツ', 'イタリア', 'スペイン', '北欧地域',
  '米国', 'カナダ', 'メキシコ', '豪州', 'その他',
];

const YEAR_COLORS = {
  '2024': { line: 'rgba(156,163,175,1)', fill: 'rgba(156,163,175,0.12)' },
  '2025': { line: 'rgba(59,130,246,1)',  fill: 'rgba(59,130,246,0.12)'  },
  '2026': { line: 'rgba(239,68,68,1)',   fill: 'rgba(239,68,68,0.12)'   },
};

const MONTHS_JP = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

const COLOR_SELECTED  = 'rgba(249,115,22,0.85)';  // 選択国：オレンジ
const COLOR_DEFAULT   = 'rgba(59,130,246,0.75)';  // 通常：青
const COLOR_YOY_UP    = 'rgba(5,122,85,1)';       // 前年比↑：緑
const COLOR_YOY_DOWN  = 'rgba(200,30,30,1)';      // 前年比↓：赤
const COLOR_REF_LINE  = 'rgba(5,122,85,0.6)';     // 100%基準線：緑点線

// ─── 状態 ────────────────────────────────────────────────────────────────────

const state = {
  country: '韓国',      // 国籍プルダウン（'総数' = 合計）
  mode: 'monthly',      // 'monthly' | 'cumulative' | 'annual'
  year: '2026',         // 比較対象年
  startMonth: 1,
  endMonth: 3,
};

let data = null;
let trendChart = null;
let barChart = null;

// ─── ヘルパー ─────────────────────────────────────────────────────────────────

function fmt(n) {
  if (n == null) return '—';
  return n.toLocaleString('ja-JP');
}

function getMonthly(entity, year, month) {
  return data.monthly[entity]?.[year]?.[String(month)] ?? null;
}

function getAvailableMonths(year) {
  return (data.meta.available_months[year] || []).map(Number);
}

function getValue(entity, year, mode, startM, endM) {
  if (data.meta.new_in_2026 && data.meta.new_in_2026.includes(entity) && year !== '2026') return null;

  if (mode === 'monthly') {
    return getMonthly(entity, year, endM);
  }
  if (mode === 'annual') {
    const months = getAvailableMonths(year);
    let sum = 0, hasAny = false;
    for (const m of months) {
      const v = getMonthly(entity, year, m);
      if (v != null) { sum += v; hasAny = true; }
    }
    return hasAny ? sum : null;
  }
  // cumulative
  let sum = 0, hasAny = false;
  for (let m = startM; m <= endM; m++) {
    const v = getMonthly(entity, year, m);
    if (v != null) { sum += v; hasAny = true; }
  }
  return hasAny ? sum : null;
}

function prevYear(year) {
  return String(parseInt(year) - 1);
}

function makePeriodLabel() {
  const { mode, year, startMonth, endMonth } = state;
  if (mode === 'annual')     return `${year}年`;
  if (mode === 'monthly')    return `${year}年${endMonth}月`;
  return startMonth === endMonth
    ? `${year}年${startMonth}月`
    : `${year}年${startMonth}〜${endMonth}月累計`;
}

// ─── カスタム凡例（線＋丸）ビルダー ──────────────────────────────────────────

/**
 * id: 凡例 div の id（なければ canvas の直前に自動挿入）
 * canvas: 対象の canvas 要素
 * datasets: Chart.js datasets 配列（borderColor / label を使用）
 */
function buildCustomLegend(id, canvas, datasets) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    el.className = 'custom-legend';
    // .chart-wrap か .bar-chart-wrap いずれかの直前に挿入
    const wrap = canvas.closest('.chart-wrap') || canvas.closest('.bar-chart-wrap');
    wrap.before(el);
  }
  el.innerHTML = datasets.map(ds => {
    // type:'bar' → 四角スウォッチ、それ以外 → 線＋丸スウォッチ
    const swatch = ds.type === 'bar'
      ? `<div class="cl-swatch-bar" style="background:${ds._legendColor ?? ds.backgroundColor}"></div>`
      : `<div class="cl-swatch-line" style="background:${ds.borderColor}"></div>
         <div class="cl-swatch-dot"  style="background:${ds.borderColor}"></div>`;
    return `
      <div class="cl-item">
        <div class="cl-swatch">${swatch}</div>
        <span>${ds.label}</span>
      </div>`;
  }).join('');
}

// ─── 100%基準線プラグイン（barChart固定） ────────────────────────────────────

const refLinePlugin = {
  id: 'refLine100',
  afterDraw(chart) {
    const y1 = chart.scales['y1'];
    if (!y1) return;
    const ctx2 = chart.ctx;
    const yPx  = y1.getPixelForValue(100);
    ctx2.save();
    ctx2.strokeStyle = COLOR_REF_LINE;
    ctx2.lineWidth   = 1.5;
    ctx2.setLineDash([6, 3]);
    ctx2.beginPath();
    ctx2.moveTo(chart.chartArea.left,  yPx);
    ctx2.lineTo(chart.chartArea.right, yPx);
    ctx2.stroke();
    ctx2.restore();
  },
};

// ─── コントロール初期化 ────────────────────────────────────────────────────────

function setupCountrySelect() {
  const sel = document.getElementById('inb-country');
  sel.innerHTML = '';
  sel.appendChild(new Option('総数', '総数'));
  COUNTRIES_ORDER.filter(c => data.monthly[c]).forEach(c => sel.appendChild(new Option(c, c)));
  sel.value = state.country;
  sel.addEventListener('change', () => {
    state.country = sel.value;
    updateAll();
  });
}

function setupModeButtons() {
  document.querySelectorAll('.inb-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.mode = btn.dataset.mode;
      document.querySelectorAll('.inb-mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyPeriodVisibility();
      updateAll();
    });
  });
}

function buildYearOptions() {
  const sel   = document.getElementById('inb-year');
  sel.innerHTML = '';
  const years = Object.keys(data.meta.available_months).sort();
  state.year  = years[years.length - 1];  // 最新年をデフォルト
  years.forEach(y => sel.appendChild(new Option(`${y}年`, y)));
  sel.value = state.year;
  sel.addEventListener('change', () => {
    state.year = sel.value;
    rebuildMonthDropdowns();
    updateAll();
  });
}

function rebuildMonthDropdowns() {
  const months   = getAvailableMonths(state.year);
  const startSel = document.getElementById('inb-start-month');
  const endSel   = document.getElementById('inb-end-month');

  startSel.innerHTML = '';
  endSel.innerHTML   = '';
  months.forEach(m => {
    startSel.appendChild(new Option(MONTHS_JP[m - 1], m));
    endSel.appendChild(new Option(MONTHS_JP[m - 1], m));
  });

  state.startMonth = months[0];
  state.endMonth   = months[months.length - 1];
  startSel.value   = state.startMonth;
  endSel.value     = state.endMonth;

  startSel.onchange = () => {
    state.startMonth = parseInt(startSel.value);
    if (state.endMonth < state.startMonth) {
      state.endMonth = state.startMonth;
      endSel.value   = state.endMonth;
    }
    updateAll();
  };
  endSel.onchange = () => {
    state.endMonth = parseInt(endSel.value);
    if (state.startMonth > state.endMonth) {
      state.startMonth = state.endMonth;
      startSel.value   = state.startMonth;
    }
    updateAll();
  };
}

function applyPeriodVisibility() {
  const startSel = document.getElementById('inb-start-month');
  const sep      = document.getElementById('inb-period-sep');
  const endSel   = document.getElementById('inb-end-month');

  if (state.mode === 'cumulative') {
    startSel.classList.remove('hidden');
    sep.classList.remove('hidden');
    endSel.classList.remove('hidden');
  } else if (state.mode === 'annual') {
    startSel.classList.add('hidden');
    sep.classList.add('hidden');
    endSel.classList.add('hidden');
  } else {
    // monthly
    startSel.classList.add('hidden');
    sep.classList.add('hidden');
    endSel.classList.remove('hidden');
  }
}

// ─── 新ダッシュボード（monthly_report.html）と同じ見せ方 ─────────────────────────
// 年の色・マーカー：今年＝青●太線、前年＝橙■、前々年＝緑◇白抜き（新ダッシュボードと共通）
const INB_YEAR_STYLE = [
  { color: '#2a78d6', pointStyle: 'circle',  hollow: false, r: 4.5, width: 3 },
  { color: '#eb6834', pointStyle: 'rect',    hollow: false, r: 4,   width: 2 },
  { color: '#1baf7a', pointStyle: 'rectRot', hollow: true,  r: 4.5, width: 2 },
];
const INB_POS = '#2a78d6', INB_NEG = '#e34948';
const INB_BAR = '#86b6ef', INB_BAR_SEL = '#1c5cab';
const INB_GRID = '#e1e0d9', INB_AXIS = '#c3c2b7', INB_INK2 = '#52514e';

let yoyChart = null;
let barYoyChart = null;

const pctOf = (a, b) => (a == null || !b) ? null : (a / b - 1) * 100;
const pctTxt = p => p == null ? '—' : `${p >= 0 ? '+' : '△'}${Math.abs(p).toFixed(1)}%`;
const manTxt = v => v >= 10000 ? (v / 10000).toLocaleString('ja-JP', { maximumFractionDigits: 1 }) + '万' : fmt(v);

function inbBaseOptions(extra = {}) {
  return Object.assign({
    responsive: true, maintainAspectRatio: false, animation: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: { backgroundColor: '#ffffff', titleColor: '#0b0b0b', bodyColor: INB_INK2, borderColor: INB_GRID,
                 borderWidth: 1, padding: 10, boxPadding: 4, usePointStyle: true },
    },
    scales: {
      x: { grid: { display: false }, border: { color: INB_AXIS }, ticks: { color: INB_INK2, font: { size: 11 } } },
      y: { grid: { color: INB_GRID }, border: { display: false }, ticks: { color: INB_INK2, font: { size: 11 } } },
    },
  }, extra);
}

function inbReplaceChart(current, canvasId, config) {
  if (current) current.destroy();
  return new Chart(document.getElementById(canvasId), config);
}

function inbLegendHtml(years) {
  const mk = s => {
    const shape = { circle: `<circle cx="11" cy="6" r="4" fill="${s.color}"/>`,
      rect: `<rect x="7.5" y="2.5" width="7" height="7" fill="${s.color}"/>`,
      rectRot: `<path d="M11 1.5L15.5 6L11 10.5L6.5 6Z" fill="#fff" stroke="${s.color}" stroke-width="1.6"/>` }[s.pointStyle];
    return `<svg width="22" height="12"><line x1="0" y1="6" x2="22" y2="6" stroke="${s.color}" stroke-width="2"/>${shape}</svg>`;
  };
  return years.map((y, k) => `<span>${mk(INB_YEAR_STYLE[years.length - 1 - k])}${y}年</span>`).join('');
}

function trendYears() {
  const years = Object.keys(data.meta.available_months).sort();
  return years.slice(-3);   // 今年＋過去2年
}

// ─── 要約メッセージ＋主要数字 ───────────────────────────────────────────────────
function updateSummary() {
  const { mode, year, startMonth, endMonth, country } = state;
  const prev = prevYear(year);
  const label = makePeriodLabel();
  const cur = getValue(country, year, mode, startMonth, endMonth);
  const pv = getValue(country, prev, mode, startMonth, endMonth);
  const total = getValue('総数', year, mode, startMonth, endMonth);
  const p = pctOf(cur, pv);
  const name = country === '総数' ? '訪日客数（総数）' : `${country}からの訪日客数`;
  const cmp = mode === 'monthly' ? '前年同月比' : mode === 'annual' ? '前年比' : '前年同期比';

  const rows = COUNTRIES_ORDER.filter(c => data.monthly[c] && c !== 'その他')
    .map(c => ({ c, v: getValue(c, year, mode, startMonth, endMonth) })).filter(r => r.v != null)
    .sort((a, b) => b.v - a.v);
  const rank = country === '総数' ? null : rows.findIndex(r => r.c === country) + 1;

  const lines = [`${label}の${name}は${fmt(cur)}人${p == null ? '' : `（${cmp}${pctTxt(p)}）`}。`];
  if (country !== '総数' && rank) lines.push(`国・地域別では${rows.length}か国・地域中${rank}位、全体に占めるシェアは${(cur / total * 100).toFixed(1)}%。`);
  else {
    const neg = COUNTRIES_ORDER.filter(c => data.monthly[c] && c !== 'その他')
      .filter(c => { const a = getValue(c, year, mode, startMonth, endMonth), b = getValue(c, prev, mode, startMonth, endMonth); return a != null && b && a < b; });
    lines.push(neg.length === 0 ? '主要国・地域は全て前年を上回った。'
      : neg.length <= 3 ? `前年を下回ったのは${neg.join('、')}。` : `前年を下回ったのは${neg.length}か国・地域。`);
  }
  document.getElementById('inb-msg').innerHTML = lines.map(t => `<p>${t}</p>`).join('');

  const tiles = [
    { lbl: `${label}`, val: fmt(cur), unit: '人', p },
    { lbl: mode === 'monthly' ? `前年同月（${prev}年${endMonth}月）` : mode === 'annual' ? `前年（${prev}年）` : `前年同期（${prev}年）`, val: fmt(pv), unit: '人', note: pv != null && cur != null ? `前年差 ${cur >= pv ? '+' : '△'}${fmt(Math.abs(cur - pv))}人` : '—' },
    country === '総数'
      ? { lbl: '国・地域数（前年比プラス）', val: String(rows.filter(r => { const b = getValue(r.c, prev, mode, startMonth, endMonth); return b && r.v >= b; }).length), unit: `/${rows.length}`, note: '「その他」を除く' }
      : { lbl: '全体に占めるシェア', val: total ? (cur / total * 100).toFixed(1) : '—', unit: '%', note: `総数 ${fmt(total)}人` },
    country === '総数'
      ? { lbl: '最多の国・地域', val: rows[0] ? rows[0].c : '—', unit: '', note: rows[0] ? `${fmt(rows[0].v)}人` : '' }
      : { lbl: '国・地域別の順位', val: rank ? String(rank) : '—', unit: '位', note: `${rows.length}か国・地域中` },
  ];
  document.getElementById('inb-kpis').innerHTML = tiles.map(t => `<div class="inb-kpi"><div class="lbl">${t.lbl}</div>
    <div class="val">${t.val}<small>${t.unit}</small></div>
    <div class="delta ${t.p == null ? '' : t.p >= 0 ? 'up' : 'down'}">${t.p != null ? `${t.p >= 0 ? '▲' : '▼'} ${cmp} ${pctTxt(t.p)}` : t.note}</div></div>`).join('');
}

// ─── 月次推移（直線・全年マーカー） ──────────────────────────────────────────────
function updateTrendChart() {
  const entity = state.country;
  document.getElementById('trend-title').textContent =
    entity === '総数' ? '月次推移（訪日外客数 総数）' : `月次推移（${entity}）`;
  const years = trendYears();
  const datasets = years.map((year, k) => {
    const s = INB_YEAR_STYLE[years.length - 1 - k];
    const maxM = Math.max(0, ...getAvailableMonths(year));
    const values = Array.from({ length: 12 }, (_, i) => (i + 1 <= maxM ? getMonthly(entity, year, i + 1) : null));
    return {
      label: `${year}年`, data: values, borderColor: s.color, backgroundColor: s.hollow ? '#ffffff' : s.color,
      pointStyle: s.pointStyle, pointRadius: s.r, pointHoverRadius: s.r + 2,
      pointBorderColor: s.hollow ? s.color : '#ffffff', pointBorderWidth: s.hollow ? 1.8 : 1,
      borderWidth: s.width, tension: 0, spanGaps: false, order: years.length - k,
    };
  });
  document.getElementById('trend-legend').innerHTML = inbLegendHtml(years);
  const o = inbBaseOptions();
  o.scales.y.ticks.callback = v => manTxt(v);
  o.plugins.tooltip.callbacks = { label: c => ` ${c.dataset.label}：${c.raw == null ? '—' : fmt(c.raw) + '人'}` };
  trendChart = inbReplaceChart(trendChart, 'trend-chart', { type: 'line', data: { labels: MONTHS_JP, datasets }, options: o });
}

// ─── 月別の前年同月比（選択国・選択年） ──────────────────────────────────────────
function updateYoyMonthChart() {
  const { country, year } = state;
  const prev = prevYear(year);
  const months = getAvailableMonths(year);
  document.getElementById('yoy-title').textContent =
    `月別の前年同月比（${country === '総数' ? '総数' : country}・${year}年）`;
  const vals = months.map(m => pctOf(getMonthly(country, year, m), getMonthly(country, prev, m)));
  const o = inbBaseOptions();
  o.interaction = { mode: 'nearest', axis: 'x', intersect: false };
  o.scales.y.ticks.callback = v => `${v}%`;
  o.plugins.tooltip.callbacks = { label: c => ` 前年同月比：${pctTxt(c.raw)}` };
  yoyChart = inbReplaceChart(yoyChart, 'yoy-chart', {
    type: 'bar',
    data: { labels: months.map(m => MONTHS_JP[m - 1]), datasets: [{ label: '前年同月比', data: vals,
      backgroundColor: vals.map(v => (v ?? 0) >= 0 ? INB_POS : INB_NEG), borderRadius: 4, borderSkipped: false,
      maxBarThickness: 28 }] },
    options: o,
  });
}

// ─── 国・地域別（期間）＋前年比（左右に分けて同じ並び） ───────────────────────────
function updateBarChart() {
  const { mode, year, startMonth, endMonth, country } = state;
  const prev = prevYear(year);
  const rows = COUNTRIES_ORDER.filter(c => data.monthly[c] && c !== 'その他')
    .map(c => ({ name: c, cur: getValue(c, year, mode, startMonth, endMonth), prev: getValue(c, prev, mode, startMonth, endMonth) }))
    .filter(r => r.cur != null)
    .sort((a, b) => b.cur - a.cur);
  const labels = rows.map(r => r.name);
  const label = makePeriodLabel();
  document.getElementById('bar-label').textContent = label;
  document.getElementById('bar-title').textContent = `国・地域別 訪日客数（${label}）`;
  document.getElementById('bar-yoy-title').textContent =
    mode === 'monthly' ? '前年同月比' : mode === 'annual' ? '前年比' : '前年同期比';

  const hbar = (extra) => {
    const o = inbBaseOptions({ indexAxis: 'y' });
    o.interaction = { mode: 'nearest', axis: 'y', intersect: false };
    o.scales.x = { grid: { color: INB_GRID }, border: { display: false }, ticks: { color: INB_INK2, font: { size: 11 } } };
    o.scales.y = { grid: { display: false }, border: { color: INB_AXIS },
      ticks: { color: c => (labels[c.index] === country ? INB_BAR_SEL : INB_INK2), font: c => ({ size: 11, weight: labels[c.index] === country ? '700' : '400' }), autoSkip: false } };
    return Object.assign(o, extra);
  };

  const o1 = hbar();
  o1.scales.x.ticks.callback = v => manTxt(v);
  o1.plugins.tooltip.callbacks = { label: c => ` ${fmt(c.raw)}人` };
  barChart = inbReplaceChart(barChart, 'bar-chart', {
    type: 'bar',
    data: { labels, datasets: [{ label: '訪日客数', data: rows.map(r => r.cur),
      backgroundColor: rows.map(r => r.name === country ? INB_BAR_SEL : INB_BAR),
      borderRadius: 4, borderSkipped: 'start', maxBarThickness: 18, categoryPercentage: 0.8 }] },
    options: o1,
  });

  const yoy = rows.map(r => pctOf(r.cur, r.prev));
  const o2 = hbar();
  o2.scales.x.ticks.callback = v => `${v}%`;
  o2.plugins.tooltip.callbacks = { label: c => ` ${document.getElementById('bar-yoy-title').textContent}：${pctTxt(c.raw)}` };
  barYoyChart = inbReplaceChart(barYoyChart, 'bar-yoy-chart', {
    type: 'bar',
    data: { labels, datasets: [{ label: '前年同期比', data: yoy,
      backgroundColor: yoy.map(v => (v ?? 0) >= 0 ? INB_POS : INB_NEG),
      borderRadius: 4, borderSkipped: false, maxBarThickness: 18, categoryPercentage: 0.8 }] },
    options: o2,
  });
}

// ─── 国別比較表 ────────────────────────────────────────────────────────────────

function yoyBadge(cur, prev, isNew) {
  if (isNew) return '<span class="badge badge-new">新規</span>';
  if (prev == null || prev === 0 || cur == null) return '<span class="badge badge-neutral">—</span>';
  const pct  = (cur - prev) / prev * 100;
  const sign = pct >= 0 ? '+' : '';
  const text = `${sign}${pct.toFixed(1)}%`;
  if (pct >= 20) return `<span class="badge badge-up-strong">${text}</span>`;
  if (pct >= 10) return `<span class="badge badge-up">${text}</span>`;
  if (pct >= 0)  return `<span class="badge badge-neutral">${text}</span>`;
  return `<span class="badge badge-down">${text}</span>`;
}

function updateTable() {
  const { mode, year, startMonth, endMonth, country } = state;
  const prev = prevYear(year);

  // ヘッダー更新
  const thCur  = document.getElementById('th-year-cur');
  const thPrev = document.getElementById('th-year-prev');
  if (thCur)  thCur.textContent  = `${year}年`;
  if (thPrev) thPrev.textContent = `${prev}年`;

  document.getElementById('table-label').textContent = makePeriodLabel();

  const tbody = document.querySelector('#comparison-table tbody');
  tbody.innerHTML = '';

  const totalCur  = getValue('総数',  year, mode, startMonth, endMonth);
  const koreaCur  = getValue('韓国', year, mode, startMonth, endMonth);

  const addRow = (entity, label, isTotal) => {
    const vCur  = getValue(entity, year, mode, startMonth, endMonth);
    const vPrev = getValue(entity, prev, mode, startMonth, endMonth);
    const isNew = data.meta.new_in_2026 && data.meta.new_in_2026.includes(entity);

    const sharePct = (vCur != null && totalCur != null && totalCur > 0)
      ? (vCur / totalCur * 100).toFixed(1) + '%'
      : '—';

    let barHtml = '';
    if (!isTotal) {
      const w = (vCur != null && koreaCur != null && koreaCur > 0)
        ? Math.min(100, (vCur / koreaCur) * 100).toFixed(1)
        : 0;
      barHtml = `<div class="share-bar"><div class="share-bar-fill" style="width:${w}%"></div></div>`;
    }

    const tr = document.createElement('tr');
    if (isTotal) tr.classList.add('row-total');
    if (!isTotal && entity === country) tr.classList.add('row-selected');

    tr.innerHTML = `
      <td class="col-name">${!isTotal && entity === country ? '▶ ' : ''}${label}</td>
      <td class="col-num">${fmt(vCur)}</td>
      <td class="col-num">${fmt(vPrev)}</td>
      <td class="col-num">${sharePct}</td>
      <td class="col-bar">${barHtml}</td>
      <td class="col-num">${yoyBadge(vCur, vPrev, isNew)}</td>
    `;
    tbody.appendChild(tr);
  };

  addRow('総数', '総数', true);
  COUNTRIES_ORDER.filter(c => data.monthly[c]).forEach(c => addRow(c, c, false));
}

// ─── 一括更新 ─────────────────────────────────────────────────────────────────

function updateAll() {
  updateSummary();
  updateTrendChart();
  updateYoyMonthChart();
  updateBarChart();
  updateTable();
}

// ─── 初期化 ───────────────────────────────────────────────────────────────────

async function init() {
  try {
    const res = await fetch('data/inbound.json', { cache: 'no-cache' });
    data = await res.json();
  } catch (e) {
    document.getElementById('tab-inbound').innerHTML =
      '<div style="padding:40px;text-align:center;color:#c81e1e">データ読み込みエラー：data/inbound.json が見つかりません</div>';
    return;
  }

  document.getElementById('last-updated').textContent = data.meta.last_updated;

  setupCountrySelect();
  setupModeButtons();
  buildYearOptions();
  rebuildMonthDropdowns();
  applyPeriodVisibility();

  updateAll();
}

init();

// ─── タブ切り替え ──────────────────────────────────────────────────────────────

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + tab).classList.add('active');

    if (tab === 'stay-country' && typeof onShowStayCountry === 'function') onShowStayCountry();
    if (tab === 'stay-pref'    && typeof onShowStayPref    === 'function') onShowStayPref();
  });
});
