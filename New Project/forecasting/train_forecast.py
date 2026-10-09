"""Train a small, reproducible one-day-ahead M5 forecasting experiment.

Run: python train_forecast.py
Requires numpy and pandas. Data and generated outputs stay outside Git.
"""
from pathlib import Path
import hashlib
import html
import json

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "Dataset" / "m5-forecasting-accuracy"
OUTPUT = DATA / "ai_results"
ITEMS = ["FOODS_1_085", "FOODS_2_019", "FOODS_2_197", "FOODS_3_377", "FOODS_3_064"]
TRAIN_END = pd.Timestamp("2016-02-28")
VALIDATION_END = pd.Timestamp("2016-04-24")
METHODS = {"linear_regression": "AI: Linear Regression", "last_week": "วันเดียวกันสัปดาห์ก่อน", "mean_7": "ค่าเฉลี่ย 7 วัน", "mean_28": "ค่าเฉลี่ย 28 วัน"}


def features(series):
    """Every sales feature is shifted before computation: target is never an input."""
    previous = series.shift(1)
    result = pd.DataFrame(index=series.index)
    for lag in (1, 7, 14, 28):
        result[f"lag_{lag}"] = series.shift(lag)
    result["mean_7"] = previous.rolling(7).mean()
    result["mean_28"] = previous.rolling(28).mean()
    result["std_7"] = previous.rolling(7).std(ddof=0)
    for weekday in range(1, 7):
        result[f"weekday_{weekday}"] = (series.index.dayofweek == weekday).astype(float)
    result["year_sin"] = np.sin(2 * np.pi * series.index.dayofyear / 365.25)
    result["year_cos"] = np.cos(2 * np.pi * series.index.dayofyear / 365.25)
    return result


def fit(x, y):
    # Normalization is fitted only on the training period.
    center = x.mean(axis=0)
    scale = x.std(axis=0)
    scale[scale == 0] = 1
    design = np.column_stack([np.ones(len(x)), (x - center) / scale])
    coefficients, _, _, _ = np.linalg.lstsq(design, y, rcond=None)
    assert np.isfinite(coefficients).all()
    return center, scale, coefficients


def predict(model, x):
    center, scale, coefficients = model
    design = np.column_stack([np.ones(len(x)), (x - center) / scale])
    return np.maximum(design @ coefficients, 0)


def metrics(actual, predicted):
    error = predicted - actual
    return {"mae": float(np.abs(error).mean()), "rmse": float(np.sqrt(np.square(error).mean())), "bias": float(error.mean())}


def chart(actual, predicted, dates):
    width, height = 860, 310
    left, top, right, bottom = 58, 18, 18, 55
    plot_w, plot_h = width-left-right, height-top-bottom
    maximum = max(float(max(actual)), float(max(predicted)), 1) * 1.12
    def points(values):
        return " ".join(f"{left+i*plot_w/(len(values)-1):.1f},{top+plot_h-float(v)/maximum*plot_h:.1f}" for i, v in enumerate(values))
    grid = ""
    for i in range(5):
        v = maximum*i/4
        y = top+plot_h-v/maximum*plot_h
        grid += f'<line x1="{left}" x2="{width-right}" y1="{y}" y2="{y}" stroke="#e2e8f0"/><text x="{left-8}" y="{y+4}" text-anchor="end">{v:.0f}</text>'
    for i in (0, 7, 14, 21, len(dates)-1):
        x = left+i*plot_w/(len(dates)-1)
        grid += f'<text x="{x}" y="{height-24}" text-anchor="middle">{dates[i][5:]}</text>'
    return f'<svg viewBox="0 0 {width} {height}" role="img" aria-label="กราฟยอดขายจริงและคำทำนายรายวัน"><g font-size="12" fill="#475569">{grid}</g><polyline points="{points(actual)}" fill="none" stroke="#2563eb" stroke-width="2.5"/><polyline points="{points(predicted)}" fill="none" stroke="#ea580c" stroke-width="2.5"/></svg>'


