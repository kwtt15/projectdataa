# WASHY — Car Wash & Auto Detailing Booking System

** Database Systems**

WASHY เป็นเว็บแอปพลิเคชันสำหรับจัดการร้านล้างรถและบริการดูแลรถยนต์ ครอบคลุมข้อมูลลูกค้า รถยนต์ สมาชิก การจองบริการ พนักงาน ช่องล้าง การชำระเงิน และวัสดุ โดยใช้ **Microsoft SQL Server** เป็นฐานข้อมูล, **Node.js / Express** เป็น Backend และ **HTML / CSS / JavaScript** เป็น Frontend

เอกสารนี้อธิบายวิธีติดตั้งและเปิดใช้งานบน **เครื่อง Windows ของผู้ตรวจ** โดยไม่จำเป็นต้องใช้ชื่อเครื่องหรือรหัสผ่านของผู้พัฒนา

## 1. โปรแกรมที่ต้องติดตั้ง

1. **Microsoft SQL Server** หรือ **SQL Server Express** (Database Engine)
2. **SQL Server Management Studio (SSMS)** สำหรับรันไฟล์ `.sql`
3. **Node.js รุ่น LTS** ซึ่งมี npm มาด้วย
4. เว็บเบราว์เซอร์ เช่น Chrome หรือ Edge

