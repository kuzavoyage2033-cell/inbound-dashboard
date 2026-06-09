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

// ─── 月次推移グラフ ────────────────────────────────────────────────────────────

function updateTrendChart() {
  const entity  = state.country;
  const titleEl = document.getElementById('trend-title');
  if (titleEl) {
    titleEl.textContent = entity === '総数'
      ? '月次推移（訪日外客数総数）'
      : `月次推移（${entity}）`;
  }

  const datasets = ['2024', '2025', '2026'].map(year => {
    const avail = getAvailableMonths(year);
    const maxM  = avail.length ? Math.max(...avail) : 0;
    const values = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      if (data.meta.new_in_2026 && data.meta.new_in_2026.includes(entity) && year !== '2026') return null;
      return m <= maxM ? getMonthly(entity, year, m) : null;
    });
    const c = YEAR_COLORS[year];
    return {
      label: `${year}年`,
      data: values,
      borderColor: c.line,
      backgroundColor: c.fill,
      pointBackgroundColor: c.line,
      borderWidth: 1.5,
      tension: 0,
      pointRadius: 3,
      pointHoverRadius: 5,
      spanGaps: false,
      fill: false,
    };
  });

  // カスタム凡例を描画（線＋丸）
  buildCustomLegend('trend-legend', document.getElementById('trend-chart'), datasets);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: ctx => `${ctx.dataset.label}：${ctx.parsed.y != null ? fmt(ctx.parsed.y) + '人' : '—'}`,
        },
      },
    },
    scales: {
      x: {
        ticks: { font: { size: 11 } },
        grid:  { color: 'rgba(0,0,0,0.04)' },
      },
      y: {
        beginAtZero: false,
        ticks: {
          font: { size: 11 },
          callback: v => v >= 10000 ? (v / 10000).toFixed(0) + '万' : v.toLocaleString(),
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

// ─── 国別棒グラフ＋前年比折れ線 ─────────────────────────────────────────────────

function updateBarChart() {
  const { mode, year, startMonth, endMonth, country } = state;
  const prev = prevYear(year);

  const rows = COUNTRIES_ORDER
    .filter(c => data.monthly[c])
    .map(c => ({
      name: c,
      cur:  getValue(c, year, mode, startMonth, endMonth),
      prev: getValue(c, prev, mode, startMonth, endMonth),
    }))
    .filter(r => r.cur != null)
    .sort((a, b) => (b.cur ?? 0) - (a.cur ?? 0));

  const labels      = rows.map(r => r.name);
  const barColors   = rows.map(r => r.name === country ? COLOR_SELECTED : COLOR_DEFAULT);
  const yoyData     = rows.map(r => {
    if (r.prev == null || r.prev === 0) return null;
    return (r.cur / r.prev) * 100;
  });
  const yoyPtColors = yoyData.map(v =>
    v == null ? 'transparent' : v >= 100 ? COLOR_YOY_UP : COLOR_YOY_DOWN
  );

  document.getElementById('bar-label').textContent = makePeriodLabel();

  const datasets = [
    {
      type: 'bar',
      label: '訪日外客数',
      data: rows.map(r => r.cur),
      backgroundColor: barColors,
      _legendColor: COLOR_DEFAULT,
      borderRadius: 3,
      borderSkipped: false,
      yAxisID: 'y',
      order: 2,
    },
    {
      type: 'line',
      label: '前年比（右軸）',
      data: yoyData,
      borderColor: 'rgba(100,100,100,0.5)',
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      pointRadius: 3,
      pointHoverRadius: 5,
      pointBackgroundColor: yoyPtColors,
      pointBorderColor:     yoyPtColors,
      spanGaps: false,
      tension: 0,
      yAxisID: 'y1',
      order: 1,
    },
  ];

  buildCustomLegend('bar-legend', document.getElementById('bar-chart'), datasets);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: ctx => ctx.dataset.yAxisID === 'y1'
            ? (ctx.parsed.y != null ? `前年比：${ctx.parsed.y.toFixed(1)}%` : '前年比：—')
            : `${ctx.dataset.label}：${ctx.parsed.y != null ? fmt(ctx.parsed.y) + '人' : '—'}`,
        },
      },
    },
    scales: {
      x: {
        ticks: { font: { size: 10 } },
        grid:  { color: 'rgba(0,0,0,0.04)' },
      },
      y: {
        position: 'left',
        beginAtZero: true,
        ticks: {
          font: { size: 11 },
          callback: v => v >= 10000 ? (v / 10000).toFixed(0) + '万' : v.toLocaleString(),
        },
        grid: { color: 'rgba(0,0,0,0.04)' },
      },
      y1: {
        position: 'right',
        grid: { drawOnChartArea: false },
        ticks: {
          font: { size: 11 },
          callback: v => v + '%',
        },
        title: {
          display: true,
          text: '前年比（%）',
          font: { size: 11 },
          color: 'rgba(100,100,100,0.8)',
        },
      },
    },
  };

  const ctx = document.getElementById('bar-chart');
  if (barChart) {
    barChart.data.labels   = labels;
    barChart.data.datasets = datasets;
    barChart.options       = options;
    barChart.update('none');
  } else {
    barChart = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets },
      options,
      plugins: [refLinePlugin],
    });
  }
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
