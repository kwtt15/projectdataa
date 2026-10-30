-- SQL Server / washy_realistic only. Run after files 01-04.
-- Adds the assignment's atomic booking + redemption/payment workflow.
-- Existing 630 bookings are not modified by this installation.
USE washy_realistic;
GO
CREATE OR ALTER PROCEDURE dbo.sp_process_car_wash_booking
 @vehicle_id int,
 @package_id int,
 @bay_id int,
 @staff_id int,
 @start_time datetime2,
 @payment_method varchar(20),
 @member_card_id int=NULL,
 @paid_amount decimal(10,2)=NULL
AS
BEGIN
 SET NOCOUNT ON;
 SET XACT_ABORT ON;
 BEGIN TRY
  BEGIN TRANSACTION;
  EXEC dbo.usp_lock;
  DECLARE @new TABLE(booking_id int,end_time datetime2,price_snapshot decimal(10,2));
  DECLARE @id int,@price decimal(10,2),@end datetime2;
  -- Existing procedure checks package, card owner/expiry/credit, staff and bay.
  -- Booking guard checks opening hours and overlapping bay/staff/vehicle.
  INSERT INTO @new
  EXEC dbo.usp_create_booking @vehicle_id=@vehicle_id,@package_id=@package_id,
   @bay_id=@bay_id,@staff_id=@staff_id,@start_time=@start_time,@member_card_id=@member_card_id;
  SELECT @id=booking_id,@price=price_snapshot,@end=end_time FROM @new;
  IF @payment_method IS NULL
    OR (@member_card_id IS NULL AND @payment_method NOT IN('Cash','PromptPay','Credit_Card'))
    OR (@member_card_id IS NOT NULL AND @payment_method<>'Member_Credit')
    THROW 51401,'Payment method does not match member card.',1;
  IF @member_card_id IS NULL AND (@paid_amount IS NULL OR @paid_amount<>@price)
    THROW 51402,'Cash/transfer/card amount must equal service price.',1;
  IF @member_card_id IS NOT NULL AND ISNULL(@paid_amount,0)<>0
    THROW 51403,'Member redemption must not include new cash.',1;
  -- This entry point is for reception when service starts.
  -- Pending -> In_Progress fires the EXISTING trigger exactly once.
  EXEC dbo.usp_start_booking @booking_id=@id;
  -- Member_Credit is redemption value, not newly received cash.
  INSERT dbo.payments(booking_id,amount,payment_method)
   VALUES(@id,@price,@payment_method);
  COMMIT TRANSACTION;
  SELECT @id booking_id,@end end_time,@price price_snapshot,
         CAST('In_Progress' AS varchar(20)) booking_status,@payment_method payment_method;
 END TRY
 BEGIN CATCH
  IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
  THROW;
 END CATCH;
END;
GO
-- Supports both original pay-at-completion and new paid-at-reception flow.
CREATE OR ALTER PROCEDURE dbo.usp_complete_booking
 @booking_id int,@payment_method varchar(20)
AS
BEGIN
 SET NOCOUNT ON;
 SET XACT_ABORT ON;
 BEGIN TRY
  BEGIN TRANSACTION;
  EXEC dbo.usp_lock;
  DECLARE @price decimal(10,2),@card int;
  SELECT @price=price_snapshot,@card=member_card_id
   FROM dbo.bookings WHERE booking_id=@booking_id AND booking_status='In_Progress';
  IF @price IS NULL THROW 51018,'Only In_Progress bookings may complete.',1;
  IF @payment_method IS NULL
    OR (@card IS NULL AND @payment_method NOT IN('Cash','PromptPay','Credit_Card'))
    OR (@card IS NOT NULL AND @payment_method<>'Member_Credit')
    THROW 51019,'Payment method does not match booking.',1;
  IF EXISTS(SELECT 1 FROM dbo.payments WHERE booking_id=@booking_id)
  BEGIN
   IF (SELECT COUNT(*) FROM dbo.payments WHERE booking_id=@booking_id)<>1
     OR NOT EXISTS(SELECT 1 FROM dbo.payments WHERE booking_id=@booking_id
                   AND amount=@price AND payment_method=@payment_method)
     THROW 51404,'Existing payment does not match; review before completion.',1;
  END
  ELSE
   INSERT dbo.payments(booking_id,amount,payment_method) VALUES(@booking_id,@price,@payment_method);
  UPDATE dbo.bookings SET booking_status='Completed' WHERE booking_id=@booking_id;
  COMMIT TRANSACTION;
 END TRY
 BEGIN CATCH
  IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
  THROW;
 END CATCH;
END;
GO
GRANT EXECUTE ON dbo.sp_process_car_wash_booking TO washy_realistic_app;
GO
-- Verify installation. These SELECTs do not create bookings.
SELECT name,type_desc FROM sys.objects
WHERE name IN('sp_process_car_wash_booking','trg_deduct_member_credit','vw_daily_car_wash_revenue_summary');
PRINT 'Installed. Run 08_test_required_flow.sql in a development database.';
