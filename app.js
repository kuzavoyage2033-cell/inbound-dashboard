'use strict';

// ─── 定数 ────────────────────────────────────────────────────────────────────

const COUNTRIES_ORDER = [
  '韓国', '台湾', '中国', '香港', 'タイ', 'シンガポール', 'マレーシア',
  'インドネシア', 'フィリピン', 'ベトナム', 'インド', '中東地域',
  '英国', 'フランス', 'ドイツ', 'イタリア', 'スペイン', '北欧地域',
  '米国', 'カナダ', 'メキシコ', '豪州', 'その他',
];

const YEAR_COLORS = {
  '2024': { line: 'rgba(156,163,175,1)', fill: 'rgba(156,163,175,0.12)', bar: 'rgba(156,163,175,0.7)' },
  '2025': { line: 'rgba(59,130,246,1)',  fill: 'rgba(59,130,246,0.12)',  bar: 'rgba(59,130,246,0.8)' },
  '2026': { line: 'rgba(239,68,68,1)',   fill: 'rgba(239,68,68,0.12)',   bar: 'rgba(239,68,68,0.85)' },
};

const MONTHS_JP = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

// ─── 状態 ────────────────────────────────────────────────────────────────────

const state = {
  mode: 'monthly',      // 'monthly' | 'cumulative'
  startMonth: 1,
  endMonth: 3,
  trendView: 'total',   // 'total' | 'country'
  trendCountry: '韓国',
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

/** 期間値を返す。新規市場は2026以外null */
function getPeriodValue(entity, year, startM, endM, mode) {
  if (data.meta.new_in_2026.includes(entity) && year !== '2026') return null;

  if (mode === 'monthly') {
    return getMonthly(entity, year, endM);
  }
  // 累計
  let sum = 0, hasAny = false;
  for (let m = startM; m <= endM; m++) {
    const v = getMonthly(entity, year, m);
    if (v != null) { sum += v; hasAny = true; }
  }
  return hasAny ? sum : null;
}

function yoyBadge(cur, prev, isNew) {
  if (isNew) return '<span class="badge badge-new">新規</span>';
  if (prev == null || prev === 0 || cur == null) return '<span class="badge badge-neutral">—</span>';
  const pct = (cur - prev) / prev * 100;
  const sign = pct >= 0 ? '+' : '';
  const text = `${sign}${pct.toFixed(1)}%`;
  if (pct >= 10)  return `<span class="badge badge-up">${text}</span>`;
  if (pct < 0)    return `<span class="badge badge-down">${text}</span>`;
  return `<span class="badge badge-neutral">${text}</span>`;
}

function makePeriodLabel() {
  const { mode, startMonth, endMonth } = state;
  if (mode === 'monthly') return `${endMonth}月`;
  return startMonth === endMonth ? `${startMonth}月` : `${startMonth}〜${endMonth}月累計`;
}

// ─── 月プルダウン ─────────────────────────────────────────────────────────────

function buildMonthOptions(select, months) {
  select.innerHTML = '';
  months.forEach(m => select.appendChild(new Option(MONTHS_JP[m - 1], m)));
}

function setupMonthDropdowns() {
  const months26 = getAvailableMonths('2026');
  const startSel = document.getElementById('start-month');
  const endSel   = document.getElementById('end-month');

  buildMonthOptions(startSel, months26);
  buildMonthOptions(endSel,   months26);

  state.startMonth = months26[0];
  state.endMonth   = months26[months26.length - 1];
  startSel.value = state.startMonth;
  endSel.value   = state.endMonth;

  startSel.addEventListener('change', () => {
    state.startMonth = parseInt(startSel.value);
    if (state.endMonth < state.startMonth) {
      state.endMonth = state.startMonth;
      endSel.value = state.endMonth;
    }
    updateAll();
  });

  endSel.addEventListener('change', () => {
    state.endMonth = parseInt(endSel.value);
    if (state.startMonth > state.endMonth) {
      state.startMonth = state.endMonth;
      startSel.value = state.startMonth;
    }
    updateAll();
  });
}

function applyModeToDropdowns() {
  const startSel = document.getElementById('start-month');
  const sep      = document.getElementById('period-sep');
  if (state.mode === 'cumulative') {
    startSel.classList.remove('hidden');
    sep.classList.remove('hidden');
  } else {
    startSel.classList.add('hidden');
    sep.classList.add('hidden');
  }
}

// ─── 国選択プルダウン ──────────────────────────────────────────────────────────

function setupCountrySelect() {
  const sel = document.getElementById('country-select');
  sel.innerHTML = '';
  COUNTRIES_ORDER
    .filter(c => c !== 'その他' && data.monthly[c])
    .forEach(c => sel.appendChild(new Option(c, c)));
  sel.value = state.trendCountry;
  sel.addEventListener('change', () => {
    state.trendCountry = sel.value;
    updateAll();
  });
}

// ─── モード切り替え ────────────────────────────────────────────────────────────

function setupModeSwitch() {
  document.querySelectorAll('.btn-mode').forEach(btn => {
    btn.addEventListener('click', () => {
      state.mode = btn.dataset.mode;
      document.querySelectorAll('.btn-mode').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyModeToDropdowns();
      updateAll();
    });
  });
}

// ─── トレンド切り替え ──────────────────────────────────────────────────────────

function setupViewToggle() {
  document.querySelectorAll('.btn-view').forEach(btn => {
    btn.addEventListener('click', () => {
      state.trendView = btn.dataset.view;
      document.querySelectorAll('.btn-view').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const countrySel = document.getElementById('country-select');
      state.trendView === 'country'
        ? countrySel.classList.remove('hidden')
        : countrySel.classList.add('hidden');
      updateAll();
    });
  });
}

// ─── サマリー更新 ─────────────────────────────────────────────────────────────

function updateSummary() {
  const { startMonth, endMonth, mode, trendView, trendCountry } = state;
  const entity = trendView === 'country' ? trendCountry : '総数';
  const isNew = data.meta.new_in_2026.includes(entity);

  const v26 = getPeriodValue(entity, '2026', startMonth, endMonth, mode);
  const v25 = isNew ? null : getPeriodValue(entity, '2025', startMonth, endMonth, mode);

  const labelEl = document.querySelector('#summary-total-2026 .summary-label');
  labelEl.textContent = trendView === 'country' ? `${trendCountry} 2026年` : '2026年合計';

  document.getElementById('val-total-2026').textContent = v26 != null ? fmt(v26) + '人' : '—';

  const yoyEl = document.getElementById('val-yoy');
  if (isNew) {
    yoyEl.textContent = '新規';
    yoyEl.className = 'summary-value';
  } else if (v26 != null && v25 != null && v25 !== 0) {
    const pct = (v26 - v25) / v25 * 100;
    const sign = pct >= 0 ? '+' : '';
    yoyEl.textContent = `${sign}${pct.toFixed(1)}%`;
    yoyEl.className = 'summary-value ' + (pct >= 0 ? 'up' : 'down');
  } else {
    yoyEl.textContent = '—';
    yoyEl.className = 'summary-value';
  }
}

// ─── 全体推移グラフ ────────────────────────────────────────────────────────────

function updateTrendChart() {
  const entity = state.trendView === 'total' ? '総数' : state.trendCountry;
  const titleEl = document.getElementById('trend-title');
  if (titleEl) titleEl.textContent = state.trendView === 'total' ? '全体推移（全国合計）' : `全体推移（${state.trendCountry}）`;

  const datasets = ['2024', '2025', '2026'].map(year => {
    // 2024/2025は12ヶ月、2026は利用可能月まで
    const maxM = Math.max(...getAvailableMonths(year));
    const values = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      return m <= maxM ? getMonthly(entity, year, m) : null;
    });
    const c = YEAR_COLORS[year];
    return {
      label: `${year}年`,
      data: values,
      borderColor: c.line,
      backgroundColor: c.fill,
      borderWidth: 2.5,
      tension: 0.35,
      pointRadius: 4,
      pointHoverRadius: 6,
      spanGaps: false,
      fill: false,
    };
  });

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'top', labels: { font: { size: 12 }, padding: 16 } },
      tooltip: {
        callbacks: {
          label: ctx => `${ctx.dataset.label}：${ctx.parsed.y != null ? fmt(ctx.parsed.y) + '人' : '—'}`,
        },
      },
    },
    scales: {
      x: {
        ticks: { font: { size: 11 } },
        grid: { color: 'rgba(0,0,0,0.04)' },
      },
      y: {
        beginAtZero: false,
        ticks: {
          font: { size: 11 },
          callback: v => (v >= 10000 ? (v / 10000).toFixed(0) + '万' : v.toLocaleString()),
        },
        grid: { color: 'rgba(0,0,0,0.04)' },
      },
    },
  };

  const ctx = document.getElementById('trend-chart');
  if (trendChart) {
    trendChart.data.datasets = datasets;
    trendChart.options = options;
    trendChart.update('none');
  } else {
    trendChart = new Chart(ctx, { type: 'line', data: { labels: MONTHS_JP, datasets }, options });
  }
}

