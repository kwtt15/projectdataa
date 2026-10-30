const { Pool, types } = require('pg');
// Keep shop-local timestamps stable regardless of the server's timezone.
types.setTypeParser(1114, value => value.replace(' ', 'T').slice(0, 16));
types.setTypeParser(1082, value => value);
types.setTypeParser(1700, Number);
types.setTypeParser(20, Number);
let pool;
function getPool() {
  if (!process.env.DATABASE_URL) throw Error('ยังไม่ได้ตั้งค่า DATABASE_URL');
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3,
      idleTimeoutMillis: 10000, connectionTimeoutMillis: 10000, allowExitOnIdle: true });
    pool.on('error', () => console.error('PostgreSQL idle connection closed; retry the request.'));
  }
  return pool;
}
function parameters(text, values) {
  const args = [], positions = new Map();
  return { text: text.replace(/@([a-z_][a-z_0-9]*)/gi, (_, name) => {
    if (!Object.hasOwn(values, name)) throw Error('Missing parameter: ' + name);
    if (!positions.has(name)) { args.push(values[name] === '' ? null : values[name]); positions.set(name, args.length); }
    return '$' + positions.get(name);
  }), values: args };
}
function result(r) { return { recordset: r.rows, rowsAffected: [r.rowCount] }; }
async function beginTransaction() {
  const client = await getPool().connect();
  let finished = false;
  async function finish(command) {
    if (finished) return;
    try { await client.query(command); } finally { finished = true; client.release(); }
  }
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '10s'");
    // Same coarse transaction lock as the original SQL Server application.
    await client.query('SELECT pg_advisory_xact_lock(873219)');
    return { query: async (sql, values = {}) => result(await client.query(parameters(sql, values))),
      commit: () => finish('COMMIT'), rollback: () => finish('ROLLBACK') };
  } catch (e) { await finish('ROLLBACK'); throw e; }
}
async function query(sql, values = {}) {
  const tx = await beginTransaction();
  try { const r = await tx.query(sql, values); await tx.commit(); return r; }
  catch (e) { await tx.rollback(); throw e; }
}
const procedures = {
  usp_create_booking: ['vehicle_id','package_id','bay_id','staff_id','start_time','member_card_id'],
  usp_start_booking: ['booking_id'], usp_cancel_booking: ['booking_id'],
  usp_use_material: ['booking_id','material_id','quantity'],
  usp_complete_booking: ['booking_id','payment_method'],
  usp_save_customer: ['first_name','last_name','phone','customer_id'],
  usp_save_vehicle: ['customer_id','license_plate','brand','model','color','vehicle_type','vehicle_id'],
  usp_delete_customer: ['customer_id'], usp_delete_vehicle: ['vehicle_id'],
  sp_process_car_wash_booking: ['vehicle_id','package_id','bay_id','staff_id','start_time','payment_method','member_card_id','paid_amount']
};
async function procedure(name, values) {
  const keys = procedures[name];
  if (!keys) throw Error('Unknown procedure');
  const args = Object.fromEntries(keys.map(k => [k, values[k] ?? null]));
  return query(`SELECT * FROM ${name}(${keys.map(k => '@'+k).join(',')})`, args);
}
module.exports = { query, procedure, beginTransaction, getPool, parameters };
