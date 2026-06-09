'use strict';

// ─── 定数 ────────────────────────────────────────────────────────────────────

/** 北海道〜沖縄の地理的順序（全47都道府県） */
const PREFECTURES_GEO = [
  '北海道',
  '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県',
  '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
  '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県',
  '岐阜県', '静岡県', '愛知県', '三重県',
  '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県',
  '鳥取県', '島根県', '岡山県', '広島県', '山口県',
  '徳島県', '香川県', '愛媛県', '高知県',
  '福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県',
];

/** ②グラフで選択できる年 */
const SINGLE_YEARS = [2019, 2024, 2025, 2026];

/** ②グラフの年ごとの線色 */
const YEAR_LINE_COLORS = {
  2019: 'rgba(156,163,175,1)',  // グレー
  2024: 'rgba(16,185,129,1)',   // 緑
  2025: 'rgba(59,130,246,1)',   // 青
  2026: 'rgba(249,115,22,1)',   // オレンジ
};

/** ③グラフの都道府県ごとの色（1件目：青、2件目：緑、3件目：赤） */
const PREF_COMPARE_COLORS = [
  'rgba(59,130,246,1)',
  'rgba(16,185,129,1)',
  'rgba(239,68,68,1)',
];

const STAY_MONTHS_JP = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

let stayData = null;

// ─── 状態 ─────────────────────────────────────────────────────────────────────

const scState = {
  // ①コントロールパネル（棒グラフ連動）
  country: '韓国',
  mode: 'annual',
  year: 2025,
  startMonth: 1,
  endMonth: 12,
  // ②1都道府県 年別比較
  singlePref: '東京都',
  selectedYears: new Set([2019, 2024, 2025, 2026]),
  // ③3都道府県比較
  prefs: ['東京都', '大阪府', '広島県'],
  lineYear: 2025,
};

const spState = {
  pref: '広島県',
  mode: 'annual',
  year: 2025,
  startMonth: 1,
  endMonth: 12,
};

let scBar47Chart  = null;
let scSingleChart = null;
let scLineChart   = null;
let spNatChart    = null;

let scChartReady = false;
let spChartReady = false;

// ─── ヘルパー ─────────────────────────────────────────────────────────────────

function fmtStay(n) {
  if (n == null) return '—';
  return n.toLocaleString('ja-JP');
}

function getStayMonthly(country, pref, year, month) {
  return stayData.data[country]?.[pref]?.[String(year)]?.monthly?.[month - 1] ?? null;
}

function getStayAnnual(country, pref, year) {
  return stayData.data[country]?.[pref]?.[String(year)]?.annual ?? null;
}

function stayAvailMonths(year) {
  return (stayData.available_months[String(year)] || []).map(Number);
}

function latestCompleteYear() {
  for (let i = stayData.years.length - 1; i >= 0; i--) {
    const y = stayData.years[i];
    if ((stayData.available_months[String(y)] || []).length === 12) return y;
  }
  return stayData.years[stayData.years.length - 1];
}

function getStayValue(country, pref, year, mode, startM, endM) {
  if (mode === 'annual') {
    // annual が null（未確定年）は利用可能月の合計にフォールバック
    const ann = getStayAnnual(country, pref, year);
    if (ann != null) return ann;
    const avail = stayAvailMonths(year);
    if (!avail.length) return null;
    let sum = 0, hasAny = false;
    for (const m of avail) {
      const v = getStayMonthly(country, pref, year, m);
      if (v != null) { sum += v; hasAny = true; }
    }
    return hasAny ? sum : null;
  } else if (mode === 'monthly') {
    return getStayMonthly(country, pref, year, endM);
  } else {
    let sum = 0, hasAny = false;
    for (let m = startM; m <= endM; m++) {
      const v = getStayMonthly(country, pref, year, m);
      if (v != null) { sum += v; hasAny = true; }
    }
    return hasAny ? sum : null;
  }
}

/** データにある都道府県のみ北海道〜沖縄順で返す */
function geoOrderedPrefs() {
  const inData = new Set(stayData.prefectures);
  return PREFECTURES_GEO.filter(p => inData.has(p));
}

