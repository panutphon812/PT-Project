"""Verify browser Ridge training against an independent NumPy solution."""
import argparse
import json
import subprocess
from pathlib import Path

import numpy as np
import pandas as pd

from train_forecast import OUTPUT, features

parser = argparse.ArgumentParser()
parser.add_argument('--node', default='node')
args = parser.parse_args()
result_path = OUTPUT / 'import_check_models.json'
subprocess.run([args.node, str(Path(__file__).with_suffix('.cjs')), str(result_path)], check=True)
models = json.loads(result_path.read_text(encoding='utf-8'))
max_error = 0
for code, browser in models.items():
    series = pd.Series(browser['history'], dtype=float)
    series.index = pd.to_datetime(series.index)
    series = series.sort_index()
    xs = features(series).dropna()
    for name, cutoff in [('evaluation', browser['evaluation']['trained_until']), ('final', browser['trained_until'])]:
        x = xs.loc[:cutoff].to_numpy(float)
        y = series.loc[xs.loc[:cutoff].index].to_numpy(float)
        center = x.mean(axis=0)
        scale = x.std(axis=0, ddof=0)
        scale[scale == 0] = 1
        design = np.column_stack([np.ones(len(x)), (x-center)/scale])
        penalty = np.eye(design.shape[1])
        penalty[0, 0] = 0
        coefficients = np.linalg.solve(design.T @ design + penalty, design.T @ y)
        actual = browser['evaluation'] if name == 'evaluation' else browser
        np.testing.assert_allclose(coefficients, actual['coefficients'], atol=1e-8, rtol=1e-8)
        extended = series.reindex(pd.date_range(series.index.min(), pd.Timestamp(browser['max_date'])))
        evaluated = features(extended).loc[browser['min_date']:].to_numpy(float)
        predictions = np.maximum(np.column_stack([np.ones(len(evaluated)), (evaluated-center)/scale]) @ coefficients, 0)
        if name == 'evaluation':
            error = np.max(np.abs(predictions[:28] - [r['prediction'] for r in browser['test']]))
            max_error = max(max_error, float(error))
            assert error < 1e-8
            mae = np.mean(np.abs(predictions[:28] - series.iloc[-28:].to_numpy()))
            assert abs(mae-browser['mae']) < 1e-8
        else:
            x_next = features(extended).iloc[-1].to_numpy()
            expected = max(0, coefficients[0]+np.sum((x_next-center)/scale*coefficients[1:]))
            observed = max(0, actual['coefficients'][0]+np.sum((x_next-np.array(actual['center']))/np.array(actual['scale'])*np.array(actual['coefficients'][1:])))
            assert abs(expected-observed) < 1e-8
print(f'PASS: browser training and test scores match NumPy for 5 products; max prediction error {max_error:.3g}.')
