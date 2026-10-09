"""Create and verify a portable demo bundle; generated data stays out of Git."""
from datetime import datetime
import hashlib
import json
from pathlib import Path
import shutil
from zipfile import ZipFile, ZIP_DEFLATED

from train_forecast import OUTPUT

FILES = ['forecast_demo.html', 'forecast_report.html', 'sample_sales_import.csv',
         'predictions.csv', 'metrics.csv', 'experiment.json']
GUIDE = '''<!doctype html><html lang="th"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>คู่มือเปิดชิ้นงาน AI พยากรณ์ยอดขาย</title>
<style>body{font:17px/1.8 Tahoma,Arial,sans-serif;color:#172b46;background:#f4f7fb;margin:0}main{max-width:820px;margin:auto;padding:30px}section{background:white;padding:24px;border:1px solid #dbe3ef;border-radius:12px;margin:18px 0}a{color:#1857bf}h1{font-size:27px}h2{font-size:21px}code{word-break:break-word}</style>
<main><h1>คู่มือเปิดชิ้นงาน AI พยากรณ์ยอดขาย</h1>
<section><h2>เริ่มใช้งาน</h2><ol><li>แตกไฟล์ ZIP ทั้งโฟลเดอร์ก่อน อย่าเปิดชิ้นงานจากภายใน ZIP</li><li>เปิดไฟล์ <code>forecast_demo.html</code> ด้วย Chrome หรือ Edge บนคอมพิวเตอร์</li><li>เลือกสินค้าและกด “ทำนายยอดขาย”</li></ol><p><a href="forecast_demo.html">เปิดหน้าทำนายยอดขาย</a> · <a href="forecast_report.html">เปิดรายงานผลทดสอบ</a></p><p>ไม่ต้องติดตั้ง Python ไม่ต้องเปิดเซิร์ฟเวอร์ และไม่ต้องต่ออินเทอร์เน็ต เก็บไฟล์ทั้งหมดในโฟลเดอร์เดียวกันเพื่อให้ลิงก์ทำงานได้</p></section>
<section><h2>สาธิต 5 นาที</h2><ol><li>เลือก FOODS_3_064 และวันที่ 2016-04-25 กดทำนาย: ข้อมูล M5 ที่ติดมากับชิ้นงานจะทำนายประมาณ 25.14 หน่วย เทียบยอดขายจริง 25 หน่วย</li><li>เปลี่ยนเป็นวันที่ 2016-05-23 เพื่อทำนายวันถัดจากข้อมูลล่าสุด ยังไม่มียอดขายจริงของวันนี้ให้ตรวจ จากนั้นกรอกของเหลือที่ยังขายได้และหน่วยต่อแพ็ก กด “แนะนำจำนวนซื้อ”</li><li>เลือกไฟล์ <code>sample_sales_import.csv</code> ในโฟลเดอร์นี้ แล้วกด “นำเข้าและฝึก AI”</li><li>เลือกสินค้า กดทำนาย และดูผลทดสอบย้อนหลังด้านล่าง ผลจะต่างจากข้อแรก เพราะฝึกใหม่ด้วยข้อมูลช่วงสั้นกว่าและใช้วิธี Ridge Regression</li><li>ดาวน์โหลดคำทำนายหรือผลทดสอบย้อนหลัง CSV แล้วกด “กลับไปใช้ข้อมูล M5”</li></ol></section>
<section><h2>ไฟล์ยอดขายที่จะนำเข้า</h2><p>CSV แบบ UTF-8 มี 3 คอลัมน์ <code>วันที่,รหัสสินค้า,จำนวนที่ขาย</code> หรือ <code>date,item_id,sales</code> วันที่แบบ YYYY-MM-DD ยอดขายเป็นจำนวนเต็มไม่ติดลบ</p><p>อย่างน้อย 90 วันต่อเนื่องต่อสินค้า ไม่ซ้ำวันที่–สินค้า รองรับไม่เกิน 20 สินค้า, 20,000 แถว, 5 MB ต้องรวมรายการซื้อให้เป็นยอดรายวันก่อน หากข้อมูลขาด ระบบจะให้แก้ไฟล์ ไม่เติมยอด 0 ให้เอง</p><p>ข้อมูลนำเข้าและโมเดลที่ฝึกใหม่อยู่ในหน่วยความจำ เมื่อปิดหรือรีโหลดหน้า ต้องนำเข้าและฝึกใหม่ ไม่มีการส่งข้อมูลไปบริการ AI ภายนอก</p></section>
<section><h2>อธิบายชิ้นงานให้อาจารย์ฟัง</h2><p>โปรแกรมสร้างตัวแปรจากยอดขายย้อนหลังและวันในปฏิทิน แล้วฝึกโมเดลแยกสินค้าเพื่อคาดการณ์ยอดขายวันถัดไป มีการกันข้อมูลท้ายชุดไว้ทดสอบและเปรียบเทียบกับวิธีพื้นฐาน</p><p>รายงาน M5 ทดลองสินค้า 5 ตัว 28 วัน รวม 140 คำทำนาย MAE ของ AI 4.74 หน่วย เทียบค่าเฉลี่ยย้อนหลัง 28 วัน 4.94 หน่วย AI ลดความคลาดเคลื่อนรวมประมาณ 4.1% แต่แพ้วิธีพื้นฐานที่ดีที่สุดใน 2 สินค้า ผลนี้ยังไม่แทนสินค้าทั้งร้าน</p><p>เป็นการทำนายล่วงหน้า 1 วันซ้ำ โดยแต่ละวันใช้ยอดขายจริงถึงวันก่อนหน้า ไม่ใช่ทำนายทั้งเดือนพร้อมกัน และคำแนะนำซื้อใช้ยอดคาดการณ์หักสต็อกที่ผู้ใช้กรอกแล้วปัดตามแพ็ก ยังไม่ได้ประเมินการลดของเสียหรือของขาด ข้อมูล M5 ไม่มีชื่อสินค้าจริงและอายุสินค้า ไม่ใช่ข้อมูลร้านที่บ้านหรือวันพระของไทย</p></section>
<section><h2>หากเปิดแล้วใช้งานไม่ได้</h2><ul><li>แตก ZIP ใหม่แล้วเปิดด้วย Chrome หรือ Edge แทนการเปิดในโปรแกรมอ่านเอกสาร</li><li>ถ้าไม่พบรายงานหรือไฟล์ตัวอย่าง ตรวจว่าไฟล์ทั้งหมดอยู่ในโฟลเดอร์เดียวกัน</li><li>ถ้า CSV ภาษาไทยอ่านผิด ให้บันทึกเป็น CSV UTF-8 แล้วนำเข้าใหม่</li><li>ถ้าคำทำนายเปลี่ยนหลังนำเข้า ให้ตรวจว่ากำลังใช้ชุดข้อมูลใด กดกลับไปใช้ M5 เพื่อสาธิตผลเดิม</li></ul></section></main></html>'''


