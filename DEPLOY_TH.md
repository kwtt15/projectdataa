# นำ WASHY ขึ้นออนไลน์ด้วย Vercel + Neon

เมื่อทำครบ เว็บและฐานข้อมูลจะทำงานบนคลาวด์ ปิดคอมพิวเตอร์ส่วนตัวได้
ใช้บัญชีของคุณเองในการสร้างบริการ ไม่ต้องส่งรหัสผ่าน, token หรือ connection string ในแชต
ชื่อเมนูอาจต่างกันเล็กน้อยตามเวอร์ชันของผู้ให้บริการ

## 1. สร้างฐานข้อมูล Neon

1. เปิด https://console.neon.tech แล้วสมัคร/เข้าสู่ระบบ
2. สร้าง Project ชื่อ `washy` เลือก region ใกล้ผู้ใช้ เช่น Singapore หากมีให้เลือก ใช้ database `neondb` ได้
3. เปิด **SQL Editor** และตรวจว่าเลือก database ของโปรเจกต์ใหม่นี้
4. เปิดไฟล์ `database/postgres/setup-neon.sql` ใน ZIP ด้วยโปรแกรมอ่านข้อความ คัดลอกเนื้อหาทั้งหมดไปวางใน SQL Editor แล้ว Run **ครั้งเดียว บนฐานข้อมูลใหม่ที่ว่างเท่านั้น**
   ไฟล์นี้สร้างตาราง กฎธุรกิจ รายงาน และข้อมูลตัวอย่างเดิมทั้งหมดแล้ว ไม่ต้องรันไฟล์ SQL Server หรือ seed ซ้ำ
5. ตรวจผลด้วย SQL นี้:

```sql
SELECT COUNT(*) AS bookings FROM bookings; -- ควรได้ 630
SELECT COUNT(*) AS migrations FROM schema_migrations; -- ควรได้ 2
SELECT booking_status, COUNT(*) FROM bookings GROUP BY booking_status;
```

หากต้องการเริ่มร้านด้วยฐานข้อมูลว่างแทนข้อมูลตัวอย่าง ให้ใช้ `npm run db:migrate` จากเครื่องพัฒนาแทนไฟล์รวม
อย่าทดลองลบข้อมูลบนฐานข้อมูลที่ใช้งานจริงเพื่อให้ seed ผ่าน

## 2. รับ connection string ของ Neon

1. กด **Connect** ในโปรเจกต์ Neon
2. เลือก database/role เดียวกับที่รัน SQL และเปิด **Connection pooling**
3. คัดลอก connection string เต็ม เก็บไว้สำหรับช่อง `DATABASE_URL` ของ Vercel
   รูปแบบประมาณ `postgresql://USER:PASSWORD@HOST-pooler.neon.tech/neondb?sslmode=verify-full`
4. ใช้ TLS พร้อมตรวจ certificate เสมอ ใช้ `sslmode=verify-full` โดยเก็บ query parameters อื่นของ Neon ไว้
   ไม่ตั้ง `rejectUnauthorized=false` และไม่ใส่ `sslmode=disable`

connection string มีรหัสผ่าน ห้ามใส่ใน GitHub, หน้าเว็บ JavaScript, รูป screenshot หรือแชต
หากเผลอเผยแพร่ ให้เปลี่ยนรหัสผ่าน role ใน Neon แล้วอัปเดต Vercel

## 3. อัปโหลดโค้ดเข้า GitHub

ใช้ repository `kwtt15/projectdataa` ที่เตรียมไว้ หรือ repository ใหม่ในบัญชีของคุณ

1. แตก ZIP `WASHY_Vercel_Neon.zip`
2. อัปโหลด **ไฟล์และโฟลเดอร์ข้างใน** ขึ้น root ของ repository แล้ว commit ลง branch `main`
3. หน้า root ต้องเห็น `package.json`, `package-lock.json`, `vercel.json`, `api/`, `server/`, `public/`
   อย่าอัปโหลด ZIP อย่างเดียว และอย่าให้ไฟล์ไปซ้อนอยู่ในโฟลเดอร์ WASHY อีกชั้น
4. เก็บ `.gitignore` และ `.vercelignore` ด้วย ถ้า file picker ซ่อนไฟล์จุด ให้เปิดแสดง hidden files
5. ไม่อัปโหลด `node_modules`, `.env`, `.vercel` หรือค่าลับใด ๆ

ถ้าใช้ Git ผ่านเครื่องพัฒนา คัดลอกชุดไฟล์เข้า checkout ของคุณ แล้ว commit/push ตามปกติ
โค้ดชุดนี้ยังไม่ได้ push ไป GitHub ให้โดยอัตโนมัติ

## 4. สร้าง Project ใน Vercel

1. เปิด https://vercel.com/new แล้วเข้าสู่ระบบด้วย GitHub
2. Import repository `projectdataa` และให้สิทธิ์ Vercel อ่าน repository นี้
3. ตั้ง **Root Directory** เป็น root ที่มี `package.json`
4. ใช้ **Framework Preset: Other** และ **Node.js: 24.x**
5. ตั้ง **Install Command** เป็น `npm ci` และ **Build Command** เป็น `npm run build`
6. ใช้ **Output Directory** `vercel-static` ตาม `vercel.json` ไม่ใช่ `public`
   อย่าตั้ง `public` เป็น output เพราะหน้าเว็บต้องผ่านรหัสเข้าใช้งานใน Express
