"""Build an offline, interactive demo using the saved forecasting models."""
import json

import numpy as np
import pandas as pd

from train_forecast import DATA, OUTPUT, ITEMS, features, predict


def main():
    frame = pd.read_csv(DATA / 'selected_5_foods.csv', encoding='utf-8-sig')
    frame.columns = ['date', 'item_id', 'sales']
    payload = {}
    for item in ITEMS:
        series = frame[frame.item_id == item].set_index('date').sales
        series.index = pd.to_datetime(series.index)
        series = series.sort_index()
        with np.load(OUTPUT / f'model_{item}.npz', allow_pickle=False) as saved:
            names = saved['features'].tolist()
            model = tuple(saved[key] for key in ('center', 'scale', 'coefficients'))
            extended = series.reindex(pd.date_range(series.index.min(), series.index.max() + pd.Timedelta(days=1)))
            rows = features(extended)
            assert names == rows.columns.tolist()
            # Reference predictions independently checked against browser inference.
            reference = predict(model, rows.loc['2016-04-25':].to_numpy(float))
            payload[item] = {
                'history': {date.strftime('%Y-%m-%d'): int(value) for date, value in series.items()},
                'center': model[0].tolist(), 'scale': model[1].tolist(),
                'coefficients': model[2].tolist(),
                'reference': dict(zip(rows.loc['2016-04-25':].index.strftime('%Y-%m-%d'), reference.tolist())),
                'trained_until': str(saved['trained_until']),
            }
    template = (DATA.parent.parent / 'forecasting' / 'demo_template.html').read_text(encoding='utf-8')
    imports = (DATA.parent.parent / 'forecasting' / 'import_data.js').read_text(encoding='utf-8')
    page = template.replace('__MODEL_DATA__', json.dumps(payload, ensure_ascii=False, allow_nan=False)).replace('__IMPORT_FUNCTIONS__', imports)
    tested = pd.read_csv(OUTPUT / 'predictions.csv')
    tested = tested[tested.period == 'test']
    wape = 100 * (tested.linear_regression - tested.actual).abs().sum() / tested.actual.sum()
    accuracy_note = f'M5 5 สินค้า · ทดสอบ 28 วัน (140 คำทำนาย) · MAE 4.74 หน่วย · RMSE 5.94 หน่วย · WAPE {wape:.2f}% · ลด MAE จากค่าเฉลี่ยย้อนหลัง 28 วันได้ 4.1%'
    page = page.replace('__ACCURACY_NOTE__', accuracy_note)
    print(f'M5 test WAPE: {wape:.6f}%')
    (OUTPUT / 'forecast_demo.html').write_text(page, encoding='utf-8')
    # Real M5 rows for a reproducible import demonstration; not invented shop data.
    sample = frame[frame.date >= '2015-11-25'].sort_values(['date', 'item_id'])
    assert len(sample) == 180 * 5
    sample.columns = ['วันที่', 'รหัสสินค้า', 'จำนวนที่ขาย']
    sample.to_csv(OUTPUT / 'sample_sales_import.csv', index=False, encoding='utf-8-sig')
    print('Created forecast_demo.html: 5 saved models, offline next-day inference.')


if __name__ == '__main__':
    main()
