import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../db.js';
import { createService } from '../service.js';

test('daily revenue compares equal complete Bangkok windows with zero days and excludes today',()=>{
  const db=openDatabase(':memory:');const s=createService(db);
  const insert=db.prepare('INSERT INTO sales(request_key,created_at,total_cents,paid_cents) VALUES(?,?,?,?)');
  for(const [key,date,value] of [['previous','2026-09-29T17:00:00Z',100],['start','2026-09-30T17:00:00Z',200],['last','2026-10-06T16:59:59Z',300],['today','2026-10-06T17:00:00Z',400]])insert.run(key,date,value,value);
  const report=s.salesTrend(7,new Date('2026-10-07T05:00:00Z'));
  assert.equal(report.start_date,'2026-09-30');assert.equal(report.end_date,'2026-10-06');
  assert.equal(report.points[0].revenue_cents,100);assert.equal(report.points[1].revenue_cents,200);
  assert.equal(report.points[2].revenue_cents,0);assert.equal(report.points.at(-1).revenue_cents,300);
  assert.equal(report.points.reduce((sum,p)=>sum+p.revenue_cents,0),600);
  assert.equal(report.previous_end_date,'2026-09-29');assert.equal(report.points.length,7);
  assert.throws(()=>s.salesTrend(0));db.close();
});
