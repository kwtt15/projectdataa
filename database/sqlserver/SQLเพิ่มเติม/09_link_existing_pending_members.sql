USE washy_realistic;
GO
-- สำรองฐานข้อมูลก่อนรันสคริปต์นี้
-- ปรับ guard ให้ผูกบัตรกับการจอง Pending ที่ยังไม่มีบัตรได้เท่านั้น
-- ส่วนอื่นของ guard คงเดิมตาม 02_logic.sql
CREATE OR ALTER TRIGGER dbo.trg_booking_guard ON dbo.bookings AFTER INSERT,UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM deleted d LEFT JOIN inserted i ON i.booking_id=d.booking_id WHERE i.booking_id IS NULL) THROW 51003,'Use cancellation, not deletion.',1;
 IF EXISTS(SELECT 1 FROM inserted i JOIN deleted d ON d.booking_id=i.booking_id WHERE i.vehicle_id<>d.vehicle_id OR i.package_id<>d.package_id OR i.bay_id<>d.bay_id OR i.staff_id<>d.staff_id OR (ISNULL(i.member_card_id,-1)<>ISNULL(d.member_card_id,-1) AND NOT(d.booking_status='Pending' AND i.booking_status='Pending' AND d.member_card_id IS NULL AND i.member_card_id IS NOT NULL)) OR i.start_time<>d.start_time OR i.end_time<>d.end_time OR i.price_snapshot<>d.price_snapshot) THROW 51004,'Booking details are immutable; cancel and recreate.',1;
 IF EXISTS(SELECT 1 FROM inserted i JOIN deleted d ON d.booking_id=i.booking_id WHERE i.booking_status<>d.booking_status AND NOT((d.booking_status='Pending' AND i.booking_status IN('In_Progress','Cancelled')) OR(d.booking_status='In_Progress' AND i.booking_status='Completed'))) THROW 51005,'Invalid status transition.',1;
 IF EXISTS(SELECT 1 FROM inserted i LEFT JOIN deleted d ON d.booking_id=i.booking_id WHERE d.booking_id IS NULL AND i.booking_status<>'Pending') THROW 51006,'New booking must be Pending.',1;
 IF EXISTS(SELECT 1 FROM inserted WHERE CONVERT(date,start_time)<>CONVERT(date,end_time) OR CONVERT(time,start_time)<'08:00' OR CONVERT(time,end_time)>'18:00') THROW 51007,'Business hours 08:00-18:00.',1;
 IF EXISTS(SELECT 1 FROM inserted i JOIN dbo.bookings b ON b.booking_id<>i.booking_id AND (b.bay_id=i.bay_id OR b.staff_id=i.staff_id OR b.vehicle_id=i.vehicle_id) AND b.start_time<i.end_time AND i.start_time<b.end_time WHERE b.booking_status IN('Pending','In_Progress') AND i.booking_status IN('Pending','In_Progress')) THROW 51008,'Overlapping bay, staff or vehicle.',1;
END;
GO
SET XACT_ABORT ON;
BEGIN TRANSACTION;
-- จับคู่ตามเจ้าของรถ + บัตร Active + วันหมดอายุ + เครดิตเหลือหลังหักจำนวนจองที่จองสิทธิ์ไว้
-- จำกัดจำนวนการผูกบัตรใหม่ ไม่ให้เกินเครดิตที่ยังว่าง
;WITH candidates AS (
 SELECT b.booking_id,c.member_card_id,
 ROW_NUMBER() OVER(PARTITION BY c.member_card_id ORDER BY b.start_time,b.booking_id) AS rn,
 c.remaining_credit - (SELECT COUNT(*) FROM dbo.bookings x WHERE x.member_card_id=c.member_card_id AND x.booking_status='Pending') AS free_credits
 FROM dbo.bookings b
 JOIN dbo.vehicles v ON v.vehicle_id=b.vehicle_id
 JOIN dbo.member_cards c ON c.customer_id=v.customer_id
 WHERE b.booking_status='Pending' AND b.member_card_id IS NULL
 AND c.status='Active' AND c.expiry_date>=CONVERT(date,b.start_time)
 AND c.expiry_date>=CONVERT(date,GETDATE())
 AND c.remaining_credit>0
 AND c.member_card_id=(SELECT TOP (1) c2.member_card_id FROM dbo.member_cards c2 WHERE c2.customer_id=v.customer_id AND c2.status='Active' AND c2.expiry_date>=CONVERT(date,b.start_time) AND c2.expiry_date>=CONVERT(date,GETDATE()) AND c2.remaining_credit>0 ORDER BY c2.expiry_date,c2.member_card_id)
)
UPDATE b SET member_card_id=c.member_card_id
FROM dbo.bookings b JOIN candidates c ON c.booking_id=b.booking_id
WHERE c.rn<=c.free_credits;
SELECT @@ROWCOUNT AS linked_pending_bookings;
COMMIT TRANSACTION;
-- Completed / In_Progress intentionally unchanged: past credit deductions cannot be inferred safely.
SELECT booking_status,COUNT(*) AS null_member_cards FROM dbo.bookings WHERE member_card_id IS NULL GROUP BY booking_status;
GO
