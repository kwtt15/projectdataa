USE washy_realistic;
GO
-- A coarse transaction-owned application lock serializes mutations for this small project.
-- Always call procedures; do not give the web role direct transactional table writes.
CREATE OR ALTER PROCEDURE dbo.usp_lock
AS
BEGIN
 DECLARE @r int;
 EXEC @r=sys.sp_getapplock @Resource=N'washy_realistic_write',@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=10000;
 IF @r<0 THROW 51000,'Busy; retry the request.',1;
END;
GO
CREATE OR ALTER TRIGGER dbo.trg_deduct_member_credit ON dbo.bookings AFTER UPDATE AS
BEGIN
 SET NOCOUNT ON;
 IF NOT EXISTS(SELECT 1 FROM inserted i JOIN deleted d ON d.booking_id=i.booking_id WHERE d.booking_status='Pending' AND i.booking_status='In_Progress' AND i.member_card_id IS NOT NULL) RETURN;
 IF EXISTS(SELECT 1 FROM inserted i JOIN deleted d ON d.booking_id=i.booking_id JOIN dbo.member_cards c WITH(UPDLOCK,HOLDLOCK) ON c.member_card_id=i.member_card_id JOIN dbo.vehicles v ON v.vehicle_id=i.vehicle_id WHERE d.booking_status='Pending' AND i.booking_status='In_Progress' AND(c.customer_id<>v.customer_id OR c.status<>'Active' OR c.expiry_date<CONVERT(date,i.start_time))) THROW 51001,'Invalid member card.',1;
 ;WITH need AS(SELECT i.member_card_id,COUNT(*) n FROM inserted i JOIN deleted d ON d.booking_id=i.booking_id WHERE d.booking_status='Pending' AND i.booking_status='In_Progress' AND i.member_card_id IS NOT NULL GROUP BY i.member_card_id)
 UPDATE c SET remaining_credit=remaining_credit-n FROM dbo.member_cards c JOIN need n ON n.member_card_id=c.member_card_id;
 -- CHECK remaining_credit>=0 rejects the entire statement if insufficient.
END;
GO
CREATE OR ALTER TRIGGER dbo.trg_material_stock ON dbo.material_usage AFTER INSERT AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM inserted i JOIN dbo.bookings b ON b.booking_id=i.booking_id WHERE b.booking_status<>'In_Progress') THROW 51002,'Materials require In_Progress booking.',1;
 ;WITH used AS(SELECT material_id,SUM(quantity_used) qty FROM inserted GROUP BY material_id)
 UPDATE m SET stock_qty=stock_qty-u.qty FROM dbo.materials m JOIN used u ON u.material_id=m.material_id;
END;
GO
CREATE OR ALTER TRIGGER dbo.trg_booking_guard ON dbo.bookings AFTER INSERT,UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM deleted d LEFT JOIN inserted i ON i.booking_id=d.booking_id WHERE i.booking_id IS NULL) THROW 51003,'Use cancellation, not deletion.',1;
 IF EXISTS(SELECT 1 FROM inserted i JOIN deleted d ON d.booking_id=i.booking_id WHERE i.vehicle_id<>d.vehicle_id OR i.package_id<>d.package_id OR i.bay_id<>d.bay_id OR i.staff_id<>d.staff_id OR ISNULL(i.member_card_id,-1)<>ISNULL(d.member_card_id,-1) OR i.start_time<>d.start_time OR i.end_time<>d.end_time OR i.price_snapshot<>d.price_snapshot) THROW 51004,'Booking details are immutable; cancel and recreate.',1;
 IF EXISTS(SELECT 1 FROM inserted i JOIN deleted d ON d.booking_id=i.booking_id WHERE i.booking_status<>d.booking_status AND NOT((d.booking_status='Pending' AND i.booking_status IN('In_Progress','Cancelled')) OR(d.booking_status='In_Progress' AND i.booking_status='Completed'))) THROW 51005,'Invalid status transition.',1;
 IF EXISTS(SELECT 1 FROM inserted i LEFT JOIN deleted d ON d.booking_id=i.booking_id WHERE d.booking_id IS NULL AND i.booking_status<>'Pending') THROW 51006,'New booking must be Pending.',1;
 IF EXISTS(SELECT 1 FROM inserted WHERE CONVERT(date,start_time)<>CONVERT(date,end_time) OR CONVERT(time,start_time)<'08:00' OR CONVERT(time,end_time)>'18:00') THROW 51007,'Business hours 08:00-18:00.',1;
 IF EXISTS(SELECT 1 FROM inserted i JOIN dbo.bookings b ON b.booking_id<>i.booking_id AND (b.bay_id=i.bay_id OR b.staff_id=i.staff_id OR b.vehicle_id=i.vehicle_id) AND b.start_time<i.end_time AND i.start_time<b.end_time WHERE b.booking_status IN('Pending','In_Progress') AND i.booking_status IN('Pending','In_Progress')) THROW 51008,'Overlapping bay, staff or vehicle.',1;