7. เพิ่ม **Environment Variables** ก่อนกด Deploy:

| ชื่อตัวแปร | ค่า |
| --- | --- |
| `DATABASE_URL` | connection string แบบ pooled จาก Neon พร้อม TLS |
| `APP_USERNAME` | ชื่อเข้าเว็บ เช่น `admin` (ไม่ใช้เครื่องหมาย `:`) |
| `APP_PASSWORD` | รหัสผ่านใหม่ที่ยาวและเดายาก ไม่ใช้รหัสผ่านตัวอย่าง |

เลือก scope **Production** และ **Preview** หากต้องการทดสอบ preview ด้วย
ใส่ค่าตามจริง ไม่ใส่เครื่องหมาย quote ครอบ ใช้ตัวแปรฝั่ง server ปกติ ไม่เติม `NEXT_PUBLIC_` หรือ `VITE_`
`PORT` และ `DB_SERVER`/`DB_USER`/`DB_PASSWORD` ของ SQL Server เดิมไม่ต้องตั้ง

8. กด **Deploy** เมื่อเสร็จจะได้ URL ลักษณะ `https://ชื่อโปรเจกต์.vercel.app`
9. เปิด URL เบราว์เซอร์จะถามชื่อ/รหัสผ่าน ใช้ `APP_USERNAME` และ `APP_PASSWORD` ที่ตั้งไว้

หากแก้ Environment Variables ภายหลัง ให้ **Redeploy** deployment ที่ต้องการให้ใช้ค่าใหม่
ไม่ต้องรัน `npm start` บนคอมค้างไว้ และไม่ต้องเปิดพอร์ต router

## 5. ตรวจหลัง Deploy

- เปิด `/dashboard.html` และตรวจว่าข้อมูลแสดง ไม่ขึ้นข้อความเชื่อมต่อฐานข้อมูลไม่สำเร็จ
- เปิด `/api/health` ในเบราว์เซอร์ที่เข้าสู่ระบบแล้ว ควรได้ `{"ok":true,"engine":"PostgreSQL"}`
- เปิดหน้าลูกค้า รถ บริการ จองคิว และรายงาน
- บนข้อมูลทดสอบ ลองเพิ่มลูกค้า/รถ แล้วจองเวลาว่าง 08:00–18:00 เริ่มล้าง ปิดงาน และรับชำระ
- ถ้าใช้เครดิตสมาชิก ตรวจว่าเครดิตลดครั้งเดียวและไม่เกิดรายรับเงินสดจากการแลกเครดิต
- ปิดคอมแล้วเปิด URL จากมือถือได้ ข้อมูลยังอยู่ใน Neon

## เมื่อเจอปัญหา

| อาการ | สิ่งที่ตรวจ |
| --- | --- |
| 503 ขอให้ตั้งชื่อ/รหัสผ่าน | เพิ่ม `APP_USERNAME` และ `APP_PASSWORD` ให้ครบ แล้ว Redeploy |
| ถามรหัสผ่านซ้ำ | ชื่อ/รหัสผ่านต้องตรงกับค่า Vercel; ลองเปิดหน้าต่างไม่ระบุตัวตนหลังเปลี่ยนรหัส |
| เชื่อมต่อฐานข้อมูลไม่ได้ | ตรวจ `DATABASE_URL`, TLS, database/role, pooled host และดู Vercel Function Logs โดยไม่แชร์ค่าลับ |
| ขึ้นว่าตารางหรือ function ไม่มี | รัน `setup-neon.sql` ใน database เดียวกับ connection string |
| 404 ทุกหน้า | ตรวจ Root Directory และมี `vercel.json`, `api/index.js` บน branch ที่ Deploy |
| Build หา package.json ไม่พบ | โค้ดอยู่ซ้อนโฟลเดอร์ ให้ปรับ Root Directory หรือย้ายขึ้น root |
| ช่องล้าง/ช่างไม่ว่าง | ตรวจงานที่กำลังล้างและคิวซ้อน ใช้ข้อมูลใหม่ในวันเวลาว่าง |
| เปิดครั้งแรกช้า | Neon/Vercel อาจตื่นจากการพักเครื่องตามแพลน ตรวจข้อจำกัดของแพลนที่ใช้ |

## อัปเดตในอนาคต

Push โค้ดขึ้น branch production จะให้ Vercel deploy รุ่นใหม่ตามการตั้งค่า Git integration
ข้อมูลฐานข้อมูลแยกจาก deployment จึงไม่หายเมื่อ deploy ใหม่
อย่ารัน seed ซ้ำบนข้อมูลใช้งานจริง และสำรองข้อมูลก่อนเปลี่ยน schema
ระบบนี้ใช้บัญชีพนักงานร่วมหนึ่งบัญชี หากต้องการแยกสิทธิ์เจ้าของร้าน/พนักงานต้องพัฒนาระบบผู้ใช้เพิ่ม
