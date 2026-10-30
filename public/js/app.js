const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const TODAY = localDate();
const datePart = (value) => String(value || "").slice(0, 10);
let reportFrom = "",
  reportTo = "";
const withinReport = (value) => {
  const d = datePart(value);
  return d && (!reportFrom || d >= reportFrom) && (!reportTo || d <= reportTo);
};

const MEMBER_CREDITS = {};
const SCHEMAS = {
  customers: {
    title: "Customers",
    fields: [
      ["first_name", "ชื่อ"],
      ["last_name", "นามสกุล"],
      ["phone", "เบอร์โทร"],
    ],
  },
  vehicles: {
    title: "Vehicles",
    fields: [
      ["customer_id", "เจ้าของรถ", "customers"],
      ["license_plate", "ทะเบียนรถ"],
      ["brand", "ยี่ห้อ"],
      ["model", "รุ่น"],
      ["color", "สี"],
      [
        "vehicle_type",
        "ประเภทรถ",
        ["Sedan", "SUV", "Pickup", "Hatchback", "Van", "Other"],
      ],
    ],
  },
  services: {
    title: "Services",
    fields: [
      ["package_name", "ชื่อแพ็กเกจ"],
      ["price", "ราคา", "number"],
      ["duration_minutes", "ระยะเวลา (นาที)", "number"],
      ["status", "สถานะ", ["เปิดใช้งาน", "ปิดใช้งาน"]],
    ],
  },
  bays: {
    title: "Wash Bays",
    fields: [
      ["bay_name", "ชื่อช่องล้าง"],
      ["status", "สถานะ", ["เปิดใช้งาน", "กำลังใช้งาน", "ปิดปรับปรุง"]],
    ],
  },
  staff: {
    title: "Staff",
    fields: [
      ["first_name", "ชื่อ"],
      ["last_name", "นามสกุล"],
      ["phone", "เบอร์โทร"],
      [
        "position",
        "ตำแหน่ง",
        ["Technician", "Detailer", "Supervisor", "Cashier"],
      ],
      ["status", "สถานะ", ["พร้อมทำงาน", "ไม่พร้อมทำงาน", "ลางาน"]],
    ],
  },
  members: {
    title: "Members",
    fields: [
      ["customer_id", "ลูกค้า", "customers"],
      ["card_number", "หมายเลขบัตร"],
      ["member_type", "ประเภทสมาชิก"],
      ["remaining_credit", "เครดิตคงเหลือ (ครั้ง)", "number"],
      ["expiry_date", "วันหมดอายุ", "date"],
      ["status", "สถานะ", ["ใช้งาน", "หมดอายุ", "ระงับ"]],
    ],
  },
  bookings: {
    title: "Bookings",
    fields: [
      ["vehicle_id", "รถยนต์", "vehicles"],
      ["customer_name", "เจ้าของรถ", "derived_customer"],
      ["member_card_id", "ข้อมูลสมาชิก", "derived_member"],
      ["package_id", "แพ็กเกจ", "services"],
      ["bay_id", "ช่องล้าง", "bays"],
      ["staff_id", "พนักงาน", "staff"],
      ["start_time", "วันและเวลาเริ่ม", "datetime-local"],
      [
        "booking_status",
        "สถานะ",
        ["รอให้บริการ", "กำลังล้าง", "เสร็จสิ้น", "ยกเลิก"],
      ],
    ],
  },
  payments: {
    title: "Payments",
    fields: [
      ["booking_id", "รายการจอง", "bookings"],
      ["payment_date", "วันที่ชำระ", "datetime-local"],
      ["amount", "จำนวนเงิน", "number"],
      [
        "payment_method",
        "วิธีชำระ",
        ["เงินสด", "โอนเงิน", "บัตรเครดิต", "เครดิตสมาชิก"],
      ],
    ],
  },
  materials: {
    title: "Materials (Stock)",
    fields: [
      ["material_name", "ชื่อวัสดุ"],
      ["unit", "หน่วย"],
      ["unit_cost", "ต้นทุนต่อหน่วย", "number"],
      ["stock_qty", "จำนวนคงเหลือ", "number"],
    ],
  },
  material_usage: {
    title: "Material Usage",
    fields: [
      ["booking_id", "รายการจอง", "bookings"],
      ["material_id", "วัสดุ", "materials"],
      ["quantity_used", "จำนวนที่ใช้", "number"],
    ],
  },
};
// Main UI controller. Data is loaded from the MySQL API.
const KEY = "washy_er_v3";
// ข้อมูลจะถูกโหลดจาก MySQL ผ่าน /api/bootstrap เท่านั้น
let db = {
  customers: [],
  vehicles: [],
  services: [],
  bays: [],
  staff: [],
  members: [],
  bookings: [],
  payments: [],
  materials: [],
  material_usage: [],
};
let page = document.body.dataset.page || "dashboard",
  search = "",
  editId = null,
  formType = null,
  tab = "bays";
const $ = (s) => document.querySelector(s),
  esc = (x) =>
    String(x ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    ); // Data persistence is handled by the backend, not localStorage.
