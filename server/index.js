require("dotenv").config();
const express = require("express"),
  { query, procedure, beginTransaction } = require("./database"),
  path = require("path");
const app = express();
app.disable("x-powered-by");
app.use(require("./auth"));
app.use(express.json({ limit: "200kb" }));
app.use("/api", (_, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
const models = {
  customers: ["customers", "customer_id", ["first_name", "last_name", "phone"]],
  vehicles: [
    "vehicles",
    "vehicle_id",
    ["customer_id", "license_plate", "brand", "model", "color", "vehicle_type"],
  ],
  services: [
    "service_packages",
    "package_id",
    ["package_name", "price", "duration_minutes", "status"],
  ],
  bays: ["wash_bays", "bay_id", ["bay_name", "status"]],
  staff: [
    "staff",
    "staff_id",
    ["first_name", "last_name", "phone", "position", "status"],
  ],
  members: [
    "member_cards",
    "member_card_id",
    [
      "customer_id",
      "card_number",
      "member_type",
      "remaining_credit",
      "expiry_date",
      "status",
    ],
  ],
  bookings: [
    "bookings",
    "booking_id",
    [
      "vehicle_id",
      "package_id",
      "bay_id",
      "staff_id",
      "start_time",
      "booking_status",
    ],
  ],
  payments: [
    "payments",
    "payment_id",
    ["booking_id", "payment_method", "payment_date"],
  ],
  materials: [
    "materials",
    "material_id",
    ["material_name", "unit", "unit_cost", "stock_qty"],
  ],
  material_usage: [
    "material_usage",
    "usage_id",
    ["booking_id", "material_id", "quantity_used"],
  ],
};
const status = {
  services: { เปิดใช้งาน: "Active", ปิดใช้งาน: "Inactive" },
  bays: {
    เปิดใช้งาน: "Available",
    ปิดปรับปรุง: "Maintenance",
    กำลังใช้งาน: "Occupied",
  },
  staff: { พร้อมทำงาน: "Active", ไม่พร้อมทำงาน: "Inactive", ลางาน: "On_Leave" },
  members: { ใช้งาน: "Active", หมดอายุ: "Expired", ระงับ: "Suspended" },
  bookings: {
    รอให้บริการ: "Pending",
    กำลังล้าง: "In_Progress",
    เสร็จสิ้น: "Completed",
    ยกเลิก: "Cancelled",
  },
  payments: {
    เงินสด: "Cash",
    โอนเงิน: "PromptPay",
    บัตรเครดิต: "Credit_Card",
    เครดิตสมาชิก: "Member_Credit",
  },
};
const reverse = Object.fromEntries(
  Object.entries(status).map(([k, v]) => [
    k,
    Object.fromEntries(Object.entries(v).map(([a, b]) => [b, a])),
  ]),
);
function normalize(type, row) {
  let o = { ...row, id: row[models[type][1]] };
  delete o[models[type][1]];
  for (const k of [
    "start_time",
    "end_time",
    "created_at",
    "payment_date",
    "expiry_date",
  ])
    if (o[k] instanceof Date) {
      let d = o[k];
      o[k] =
        k === "expiry_date"
          ? d.toISOString().slice(0, 10)
          : d.toISOString().slice(0, 16);
    }
  for (const k of ["status", "booking_status", "payment_method"])
    if (reverse[type]?.[o[k]]) o[k] = reverse[type][o[k]];
  if (type === "payments") o.payment_status = "ชำระแล้ว";
  return o;
}
function input(type, body) {
  const obj = {};
  for (const k of models[type][2])
    if (Object.hasOwn(body, k) && body[k] !== undefined)
      obj[k] = status[type]?.[body[k]] || body[k];
  return obj;
}
function failure(res, e) {
  console.error("WASHY request failed", { code: e.code || "VALIDATION", message: e.code === "P0001" ? e.message : "Request rejected" });
  res
    .status(
      ["23503", "23505", "23514", "P0001", "40001"].includes(e.code) ? 409 : 400,
    )
    .json({
      error: e.code ? (e.code === "P0001" ? e.message : "ข้อมูลไม่ถูกต้อง ขัดแย้งกับข้อมูลเดิม หรือฐานข้อมูลยังไม่พร้อม") : (e.message || "Database error"),
    });
}
app.get("/api/health", async (_, res) => {
  try {
    await query("SELECT 1 AS ok");
    res.json({ ok: true, engine: "PostgreSQL" });
  } catch (e) {
    failure(res, e);
  }
});
app.get("/api/bootstrap", async (_, res) => {
  try {
    const data = {};
    for (const [type, [table, pk]] of Object.entries(models)) {
      const result = await query(
        `SELECT * FROM ${table} ORDER BY ${pk} DESC LIMIT 1500`,
      );
      data[type] = result.recordset.map((x) => normalize(type, x));
    }
    res.json(data);
  } catch (e) {
    failure(res, e);
  }
});
// Receive one payment per booking; member credit is measured in wash credits (1 booking = 1 credit).
app.post("/api/payments", async (req, res) => {
  const b = req.body,
    bookingId = Number(b.booking_id),
    method = status.payments[b.payment_method] || b.payment_method;
  if (
    !Number.isInteger(bookingId) ||
    bookingId <= 0 ||
    !["Cash", "PromptPay", "Credit_Card", "Member_Credit"].includes(method)
  )
    return res
      .status(400)
      .json({ error: "กรุณาเลือกรายการจองและวิธีชำระเงิน" });
  let tx;
  try {
    tx = await beginTransaction();
    const run = (q, v = {}) => tx.query(q, v);
    const booking = (
      await run(
        `SELECT b.*,v.customer_id FROM bookings b JOIN vehicles v ON v.vehicle_id=b.vehicle_id WHERE b.booking_id=@id`,
        { id: bookingId },
      )
    ).recordset[0];
    if (!booking) throw Error("ไม่พบรายการจอง");
    if (booking.booking_status !== "Completed")
      throw Error("รับชำระได้เฉพาะรายการจองที่มีสถานะเสร็จสิ้นแล้วเท่านั้น");
    if (
      (
        await run(
          "SELECT COUNT(*) n FROM payments WHERE booking_id=@id",
          { id: bookingId },
        )
      ).recordset[0].n
    )
      throw Error("รายการจองนี้ชำระเงินแล้ว");
    if (method === "Member_Credit") {
      let card;
      if (booking.member_card_id) {
        card = (
          await run(
            `SELECT * FROM member_cards WHERE member_card_id=@id AND customer_id=@customer`,
            { id: booking.member_card_id, customer: booking.customer_id },
          )
        ).recordset[0];
        if (!card) throw Error("ไม่พบบัตรสมาชิกของลูกค้า");
        // เครดิตของบัตรที่ผูกกับการจองถูกหักตอนเริ่มล้างแล้ว
      } else {
        card = (
          await run(
            `SELECT * FROM member_cards WHERE customer_id=@customer AND status='Active' AND expiry_date>=(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date AND remaining_credit>0 ORDER BY expiry_date,member_card_id LIMIT 1`,
            { customer: booking.customer_id },
          )
        ).recordset[0];
        if (!card) throw Error("ไม่มีบัตรสมาชิกที่ใช้งานได้และมีเครดิตเพียงพอ");
        const debit = await run(
          `UPDATE member_cards SET remaining_credit=remaining_credit-1 WHERE member_card_id=@card AND remaining_credit>0`,
          { card: card.member_card_id },
        );
        if (debit.rowsAffected[0] !== 1) throw Error("เครดิตสมาชิกไม่เพียงพอ");
      }
    } else if (booking.member_card_id) {
      throw Error("การจองนี้ผูกบัตรสมาชิกอยู่ กรุณาเลือกเครดิตสมาชิก");
    }
    const paid = Number(b.amount ?? booking.price_snapshot);
    if (!Number.isFinite(paid) || paid <= 0) throw Error("จำนวนเงินไม่ถูกต้อง");
    const amount =
      method === "Member_Credit" ? Number(booking.price_snapshot) : paid;
    await run(
      `INSERT INTO payments(booking_id,payment_method,amount,payment_date) VALUES(@id,@method,@amount,COALESCE(CAST(@date AS timestamp), CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok'))`,
      {
        id: bookingId,
        method,
        amount,
        date: b.payment_date ? String(b.payment_date).replace("T", " ") : null,
      },
    );
    await tx.commit();
    res.status(201).json({ ok: true });
  } catch (e) {
    if (tx)
      try {
        await tx.rollback();
      } catch (_) {}
    failure(res, e);
  }
});
app.post("/api/:type", async (req, res, next) => {
  const type = req.params.type;
  if (!Object.hasOwn(models, type)) return next();
  try {
    let obj = input(type, req.body),
      result;
    if (type === "bookings") {
      // Explicit membership choice from the Booking form. Never guess a member card.
      const start = String(obj.start_time || "").replace("T", " ");
      const requested = req.body.member_card_id;
      let memberCardId = null;
      if (requested !== null && requested !== undefined && requested !== "") {
        memberCardId = Number(requested);
        if (!Number.isSafeInteger(memberCardId) || memberCardId <= 0)
          return res.status(400).json({ error: "Member ID ไม่ถูกต้อง" });
        const card = await query(
          `SELECT c.member_card_id FROM member_cards c JOIN vehicles v ON v.customer_id=c.customer_id WHERE v.vehicle_id=@vehicle_id AND c.member_card_id=@card_id AND c.status='Active' AND c.expiry_date>=CAST(@start_time AS date) AND c.remaining_credit>0`,
          {
            vehicle_id: Number(obj.vehicle_id),
            card_id: memberCardId,
            start_time: start,
          },
        );
        if (!card.recordset.length)
          return res.status(400).json({
            error: "บัตรสมาชิกไม่ถูกต้อง หมดอายุ หรือไม่ใช่ของเจ้าของรถ",
          });
      }
      result = await procedure("usp_create_booking", {
        vehicle_id: obj.vehicle_id,
        package_id: obj.package_id,
        bay_id: obj.bay_id,
        staff_id: obj.staff_id,
        start_time: start,
        member_card_id: memberCardId,
      });
      return res.status(201).json({
        id: result.recordset?.[0]?.booking_id,
        member_card_id: memberCardId,
      });
    }
    if (type === "material_usage") {
      await procedure("usp_use_material", {
        booking_id: obj.booking_id,
        material_id: obj.material_id,
        quantity: obj.quantity_used,
      });
      return res.status(201).json({ ok: true });
    }
    if (type === "payments")
      return res.status(409).json({
        error:
          "การรับชำระต้องทำผ่านขั้นตอนปิดงานหรือรับรถ เพื่อป้องกันการหักเครดิตซ้ำ กรุณาใช้ API /api/bookings/:id/complete หรือ /api/reception",
      });
    if (type === "customers") {
      result = await procedure("usp_save_customer", {
        ...obj,
        customer_id: null,
      });
      return res.status(201).json({ id: result.recordset?.[0]?.customer_id });
    }
    if (type === "vehicles") {
      result = await procedure("usp_save_vehicle", {
        ...obj,
        vehicle_id: null,
      });
      return res.status(201).json({ id: result.recordset?.[0]?.vehicle_id });
    }
    if (type === "members") {
      obj.member_type = String(obj.member_type || "").trim();
      if (!obj.member_type || obj.member_type.length > 30)
        throw Error("กรุณากรอกประเภทสมาชิกไม่เกิน 30 ตัวอักษร");
      if (
        !Number.isInteger(Number(obj.remaining_credit)) ||
        Number(obj.remaining_credit) < 0
      )
        throw Error("เครดิตคงเหลือต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป");
      obj.remaining_credit = Number(obj.remaining_credit);
    }
    const keys = Object.keys(obj);
    if (!keys.length) throw Error("ไม่มีข้อมูล");
    result = await query(
      `INSERT INTO ${models[type][0]} (${keys.map((x) => x).join(",")}) VALUES (${keys.map((x) => "@" + x).join(",")}) RETURNING ${models[type][1]} AS id`,
      obj,
    );
    res.status(201).json({ id: result.recordset[0].id });
  } catch (e) {
    failure(res, e);
  }
});
// All edits are parameterized and checked by PostgreSQL constraints.
// Booking and bay status are synchronized within the same transaction.
// Booking history fields are immutable under BR10 and the SQL guard.
// Status changes must use the transactional stored procedures below.
app.put("/api/bookings/:id", async (req, res) => {
  const id = Number(req.params.id),
    requested =
      status.bookings[req.body.booking_status] || req.body.booking_status;
  if (!Number.isSafeInteger(id) || id <= 0)
    return res.status(400).json({ error: "รหัสการจองไม่ถูกต้อง" });
  try {
    const found = (
      await query(
        "SELECT booking_status FROM bookings WHERE booking_id=@id",
        { id },
      )
    ).recordset[0];
    if (!found) return res.status(404).json({ error: "ไม่พบรายการจอง" });
    if (!requested || requested === found.booking_status)
      return res.json({ ok: true });
    if (found.booking_status === "Pending" && requested === "In_Progress")
      await procedure("usp_start_booking", { booking_id: id });
    else if (found.booking_status === "Pending" && requested === "Cancelled")
      await procedure("usp_cancel_booking", { booking_id: id });
    else if (
      found.booking_status === "In_Progress" &&
      requested === "Completed"
    ) {
      // แยกการปิดงานออกจากการชำระเงิน: รับชำระภายหลังในหน้า Payments
      await query(
        `UPDATE bookings SET booking_status='Completed' WHERE booking_id=@id AND booking_status='In_Progress'`,
        { id },
      );
    } else
      return res.status(409).json({
        error:
          "ตาม BR10 ห้ามแก้ประวัติการจองโดยตรง การปิดงานให้เปลี่ยนสถานะเป็นเสร็จสิ้น และบันทึกชำระเงินที่หน้า Payments และการแก้รถ/แพ็กเกจ/เวลาให้ยกเลิกแล้วจองใหม่",
      });
    await query(
      `UPDATE wash_bays SET status=CASE WHEN EXISTS(SELECT 1 FROM bookings b WHERE b.bay_id=wash_bays.bay_id AND b.booking_status='In_Progress') THEN 'Occupied' ELSE CASE WHEN status='Maintenance' THEN 'Maintenance' ELSE 'Available' END END WHERE bay_id=(SELECT bay_id FROM bookings WHERE booking_id=@id)`,
      { id },
    );
    return res.json({ ok: true });
  } catch (e) {
    failure(res, e);
  }
});
app.put("/api/:type/:id", async (req, res) => {
  const type = req.params.type;
  if (!Object.hasOwn(models, type)) return res.sendStatus(404);
  try {
    let obj = input(type, req.body),
      id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw Error("ID ไม่ถูกต้อง");
    if (type === "customers") {
      await procedure("usp_save_customer", { ...obj, customer_id: id });
      return res.json({ ok: true });
    }
    if (type === "vehicles") {
      await procedure("usp_save_vehicle", { ...obj, vehicle_id: id });
      return res.json({ ok: true });
    }
    if (type === "members") {
      if (Object.hasOwn(obj, "member_type")) {
        obj.member_type = String(obj.member_type || "").trim();
        if (!obj.member_type || obj.member_type.length > 30)
          throw Error("ประเภทสมาชิกต้องมี 1-30 ตัวอักษร");
      }
      if (Object.hasOwn(obj, "remaining_credit")) {
        obj.remaining_credit = Number(obj.remaining_credit);
        if (!Number.isInteger(obj.remaining_credit) || obj.remaining_credit < 0)
          throw Error("เครดิตต้องเป็นจำนวนเต็มไม่ติดลบ");
      }
    }
    if (type === "payments" && Object.hasOwn(req.body, "amount"))
      obj.amount = Number(req.body.amount);
    if (type === "material_usage")
      return res
        .status(409)
        .json({
          error:
            "ไม่อนุญาตให้แก้รายการใช้วัสดุย้อนหลัง เพราะจะทำให้สต็อกคลาดเคลื่อน กรุณาบันทึกรายการใหม่",
        });
    if (type === "bays") {
      const active = (
        await query(
          `SELECT COUNT(*) AS n FROM bookings WHERE bay_id=@id AND booking_status='In_Progress'`,
          { id },
        )
      ).recordset[0].n;
      if (active) obj.status = "Occupied";
    }
    const keys = Object.keys(obj);
    if (!keys.length) throw Error("ไม่มีข้อมูล");
    const result = await query(
      `UPDATE ${models[type][0]} SET ${keys.map((k) => k + "=@" + k).join(",")} WHERE ${models[type][1]}=@id`,
      { ...obj, id },
    );
    res.json({ ok: result.rowsAffected[0] > 0 });
  } catch (e) {
    failure(res, e);
  }
});
app.delete("/api/:type/:id", async (req, res) => {
  const type = req.params.type;
  if (!Object.hasOwn(models, type)) return res.sendStatus(404);
  if (["payments", "material_usage", "bookings"].includes(type))
    return res.status(409).json({ error: "ไม่อนุญาตให้ลบประวัติธุรกรรม" });
  try {
    const id = Number(req.params.id);
    if (type === "customers")
      await procedure("usp_delete_customer", { customer_id: id });
    else if (type === "vehicles")
      await procedure("usp_delete_vehicle", { vehicle_id: id });
    else
      await query(
        `DELETE FROM ${models[type][0]} WHERE ${models[type][1]}=@id`,
        { id },
      );
    res.json({ ok: true });
  } catch (e) {
    failure(res, e);
  }
});
app.post("/api/bookings/:id/start", async (req, res) => {
  try {
    await procedure("usp_start_booking", { booking_id: Number(req.params.id) });
    await query(
      `UPDATE wash_bays SET status=CASE WHEN EXISTS (SELECT 1 FROM bookings b WHERE b.bay_id=wash_bays.bay_id AND b.booking_status='In_Progress') THEN 'Occupied' ELSE CASE WHEN status='Maintenance' THEN 'Maintenance' ELSE 'Available' END END WHERE bay_id=(SELECT bay_id FROM bookings WHERE booking_id=@id)`,
      { id: Number(req.params.id) },
    );
    res.json({ ok: true });
  } catch (e) {
    failure(res, e);
  }
});
app.post("/api/bookings/:id/cancel", async (req, res) => {
  try {
    await procedure("usp_cancel_booking", {
      booking_id: Number(req.params.id),
    });
    await query(
      `UPDATE wash_bays SET status=CASE WHEN EXISTS (SELECT 1 FROM bookings b WHERE b.bay_id=wash_bays.bay_id AND b.booking_status='In_Progress') THEN 'Occupied' ELSE CASE WHEN status='Maintenance' THEN 'Maintenance' ELSE 'Available' END END WHERE bay_id=(SELECT bay_id FROM bookings WHERE booking_id=@id)`,
      { id: Number(req.params.id) },
    );
    res.json({ ok: true });
  } catch (e) {
    failure(res, e);
  }
});
app.post("/api/bookings/:id/complete", async (req, res) => {
  try {
    await procedure("usp_complete_booking", {
      booking_id: Number(req.params.id),
      payment_method:
        status.payments[req.body.payment_method] || req.body.payment_method,
    });
    await query(
      `UPDATE wash_bays SET status=CASE WHEN EXISTS (SELECT 1 FROM bookings b WHERE b.bay_id=wash_bays.bay_id AND b.booking_status='In_Progress') THEN 'Occupied' ELSE CASE WHEN status='Maintenance' THEN 'Maintenance' ELSE 'Available' END END WHERE bay_id=(SELECT bay_id FROM bookings WHERE booking_id=@id)`,
      { id: Number(req.params.id) },
    );
    res.json({ ok: true });
  } catch (e) {
    failure(res, e);
  }
});
app.post("/api/reception", async (req, res) => {
  try {
    const b = req.body;
    const result = await procedure("sp_process_car_wash_booking", {
      vehicle_id: b.vehicle_id,
      package_id: b.package_id,
      bay_id: b.bay_id,
      staff_id: b.staff_id,
      start_time: b.start_time?.replace("T", " "),
      payment_method: status.payments[b.payment_method] || b.payment_method,
      member_card_id: b.member_card_id || null,
      paid_amount: b.paid_amount ?? null,
    });
    res.status(201).json(result.recordset?.[0] || { ok: true });
  } catch (e) {
    failure(res, e);
  }
});
app.get("/api/reports/daily", async (req, res) => {
  try {
    let r = await query(
      "SELECT * FROM vw_daily_car_wash_revenue_summary ORDER BY service_date DESC LIMIT 366",
    );
    res.json(r.recordset);
  } catch (e) {
    failure(res, e);
  }
});
app.use(express.static(path.resolve(__dirname, "..", "public")));
app.get("/", (_, res) => res.redirect("/dashboard.html"));
if (require.main === module) {
  app.listen(Number(process.env.PORT || 3000), () => console.log("WASHY listening on port " + (process.env.PORT || 3000)));
}
module.exports = app;