END;
GO
CREATE OR ALTER VIEW dbo.vw_daily_car_wash_revenue_summary AS
WITH receipts AS(SELECT booking_id,SUM(CASE WHEN payment_method='Member_Credit' THEN 0 ELSE amount END) cash_received,SUM(CASE WHEN payment_method='Member_Credit' THEN amount ELSE 0 END) member_value FROM dbo.payments GROUP BY booking_id)
SELECT CONVERT(date,b.start_time) service_date,b.package_id,p.package_name,b.bay_id,w.bay_name,COUNT_BIG(*) completed_cars,SUM(b.price_snapshot) service_value,SUM(ISNULL(r.cash_received,0)) cash_received,SUM(ISNULL(r.member_value,0)) member_redemption_value
FROM dbo.bookings b JOIN dbo.service_packages p ON p.package_id=b.package_id JOIN dbo.wash_bays w ON w.bay_id=b.bay_id LEFT JOIN receipts r ON r.booking_id=b.booking_id WHERE b.booking_status='Completed'
GROUP BY CONVERT(date,b.start_time),b.package_id,p.package_name,b.bay_id,w.bay_name;
GO
CREATE OR ALTER PROCEDURE dbo.usp_create_booking @vehicle_id int,@package_id int,@bay_id int,@staff_id int,@start_time datetime2,@member_card_id int=NULL
AS
BEGIN
 SET NOCOUNT ON; SET XACT_ABORT ON;
 BEGIN TRY
 BEGIN TRANSACTION;
 EXEC dbo.usp_lock;
 DECLARE @price decimal(10,2),@minutes int,@end datetime2,@id int;
 SELECT @price=price,@minutes=duration_minutes FROM dbo.service_packages WHERE package_id=@package_id AND status='Active';
 IF @price IS NULL OR @start_time IS NULL THROW 51010,'Invalid package or time.',1;
 SET @end=DATEADD(minute,@minutes,@start_time);
 IF NOT EXISTS(SELECT 1 FROM dbo.wash_bays WHERE bay_id=@bay_id AND status='Available') THROW 51011,'Bay unavailable.',1;
 IF NOT EXISTS(SELECT 1 FROM dbo.staff WHERE staff_id=@staff_id AND status='Active' AND position IN('Technician','Detailer')) THROW 51012,'Staff unavailable.',1;
 IF @member_card_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM dbo.member_cards c JOIN dbo.vehicles v ON v.customer_id=c.customer_id WHERE v.vehicle_id=@vehicle_id AND c.member_card_id=@member_card_id AND c.status='Active' AND c.expiry_date>=CONVERT(date,@start_time) AND c.remaining_credit>(SELECT COUNT(*) FROM dbo.bookings b WHERE b.member_card_id=c.member_card_id AND b.booking_status='Pending')) THROW 51013,'Card invalid or credits already reserved.',1;
 INSERT dbo.bookings(vehicle_id,package_id,bay_id,staff_id,member_card_id,start_time,end_time,booking_status,price_snapshot) VALUES(@vehicle_id,@package_id,@bay_id,@staff_id,@member_card_id,@start_time,@end,'Pending',@price);
 SET @id=CONVERT(int,SCOPE_IDENTITY());
 SELECT @id booking_id,@end end_time,@price price_snapshot;
 COMMIT;
 END TRY
 BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK;
 THROW;
 END CATCH;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_start_booking @booking_id int