function scPeriodLabel() {
  if (scState.mode === 'annual') {
    const avail = stayAvailMonths(scState.year);
    const isPartial = avail.length > 0 && avail.length < 12;
    return isPartial
      ? `${scState.year}年（1〜${avail[avail.length - 1]}月計）`
      : `${scState.year}年`;
  }
  if (scState.mode === 'monthly') return `${scState.year}年${scState.endMonth}月`;
  const s = scState.startMonth, e = scState.endMonth;
  return s === e ? `${scState.year}年${s}月` : `${scState.year}年${s}〜${e}月累計`;
}

function spPeriodLabel() {
  if (spState.mode === 'annual') {
    const avail = stayAvailMonths(spState.year);
    const isPartial = avail.length > 0 && avail.length < 12;
    return isPartial
      ? `${spState.year}年（1〜${avail[avail.length - 1]}月計）`
      : `${spState.year}年`;
  }
  if (spState.mode === 'monthly') return `${spState.year}年${spState.endMonth}月`;
  const s = spState.startMonth, e = spState.endMonth;
  return s === e ? `${spState.year}年${s}月` : `${spState.year}年${s}〜${e}月累計`;
}

// ─── Tab2: コントロールパネル ─────────────────────────────────────────────────

function buildScCountrySelect() {
  const sel = document.getElementById('sc-country');
  sel.innerHTML = '';
  stayData.countries.forEach(c => sel.appendChild(new Option(c, c)));
  sel.value = stayData.countries.includes(scState.country) ? scState.country : stayData.countries[0];
  scState.country = sel.value;
  sel.addEventListener('change', () => {
    scState.country = sel.value;
    updateScAll();
  });
}

function buildScYearSelect() {
  const sel = document.getElementById('sc-year');
  sel.innerHTML = '';
  stayData.years.forEach(y => sel.appendChild(new Option(`${y}年`, y)));
  scState.year = latestCompleteYear();
  sel.value = scState.year;
  sel.addEventListener('change', () => {
    scState.year = parseInt(sel.value);
    rebuildScMonthDropdowns();
    updateScAll();
  });
  rebuildScMonthDropdowns();
}

function rebuildScMonthDropdowns() {
  const avail    = stayAvailMonths(scState.year);
  const startSel = document.getElementById('sc-start-month');
  const endSel   = document.getElementById('sc-end-month');
  [startSel, endSel].forEach(s => {
    if (!s) return;
    s.innerHTML = '';
    avail.forEach(m => s.appendChild(new Option(STAY_MONTHS_JP[m - 1], m)));
  });
  scState.startMonth = avail[0];
  scState.endMonth   = avail[avail.length - 1];
  if (startSel) startSel.value = scState.startMonth;
  if (endSel)   endSel.value   = scState.endMonth;
}

function setupScModeButtons() {
  document.querySelectorAll('.sc-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      scState.mode = btn.dataset.mode;
      document.querySelectorAll('.sc-mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyScPeriodVisibility();
      updateScAll();
    });
  });

  const startSel = document.getElementById('sc-start-month');
  const endSel   = document.getElementById('sc-end-month');
  if (startSel) startSel.onchange = () => {
    scState.startMonth = parseInt(startSel.value);
    if (scState.endMonth < scState.startMonth) {
      scState.endMonth = scState.startMonth;
      endSel.value = scState.endMonth;
    }
    updateScAll();
  };
  if (endSel) endSel.onchange = () => {
    scState.endMonth = parseInt(endSel.value);
    if (scState.startMonth > scState.endMonth) {
      scState.startMonth = scState.endMonth;
      startSel.value = scState.startMonth;
    }
    updateScAll();
  };
}

