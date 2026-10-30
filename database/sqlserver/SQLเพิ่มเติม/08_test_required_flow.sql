-- Tests use transactions and roll back successful samples.
-- Run in SSMS after installing 07_required_flow.sql.
USE washy_realistic;
GO
-- Cash path, no duplicate payment at completion.
BEGIN TRY
 BEGIN TRANSACTION;
 DECLARE @n int=(SELECT COUNT(*) FROM dbo.bookings),@id int;
 EXEC dbo.sp_process_car_wash_booking 120,1,20,22,'2026-12-20T09:00:00','Cash',NULL,150;
 SELECT @id=MAX(booking_id) FROM dbo.bookings;
 IF (SELECT COUNT(*) FROM dbo.bookings)<>@n+1 THROW 51501,'Booking missing.',1;
 EXEC dbo.usp_complete_booking @id,'Cash';
 IF (SELECT COUNT(*) FROM dbo.payments WHERE booking_id=@id)<>1 THROW 51502,'Payment duplicated.',1;
 ROLLBACK;
 PRINT 'PASS: cash + completion, one payment (rolled back)';
END TRY
BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK;
 THROW;
END CATCH;
GO
-- Member path, trigger deducts exactly once.
BEGIN TRY
 BEGIN TRANSACTION;
 DECLARE @credit int=(SELECT remaining_credit FROM dbo.member_cards WHERE member_card_id=1),@id int;
 EXEC dbo.sp_process_car_wash_booking 1,1,20,22,'2026-12-20T10:00:00','Member_Credit',1,NULL;
 SELECT @id=MAX(booking_id) FROM dbo.bookings;
 IF (SELECT remaining_credit FROM dbo.member_cards WHERE member_card_id=1)<>@credit-1 THROW 51503,'Credit mismatch.',1;
 EXEC dbo.usp_complete_booking @id,'Member_Credit';
 IF (SELECT remaining_credit FROM dbo.member_cards WHERE member_card_id=1)<>@credit-1 THROW 51504,'Double deduction.',1;
 ROLLBACK;
 PRINT 'PASS: member credit deducted once (rolled back)';
END TRY
BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK;
 THROW;
END CATCH;
GO
-- Invalid amount must roll back the booking too (without an ambient transaction).
DECLARE @before int=(SELECT COUNT(*) FROM dbo.bookings),@caught bit=0;
BEGIN TRY
 EXEC dbo.sp_process_car_wash_booking 120,1,20,22,'2026-12-20T11:00:00','Cash',NULL,1;
END TRY
BEGIN CATCH
 IF ERROR_NUMBER()<>51402 THROW;
 SET @caught=1;
END CATCH;
IF @caught=0 THROW 51505,'Invalid amount accepted.',1;
IF (SELECT COUNT(*) FROM dbo.bookings)<>@before THROW 51506,'Booking survived failed transaction.',1;
PRINT 'PASS: invalid amount rejected and booking rolled back';
GO