AS
BEGIN
 SET NOCOUNT ON; SET XACT_ABORT ON;
 BEGIN TRY
 BEGIN TRANSACTION;
 EXEC dbo.usp_lock;
 IF NOT EXISTS(SELECT 1 FROM dbo.bookings b JOIN dbo.wash_bays w ON w.bay_id=b.bay_id JOIN dbo.staff s ON s.staff_id=b.staff_id WHERE b.booking_id=@booking_id AND b.booking_status='Pending' AND w.status='Available' AND s.status='Active') THROW 51014,'Booking cannot start.',1;
 IF EXISTS(SELECT 1 FROM dbo.bookings b JOIN dbo.bookings x ON (b.bay_id=x.bay_id OR b.staff_id=x.staff_id OR b.vehicle_id=x.vehicle_id) WHERE b.booking_id=@booking_id AND x.booking_status='In_Progress') THROW 51015,'Resource still working on another booking.',1;
 UPDATE dbo.bookings SET booking_status='In_Progress' WHERE booking_id=@booking_id;
 COMMIT;
 END TRY
 BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK;
 THROW;
 END CATCH;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_cancel_booking @booking_id int
AS
BEGIN
 SET NOCOUNT ON; SET XACT_ABORT ON;
 BEGIN TRY
 BEGIN TRANSACTION;
 EXEC dbo.usp_lock;
 UPDATE dbo.bookings SET booking_status='Cancelled' WHERE booking_id=@booking_id AND booking_status='Pending';
 IF @@ROWCOUNT<>1 THROW 51016,'Only Pending bookings may be cancelled.',1;
 COMMIT;
 END TRY
 BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK;
 THROW;
 END CATCH;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_use_material @booking_id int,@material_id int,@quantity decimal(10,2)
AS
BEGIN
 SET NOCOUNT ON; SET XACT_ABORT ON;
 BEGIN TRY
 BEGIN TRANSACTION;
 EXEC dbo.usp_lock;
 DECLARE @cost decimal(10,2);
 SELECT @cost=unit_cost FROM dbo.materials WHERE material_id=@material_id;
 IF @cost IS NULL OR @quantity IS NULL OR @quantity<=0 THROW 51017,'Invalid material or quantity.',1;
 INSERT dbo.material_usage(booking_id,material_id,quantity_used,unit_cost_snapshot) VALUES(@booking_id,@material_id,@quantity,@cost);
 COMMIT;
 END TRY
 BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK;
 THROW;
 END CATCH;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_complete_booking @booking_id int,@payment_method varchar(20)
AS
BEGIN
 SET NOCOUNT ON; SET XACT_ABORT ON;
 BEGIN TRY
 BEGIN TRANSACTION;
 EXEC dbo.usp_lock;
 DECLARE @price decimal(10,2),@card int;
 SELECT @price=price_snapshot,@card=member_card_id FROM dbo.bookings WHERE booking_id=@booking_id AND booking_status='In_Progress';
 IF @price IS NULL THROW 51018,'Only In_Progress bookings may complete.',1;
 IF @payment_method IS NULL OR (@card IS NULL AND @payment_method NOT IN('Cash','PromptPay','Credit_Card')) OR(@card IS NOT NULL AND @payment_method<>'Member_Credit') THROW 51019,'Payment method does not match booking.',1;
 IF EXISTS(SELECT 1 FROM dbo.payments WHERE booking_id=@booking_id) THROW 51020,'Already paid.',1;
 INSERT dbo.payments(booking_id,amount,payment_method) VALUES(@booking_id,@price,@payment_method);
 UPDATE dbo.bookings SET booking_status='Completed' WHERE booking_id=@booking_id;
 COMMIT;
 END TRY
 BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK;
 THROW;
 END CATCH;
END;
GO
-- Web account: SELECT plus EXECUTE only. Add a dedicated database user to this role.
IF DATABASE_PRINCIPAL_ID('washy_realistic_app') IS NULL EXEC('CREATE ROLE washy_realistic_app');
GRANT SELECT ON SCHEMA::dbo TO washy_realistic_app;
GRANT EXECUTE ON dbo.usp_create_booking TO washy_realistic_app;
GRANT EXECUTE ON dbo.usp_start_booking TO washy_realistic_app;
GRANT EXECUTE ON dbo.usp_cancel_booking TO washy_realistic_app;
GRANT EXECUTE ON dbo.usp_use_material TO washy_realistic_app;
GRANT EXECUTE ON dbo.usp_complete_booking TO washy_realistic_app;
