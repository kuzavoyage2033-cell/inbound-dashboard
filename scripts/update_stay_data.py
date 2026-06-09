#!/usr/bin/env python3
"""
宿泊旅行統計Excelデータ → JSON変換スクリプト
使い方: python3 update_stay_data.py <Excelファイルのパス>
"""
import sys
import json
import os
from pathlib import Path
import pandas as pd
from datetime import datetime

# 年次データが揃っている年（全12ヶ月あるもの）
COMPLETE_YEARS = {2019, 2024, 2025}


def main():
    if len(sys.argv) < 2:
        print('使い方: python3 update_stay_data.py <Excelファイルのパス>')
        sys.exit(1)

    excel_path = sys.argv[1]
    if not os.path.exists(excel_path):
        print(f'エラー: ファイルが見つかりません: {excel_path}')
        sys.exit(1)

    print('Excelを読み込み中...')
    df = pd.read_excel(
        excel_path,
        sheet_name='元データ',
        usecols=['延べ宿泊数', '都道府県（地図用）', '国籍', '年', '月'],
    )

    # 基本情報
    countries   = sorted(df['国籍'].unique().tolist())
    prefectures = sorted(df['都道府県（地図用）'].unique().tolist())
    years       = sorted(df['年'].unique().tolist())

    # 年ごとの利用可能月
    available_months = {
        int(y): sorted(df[df['年'] == y]['月'].unique().tolist())
        for y in years
    }

    # 集計
    grouped = df.groupby(['国籍', '都道府県（地図用）', '年', '月'])['延べ宿泊数'].sum()

    print('JSON構造を構築中...')
    data = {}
    for country in countries:
        data[country] = {}
        for pref in prefectures:
            data[country][pref] = {}
            for year in years:
                year_str = str(year)
                avail = available_months[year]
                monthly = []
                for m in range(1, 13):
                    try:
                        val = int(grouped.loc[(country, pref, year, m)])
                    except KeyError:
                        val = None
                    monthly.append(val)

                # annual: 利用可能月の合計（全12ヶ月揃っている場合のみ合計値を出す）
                valid_vals = [v for v in monthly if v is not None]
                annual = sum(valid_vals) if len(avail) == 12 else None

                data[country][pref][year_str] = {
                    'monthly': monthly,
                    'annual':  annual,
                }

    output = {
        'updated_at':       datetime.now().strftime('%Y-%m-%d'),
        'countries':        countries,
        'prefectures':      prefectures,
        'years':            [int(y) for y in years],
        'available_months': {str(k): v for k, v in available_months.items()},
        'data':             data,
    }

    dashboard_data = str(Path(__file__).resolve().parent.parent / 'dashboard' / 'data')
    os.makedirs(dashboard_data, exist_ok=True)
    out_path = os.path.join(dashboard_data, 'stay.json')
    print(f'JSONを書き込み中: {out_path}')
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, separators=(',', ':'))

    size_kb = os.path.getsize(out_path) / 1024
    print(f'✅ 完了: {out_path} ({size_kb:.0f} KB)')
    print(f'   国籍: {len(countries)}種類')
    print(f'   都道府県: {len(prefectures)}都道府県')
    print(f'   年: {years}')


if __name__ == '__main__':
    main()
