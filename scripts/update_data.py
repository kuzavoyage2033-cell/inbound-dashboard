#!/usr/bin/env python3
"""
JNTO訪日外客統計 自動ダウンロード＆JSON変換スクリプト
使い方: python update_data.py [Excelファイルのパス]
  引数省略時はJNTOサイトから最新Excelを自動ダウンロード
"""
import sys
import json
import os
import re
import urllib.request
from pathlib import Path
import pandas as pd
from datetime import datetime

JNTO_STATS_URL = "https://www.jnto.go.jp/statistics/data/visitors-statistics/"
JNTO_BASE_URL = "https://www.jnto.go.jp"

TARGET_COUNTRIES = [
    '韓国', '台湾', '中国', '米国', '香港', 'タイ', '豪州',
    'フィリピン', 'マレーシア', 'インドネシア', 'ベトナム', 'カナダ',
    'シンガポール', '英国', 'ドイツ', 'フランス', 'インド',
    'イタリア', 'メキシコ', 'スペイン', '北欧地域', '中東地域',
]

NEW_IN_2026 = []

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Referer": JNTO_STATS_URL,
}

# 00_観光データ格納庫/入国データ自動DL/ への絶対パス
JNTO_SAVE_DIR = (
    Path(__file__).resolve().parent.parent.parent.parent
    / "00_観光データ格納庫"
    / "入国データ自動DL"
)


def fetch_text(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", errors="replace")


def find_jnto_excel_url():
    """JNTOページをスクレイピングして最新Excelのファイル名とURLを返す"""
    print("JNTOサイトからダウンロードリンクを検索中...")
    html = fetch_text(JNTO_STATS_URL)
    # リンク例: /statistics/data/_files/20260520_1615-5.xlsx
    matches = re.findall(r'/statistics/data/_files/(\d{8}_\d+-5\.xlsx)', html)
    if not matches:
        raise RuntimeError(
            "JNTOページからExcelリンクが見つかりませんでした。"
            "ページ構造が変わった可能性があります。"
        )
    filename = sorted(matches)[-1]  # 日付プレフィックスが最新のものを選択
    url = f"{JNTO_BASE_URL}/statistics/data/_files/{filename}"
    print(f"  発見: {filename}")
    return url, filename


def download_jnto_excel():
    """JNTOから最新Excelをダウンロードして保存パスを返す。既存最新なら再利用。"""
    url, orig_filename = find_jnto_excel_url()
    os.makedirs(JNTO_SAVE_DIR, exist_ok=True)

    # 保存名を yyyymmdd_入国データ縦持ち.xlsx 形式に変換
    date_prefix = orig_filename[:8]  # 例: "20260520"
    save_name = f"{date_prefix}_入国データ縦持ち.xlsx"
    save_path = JNTO_SAVE_DIR / save_name

    if save_path.exists():
        print(f"  既存ファイルが最新です（スキップ）: {save_name}")
        return str(save_path)

    # 旧バージョンのファイル（命名パターン: YYYYMMDD_入国データ縦持ち.xlsx）を削除
    for old in JNTO_SAVE_DIR.glob("????????_入国データ縦持ち.xlsx"):
        print(f"  古いバージョンを削除: {old.name}")
        old.unlink()

    print(f"  ダウンロード中: {url}")
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = resp.read()
    with open(save_path, "wb") as f:
        f.write(data)
    size_kb = len(data) / 1024
    print(f"  保存完了: {save_path} ({size_kb:.0f} KB)")
    return str(save_path)  # 例: .../20260520_入国データ縦持ち.xlsx


def parse_year(df):
    result = {}
    for _, row in df.iterrows():
        name = str(row.iloc[0]).strip() if pd.notna(row.iloc[0]) else ''
        if not name or name == 'nan':
            continue
        if name not in (['総数'] + TARGET_COUNTRIES):
            continue
        monthly = {}
        for month in range(1, 13):
            col_idx = 2 + (month - 1) * 2
            if col_idx < len(row):
                val = row.iloc[col_idx]
                if pd.notna(val):
                    try:
                        monthly[month] = int(float(val))
                    except (ValueError, TypeError):
                        pass
        if monthly:
            result[name] = monthly
    return result


def compute_other(total_data, countries_data):
    other = {}
    for month, total in total_data.items():
        subtracted = sum(
            countries_data[c][month]
            for c in TARGET_COUNTRIES
            if c in countries_data and month in countries_data[c]
        )
        other[month] = max(0, total - subtracted)
    return other


def main():
    if len(sys.argv) >= 2:
        excel_path = sys.argv[1]
        if not os.path.exists(excel_path):
            print(f'エラー: ファイルが見つかりません: {excel_path}')
            sys.exit(1)
        print(f"指定ファイルを使用: {os.path.basename(excel_path)}")
    else:
        excel_path = download_jnto_excel()

    print(f"Excelを解析中: {os.path.basename(excel_path)}")
    xl = pd.ExcelFile(excel_path)
    years_to_process = [y for y in ['2024', '2025', '2026'] if y in xl.sheet_names]

    all_data = {}
    available_months = {}

    for year in years_to_process:
        df = pd.read_excel(excel_path, sheet_name=year, header=None)
        year_data = parse_year(df)

        if '総数' in year_data:
            available_months[year] = sorted(year_data['総数'].keys())
            year_data['その他'] = compute_other(year_data['総数'], year_data)

        all_data[year] = year_data

    output = {
        'meta': {
            'last_updated': datetime.now().strftime('%Y-%m-%d'),
            'source': 'JNTO訪日外客統計',
            'new_in_2026': NEW_IN_2026,
            'available_months': {k: v for k, v in available_months.items()},
        },
        'monthly': {},
    }

    all_entities = set()
    for yd in all_data.values():
        all_entities.update(yd.keys())

    for entity in all_entities:
        output['monthly'][entity] = {}
        for year, yd in all_data.items():
            if entity in yd:
                output['monthly'][entity][year] = {str(k): v for k, v in yd[entity].items()}

    dashboard_data = str(Path(__file__).resolve().parent.parent / 'dashboard' / 'data')
    os.makedirs(dashboard_data, exist_ok=True)
    out_path = os.path.join(dashboard_data, 'inbound.json')
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f'✅ データを更新しました: {out_path}')
    for year in years_to_process:
        months = available_months.get(year, [])
        if months:
            print(f'  {year}年: {months[0]}月〜{months[-1]}月（{len(months)}ヶ月分）')


if __name__ == '__main__':
    main()