// ─── 国別比較グラフ ────────────────────────────────────────────────────────────

function updateBarChart() {
  const { startMonth, endMonth, mode } = state;

  const countries = COUNTRIES_ORDER.filter(c => data.monthly[c]);
  const label25 = countries.map(c => getPeriodValue(c, '2025', startMonth, endMonth, mode));
  const label26 = countries.map(c => getPeriodValue(c, '2026', startMonth, endMonth, mode));

  const datasets = [
    {
      label: '2025年',
      data: label25,
      backgroundColor: YEAR_COLORS['2025'].bar,
      borderRadius: 3,
      borderSkipped: false,
    },
    {
      label: '2026年',
      data: label26,
      backgroundColor: YEAR_COLORS['2026'].bar,
      borderRadius: 3,
      borderSkipped: false,
    },
  ];

  document.getElementById('bar-label').textContent = `${makePeriodLabel()}（2025年 vs 2026年）`;

  const options = {
    responsive: false,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'top', labels: { font: { size: 12 }, padding: 16 } },
      tooltip: {
        callbacks: {
          label: ctx => `${ctx.dataset.label}：${ctx.parsed.y != null ? fmt(ctx.parsed.y) + '人' : '—'}`,
        },
      },
    },
    scales: {
      x: { ticks: { font: { size: 11 } }, grid: { color: 'rgba(0,0,0,0.04)' } },
      y: {
        beginAtZero: true,
        ticks: {
          font: { size: 11 },
          callback: v => (v >= 10000 ? (v / 10000).toFixed(0) + '万' : v.toLocaleString()),
        },
        grid: { color: 'rgba(0,0,0,0.04)' },
      },
    },
  };

  const ctx = document.getElementById('bar-chart');
  if (barChart) {
    barChart.data.labels = countries;
    barChart.data.datasets = datasets;
    barChart.options = options;
    barChart.update('none');
  } else {
    barChart = new Chart(ctx, { type: 'bar', data: { labels: countries, datasets }, options });
  }
}