def build_report(predictions, scores, overview):
    all_scores = scores[(scores["period"] == "test") & (scores["item_id"] == "ALL")]
    baseline = all_scores[all_scores["method"] != "linear_regression"].sort_values("mae").iloc[0]
    ai = all_scores[all_scores["method"] == "linear_regression"].iloc[0]
    improvement = (baseline["mae"]-ai["mae"])/baseline["mae"]*100 if baseline["mae"] else 0
    verdict = f'AI คลาดเคลื่อนน้อยกว่าวิธีพื้นฐานที่ดีที่สุด {improvement:.1f}%' if improvement > 0 else f'AI ยังคลาดเคลื่อนมากกว่าวิธีพื้นฐานที่ดีที่สุด {abs(improvement):.1f}%'
    cards = ""
    for item in ITEMS:
        daily = predictions[(predictions["period"] == "test") & (predictions["item_id"] == item)]
        item_scores = scores[(scores["period"] == "test") & (scores["item_id"] == item)]
        rows = "".join(f'<tr><td>{METHODS[r.method]}</td><td>{r.mae:.2f}</td><td>{r.rmse:.2f}</td><td>{r.bias:+.2f}</td></tr>' for r in item_scores.itertuples())
        details = "".join(f'<tr><td>{r.date}</td><td>{r.actual}</td><td>{r.linear_regression:.2f}</td><td>{abs(r.linear_regression-r.actual):.2f}</td></tr>' for r in daily.itertuples())
        cards += f'<section id="{item}" class="item"><h2>{item}</h2><p>จำนวนที่ขายจริง <span class="blue">สีน้ำเงิน</span> · AI ทำนาย <span class="orange">สีส้ม</span> · หน่วย/วัน</p>{chart(daily.actual.to_numpy(),daily.linear_regression.to_numpy(),daily.date.tolist())}<table><thead><tr><th>วิธี</th><th>คลาดเคลื่อนเฉลี่ย (MAE)</th><th>RMSE</th><th>ทำนายเกิน/ขาดเฉลี่ย</th></tr></thead><tbody>{rows}</tbody></table><details><summary>ดูผลรายวัน 28 วัน</summary><table><thead><tr><th>วันที่</th><th>ขายจริง</th><th>AI ทำนาย</th><th>คลาดเคลื่อน</th></tr></thead><tbody>{details}</tbody></table></details></section>'
    summary_rows = "".join(f'<tr><td>{METHODS[r.method]}</td><td>{r.mae:.2f}</td><td>{r.rmse:.2f}</td></tr>' for r in all_scores.itertuples())
    options = '<option value="all">แสดงสินค้าทั้ง 5 ตัว</option>' + "".join(f'<option>{item}</option>' for item in ITEMS)
    report = f'''<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ผลทดลอง AI พยากรณ์ยอดขาย</title>
<style>body{{font-family:Tahoma,Arial,sans-serif;background:#f4f7fb;color:#172b46;margin:0;line-height:1.7}}main{{max-width:960px;margin:auto;padding:28px 20px}}h1{{font-size:27px}}h2{{font-size:21px}}section,.summary{{background:white;border:1px solid #dbe3ef;border-radius:12px;padding:22px;margin:20px 0}}table{{width:100%;border-collapse:collapse;font-size:14px}}th,td{{padding:10px;border-bottom:1px solid #e2e8f0;text-align:right}}th:first-child,td:first-child{{text-align:left}}th{{background:#edf2f8}}select{{font:inherit;padding:8px;max-width:100%}}svg{{width:100%;height:auto}}.blue{{color:#2563eb}}.orange{{color:#c2410c}}details{{margin-top:18px}}.note{{font-size:14px;color:#475569}}@media(max-width:600px){{section{{padding:12px}}table{{font-size:12px}}th,td{{padding:6px}}}}</style>
<main><h1>ผลทดลอง AI พยากรณ์ยอดขาย</h1><p>ข้อมูล M5 · ร้าน CA_1 · สินค้าอาหาร 5 ตัว · ทำนายล่วงหน้า 1 วัน</p>
<div class="summary"><h2>ผลจากข้อมูลที่กันไว้ทดสอบ</h2><p>25 เมษายน–22 พฤษภาคม 2016 · 28 วัน × 5 สินค้า = 140 คำทำนาย</p><p><strong>{verdict}</strong></p><table><thead><tr><th>วิธี</th><th>MAE (หน่วย)</th><th>RMSE (หน่วย)</th></tr></thead><tbody>{summary_rows}</tbody></table><p class="note">MAE คือจำนวนหน่วยที่ทำนายคลาดเคลื่อนเฉลี่ย ยิ่งน้อยยิ่งดี ผลนี้เป็นต้นแบบจากสินค้าที่เลือก ไม่ใช่ผลยืนยันสำหรับทั้งร้าน</p></div>
<label for="product">เลือกสินค้า </label><select id="product">{options}</select>{cards}
<section><h2>ทดลองอย่างไร</h2><p>AI เรียนรู้จากยอดขายย้อนหลัง 1, 7, 14 และ 28 วัน ค่าเฉลี่ย 7 และ 28 วัน ความผันผวนย้อนหลัง วันในสัปดาห์และช่วงของปี โดยใช้ Linear Regression ที่เรียนรู้ค่าน้ำหนักจากข้อมูล</p><p>ฝึกครั้งแรกถึง 28 กุมภาพันธ์ 2016 ตรวจผลระหว่าง 29 กุมภาพันธ์–24 เมษายน 2016 จากนั้นฝึกใหม่ด้วยข้อมูลถึง 24 เมษายน และทดสอบกับ 28 วันสุดท้าย โดยไม่ปรับโมเดลตามผลทดสอบ</p><p>แต่ละวันใช้ยอดขายจริงที่ทราบถึงวันก่อนหน้าในการทำนาย ไม่ใช่การทำนายทั้ง 28 วันล่วงหน้าในครั้งเดียว</p><p>ยังไม่มีการแนะนำสั่งซื้อหรือประเมินของเสีย ข้อมูลนี้ไม่มีชื่อสินค้าจริง อายุสินค้า สต็อกคงเหลือและค่าเดินทาง จึงยังไม่ยืนยันผลกับร้านในประเทศไทยหรือวันพระ</p><p class="note">แหล่งข้อมูล: <a href="https://www.kaggle.com/competitions/m5-forecasting-accuracy/data">M5 Forecasting – Accuracy, Kaggle</a> · สินค้าเลือกจากข้อมูลก่อนช่วงทดสอบ</p></section></main>
<script>document.getElementById('product').addEventListener('change',e=>{{document.querySelectorAll('.item').forEach(s=>s.hidden=e.target.value!=='all'&&s.id!==e.target.value)}});</script></html>'''
    (OUTPUT / "forecast_report.html").write_text(report, encoding="utf-8")
    return {"ai_mae": float(ai["mae"]), "best_baseline": str(baseline["method"]), "best_baseline_mae": float(baseline["mae"]), "improvement_percent": float(improvement)}