function applyScPeriodVisibility() {
  const startSel = document.getElementById('sc-start-month');
  const sep      = document.getElementById('sc-period-sep');
  const endSel   = document.getElementById('sc-end-month');

  if (scState.mode === 'annual') {
    startSel.classList.add('hidden');
    sep.classList.add('hidden');
    endSel.classList.add('hidden');
  } else if (scState.mode === 'monthly') {
    startSel.classList.add('hidden');
    sep.classList.add('hidden');
    endSel.classList.remove('hidden');
  } else {
    startSel.classList.remove('hidden');
    sep.classList.remove('hidden');
    endSel.classList.remove('hidden');
  }
}

// ─── Tab2: ①47都道府県 縦棒グラフ ────────────────────────────────────────────

function updateScBar47() {
  const { country, mode, year, startMonth, endMonth } = scState;
  const prefs  = geoOrderedPrefs();
  const values = prefs.map(p => getStayValue(country, p, year, mode, startMonth, endMonth));

  const titleEl = document.getElementById('sc-bar47-title');
  if (titleEl) titleEl.textContent = `47都道府県 宿泊数（${country}・${scPeriodLabel()}）`;

  const chartData = {
    labels: prefs,
    datasets: [{
      label: '延べ宿泊数',
      data: values,
      backgroundColor: 'rgba(59,130,246,0.72)',
      borderColor: 'rgba(59,130,246,0.9)',
      borderWidth: 0,
      borderRadius: 2,
    }],
  };
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: ctx => `${fmtStay(ctx.parsed.y)} 人泊`,
        },
      },
    },
    scales: {
      x: {
        ticks: {
          maxRotation: 45,
          minRotation: 45,
          font: { size: 10 },
        },
        grid: { color: 'rgba(0,0,0,0.04)' },
      },
      y: {
        beginAtZero: true,
        ticks: {
          font: { size: 11 },
          callback: v => v >= 10000 ? (v / 10000).toFixed(0) + '万' : v.toLocaleString(),
        },
        grid: { color: 'rgba(0,0,0,0.06)' },
      },
    },
  };

  const ctx = document.getElementById('sc-bar47-chart');
  if (scBar47Chart) {
    scBar47Chart.data    = chartData;
    scBar47Chart.options = options;
    scBar47Chart.update('none');
  } else {
    scBar47Chart = new Chart(ctx, { type: 'bar', data: chartData, options });
  }
}

// ─── Tab2: ②1都道府県 年別月次推移 ──────────────────────────────────────────

function setupScSinglePref() {
  const sel = document.getElementById('sc-single-pref');
  sel.innerHTML = '';
  geoOrderedPrefs().forEach(p => sel.appendChild(new Option(p, p)));
  sel.value = geoOrderedPrefs().includes(scState.singlePref)
    ? scState.singlePref
    : geoOrderedPrefs()[0];
  scState.singlePref = sel.value;
  sel.addEventListener('change', () => {
    scState.singlePref = sel.value;
    updateScSingle();
  });

  // 年トグルボタン
  document.querySelectorAll('.sc-year-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const y = parseInt(btn.dataset.year);
      if (scState.selectedYears.has(y)) {
        // 最低1年は残す
        if (scState.selectedYears.size > 1) {
          scState.selectedYears.delete(y);
          btn.classList.remove('active');
        }
      } else {
        scState.selectedYears.add(y);
        btn.classList.add('active');
      }
      updateScSingle();
    });
  });
}