// ─── 国別比較表 ────────────────────────────────────────────────────────────────

function updateTable() {
  const { startMonth, endMonth, mode } = state;
  document.getElementById('table-label').textContent = makePeriodLabel();
  const tbody = document.querySelector('#comparison-table tbody');
  tbody.innerHTML = '';

  const isCountryMode = state.trendView === 'country';
  const addRow = (entity, label, isTotal) => {
    const v26 = getPeriodValue(entity, '2026', startMonth, endMonth, mode);
    const v25 = getPeriodValue(entity, '2025', startMonth, endMonth, mode);
    const isNew = data.meta.new_in_2026.includes(entity);
    const isSelected = isCountryMode && entity === state.trendCountry;
    const tr = document.createElement('tr');
    if (isTotal) tr.classList.add('row-total');
    if (isSelected) tr.classList.add('row-selected');
    tr.innerHTML = `
      <td class="col-name">${isSelected ? '▶ ' : ''}${label}</td>
      <td class="col-num">${fmt(v26)}</td>
      <td class="col-num">${fmt(v25)}</td>
      <td class="col-num">${yoyBadge(v26, v25, isNew)}</td>
    `;
    tbody.appendChild(tr);
  };

  // 合計行を先頭に
  addRow('総数', '合計', true);

  // 国別
  COUNTRIES_ORDER.filter(c => data.monthly[c]).forEach(c => addRow(c, c, false));
}

// ─── 一括更新 ─────────────────────────────────────────────────────────────────

function updateAll() {
  updateSummary();
  updateTrendChart();
  updateBarChart();
  updateTable();
}

// ─── 初期化 ───────────────────────────────────────────────────────────────────

async function init() {
  try {
    const res = await fetch('data/inbound.json');
    data = await res.json();
  } catch (e) {
    document.querySelector('.container').innerHTML =
      '<div style="padding:40px;text-align:center;color:#c81e1e">データ読み込みエラー：data/inbound.json が見つかりません</div>';
    return;
  }

  document.getElementById('last-updated').textContent = data.meta.last_updated;

  setupModeSwitch();
  setupMonthDropdowns();
  setupCountrySelect();
  setupViewToggle();
  applyModeToDropdowns();

  updateAll();
}

init();