function save() {}
function ico(n) {
  return `<i data-lucide="${n}"></i>`;
}
function icons() {
  if (window.lucide) lucide.createIcons();
}
function nameFor(type, id) {
  let r = db[type]?.find((x) => String(x.id) === String(id));
  if (!r) return "-";
  return type === "customers" || type === "staff"
    ? `${r.first_name} ${r.last_name}`
    : type === "vehicles"
      ? r.license_plate
      : type === "services"
        ? r.package_name
        : type === "bays"
          ? r.bay_name
          : type === "bookings"
            ? `#B${String(r.id).padStart(3, "0")}`
            : type === "members"
              ? r.card_number
              : type === "materials"
                ? r.material_name
                : r.id;
}
function badge(s) {
  let cl = /เสร็จ|ชำระแล้ว|พร้อม|เปิด|ใช้งาน/.test(s)
    ? "success"
    : /ยกเลิก|ไม่สำเร็จ|ระงับ|หมดอายุ/.test(s)
      ? "danger"
      : /กำลัง/.test(s)
        ? "info"
        : "warning";
  return `<span class="badge ${cl}">${esc(s)}</span>`;
}
function money(n) {
  return "฿" + Number(n || 0).toLocaleString("th-TH");
}
function notify(msg) {
  $("#toast").textContent = msg;
  $("#toast").classList.add("show");
  setTimeout(() => $("#toast").classList.remove("show"), 2500);
}
function navigate(p) {
  if (!PAGES.includes(p)) return;
  window.location.href = p + ".html";
}
const PAGES = [
  "dashboard",
  "bookings",
  "customers",
  "vehicles",
  "services",
  "bays",
  "staff",
  "members",
  "payments",
  "materials",
  "material_usage",
  "reports",
];
function renderNav() {
  let items = [
    ["dashboard", "Dashboard", "house"],
    ["bookings", "Bookings", "calendar-days"],
    ["customers", "Customers", "circle-user-round"],
    ["vehicles", "Vehicles", "car-front"],
    ["services", "Services", "tag"],
    ["bays", "Wash Bays", "warehouse"],
    ["staff", "Staff", "users-round"],
    ["members", "Members", "credit-card"],
    ["payments", "Payments", "wallet"],
    ["materials", "Materials", "package"],
    ["material_usage", "Material Usage", "flask-conical"],
    ["reports", "Reports", "chart-column"],
  ];
  $("#nav").innerHTML = items
    .map(
      ([k, n, i]) =>
        `<a href="${k}.html" data-nav="${k}" class="${page === k ? "active" : ""}">${ico(i)} ${n}</a>`,
    )
    .join("");
}
function header(title, desc, btn = "") {
  return `<div class="page-head"><div><h1>${title}</h1><p>${desc}</p></div>${btn}</div>`;
}
function render() {
  renderNav();
  $("#today").textContent = new Date().toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  $("#content").innerHTML =
    page === "dashboard"
      ? dashboard()
      : page === "reports"
        ? reports()
        : page === "bays"
          ? baysPage()
          : tablePage(page);
  bind();
  icons();
}
function dashboard() {
  let today = db.bookings.filter((x) => x.start_time.slice(0, 10) === TODAY),
    paid = db.payments.filter(
      (x) =>
        x.payment_status === "ชำระแล้ว" &&
        x.payment_date.slice(0, 10) === TODAY,
    ),
    revenue = paid.reduce((a, x) => a + Number(x.amount), 0);
  let stats = [
    ["การจองวันนี้", today.length, "calendar-days"],
    [
      "กำลังให้บริการ",
      today.filter((x) => x.booking_status === "กำลังล้าง").length,
      "car-front",
    ],
    [
      "เสร็จแล้ว",
      today.filter((x) => x.booking_status === "เสร็จสิ้น").length,
      "badge-check",
    ],
    ["รายได้วันนี้", money(revenue), "wallet"],
  ];
  let vals = Array.from({ length: 7 }, (_, i) => {
      let d = new Date();
      d.setDate(d.getDate() - 6 + i);
      let date = localDate(d);
      return {
        date,
        amt: db.payments
          .filter(
            (x) =>
              x.payment_date.slice(0, 10) === date &&
              x.payment_status === "ชำระแล้ว",
          )
          .reduce((a, x) => a + Number(x.amount), 0),
      };
    }),
    max = Math.max(100, ...vals.map((x) => x.amt));
  return (
    header("Dashboard To Day", "ภาพรวมการดำเนินงานของร้าน WASHY") +
    `<div class="cards">${stats.map((x) => `<div class="card"><div class="card-icon">${ico(x[2])}</div><div class="card-label">${x[0]}</div><div class="card-value">${x[1]}</div></div>`).join("")}</div><div class="dashboard-grid"><div class="panel"><div class="panel-title"><h2>รายได้ย้อนหลัง 7 วัน</h2><span class="subtle">อ้างอิงรายการชำระเงินจริงในระบบจำลอง</span></div><div class="chart">${vals.map((x) => `<div class="bar-col"><div class="bar" title="${money(x.amt)}" style="height:${Math.max(3, (x.amt / max) * 90)}%"></div><small>${x.date.slice(5)}</small></div>`).join("")}</div></div><div class="panel"><div class="panel-title"><h2>รายการจองล่าสุด</h2><button class="btn" data-go="bookings">ดูทั้งหมด ${ico("arrow-right")}</button></div><div class="activity">${
      db.bookings
        .slice(-6)
        .reverse()
        .map(
          (b) =>
            `<div class="activity-row"><div><strong>${esc(nameFor("customers", b.customer_id))}</strong><div class="subtle">${esc(nameFor("services", b.package_id))} · ${esc(b.start_time.replace("T", " "))} น.</div></div>${badge(b.booking_status)}</div>`,
        )
        .join("") || '<div class="empty">ยังไม่มีรายการจอง</div>'
    }</div></div></div><div class="panel"><div class="panel-title"><h2>สถานะช่องล้าง</h2><button class="btn" data-go="bays">ดูช่องล้าง</button></div>${bayTiles()}</div>`
  );
}
function bayStatus(b) {
  if (b.status === "ปิดปรับปรุง") return "ปิดปรับปรุง";
  if (b.status === "กำลังใช้งาน") return "กำลังใช้งาน";
  let busy = db.bookings.some(
    (x) =>
      x.bay_id === b.id &&
      x.start_time.slice(0, 10) === TODAY &&
      x.booking_status === "กำลังล้าง",
  );
  return busy ? "กำลังใช้งาน" : "ว่าง";
}
function bayTiles() {
  return `<div class="bay-grid">${db.bays.map((b) => `<div class="bay"><h2>${esc(b.bay_name)}</h2>${badge(bayStatus(b))}<p>สถานะอ้างอิงจากรายการจอง</p></div>`).join("")}</div>`;
}
function baysPage() {
  return (
    header(
      "Wash Bays",
      "จัดการช่องล้างและดูสถานะจากการจอง",
      `<button class="btn primary" data-add="bays">${ico("plus")} เพิ่มช่องล้าง</button>`,
    ) +
    `<div class="panel">${bayTiles()}</div>` +
    tableSection("bays")
  );
}
function tablePage(type) {
  return (
    header(
      SCHEMAS[type].title,
      ["payments", "material_usage"].includes(type)
        ? "เพิ่มข้อมูลและค้นหาประวัติรายการ"
        : "จัดการข้อมูล เพิ่ม แก้ไข ลบ และค้นหา",
      `<button class="btn primary" data-add="${type}">${ico("plus")} เพิ่มข้อมูล</button>`,
    ) + tableSection(type)
  );
} // ตารางแต่ละหน้ากำหนดหัวตารางไว้ในไฟล์ HTML ของหน้านั้น
function tableSection(type) {
  const template = document.querySelector("#dataTableTemplate");
  if (!template) return "";
  const fragment = template.content.cloneNode(true);
  const fields = SCHEMAS[type].fields;
  const rows = db[type].filter(
    (r) =>
      Object.values(r).some((v) =>
        String(v).toLowerCase().includes(search.toLowerCase()),
      ) ||
      fields.some(
        (f) =>
          typeof f[2] === "string" &&
          db[f[2]] &&
          nameFor(f[2], r[f[0]]).toLowerCase().includes(search.toLowerCase()),
      ),
  );
  // Payments and Material Usage are append-only in the UI.
  // Existing records are shown without edit/delete actions.
  const readOnlyHistory = ["payments", "material_usage"].includes(type);
  fragment.querySelector("[data-table-body]").innerHTML =
    rows
      .map(
        (r) =>
          `<tr><td>#${r.id}</td>${fields.map((f) => `<td>${f[0] === "customer_name" ? esc(nameFor("customers", db.vehicles.find((v) => v.id === r.vehicle_id)?.customer_id)) : f[0].includes("status") ? badge(r[f[0]]) : f[2] === "members_optional" ? (r[f[0]] ? esc(nameFor("members", r[f[0]])) : "—") : typeof f[2] === "string" && db[f[2]] ? esc(nameFor(f[2], r[f[0]])) : ["price", "amount", "unit_cost", "unit_cost_snapshot", "price_snapshot"].includes(f[0]) ? money(r[f[0]]) : esc(r[f[0]])}</td>`).join("")}${readOnlyHistory ? "" : `<td><div class="actions"><button class="btn" data-edit="${type}:${r.id}">${ico("pencil")}</button><button class="btn danger" data-del="${type}:${r.id}">${ico("trash-2")}</button></div></td>`}</tr>`,
      )
      .join("") ||
    `<tr><td colspan="${fields.length + (readOnlyHistory ? 1 : 2)}" class="empty">ไม่พบข้อมูล</td></tr>`;
  const container = document.createElement("div");
  container.appendChild(fragment);
  const input = container.querySelector("#search");
  input.value = search;
  return container.innerHTML;
}
function reports() {
  const bookings = db.bookings.filter((b) => withinReport(b.start_time));
  const paid = db.payments.filter(
    (p) => p.payment_status === "ชำระแล้ว" && withinReport(p.payment_date),
  );
  const total = paid.reduce((a, p) => a + Number(p.amount || 0), 0);
  const counts = {};
  bookings.forEach((b) => {
    const k = datePart(b.start_time);
    counts[k] ??= { date: k, bookings: 0, revenue: 0 };
    counts[k].bookings++;
  });
  paid.forEach((p) => {
    const k = datePart(p.payment_date);
    counts[k] ??= { date: k, bookings: 0, revenue: 0 };
    counts[k].revenue += Number(p.amount || 0);
  });
  const rows = Object.values(counts).sort((a, b) =>
    b.date.localeCompare(a.date),
  );
  const packageRows = db.services
    .map((s) => {
      const matching = bookings.filter(
        (b) => b.package_id === s.id && b.booking_status !== "ยกเลิก",
      );
      const ids = new Set(matching.map((b) => Number(b.id)));
      const revenue = paid
        .filter((p) => ids.has(Number(p.booking_id)))
        .reduce((a, p) => a + Number(p.amount || 0), 0);
      return `<tr><td>${esc(s.package_name)}</td><td>${matching.length}</td><td>${money(revenue)}</td></tr>`;
    })
    .join("");
  return (
    header(
      "Reports",
      "รายงานตามวันที่จองและวันที่รับชำระเงินจริง",
      `<button class="btn primary" id="exportCSV">${ico("download")} ส่งออก CSV</button>`,
    ) +
    `<div class="panel" style="margin-bottom:20px"><div style="display:flex;gap:14px;flex-wrap:wrap;align-items:end"><label>ตั้งแต่วันที่<br><input id="reportFrom" type="date" value="${esc(reportFrom)}"></label><label>ถึงวันที่<br><input id="reportTo" type="date" value="${esc(reportTo)}"></label><button class="btn" id="clearReportDates">แสดงทุกวันที่</button></div><p class="subtle">จำนวนการจองอ้างอิงวันเริ่มบริการ ส่วนรายได้อ้างอิงวันที่ชำระเงิน (จึงอาจเป็นคนละวันกัน)</p></div>` +
    `<div class="cards"><div class="card"><div class="card-icon">${ico("wallet")}</div><div class="card-label">รายได้ที่รับชำระ</div><div class="card-value">${money(total)}</div></div><div class="card"><div class="card-icon">${ico("calendar-days")}</div><div class="card-label">จำนวนการจอง</div><div class="card-value">${bookings.length}</div></div><div class="card"><div class="card-icon">${ico("check-circle")}</div><div class="card-label">บริการเสร็จสิ้น</div><div class="card-value">${bookings.filter((b) => b.booking_status === "เสร็จสิ้น").length}</div></div><div class="card"><div class="card-icon">${ico("credit-card")}</div><div class="card-label">การชำระเงินสำเร็จ</div><div class="card-value">${paid.length}</div></div></div>` +
    `<div class="panel" style="margin-top:22px"><h2>สรุปรายวัน</h2><div class="table-wrap"><table><thead><tr><th>วันที่</th><th>จำนวนการจอง</th><th>รายได้ที่รับชำระ</th></tr></thead><tbody>${rows.map((x) => `<tr><td>${x.date}</td><td>${x.bookings}</td><td>${money(x.revenue)}</td></tr>`).join("") || '<tr><td colspan="3">ไม่มีข้อมูลในช่วงวันที่เลือก</td></tr>'}</tbody></table></div></div>` +
    `<div class="panel"><h2>สรุปตามแพ็กเกจ</h2><p class="subtle">รายได้เฉพาะรายการชำระเงินที่เกิดในช่วงวันที่เลือกและผูกกับการจองในช่วงเดียวกัน</p><div class="table-wrap"><table><thead><tr><th>แพ็กเกจ</th><th>จำนวนการจองที่ไม่ยกเลิก</th><th>รายได้ที่รับชำระ</th></tr></thead><tbody>${packageRows}</tbody></table></div></div>`
  );
}