def main():
    source = DATA / "selected_5_foods.csv"
    df = pd.read_csv(source, encoding="utf-8-sig")
    df.columns = ["date", "item_id", "sales"]
    df["date"] = pd.to_datetime(df["date"])
    assert set(df.item_id.unique()) == set(ITEMS)
    assert not df.duplicated(["date", "item_id"]).any()
    assert (df.sales >= 0).all() and np.isfinite(df.sales).all()
    OUTPUT.mkdir(exist_ok=True)
    records, score_rows = [], []
    for item in ITEMS:
        series = df[df.item_id == item].set_index("date").sales.sort_index()
        assert len(series) == 1941
        assert series.index.equals(pd.date_range(series.index.min(), series.index.max()))
        x = features(series)
        # Independently verify history alignment and future invariance.
        day = pd.Timestamp("2016-04-25")
        assert x.loc[day, "lag_1"] == series.loc[day-pd.Timedelta(days=1)]
        assert x.loc[day, "mean_7"] == series.loc[day-pd.Timedelta(days=7):day-pd.Timedelta(days=1)].mean()
        changed = series.copy()
        changed.loc[day:] += 10000
        pd.testing.assert_frame_equal(features(changed).loc[:day], x.loc[:day])
        valid = x.notna().all(axis=1)
        for period, train_end, end in [("validation", TRAIN_END, VALIDATION_END), ("test", VALIDATION_END, series.index.max())]:
            train = valid & (x.index <= train_end)
            evaluation = valid & (x.index > train_end) & (x.index <= end)
            assert x.index[train].max() < x.index[evaluation].min()
            model = fit(x.loc[train].to_numpy(float), series.loc[train].to_numpy(float))
            estimates = {"linear_regression": predict(model, x.loc[evaluation].to_numpy(float)), "last_week": x.loc[evaluation,"lag_7"].to_numpy(), "mean_7": x.loc[evaluation,"mean_7"].to_numpy(), "mean_28": x.loc[evaluation,"mean_28"].to_numpy()}
            actual = series.loc[evaluation].to_numpy(float)
            for method, forecast in estimates.items():
                assert np.isfinite(forecast).all()
                score_rows.append({"period": period, "item_id": item, "method": method, "days": len(actual), **metrics(actual, forecast)})
            for i, date in enumerate(x.index[evaluation]):
                records.append({"period": period, "date": date.strftime("%Y-%m-%d"), "item_id": item, "actual": int(actual[i]), **{name: float(values[i]) for name, values in estimates.items()}})
            if period == "test":
                np.savez(OUTPUT/f"model_{item}.npz", center=model[0], scale=model[1], coefficients=model[2], features=np.array(x.columns, dtype=str), trained_until=str(train_end.date()))
    predictions = pd.DataFrame(records).sort_values(["period", "date", "item_id"])
    assert len(predictions[predictions.period == "test"]) == 140
    assert len(predictions[predictions.period == "validation"]) == 280
    for period in ("validation", "test"):
        part = predictions[predictions.period == period]
        for method in METHODS:
            score_rows.append({"period": period, "item_id": "ALL", "method": method, "days": len(part), **metrics(part.actual.to_numpy(), part[method].to_numpy())})
    scores = pd.DataFrame(score_rows)
    predictions.to_csv(OUTPUT/"predictions.csv", index=False, encoding="utf-8-sig", float_format="%.6f")
    scores.to_csv(OUTPUT/"metrics.csv", index=False, encoding="utf-8-sig", float_format="%.6f")
    overview = {"store": "CA_1", "items": ITEMS, "forecast_horizon_days": 1, "evaluation": "frozen model with observed prior-day sales (rolling one-step)", "train_end": str(TRAIN_END.date()), "validation_end": str(VALIDATION_END.date()), "test_start": "2016-04-25", "test_end": "2016-05-22", "source_sha256": hashlib.sha256(source.read_bytes()).hexdigest(), "feature_names": list(x.columns), "numpy_version": np.__version__, "pandas_version": pd.__version__, "checks": "continuous dates, unique keys, finite values, chronological splits, historical feature alignment, future target perturbation invariance"}
    overview.update(build_report(predictions, scores, overview))
    (OUTPUT/"experiment.json").write_text(json.dumps(overview, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(overview, ensure_ascii=True, indent=2))
    print(scores[scores.period == "test"].to_string(index=False))


if __name__ == "__main__":
    main()