def main():
    root = OUTPUT.parent / 'delivery'
    root.mkdir(exist_ok=True)
    folder = root / ('AI_Forecast_Demo_' + datetime.now().strftime('%Y%m%d_%H%M%S'))
    folder.mkdir()
    for name in FILES:
        assert (OUTPUT / name).is_file(), name
        shutil.copy2(OUTPUT / name, folder / name)
    (folder / 'START_HERE.html').write_text(GUIDE, encoding='utf-8')
    files = FILES + ['START_HERE.html']
    manifest = {name: hashlib.sha256((folder/name).read_bytes()).hexdigest() for name in files}
    (folder / 'checksums.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    # Verify every packaged file against its source and archive content.
    for name in FILES:
        assert (folder/name).read_bytes() == (OUTPUT/name).read_bytes()
    archive = folder.with_suffix('.zip')
    with ZipFile(archive, 'w', ZIP_DEFLATED) as bundle:
        for name in files + ['checksums.json']:
            bundle.write(folder/name, folder.name+'/'+name)
    with ZipFile(archive) as bundle:
        assert bundle.testzip() is None
        assert len(bundle.namelist()) == len(files)+1
        for name in files:
            assert hashlib.sha256(bundle.read(folder.name+'/'+name)).hexdigest() == manifest[name]
    print('PASS: 8 bundle files, source comparison, ZIP CRC and SHA256 verification.')
    print(folder.name)
    print(archive.name)


if __name__ == '__main__':
    main()
