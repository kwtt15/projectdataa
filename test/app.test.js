const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PGlite } = require('@electric-sql/pglite');
const pg = require('pg');
const { readFileSync } = require('node:fs');
// Exercise the production pg adapter and HTTP routes against a real PostgreSQL
// engine in WASM. Only the transport/pool is substituted; SQL is not mocked.
let db, tail = Promise.resolve();
class TestPool {
  on() {}
  async connect() {
    const previous = tail;
    let release;
    tail = new Promise(resolve => { release = resolve; });
    await previous;
    return { query: async (query, values) => {
      const text = typeof query === 'string' ? query : query.text;
      values = typeof query === 'string' ? values : query.values;
      let r;
      if (!values && text.includes(';')) r = (await db.exec(text)).at(-1);
      else r = await db.query(text, values);
      const rows = r.rows.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => {
        const field = r.fields.find(f => f.name === key);
        if (value !== null && typeof value === 'string' && field) value = pg.types.getTypeParser(field.dataTypeID)(value);
        return [key,value];
      })));
      return { rows, rowCount: r.affectedRows ?? rows.length };
    }, release };
  }
}
pg.Pool = TestPool;
process.env.DATABASE_URL = 'postgresql://test/test';
const app = require('../server/index');
const { migrate, seed } = require('../scripts/database');
const { parameters } = require('../server/database');
const credentials = 'Basic ' + Buffer.from('admin:integration-test-only').toString('base64');
let base;
async function request(url, method='GET', body, authenticated=true) {
  const r = await fetch(base+url, { method, headers: { ...(authenticated ? { authorization:credentials } : {}), 'Content-Type':'application/json' }, ...(body ? { body:JSON.stringify(body) } : {}) });
  const text = await r.text();
  return { status:r.status, headers:r.headers, body:r.headers.get('content-type')?.includes('json') ? JSON.parse(text) : text };
}
test('WASHY PostgreSQL deployment workflow', async t => {
  db = new PGlite();
  const client = { query:async (text, values) => {
    if (values) { const r=await db.query(text,values); return {rows:r.rows}; }
    const r=(await db.exec(text)).at(-1); return { rows:r.rows };
  }};
  await migrate(client);
  await migrate(client);
  process.env.NODE_ENV = 'production';
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening',resolve));
  base = 'http://127.0.0.1:'+server.address().port;
  t.after(async()=>{ await new Promise(resolve=>server.close(resolve)); await db.close(); });
  await t.test('production fails closed until browser credentials are configured',async()=>{
    delete process.env.APP_USERNAME;delete process.env.APP_PASSWORD;
    assert.equal((await request('/dashboard.html')).status,503);
    process.env.APP_USERNAME='admin';process.env.APP_PASSWORD='integration-test-only';
    assert.equal((await request('/api/bootstrap','GET',null,false)).status,401);
    assert.equal((await request('/dashboard.html','GET',null,false)).status,401);
    assert.equal((await request('/dashboard.html')).status,200);
    for(const file of ['/.env','/server/index.js','/package.json','/database/postgres/seed.sql']) assert.equal((await request(file)).status,404);
  });
  await t.test('health and parameterized inputs',async()=>{
    assert.equal((await request('/api/health')).body.engine,'PostgreSQL');
    assert.deepEqual(parameters('SELECT @x, @x, @y',{x:"';DROP TABLE customers;--",y:2}),{text:'SELECT $1, $1, $2',values:["';DROP TABLE customers;--",2]});
  });
  const ids={};
  await t.test('create all master resources through the HTTP API',async()=>{
    const data={customers:{first_name:'ทดสอบ',last_name:'ระบบ',phone:'0812345678'},
      services:{package_name:'ล้างรถ',price:250,duration_minutes:60,status:'เปิดใช้งาน'},
      bays:{bay_name:'ช่อง 1',status:'เปิดใช้งาน'},
      staff:{first_name:'ช่าง',last_name:'ทดสอบ',phone:'0898765432',position:'Technician',status:'พร้อมทำงาน'},
      materials:{material_name:'แชมพู',unit:'ลิตร',unit_cost:10,stock_qty:5}};
    for(const [type,body] of Object.entries(data)) {
      const r=await request('/api/'+type,'POST',body);assert.equal(r.status,201,JSON.stringify(r.body));ids[type]=r.body.id;
    }
    let r=await request('/api/vehicles','POST',{customer_id:ids.customers,license_plate:'ทดสอบ 123',brand:'Toyota',model:'Yaris',color:'ขาว',vehicle_type:'Sedan'});
    assert.equal(r.status,201,JSON.stringify(r.body));ids.vehicles=r.body.id;
    r=await request('/api/members','POST',{customer_id:ids.customers,card_number:'TEST001',member_type:'Gold',remaining_credit:2,expiry_date:'2099-12-31',status:'ใช้งาน'});
    assert.equal(r.status,201,JSON.stringify(r.body));ids.members=r.body.id;
  });
  const booking = (time='2090-01-02T09:00')=>({vehicle_id:ids.vehicles,package_id:ids.services,bay_id:ids.bays,staff_id:ids.staff,start_time:time,member_card_id:ids.members});
  await t.test('reject out-of-hours and overlapping bookings, reserve credits',async()=>{
    assert.equal((await request('/api/bookings','POST',booking('2090-01-02T07:00'))).status,409);
    let r=await request('/api/bookings','POST',booking());assert.equal(r.status,201,JSON.stringify(r.body));ids.booking=r.body.id;
    assert.equal((await request('/api/bookings','POST',booking())).status,409);
    r=await request('/api/bookings','POST',booking('2090-01-03T09:00'));assert.equal(r.status,201,JSON.stringify(r.body));ids.pending=r.body.id;
    assert.equal((await request('/api/bookings','POST',booking('2090-01-04T09:00'))).status,409);
    assert.equal((await request('/api/bookings/'+ids.pending+'/cancel','POST',{})).status,200);
  });
  await t.test('start once, debit one credit, protect inventory and history',async()=>{
    assert.equal((await request('/api/bookings/'+ids.booking+'/start','POST',{})).status,200);
    assert.equal((await request('/api/bookings/'+ids.booking+'/start','POST',{})).status,409);
    let data=(await request('/api/bootstrap')).body;
    assert.equal(data.members[0].remaining_credit,1);assert.equal(data.bays[0].status,'กำลังใช้งาน');
    assert.equal((await request('/api/material_usage','POST',{booking_id:ids.booking,material_id:ids.materials,quantity_used:2})).status,201);
    assert.equal((await request('/api/material_usage','POST',{booking_id:ids.booking,material_id:ids.materials,quantity_used:10})).status,409);
    data=(await request('/api/bootstrap')).body;assert.equal(data.materials[0].stock_qty,3);assert.equal(data.material_usage.length,1);
    assert.equal((await request('/api/bookings/'+ids.booking,'DELETE')).status,409);
    assert.equal((await request('/api/vehicles/'+ids.vehicles,'PUT',{customer_id:ids.customers,license_plate:'NEW',brand:'B',model:'M',color:'C',vehicle_type:'Sedan'})).status,409);
  });
  await t.test('complete and receive member payment exactly once',async()=>{
    assert.equal((await request('/api/bookings/'+ids.booking,'PUT',{booking_status:'เสร็จสิ้น'})).status,200);
    let r=await request('/api/payments','POST',{booking_id:ids.booking,payment_method:'เครดิตสมาชิก'});assert.equal(r.status,201,JSON.stringify(r.body));
    assert.equal((await request('/api/payments','POST',{booking_id:ids.booking,payment_method:'เครดิตสมาชิก'})).status,400);
    const data=(await request('/api/bootstrap')).body;
    assert.equal(data.members[0].remaining_credit,1);assert.equal(data.payments.length,1);assert.equal(data.bays[0].status,'เปิดใช้งาน');
    const report=(await request('/api/reports/daily')).body;
    assert.equal(report[0].cash_received,0);assert.equal(report[0].member_redemption_value,250);
  });
  await t.test('atomic reception rolls back incorrect payment and completes prepaid jobs',async()=>{
    const body={...booking('2090-01-05T09:00'),member_card_id:null,payment_method:'เงินสด',paid_amount:1};
    let r=await request('/api/reception','POST',body);assert.equal(r.status,409,JSON.stringify(r.body));
    assert.equal((await request('/api/bootstrap')).body.bookings.length,2);
    r=await request('/api/reception','POST',{...body,paid_amount:250});assert.equal(r.status,201,JSON.stringify(r.body));
    const id=r.body.booking_id;
    assert.equal((await request('/api/bookings/'+id+'/complete','POST',{payment_method:'เงินสด'})).status,200);
    assert.equal((await request('/api/bookings/'+id+'/complete','POST',{payment_method:'เงินสด'})).status,409);
    assert.equal((await request('/api/bootstrap')).body.payments.length,2);
  });
  await t.test('source seed imports 630 bookings and refuses to overwrite data',async()=>{
    const seeded = new PGlite();
    try {
      await seeded.exec(readFileSync('database/postgres/setup-neon.sql','utf8'));
      const bundledClient={query:async(text,values)=>{const r=values ? await seeded.query(text,values) : (await seeded.exec(text)).at(-1);return {rows:r.rows};}};
      await migrate(bundledClient);
      const counts=await seeded.query('SELECT COUNT(*)::int AS n FROM bookings');
      assert.equal(counts.rows[0].n,630);
      await assert.rejects(seeded.exec(readFileSync('database/postgres/seed.sql','utf8')),/Seed requires empty/);
    } finally { await seeded.close(); }
  });
});
