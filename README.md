# WASHY — Vercel + Neon

ระบบจัดการร้านล้างรถ เวอร์ชันออนไลน์จากไฟล์ WASHY_Submit_Project

- เว็บและ API: Node.js 24 / Express บน Vercel
- ฐานข้อมูล: PostgreSQL บน Neon (ไม่ต้องเปิด SQL Server หรือคอมพิวเตอร์ที่บ้าน)
- หน้าเว็บเดิมอยู่ใน `public/` และเรียก API ในโดเมนเดียวกัน
- รักษากฎหลัก: เวลาทำการ 08:00–18:00, ห้ามจองรถ/ช่าง/ช่องซ้อน, หักเครดิตครั้งเดียวเมื่อเริ่มล้าง, ป้องกันสต็อกติดลบ และไม่ลบประวัติธุรกรรม
- มีรหัสผ่านเข้าเว็บผ่าน browser HTTP Basic Authentication; ต้องตั้งค่าก่อนใช้บน Vercel

**เริ่ม Deploy ตาม [DEPLOY_TH.md](DEPLOY_TH.md)**

## รันบนเครื่องพัฒนา

ต้องมี Node.js 24 และฐานข้อมูล PostgreSQL/Neon สำหรับรันแอปจริง

```sh
npm ci
cp .env.example .env
# ใส่ DATABASE_URL, APP_USERNAME และ APP_PASSWORD ใน .env ด้วยตัวเอง
npm run db:migrate
# ถ้าต้องการข้อมูลตัวอย่างในฐานข้อมูลว่างเท่านั้น:
npm run db:seed
npm start
```

ถ้ารัน `setup-neon.sql` ผ่าน SQL Editor แล้ว ไม่ต้อง seed ซ้ำ คำสั่ง `db:migrate` สามารถรันซ้ำและตรวจ checksum ได้
สคริปต์ seed จะปฏิเสธฐานข้อมูลที่มีข้อมูลอยู่แล้ว และไม่ลบข้อมูลเดิม
การเพิ่ม migration ครั้งต่อไปต้องสร้างไฟล์หมายเลขใหม่ ห้ามแก้ไฟล์ migration ที่ apply แล้ว

## ทดสอบและ build

```sh
npm test
npm run build
```

ทดสอบ HTTP API และ SQL จริงด้วย PostgreSQL ใน WASM (PGlite) จึงไม่ต้องใช้ฐานข้อมูล Neon จริงในการทดสอบ
ครอบคลุม migration ที่รันซ้ำได้, การปิดการเข้าถึงเมื่อยังไม่ตั้งรหัสผ่าน, CRUD ข้อมูลหลัก, จองคิว/ยกเลิก/เริ่มล้าง,
เครดิต, วัสดุ, ชำระเงิน, รายงาน, รับรถแบบ transaction และข้อมูลเดิมครบ 630 การจอง
ยังไม่ใช่การทดสอบเครือข่าย/TLS ของ Neon หรือการ Deploy บน Vercel จริง

`npm run build` เตรียม output ว่างสำหรับ Vercel โดยไฟล์เว็บทั้งหมดส่งผ่าน Express เพื่อให้ระบบรหัสผ่านป้องกันทุกหน้า
`api/index.js` export Express app สำหรับ serverless; จะไม่เปิดพอร์ตเมื่อ Vercel import

## ฐานข้อมูล

- `database/postgres/001_schema.sql`: ตารางและ constraints
- `database/postgres/002_logic.sql`: functions, triggers และ view รายงาน
- `database/postgres/seed.sql`: ข้อมูลตัวอย่างที่แปลงจากต้นฉบับ
- `database/postgres/setup-neon.sql`: ไฟล์รวมสำหรับรันครั้งแรกบน Neon SQL Editor
- `npm run db:bundle`: สร้างไฟล์รวมใหม่หลังแก้ migration ก่อนนำไปติดตั้งครั้งแรก
- `database/sqlserver/`: ต้นฉบับ SQL Server และคู่มือเก่า ใช้อ้างอิงเท่านั้น ห้ามนำไปรันบน Neon

วันเวลาให้บริการเป็นเวลาไทย (Asia/Bangkok) แบบไม่มี timezone เพื่อให้ตรงกับช่อง datetime-local บนหน้าเว็บ
ข้อมูลเก็บในฐานข้อมูลภายนอก ไม่เก็บใน filesystem หรือหน่วยความจำของ Vercel

## ข้อจำกัด

บัญชีเข้าเว็บเป็นบัญชีพนักงานร่วมหนึ่งบัญชี ยังไม่มีสิทธิ์รายบุคคลหรือระบบสมัครสมาชิกออนไลน์
ฐานข้อมูลตัวอย่างมีข้อมูลในช่วงปี 2026 ไม่ใช่รายการขายสด
แพลนฟรีมีโควตาและอาจมี cold start; ตรวจเงื่อนไข/ราคา Vercel และ Neon ก่อนใช้กับร้านจริง
ไฟล์ชุดนี้เตรียมสำหรับ Deploy และผ่านทดสอบในสภาพแวดล้อมพัฒนา แต่ยังไม่ได้เผยแพร่เว็บจริง