แหล่งดาวน์โหลด: [SQL Server](https://www.microsoft.com/en-us/sql-server/sql-server-downloads) · [SSMS](https://learn.microsoft.com/en-us/ssms/install/install) · [Node.js](https://nodejs.org/)

ตรวจสอบ Node.js ใน Command Prompt หรือ PowerShell:

```powershell
node -v
npm -v
```

หากคำสั่งไม่ทำงาน ให้ติดตั้ง Node.js และเปิด Terminal ใหม่

## 2. โครงสร้างไฟล์ที่ใช้ส่งงาน

```text
WASHY_Submission_Ready/
├── 1 เล่มรายงาน/                 (รายงาน PDF ของผู้จัดทำ)
├── 2 ฐานข้อมูลและ Source Code/
│   ├── 1 web application code/  (HTML/CSS/JS, server/, package.json, .env.example)
│   ├── 2 schema.sql
│   ├── 3 data.sql
│   ├── 4 logic.sql
│   ├── 5 queries.sql
|   ├──SQLเพิ่มเติม
│       ├── 03_master_crud.sql
│       ├── 06_check_data.sql
│       ├── 07_required_flow.sql
│       ├── 08_test_required_flow.sql
│       └── 09_link_existing_pending_members.sql
└── 3 slides/                     (สไลด์ PDF ของผู้จัดทำ)
```

ไฟล์ SQL เพิ่มเติมทั้ง 5 ไฟล์ถูกเก็บไว้เพื่อให้สร้าง Stored Procedures/Triggers และทดสอบระบบได้ครบตามต้นฉบับ โดย **ไม่ต้องรันไฟล์ทดสอบเพื่อเปิดใช้งานเว็บไซต์**

ไฟล์ `.env.example` เป็นตัวอย่างที่ไม่บรรจุรหัสผ่านจริง ให้สร้าง `.env` บนเครื่องผู้ตรวจเอง และไม่ต้องแนบ `node_modules` ใน ZIP

## 3. สร้างฐานข้อมูลด้วย SSMS

1. เปิด **SQL Server Management Studio (SSMS)**
2. เชื่อมต่อ SQL Server ของเครื่องผู้ตรวจ โดยเริ่มด้วย **Windows Authentication**
3. เปิดไฟล์ในโฟลเดอร์ `2 ฐานข้อมูลและ Source Code/` ทีละไฟล์และกด **Execute** ตามลำดับติดตั้งด้านล่าง

| ลำดับ | ไฟล์ | จุดประสงค์ |
|---|---|---|
| 1 | `2 schema.sql` | สร้างฐานข้อมูล `washy_realistic` และตาราง |
| 2 | `4 logic.sql` | สร้าง Stored Procedures, Triggers และ View |
| 3 | `03_master_crud.sql` | สร้าง Stored Procedures สำหรับจัดการข้อมูลหลัก |
| 4 | `3 data.sql` | เพิ่มข้อมูลเริ่มต้น **รันครั้งเดียวบนฐานข้อมูลว่าง** |
| 5 | `07_required_flow.sql` | เพิ่มขั้นตอนการจองและชำระเงิน |
| 6 | `09_link_existing_pending_members.sql` | ปรับการผูกบัตรสมาชิกกับรายการจอง Pending |

เมื่อเสร็จแล้ว สามารถเปิดไฟล์ต่อไปนี้เพื่อตรวจสอบระบบ (ไม่ใช่ขั้นตอนสร้างฐานข้อมูล):

- `5 queries.sql` — คำสั่งสอบถามและรายงานข้อมูล
- `06_check_data.sql` — ตรวจสอบข้อมูลที่สร้าง
- `08_test_required_flow.sql` — ทดสอบขั้นตอนธุรกรรม โดยมีการ Rollback ตัวอย่างที่ทดสอบสำเร็จ

**ข้อควรระวัง:** `3 data.sql` จะปฏิเสธการรันหากตารางลูกค้ามีข้อมูลอยู่แล้ว อย่ารันซ้ำบนฐานข้อมูลที่มีข้อมูลจริง หากติดตั้งใหม่ให้ใช้ฐานข้อมูลใหม่หรือสำรองข้อมูลก่อนดำเนินการ

ตรวจสอบใน SSMS ว่ามีฐานข้อมูลชื่อ `washy_realistic` และตารางต่าง ๆ ปรากฏแล้ว

## 4. เปิด SQL Server Authentication (Mixed Mode)

Backend ในโปรเจกต์นี้ใช้ **SQL Server Authentication** (`DB_USER` / `DB_PASSWORD`) ไม่ใช่ Windows Authentication

1. ใน SSMS คลิกขวาชื่อ Server → **Properties** → **Security**
2. เลือก **SQL Server and Windows Authentication mode**
3. กด OK และ **Restart บริการ SQL Server** หากเพิ่งเปลี่ยนการตั้งค่านี้

## 5. สร้างบัญชีสำหรับเว็บไซต์

ใน SSMS ให้เชื่อมต่อด้วยบัญชีผู้ดูแลที่มีสิทธิ์สร้าง Login แล้วเปิด **New Query** รัน SQL ต่อไปนี้ โดย **เปลี่ยน `CHANGE_TO_A_STRONG_PASSWORD` เป็นรหัสผ่านที่ผู้ตรวจตั้งเอง** (ต้องเป็นไปตามนโยบายรหัสผ่านของ SQL Server):

```sql
USE master;
GO
IF NOT EXISTS (SELECT 1 FROM sys.sql_logins WHERE name = N'washy_web')
BEGIN
    CREATE LOGIN [washy_web]
    WITH PASSWORD = 'CHANGE_TO_A_STRONG_PASSWORD', CHECK_POLICY = ON;
END;
GO

USE washy_realistic;
GO
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'washy_web')
BEGIN
    CREATE USER [washy_web] FOR LOGIN [washy_web];
END;
GO

IF IS_ROLEMEMBER(N'db_datareader', N'washy_web') <> 1
    ALTER ROLE [db_datareader] ADD MEMBER [washy_web];
IF IS_ROLEMEMBER(N'db_datawriter', N'washy_web') <> 1
    ALTER ROLE [db_datawriter] ADD MEMBER [washy_web];
GO
GRANT EXECUTE TO [washy_web];
GO
```

สิทธิ์เหล่านี้อนุญาตให้เว็บไซต์อ่านและแก้ไขข้อมูล รวมถึงเรียก Stored Procedures ตามที่ระบบใช้งาน **หากมี Login `washy_web` อยู่แล้ว คำสั่งจะไม่เปลี่ยนรหัสผ่านเดิม** ให้ใช้รหัสผ่านเดิมหรือให้ผู้ดูแลตั้งรหัสผ่านใหม่ก่อนดำเนินการ

> สิทธิ์ `db_datawriter` และ `GRANT EXECUTE` เป็นสิทธิ์ที่กว้าง เหมาะสำหรับสภาพแวดล้อมตรวจงานที่แยกต่างหาก หากนำระบบไปใช้งานจริงควรจำกัดสิทธิ์ตามความจำเป็น

## 6. ตรวจสอบ DB_SERVER และ DB_PORT

**`DB_SERVER=127.0.0.1`** หมายถึง SQL Server ที่ทำงานอยู่บน **เครื่องเดียวกับเว็บไซต์** ไม่ใช่ IP เฉพาะของเครื่องผู้พัฒนา จึงใช้ค่านี้ได้บนเครื่องอาจารย์เช่นกัน **หาก SQL Server รับการเชื่อมต่อ TCP/IP ที่พอร์ตซึ่งระบุ**

วิธีดูชื่อ SQL Server:

1. เปิด SSMS และดูช่อง **Server name** ในหน้าต่างเชื่อมต่อ
2. ตัวอย่างชื่อ `COMPUTERNAME\SQLEXPRESS` หมายถึง SQL Server Express instance ชื่อ `SQLEXPRESS`
3. ชื่อเครื่องแต่ละเครื่องแตกต่างกันได้ และไม่จำเป็นต้องแก้ชื่อคอมพิวเตอร์ให้เหมือนผู้พัฒนา

วิธีตรวจสอบพอร์ต:

1. เปิด **SQL Server Configuration Manager** (โปรแกรมจัดการบริการและโปรโตคอลของ SQL Server)
2. ไปที่ **SQL Server Network Configuration → Protocols for SQLEXPRESS** หรือชื่อ instance ที่ใช้งาน
3. เปิด **TCP/IP** เป็น Enabled
4. เปิด **TCP/IP → Properties → IP Addresses** และตรวจสอบค่า `TCP Port` / `TCP Dynamic Ports` ของ IP ที่เปิดใช้งาน
5. หากเปลี่ยนการตั้งค่า ให้ Restart บริการ SQL Server ของ instance นั้น

**พอร์ต 1433 เป็นเพียงตัวอย่าง** SQL Server Express อาจใช้ Dynamic Port หรือพอร์ตอื่น และอาจมี instance อื่นใช้งาน 1433 อยู่แล้ว ไม่ควรตั้งพอร์ต 1433 โดยไม่ตรวจสอบ

## 7. สร้างไฟล์ .env

1. ในโฟลเดอร์ `1 web application code/` คัดลอก `.env.example` เป็น `.env`
2. กรอกข้อมูลการเชื่อมต่อให้ตรงกับ SQL Server บนเครื่องผู้ตรวจ

**ตัวอย่างเมื่อใช้ TCP/IP และ SQL Server ฟังที่พอร์ต 1433 จริง:**

```dotenv
PORT=3000
DB_SERVER=127.0.0.1
DB_PORT=1433
DB_NAME=washy_realistic
DB_USER=washy_web
DB_PASSWORD=YOUR_OWN_PASSWORD
DB_ENCRYPT=false
DB_TRUST_CERT=true
```

ให้เปลี่ยน `YOUR_OWN_PASSWORD` เป็นรหัสผ่านที่ตั้งในขั้นตอนที่ 5 และเปลี่ยน `DB_PORT` หากเครื่องใช้พอร์ตอื่น

**ทางเลือกเมื่อใช้ชื่อ instance** (และการค้นหาพอร์ตของ instance ทำงานได้):

```dotenv
PORT=3000
DB_SERVER=localhost\SQLEXPRESS
DB_NAME=washy_realistic
DB_USER=washy_web
DB_PASSWORD=YOUR_OWN_PASSWORD
DB_ENCRYPT=false
DB_TRUST_CERT=true
```

กรณีนี้ **ลบบรรทัด `DB_PORT` ออก** และอาจต้องให้บริการ **SQL Server Browser** ทำงานเพื่อค้นหาพอร์ตของ named instance ทั้งนี้ควรเริ่มทดสอบแบบ `127.0.0.1` + พอร์ตจริงก่อนหากการเชื่อมต่อผ่านชื่อ instance ไม่สำเร็จ

> โปรเจกต์นี้อ่าน `.env` จาก **โฟลเดอร์ที่รัน Node.js** ดังนั้นให้รันคำสั่งจากโฟลเดอร์หลักตามหัวข้อถัดไป

## 8. เปิดเว็บไซต์

เปิด **Terminal / PowerShell** ในโฟลเดอร์ `1 web application code` ซึ่งมีไฟล์ `package.json` แล้วรัน:

```powershell
npm install
npm start
```

คำสั่ง `npm start` ของโปรเจกต์นี้เรียก `node server/index.js` โดยอัตโนมัติ **ไม่ต้อง `cd server`**

เมื่อ Server เริ่มทำงาน ให้เปิด:

- **ตรวจสอบฐานข้อมูล:** http://localhost:3000/api/health
- **เปิดเว็บไซต์:** http://localhost:3000

หากเชื่อมต่อฐานข้อมูลสำเร็จ `/api/health` จะแสดงผลลักษณะนี้:

```json
{"ok":true,"database":"washy_realistic","engine":"SQL Server"}
```

**หมายเหตุ:** การเห็นข้อความ Server เริ่มทำงานหรือเปิดหน้าเว็บได้ ยังไม่ยืนยันว่าต่อฐานข้อมูลสำเร็จ ต้องตรวจสอบ `/api/health` และทดลองใช้งานจริงด้วย

## 9. การแก้ปัญหาที่พบบ่อย

| อาการ | สิ่งที่ควรตรวจสอบ |
|---|---|
| `Login failed for user 'washy_web'` | รหัสผ่าน `.env`, Mixed Mode, สถานะ Login, สิทธิ์ฐานข้อมูล และ instance ที่เชื่อมต่อ |
| `Failed to connect` / Timeout | SQL Server Service, TCP/IP, IP/พอร์ตจริง, Firewall และชื่อ instance |
| `node is not recognized` | ติดตั้ง Node.js LTS แล้วเปิด Terminal ใหม่ |
| `Cannot find module` | เปิด Terminal ในโฟลเดอร์หลักและรัน `npm install` |
| เปิดเว็บไซต์ได้แต่ข้อมูลไม่ขึ้น | ตรวจสอบ `/api/health`, `3 data.sql`, Stored Procedures และ Console ของ Backend |
| `EADDRINUSE` ที่พอร์ต 3000 | ปิด Server เดิมหรือเปลี่ยน `PORT` ใน `.env` แล้วเปิดด้วยพอร์ตใหม่ |
| `3 data.sql` รันไม่ผ่าน | ตรวจสอบว่าฐานข้อมูลมีข้อมูลอยู่แล้วหรือไม่; สคริปต์นี้สำหรับฐานข้อมูลว่างเท่านั้น |

หากแก้ไข `.env` ให้ **หยุด Server ด้วย `Ctrl+C` แล้วรัน `npm start` ใหม่** ทุกครั้ง

## 10. สรุปขั้นตอนสำหรับอาจารย์ผู้ตรวจ

1. ติดตั้ง SQL Server, SSMS และ Node.js
2. เปิด SSMS แล้วรัน `2 schema.sql` → `4 logic.sql` → `03_master_crud.sql` → `3 data.sql` → `07_required_flow.sql` → `09_link_existing_pending_members.sql`
3. เปิด Mixed Mode และสร้าง Login `washy_web` ตามหัวข้อ 4–5
4. ตรวจสอบว่า SQL Server เปิด TCP/IP และทราบพอร์ตจริง
5. สร้าง `.env` จาก `.env.example` และกำหนดค่าของเครื่องผู้ตรวจ
6. เปิด Terminal ในโฟลเดอร์หลัก แล้วรัน `npm install` และ `npm start`
7. เปิด http://localhost:3000/api/health ให้ได้ `"ok":true`
8. เปิด http://localhost:3000 เพื่อทดลองใช้งาน
9. ใช้ `5 queries.sql`, `06_check_data.sql` และ `08_test_required_flow.sql` เพื่อตรวจสอบฐานข้อมูลเพิ่มเติม

---

**หมายเหตุ:** README นี้จัดทำจากโครงสร้างและโค้ดใน `WASHY_Booking_Project1.zip` การติดตั้งบนเครื่องใหม่ยังขึ้นอยู่กับการตั้งค่า SQL Server ของเครื่องนั้น และควรทดสอบการติดตั้งจริงก่อนส่งงานขั้นสุดท้าย