function updateScSingle() {
  const { country, singlePref, selectedYears } = scState;
  const titleEl = document.getElementById('sc-single-title');
  if (titleEl) titleEl.textContent = `${singlePref} 年別月次推移（${country}）`;

  const datasets = SINGLE_YEARS.filter(y => selectedYears.has(y)).map(year => {
    const avail = stayData.available_months[String(year)] || [];
    const maxM  = avail.length ? Math.max(...avail) : 0;
    const values = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      return m <= maxM ? getStayMonthly(country, singlePref, year, m) : null;
    });
    return {
      label: `${year}年`,
      data: values,
      borderColor: YEAR_LINE_COLORS[year],
      backgroundColor: 'transparent',
      pointBackgroundColor: YEAR_LINE_COLORS[year],
      borderWidth: 1.5,
      tension: 0,
      pointRadius: 3,
      pointHoverRadius: 5,
      spanGaps: false,
      fill: false,
    };
  });

  const ctx = document.getElementById('sc-single-chart');
  buildCustomLegend('sc-single-legend', ctx, datasets);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: ctx => `${ctx.dataset.label}：${ctx.parsed.y != null ? fmtStay(ctx.parsed.y) + ' 人泊' : '—'}`,
        },
      },
    },
    scales: {
      x: { ticks: { font: { size: 11 } }, grid: { color: 'rgba(0,0,0,0.04)' } },
      y: {
        beginAtZero: false,
        ticks: {
          font: { size: 11 },
          callback: v => v >= 10000 ? (v / 10000).toFixed(0) + '万' : v.toLocaleString(),
        },
        grid: { color: 'rgba(0,0,0,0.06)' },
      },
    },
  };

  if (scSingleChart) {
    scSingleChart.data    = { labels: STAY_MONTHS_JP, datasets };
    scSingleChart.options = options;
    scSingleChart.update('none');
  } else {
    scSingleChart = new Chart(ctx, { type: 'line', data: { labels: STAY_MONTHS_JP, datasets }, options });
  }
}

// ─── Tab2: ③最大3都道府県 月次比較 ──────────────────────────────────────────

function setupScComparePrefs() {
  const prefs = geoOrderedPrefs();

  // 都道府県プルダウン ×3
  ['sc-pref1', 'sc-pref2', 'sc-pref3'].forEach((id, i) => {
    const sel = document.getElementById(id);
    sel.innerHTML = '<option value="">（なし）</option>';
    prefs.forEach(p => sel.appendChild(new Option(p, p)));
    if (scState.prefs[i]) sel.value = scState.prefs[i];
    sel.addEventListener('change', () => {
      scState.prefs[i] = sel.value || null;
      updateScLine();
    });
  });

  // 年プルダウン（2019/2024/2025/2026のみ）
  const yearSel = document.getElementById('sc-line-year');
  yearSel.innerHTML = '';
  SINGLE_YEARS.forEach(y => yearSel.appendChild(new Option(`${y}年`, y)));
  yearSel.value = scState.lineYear;
  yearSel.addEventListener('change', () => {
    scState.lineYear = parseInt(yearSel.value);
    updateScLine();
  });
}

function updateScLine() {
  const { country, prefs, lineYear } = scState;
  const selectedPrefs = prefs.filter(p => p);

  const titleEl = document.getElementById('sc-line-title');
  if (titleEl) titleEl.textContent = `都道府県別 月次推移比較（${country}）`;

  const avail = stayData.available_months[String(lineYear)] || [];
  const maxM  = avail.length ? Math.max(...avail) : 0;

  const datasets = selectedPrefs.map((pref, i) => {
    const values = Array.from({ length: 12 }, (_, mi) => {
      const m = mi + 1;
      return m <= maxM ? getStayMonthly(country, pref, lineYear, m) : null;
    });
    return {
      label: pref,
      data: values,
      borderColor: PREF_COMPARE_COLORS[i],
      backgroundColor: 'transparent',
      pointBackgroundColor: PREF_COMPARE_COLORS[i],
      borderWidth: 1.5,
      tension: 0,
      pointRadius: 3,
      pointHoverRadius: 5,
      spanGaps: false,
      fill: false,
    };
  });

  const ctx = document.getElementById('sc-line-chart');
  buildCustomLegend('sc-line-legend', ctx, datasets);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: ctx => `${ctx.dataset.label}：${ctx.parsed.y != null ? fmtStay(ctx.parsed.y) + ' 人泊' : '—'}`,
        },
      },
    },
    scales: {
      x: { ticks: { font: { size: 11 } }, grid: { color: 'rgba(0,0,0,0.04)' } },
      y: {
        beginAtZero: false,
        ticks: {
          font: { size: 11 },
          callback: v => v >= 10000 ? (v / 10000).toFixed(0) + '万' : v.toLocaleString(),
        },
        grid: { color: 'rgba(0,0,0,0.06)' },
      },
    },
  };

  if (scLineChart) {
    scLineChart.data    = { labels: STAY_MONTHS_JP, datasets };
    scLineChart.options = options;
    scLineChart.update('none');
  } else {
    scLineChart = new Chart(ctx, { type: 'line', data: { labels: STAY_MONTHS_JP, datasets }, options });
  }
}