function bind() {
  document
    .querySelectorAll("[data-go]")
    .forEach((e) => (e.onclick = () => navigate(e.dataset.go)));
  document
    .querySelectorAll("[data-add]")
    .forEach((e) => (e.onclick = () => openForm(e.dataset.add)));
  document.querySelectorAll("[data-edit]").forEach(
    (e) =>
      (e.onclick = () => {
        let [t, id] = e.dataset.edit.split(":");
        if (t === "material_usage") {
          alert(
            "รายการใช้วัสดุที่บันทึกแล้วไม่สามารถแก้ไขย้อนหลังได้ เพื่อรักษายอดสต็อก",
          );
          return;
        }
        openForm(t, Number(id));
      }),
  );
  document.querySelectorAll("[data-del]").forEach(
    (e) =>
      (e.onclick = () => {
        let [t, id] = e.dataset.del.split(":");
        remove(t, Number(id));
      }),
  );
  let s = $("#search");
  if (s)
    s.oninput = (e) => {
      search = e.target.value;
      // Update table rows only: preserve the search input, caret and focus.
      const temp = document.createElement("div");
      temp.innerHTML = tableSection(page);
      const nextBody = temp.querySelector("[data-table-body]");
      const currentBody = document.querySelector("#content [data-table-body]");
      if (nextBody && currentBody) {
        currentBody.innerHTML = nextBody.innerHTML;
        currentBody.querySelectorAll("[data-edit]").forEach(
          (el) =>
            (el.onclick = () => {
              const [t, id] = el.dataset.edit.split(":");
              if (t === "material_usage") {
                alert(
                  "รายการใช้วัสดุที่บันทึกแล้วไม่สามารถแก้ไขย้อนหลังได้ เพื่อรักษายอดสต็อก",
                );
                return;
              }
              openForm(t, Number(id));
            }),
        );
        currentBody.querySelectorAll("[data-del]").forEach(
          (el) =>
            (el.onclick = () => {
              const [t, id] = el.dataset.del.split(":");
              remove(t, Number(id));
            }),
        );
        icons();
      }
    };
  let csv = $("#exportCSV");
  if (csv) csv.onclick = exportCSV;
  const from = $("#reportFrom"),
    to = $("#reportTo"),
    clear = $("#clearReportDates");
  if (from)
    from.onchange = () => {
      reportFrom = from.value;
      render();
    };
  if (to)
    to.onchange = () => {
      reportTo = to.value;
      render();
    };
  if (clear)
    clear.onclick = () => {
      reportFrom = "";
      reportTo = "";
      render();
    };
}
function optionsFor(type) {
  return db[type].map((x) => [
    x.id,
    type === "vehicles"
      ? `${nameFor("vehicles", x.id)} · เจ้าของ: ${nameFor("customers", x.customer_id)}`
      : nameFor(type, x.id),
  ]);
}
function bookingAmount(id) {
  const b = db.bookings.find((x) => x.id === Number(id));
  return Number(
    b?.price_snapshot ??
      db.services.find((x) => x.id === b?.package_id)?.price ??
      0,
  );
}
function fieldHTML(f, value) {
  let [key, label, kind] = f,
    opts = Array.isArray(kind)
      ? kind.map((x) => [x, x])
      : kind === "members_optional"
        ? optionsFor("members")
        : typeof kind === "string" && db[kind]
          ? optionsFor(kind)
          : null;
  if (kind === "derived_customer" || kind === "derived_member")
    return kind === "derived_member"
      ? `<div class="field" id="bookingMemberInfo" style="grid-column:1/-1;padding:12px;border:1px solid #d9e4f0;border-radius:10px;background:#f5f9ff"><strong>ใช้สิทธิ์สมาชิกกับการจองนี้หรือไม่?</strong><div style="margin:8px 0"><label><input type="radio" name="member_choice" value="none" checked> ลูกค้าทั่วไป / ไม่ใช้สมาชิก</label>　<label><input type="radio" name="member_choice" value="member"> ใช้สมาชิก</label></div><label id="memberCardWrap" style="display:none">เลือกบัตรสมาชิก <select name="member_card_id" id="bookingMemberCard"><option value="">-- เลือกบัตร --</option></select></label><div id="memberCardMessage" style="margin-top:6px"></div><small>เลือกบัตรเพื่อผูก Member ID ลง SQL Server โดยยังไม่หักเครดิต (หักเมื่อชำระด้วยเครดิตสมาชิก)</small></div>`
      : "";
  if (key === "booking_id" && formType === "material_usage") {
    opts = db.bookings
      .filter((b) => b.booking_status === "กำลังล้าง")
      .map((b) => [
        b.id,
        `#B${String(b.id).padStart(3, "0")} · ${nameFor("customers", bookingCustomer(b))} · ${nameFor("services", b.package_id)}`,
      ]);
  }
  if (key === "remaining_credit")
    return `<label class="field">${label}<input name="${key}" type="number" value="${esc(value ?? 0)}" min="0" step="1"></label>`;
  if (key === "amount")
    return `<label class="field">${label}<input name="${key}" type="number" value="${esc(value ?? 0)}" min="0" step="0.01"></label>`;
  if (
    key === "customer_id" &&
    (formType === "vehicles" || formType === "members")
  )
    return `<label class="field">${label}<input type="search" class="customer-search" placeholder="พิมพ์ชื่อหรือนามสกุลเพื่อค้นหา" autocomplete="off" value="${esc(value ? nameFor("customers", value) : "")}" required><input type="hidden" name="customer_id" value="${esc(value ?? "")}"><div class="customer-results"></div></label>`;
  if (key === "staff_id" && formType === "bookings") opts = [];
  if (key === "booking_id" && formType === "payments") {
    const available = db.bookings.filter(
      (b) =>
        b.booking_status === "เสร็จสิ้น" &&
        (!db.payments.some((x) => x.booking_id === b.id) ||
          b.id === Number(value)),
    );
    opts = available.map((b) => [
      b.id,
      `#B${String(b.id).padStart(3, "0")} · ${nameFor("customers", bookingCustomer(b))} · ${nameFor("services", b.package_id)} · ${money(bookingAmount(b.id))}`,
    ]);
  }
  let content = opts
    ? `<select name="${key}" ${kind === "members_optional" ? "" : "required"}><option value="">-- เลือก --</option>${opts.map(([v, t]) => `<option value="${esc(v)}" ${String(value ?? "") === String(v) ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>`
    : `<input name="${key}" type="${kind === "number" ? "number" : kind === "date" ? "date" : kind === "time" ? "time" : kind === "datetime-local" ? "datetime-local" : "text"}" ${kind === "number" ? 'min="0" step="any"' : ""} value="${esc(value ?? (kind === "date" ? TODAY : kind === "datetime-local" ? TODAY + "T10:00" : ""))}" required>`;
  return `<label class="field">${label}${content}</label>`;
}
function openForm(type, id = null) {
  formType = type;
  editId = id;
  let record = id ? db[type].find((x) => x.id === id) : {};
  $("#modalTitle").textContent =
    (id ? "แก้ไข" : "เพิ่ม") + " " + SCHEMAS[type].title;
  if (type === "bookings" && id) {
    const current = record.booking_status;
    const choices =
      current === "รอให้บริการ"
        ? ["รอให้บริการ", "กำลังล้าง", "ยกเลิก"]
        : current === "กำลังล้าง"
          ? ["กำลังล้าง", "เสร็จสิ้น"]
          : [current];
    $("#formFields").innerHTML =
      `<div class="field" style="grid-column:1/-1"><strong>การจอง #B${String(id).padStart(3, "0")}</strong><p>สถานะปัจจุบัน: ${esc(current)}</p><label>เปลี่ยนสถานะ <select name="booking_status" required>${choices.map((x) => `<option value="${esc(x)}" ${x === current ? "selected" : ""}>${esc(x)}</option>`).join("")}</select></label><p class="subtle">การเปลี่ยนสถานะจะบันทึกลง SQL Server · เมื่อเสร็จสิ้นแล้วให้ไปบันทึกการชำระเงินแยกที่หน้า Payments</p></div>`;
  } else {
    $("#formFields").innerHTML = SCHEMAS[type].fields
      .map((f) => fieldHTML(f, record[f[0]]))
      .join("");
  }
  $("#modal").classList.remove("hidden");
  setupForm(type, record);
  icons();
}
// ระบบค้นหาลูกค้าจากชื่อ และคำนวณราคา/เครดิตอัตโนมัติ
function setupForm(type, record) {
  const form = $("#editorForm");
  const customerSearch = form.querySelector(".customer-search");
  if (customerSearch) {
    const hidden = form.querySelector('input[name="customer_id"]'),
      results = form.querySelector(".customer-results");
    const show = () => {
      const q = customerSearch.value.trim().toLowerCase();
      hidden.value = "";
      results.innerHTML =
        db.customers
          .filter(
            (c) =>
              !q ||
              `${c.first_name} ${c.last_name} ${c.phone}`
                .toLowerCase()
                .includes(q),
          )
          .slice(0, 12)
          .map(
            (c) =>
              `<button type="button" class="customer-choice" data-id="${c.id}">${esc(c.first_name + " " + c.last_name)} · ${esc(c.phone)}</button>`,
          )
          .join("") || '<span class="subtle">ไม่พบลูกค้า</span>';
      results.hidden = false;
    };
    customerSearch.addEventListener("input", show);
    customerSearch.addEventListener("focus", show);
    results.addEventListener("click", (e) => {
      const b = e.target.closest("[data-id]");
      if (!b) return;
      hidden.value = b.dataset.id;
      customerSearch.value = nameFor("customers", b.dataset.id);
      results.hidden = true;
    });
    if (record.customer_id) hidden.value = record.customer_id;
  }
  if (type === "bookings") {
    const vehicleSelect = form.elements.vehicle_id;
    const memberInfo = document.getElementById("bookingMemberInfo");
    const updateMember = () => {
      if (!memberInfo) return;
      const vehicle = db.vehicles.find(
        (v) => Number(v.id) === Number(vehicleSelect.value),
      );
      const msg = document.getElementById("memberCardMessage");
      const select = document.getElementById("bookingMemberCard");
      const useMember =
        form.querySelector('input[name="member_choice"]:checked')?.value ===
        "member";
      const wrap = document.getElementById("memberCardWrap");
      wrap.style.display = useMember ? "block" : "none";
      if (!vehicle) {
        msg.textContent = "กรุณาเลือกรถยนต์ก่อน";
        select.innerHTML = '<option value="">-- เลือกบัตร --</option>';
        return;
      }
      const owner = db.customers.find(
        (c) => Number(c.id) === Number(vehicle.customer_id),
      );
      const cards = db.members.filter(
        (m) => Number(m.customer_id) === Number(vehicle.customer_id),
      );
      const active = cards.filter(
        (m) =>
          m.status === "ใช้งาน" &&
          String(m.expiry_date).slice(0, 10) >=
            new Date().toISOString().slice(0, 10),
      );
      const previous =
        select.value ||
        (Number(record.vehicle_id) === Number(vehicle.id)
          ? record.member_card_id
          : null);
      select.innerHTML =
        '<option value="">-- เลือกบัตร --</option>' +
        active
          .map(
            (m) =>
              `<option value="${esc(m.id)}" ${Number(previous) === Number(m.id) ? "selected" : ""}>${esc(m.card_number)} (ID ${esc(m.id)}) · เครดิต ${esc(m.remaining_credit)} ครั้ง</option>`,
          )
          .join("");
      msg.textContent = `${owner ? owner.first_name + " " + owner.last_name : "ไม่พบเจ้าของรถ"} · ${active.length ? "มีบัตรสมาชิก " + active.length + " ใบ" : "ไม่มีบัตรสมาชิกที่ใช้งานได้"}`;
    };
    vehicleSelect.addEventListener("change", updateMember);
    form
      .querySelectorAll('input[name="member_choice"]')
      .forEach((r) => r.addEventListener("change", updateMember));
    if (record.member_card_id)
      form.querySelector(
        'input[name="member_choice"][value="member"]',
      ).checked = true;
    updateMember();
    const start = form.elements.start_time;
    const packageSelect = form.elements.package_id;
    const staffSelect = form.elements.staff_id;
    const updateStaff = () => {
      const previous = staffSelect.value || String(record.staff_id ?? "");
      const pkg = db.services.find((p) => p.id === Number(packageSelect.value));
      const beginning = start.value ? new Date(start.value) : null;
      const end =
        beginning && pkg
          ? new Date(beginning.getTime() + Number(pkg.duration_minutes) * 60000)
          : null;
      const valid =
        beginning &&
        !Number.isNaN(beginning.getTime()) &&
        end &&
        !Number.isNaN(end.getTime()) &&
        end > beginning;
      const available = valid
        ? db.staff.filter((person) => {
            if (person.status !== "พร้อมทำงาน") return false;
            return !db.bookings.some(
              (b) =>
                b.staff_id === person.id &&
                b.id !== editId &&
                !["ยกเลิก", "เสร็จสิ้น"].includes(b.booking_status) &&
                new Date(b.start_time) < end &&
                new Date(b.end_time) > beginning,
            );
          })
        : [];
      staffSelect.innerHTML =
        '<option value="">' +
        (valid
          ? "-- เลือกพนักงานที่ว่าง --"
          : "-- เลือกแพ็กเกจและวันเวลาก่อน --") +
        "</option>" +
        available
          .map(
            (person) =>
              `<option value="${person.id}">${esc(person.first_name + " " + person.last_name)}</option>`,
          )
          .join("");
      if (available.some((person) => String(person.id) === previous))
        staffSelect.value = previous;
      if (valid && !available.length)
        staffSelect.options[0].textContent = "ไม่มีพนักงานว่างในช่วงเวลานี้";
    };
    start.addEventListener("change", updateStaff);
    start.addEventListener("input", updateStaff);
    packageSelect.addEventListener("change", updateStaff);
    updateStaff();
  }
  if (type === "material_usage") {
    const b = form.elements.booking_id;
    if (
      b &&
      !editId &&
      !db.bookings.some((x) => x.booking_status === "กำลังล้าง")
    ) {
      b.closest("label")?.insertAdjacentHTML(
        "afterend",
        `<p class="subtle" style="grid-column:1/-1">ยังไม่มีรายการจองที่กำลังล้าง กรุณาไปหน้า Bookings และเปลี่ยนสถานะเป็น “กำลังล้าง” ก่อนบันทึกการใช้วัสดุ</p>`,
      );
    }
  }
  if (type === "payments") {
    const booking = form.elements.booking_id,
      amount = form.elements.amount;
    const update = () => {
      if (!editId) amount.value = bookingAmount(booking.value);
    };
    booking.addEventListener("change", update);
    if (!editId) update();
  }
}
function closeForm() {
  $("#modal").classList.add("hidden");
  editId = null;
}
function minutes(s) {
  let [h, m] = s.split(":").map(Number);
  return h * 60 + m;
}
function timeStr(n) {
  return `${String(Math.floor(n / 60) % 24).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
}
function overlaps(a, b) {
  return (
    minutes(a.start_time) < minutes(b.end_time) &&
    minutes(b.start_time) < minutes(a.end_time)
  );
}
function bookingCustomer(b) {
  return db.vehicles.find((v) => v.id === b.vehicle_id)?.customer_id;
}
function dateOverlaps(a, b) {
  return (
    new Date(a.start_time) < new Date(b.end_time) &&
    new Date(b.start_time) < new Date(a.end_time)
  );
}
function validate(type, r) {
  if (type === "customers" && !/^0[0-9]{8,9}$/.test(r.phone))
    throw Error("เบอร์โทรต้องมี 9–10 หลักและขึ้นต้นด้วย 0");
  if (type === "vehicles") {
    if (!db.customers.some((x) => x.id === r.customer_id))
      throw Error("กรุณาเลือกลูกค้า");
    if (
      db.vehicles.some(
        (x) =>
          x.id !== r.id &&
          x.license_plate.trim().toLowerCase() ===
            r.license_plate.trim().toLowerCase(),
      )
    )
      throw Error("ทะเบียนรถซ้ำ");
  }
  if (type === "services" && (r.price < 0 || r.duration_minutes <= 0))
    throw Error("ราคาและระยะเวลาต้องถูกต้อง");
  if (type === "members") {
    if (
      db.members.some((x) => x.id !== r.id && x.card_number === r.card_number)
    )
      throw Error("เลขบัตรสมาชิกซ้ำ");
    if (r.remaining_credit < 0 || !Number.isInteger(r.remaining_credit))
      throw Error("เครดิตต้องเป็นจำนวนครั้งเต็มและไม่ติดลบ");
  }
  if (type === "bookings") {
    const v = db.vehicles.find((x) => x.id === r.vehicle_id),
      pkg = db.services.find((x) => x.id === r.package_id),
      bay = db.bays.find((x) => x.id === r.bay_id),
      staff = db.staff.find((x) => x.id === r.staff_id);
    if (!v || !pkg || !bay || !staff) throw Error("กรุณาเลือกข้อมูลให้ครบ");
    if (
      pkg.status !== "เปิดใช้งาน" ||
      bay.status === "ปิดปรับปรุง" ||
      staff.status !== "พร้อมทำงาน"
    )
      throw Error("แพ็กเกจ ช่องล้าง หรือพนักงานไม่พร้อมใช้งาน");
    const start = new Date(r.start_time),
      end = new Date(start.getTime() + pkg.duration_minutes * 60000);
    if (
      Number.isNaN(start.getTime()) ||
      end.toDateString() !== start.toDateString()
    )
      throw Error("เวลาบริการต้องอยู่ภายในวันเดียวกัน");
    r.end_time =
      r.start_time.slice(0, 10) +
      "T" +
      String(end.getHours()).padStart(2, "0") +
      ":" +
      String(end.getMinutes()).padStart(2, "0");
    const old = db.bookings.find((x) => x.id === r.id);
    r.price_snapshot = old?.price_snapshot ?? pkg.price;
    r.created_at = old?.created_at ?? new Date().toISOString().slice(0, 16);
    if (
      r.booking_status !== "ยกเลิก" &&
      db.bookings.some(
        (x) =>
          x.id !== r.id &&
          !["ยกเลิก", "เสร็จสิ้น"].includes(x.booking_status) &&
          dateOverlaps(x, r) &&
          (x.bay_id === r.bay_id || x.staff_id === r.staff_id),
      )
    )
      throw Error("ช่องล้างหรือพนักงานมีการจองซ้ำในช่วงเวลานี้");
  }
  if (type === "payments") {
    const b = db.bookings.find((x) => x.id === r.booking_id);
    if (!b || b.booking_status === "ยกเลิก") throw Error("รายการจองไม่ถูกต้อง");
    if (db.payments.some((x) => x.id !== r.id && x.booking_id === r.booking_id))
      throw Error("รายการจองนี้บันทึกการชำระเงินแล้ว");
    r.amount = bookingAmount(r.booking_id);
    r.payment_status = "ชำระแล้ว"; // เก็บภายในเพื่อให้รายงานเดิมทำงานได้ โดยไม่แสดงสถานะใน UI
    if (r.payment_method === "เครดิตสมาชิก") {
      const member = db.members.find(
        (m) =>
          m.customer_id === bookingCustomer(b) &&
          m.status === "ใช้งาน" &&
          m.expiry_date >= r.payment_date.slice(0, 10) &&
          m.remaining_credit > 0,
      );
      if (
        !member &&
        !(
          db.payments.find((x) => x.id === r.id)?.payment_method ===
          "เครดิตสมาชิก"
        )
      )
        throw Error("ลูกค้ารายนี้ไม่มีเครดิตสมาชิกเพียงพอ");
      r.credit_member_id =
        member?.id ?? db.payments.find((x) => x.id === r.id)?.credit_member_id;
    }
  }
  if (type === "materials") {
    if (r.stock_qty < 0 || r.unit_cost < 0)
      throw Error("จำนวนคงเหลือและต้นทุนต้องไม่ติดลบ");
    if (
      db.materials.some(
        (x) =>
          x.id !== r.id &&
          x.material_name.trim().toLowerCase() ===
            r.material_name.trim().toLowerCase(),
      )
    )
      throw Error("ชื่อวัสดุซ้ำ");
  }
  if (type === "material_usage") {
    const m = db.materials.find((x) => x.id === r.material_id);
    if (!m || !db.bookings.some((x) => x.id === r.booking_id))
      throw Error("กรุณาเลือกวัสดุและการจอง");
    if (r.quantity_used <= 0) throw Error("จำนวนที่ใช้ต้องมากกว่า 0");
    const old = db.material_usage.find((x) => x.id === r.id);
    const available =
      m.stock_qty +
      (old?.material_id === r.material_id ? old.quantity_used : 0);
    if (available < r.quantity_used) throw Error("วัสดุในสต็อกไม่เพียงพอ");
    r.unit_cost_snapshot =
      old?.material_id === r.material_id ? old.unit_cost_snapshot : m.unit_cost;
  }
}
function applyEffects(type, r, old) {
  if (type === "material_usage") {
    if (old)
      db.materials.find((x) => x.id === old.material_id).stock_qty +=
        old.quantity_used;
    db.materials.find((x) => x.id === r.material_id).stock_qty -=
      r.quantity_used;
  }
  if (type === "payments") {
    if (old?.payment_method === "เครดิตสมาชิก") {
      const prev = db.members.find((m) => m.id === old.credit_member_id);
      if (prev) prev.remaining_credit++;
    }
    if (r.payment_method === "เครดิตสมาชิก") {
      const member = db.members.find((m) => m.id === r.credit_member_id);
      if (member) member.remaining_credit--;
    }
  }
}
function remove(type, id) {
  const refs = {
    customers: [
      ["vehicles", "customer_id"],
      ["members", "customer_id"],
    ],
    vehicles: [["bookings", "vehicle_id"]],
    services: [["bookings", "package_id"]],
    bays: [["bookings", "bay_id"]],
    staff: [["bookings", "staff_id"]],
    members: [["bookings", "member_card_id"]],
    bookings: [
      ["payments", "booking_id"],
      ["material_usage", "booking_id"],
    ],
    materials: [["material_usage", "material_id"]],
  };
  if ((refs[type] || []).some(([t, k]) => db[t].some((x) => x[k] === id))) {
    alert("ลบไม่ได้: มีข้อมูลอื่นอ้างอิงรายการนี้อยู่");
    return;
  }
  if (!confirm("ยืนยันลบข้อมูลนี้?")) return;
  apiDelete(type, id);
  return;
  const old = db[type].find((x) => x.id === id);
  if (type === "payments" && old?.payment_method === "เครดิตสมาชิก") {
    const m = db.members.find((x) => x.id === old.credit_member_id);
    if (m) m.remaining_credit++;
  }
  if (type === "material_usage") {
    const m = db.materials.find((x) => x.id === old.material_id);
    if (m) m.stock_qty += old.quantity_used;
  }
  db[type] = db[type].filter((x) => x.id !== id);
  save();
  render();
  notify("ลบข้อมูลแล้ว");
}
function exportCSV() {
  let rows = [["วันที่", "จำนวนการจอง", "รายได้"]];
  let dates = [
    ...new Set([
      ...db.bookings
        .filter((x) => withinReport(x.start_time))
        .map((x) => datePart(x.start_time)),
      ...db.payments
        .filter(
          (x) =>
            x.payment_status === "ชำระแล้ว" && withinReport(x.payment_date),
        )
        .map((x) => datePart(x.payment_date)),
    ]),
  ].sort();
  dates.forEach((d) =>
    rows.push([
      d,
      db.bookings.filter((x) => datePart(x.start_time) === d).length,
      db.payments
        .filter(
          (x) =>
            datePart(x.payment_date) === d && x.payment_status === "ชำระแล้ว",
        )
        .reduce((a, x) => a + Number(x.amount), 0),
    ]),
  );
  let csv = "\ufeff" + rows.map((x) => x.join(",")).join("\r\n");
  let a = document.createElement("a");
  a.href = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  a.download = "washy-report.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}
$("#editorForm").onsubmit = async (e) => {
  e.preventDefault();
  let type = formType,
    raw = Object.fromEntries(new FormData(e.target)),
    r = { ...raw, id: editId ?? Math.max(0, ...db[type].map((x) => x.id)) + 1 };
  for (let f of SCHEMAS[type].fields) {
    if (
      f[2] === "number" ||
      f[2] === "members_optional" ||
      (typeof f[2] === "string" && db[f[2]])
    )
      r[f[0]] = r[f[0]] === "" ? null : Number(r[f[0]]);
  }

  if (type === "bookings" && editId) {
    const old = db.bookings.find((x) => x.id === editId);
    if (r.booking_status === old.booking_status) {
      closeForm();
      return;
    }
    await apiWrite("bookings", { booking_status: r.booking_status }, editId);
    return;
  }
  if (type === "bookings") {
    delete r.customer_name;
    if (r.member_choice === "member" && !r.member_card_id) {
      alert("กรุณาเลือกบัตรสมาชิก หรือเลือกลูกค้าทั่วไป");
      return;
    }
    r.member_card_id =
      r.member_choice === "member" ? Number(r.member_card_id) : null;
    delete r.member_choice;
  }
  try {
    let old = editId ? db[type].find((x) => x.id === editId) : null;
    await apiWrite(type, r, editId);
    return;
    applyEffects(type, r, old);
    if (editId) {
      let idx = db[type].findIndex((x) => x.id === editId);
      db[type][idx] = r;
    } else db[type].push(r);
    save();
    closeForm();
    render();
    notify("บันทึกข้อมูลสำเร็จ");
  } catch (err) {
    alert(err.message);
  }
};
$("#closeModal").onclick = $("#cancelModal").onclick = closeForm;
$("#modal").onclick = (e) => {
  if (e.target.id === "modal") closeForm();
};
$("#toggle").onclick = () => {
  if (innerWidth < 721) document.body.classList.toggle("mobile-open");
  else document.body.classList.toggle("collapsed");
};
async function request(url, opts = {}) {
  const response = await fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json" },
  });
  const data = await response.json();
  if (!response.ok) throw Error(data.error || "API error");
  return data;
}
async function loadFromServer() {
  try {
    db = await request("/api/bootstrap?ts=" + Date.now());
    render();
  } catch (e) {
    document.querySelector("#content").innerHTML =
      '<div class="panel">เชื่อมต่อฐานข้อมูลไม่สำเร็จ: ' +
      esc(e.message) +
      "</div>";
    console.error(e);
  }
}
async function apiWrite(type, row, id) {
  try {
    await request("/api/" + type + (id ? "/" + id : ""), {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(row),
    });
    closeForm();
    await loadFromServer();
    window.addEventListener("focus", () => loadFromServer());
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) loadFromServer();
    });
    notify("บันทึกข้อมูลสำเร็จ");
  } catch (e) {
    alert(e.message);
  }
}
async function apiDelete(type, id) {
  try {
    await request("/api/" + type + "/" + id, { method: "DELETE" });
    await loadFromServer();
    window.addEventListener("focus", () => loadFromServer());
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) loadFromServer();
    });
    notify("ลบข้อมูลสำเร็จ");
  } catch (e) {
    alert(e.message);
  }
}
loadFromServer();
window.addEventListener("focus", () => loadFromServer());
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) loadFromServer();
});
