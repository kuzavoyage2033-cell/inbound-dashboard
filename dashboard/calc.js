'use strict';
/*
 * 全国版ダッシュボード共通の集計ルール（scripts/stats_common.py と同じ定義の JavaScript 版）
 *   1. 期間の合計は、期間内の全ての月に値がある場合だけ計算（欠損が1か月でもあれば null と欠損月を返す）
 *   2. 前年比は同じ月の範囲で比較。年単位で当年が途中までなら、公表済みの月だけで前年と比較
 *   3. 宿泊の2026年新設区分（メキシコ・北欧地域・中東地域）は「その他」に合算（データ作成時に処理済み）
 * 同じ結果になることは tests/calc_cases.json の共通テストケースで検査している。
 */
const StatsCalc = (() => {
  function periodMonths(mode, yearAvailable, start = 1, end = 12) {
    if (mode === 'monthly') return [end];
    if (mode === 'cumulative') {
      const out = [];
      for (let m = start; m <= end; m++) out.push(m);
      return out;
    }
    if (mode === 'annual') {
      if (yearAvailable.length >= 12) return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
      return [...yearAvailable].sort((a, b) => a - b);
    }
    throw new Error('unknown mode: ' + mode);
  }

  function isPartialYear(mode, yearAvailable) {
    return mode === 'annual' && yearAvailable.length > 0 && yearAvailable.length < 12;
  }

  /** getValue(year, month) → number|null。戻り値 { value: number|null, missing: [月...] } */
  function sumMonths(getValue, year, months) {
    const missing = [];
    let sum = 0;
    for (const m of months) {
      const v = getValue(year, m);
      if (v == null) missing.push(m); else sum += v;
    }
    if (missing.length || !months.length) return { value: null, missing };
    return { value: sum, missing: [] };
  }

  function yoyRatio(cur, prev) {
    if (cur == null || prev == null || prev === 0) return null;
    return cur / prev;
  }

  function periodLabel(mode, year, yearAvailable, start = 1, end = 12) {
    if (mode === 'annual') {
      return isPartialYear(mode, yearAvailable)
        ? `${year}年（1〜${Math.max(...yearAvailable)}月）`
        : `${year}年`;
    }
    if (mode === 'monthly') return `${year}年${end}月`;
    return start === end ? `${year}年${start}月` : `${year}年${start}〜${end}月累計`;
  }

  return { periodMonths, isPartialYear, sumMonths, yoyRatio, periodLabel };
})();

if (typeof module !== 'undefined') module.exports = StatsCalc;   // node のテスト用