function updateScAll() {
  if (!scChartReady) return;
  updateScBar47();
  updateScSingle();
  updateScLine();
}

// ─── Tab3: 都道府県別宿泊分析 ─────────────────────────────────────────────────

const natSharePlugin = {
  id: 'natShare',
  afterDatasetsDraw(chart) {
    const { ctx, data } = chart;
    const vals  = data.datasets[0].data;
    const total = vals.reduce((s, v) => s + (v || 0), 0);
    if (!total) return;
    ctx.save();
    ctx.font      = '600 11px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = '#374151';
    ctx.textAlign = 'left';
    chart.getDatasetMeta(0).data.forEach((bar, i) => {
      const v = vals[i];
      if (!v) return;
      const pct = (v / total * 100).toFixed(1) + '%';
      ctx.fillText(pct, bar.x + 5, bar.y + 4.5);
    });
    ctx.restore();
  },
};

function buildSpPrefSelect() {
  const sel = document.getElementById('sp-pref');
  sel.innerHTML = '';
  geoOrderedPrefs().forEach(p => sel.appendChild(new Option(p, p)));
  sel.value = geoOrderedPrefs().includes(spState.pref) ? spState.pref : geoOrderedPrefs()[0];
  spState.pref = sel.value;
  sel.addEventListener('change', () => {
    spState.pref = sel.value;
    updateSpAll();
  });
}

function setupSpPeriodControls() {
  document.querySelectorAll('.sp-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      spState.mode = btn.dataset.mode;
      document.querySelectorAll('.sp-mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applySpPeriodVisibility();
      updateSpAll();
    });
  });

  // 年プルダウン
  const pg = document.getElementById('sp-period-group');
  const yearSel = document.createElement('select');
  yearSel.id        = 'sp-year';
  yearSel.className = 'select-month';
  stayData.years.forEach(y => yearSel.appendChild(new Option(`${y}年`, y)));
  spState.year  = latestCompleteYear();
  yearSel.value = spState.year;
  yearSel.addEventListener('change', () => {
    spState.year = parseInt(yearSel.value);
    rebuildSpMonthDropdowns();
    updateSpAll();
  });
  pg.querySelector('.period-selector').prepend(yearSel);
  rebuildSpMonthDropdowns();

  // 月プルダウン
  const startSel = document.getElementById('sp-start-month');
  const endSel   = document.getElementById('sp-end-month');
  if (startSel) startSel.addEventListener('change', () => {
    spState.startMonth = parseInt(startSel.value);
    if (spState.endMonth < spState.startMonth) {
      spState.endMonth = spState.startMonth;
      endSel.value = spState.endMonth;
    }
    updateSpAll();
  });
  if (endSel) endSel.addEventListener('change', () => {
    spState.endMonth = parseInt(endSel.value);
    if (spState.startMonth > spState.endMonth) {
      spState.startMonth = spState.endMonth;
      startSel.value = spState.startMonth;
    }
    updateSpAll();
  });

  applySpPeriodVisibility();
}

function rebuildSpMonthDropdowns() {
  const avail    = stayAvailMonths(spState.year);
  const startSel = document.getElementById('sp-start-month');
  const endSel   = document.getElementById('sp-end-month');
  [startSel, endSel].forEach(sel => {
    if (!sel) return;
    sel.innerHTML = '';
    avail.forEach(m => sel.appendChild(new Option(STAY_MONTHS_JP[m - 1], m)));
  });
  if (startSel) startSel.value = spState.startMonth = avail[0];
  if (endSel)   endSel.value   = spState.endMonth   = avail[avail.length - 1];
}

