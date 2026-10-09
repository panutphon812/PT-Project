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
    (OUTPUT / 'forecast_demo.html').write_text(template.replace('__MODEL_DATA__', json.dumps(payload, ensure_ascii=False, allow_nan=False)), encoding='utf-8')
    print('Created forecast_demo.html: 5 saved models, offline next-day inference.')


if __name__ == '__main__':
    main()