function applySpPeriodVisibility() {
  const pg       = document.getElementById('sp-period-group');
  const startSel = document.getElementById('sp-start-month');
  const sep      = document.getElementById('sp-period-sep');
  const endSel   = document.getElementById('sp-end-month');

  pg.style.display = '';

  if (spState.mode === 'annual') {
    startSel.classList.add('hidden');
    sep.classList.add('hidden');
    endSel.classList.add('hidden');
  } else if (spState.mode === 'monthly') {
    startSel.classList.add('hidden');
    sep.classList.add('hidden');
    endSel.classList.remove('hidden');
  } else {
    startSel.classList.remove('hidden');
    sep.classList.remove('hidden');
    endSel.classList.remove('hidden');
  }
}

function updateSpNatBar() {
  const { pref, mode, year, startMonth, endMonth } = spState;

  let rows = stayData.countries
    .filter(c => c !== 'その他')
    .map(c => ({ country: c, val: getStayValue(c, pref, year, mode, startMonth, endMonth) }))
    .filter(r => r.val != null && r.val > 0);
  rows.sort((a, b) => b.val - a.val);

  const total  = rows.reduce((s, r) => s + r.val, 0);
  const labels = rows.map(r => r.country);
  const values = rows.map(r => r.val);

  document.getElementById('sp-nat-title').textContent = `国籍別割合（${pref}）`;
  document.getElementById('sp-pie-note').textContent  = spPeriodLabel();

  const rowH  = 28;
  const chartH = Math.max(300, rows.length * rowH + 40);
  const wrap  = document.getElementById('sp-nat-wrap');
  wrap.style.height = chartH + 'px';

  const ctx = document.getElementById('sp-nat-line-chart');
  const chartData = {
    labels,
    datasets: [{
      label: '延べ宿泊数',
      data: values,
      backgroundColor: 'rgba(90,120,170,0.75)',
      borderRadius: 2,
      borderSkipped: false,
    }],
  };
  const options = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding: { right: 56 } },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: ctx => {
            const pct = total > 0 ? (ctx.parsed.x / total * 100).toFixed(1) + '%' : '';
            return `${fmtStay(ctx.parsed.x)} 人泊（${pct}）`;
          },
        },
      },
    },
    scales: {
      x: {
        beginAtZero: true,
        ticks: {
          font: { size: 11 },
          callback: v => total > 0 ? (v / total * 100).toFixed(0) + '%' : v,
        },
        grid: { color: 'rgba(0,0,0,0.04)' },
      },
      y: { ticks: { font: { size: 11 } }, grid: { display: false } },
    },
  };

  if (spNatChart) { spNatChart.destroy(); spNatChart = null; }
  spNatChart = new Chart(ctx, { type: 'bar', data: chartData, options, plugins: [natSharePlugin] });
}

function updateSpAll() {
  if (!spChartReady) return;
  updateSpNatBar();
}

// ─── 遅延初期化（タブ表示時のみ描画） ────────────────────────────────────────

function onShowStayCountry() {
  if (!stayData || scChartReady) return;
  scChartReady = true;
  updateScAll();
}

function onShowStayPref() {
  if (!stayData || spChartReady) return;
  spChartReady = true;
  updateSpAll();
}

// ─── 初期化 ───────────────────────────────────────────────────────────────────

async function initStay() {
  try {
    const res = await fetch('data/stay.json');
    stayData  = await res.json();
  } catch (e) {
    ['tab-stay-country', 'tab-stay-pref'].forEach(id => {
      document.getElementById(id).innerHTML =
        '<div style="padding:40px;text-align:center;color:#c81e1e">データ読み込みエラー：data/stay.json が見つかりません</div>';
    });
    return;
  }

  const upd = stayData.updated_at || '—';
  document.getElementById('sc-updated').textContent = upd;
  document.getElementById('sp-updated').textContent = upd;

  // Tab2: コントロール初期化（チャートはタブ表示時に描画）
  buildScCountrySelect();
  buildScYearSelect();
  applyScPeriodVisibility();
  setupScModeButtons();
  setupScSinglePref();
  setupScComparePrefs();

  // Tab3: コントロール初期化
  buildSpPrefSelect();
  setupSpPeriodControls();
}

initStay();
