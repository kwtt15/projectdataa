USE washy_realistic;
GO
CREATE OR ALTER PROCEDURE dbo.usp_save_customer @first_name nvarchar(50),@last_name nvarchar(50),@phone varchar(15),@customer_id int=NULL
AS
BEGIN
 SET NOCOUNT ON; SET XACT_ABORT ON;
 BEGIN TRY
 BEGIN TRANSACTION;
 EXEC dbo.usp_lock;
 IF NULLIF(LTRIM(RTRIM(@first_name)),N'') IS NULL OR NULLIF(LTRIM(RTRIM(@last_name)),N'') IS NULL OR NULLIF(LTRIM(RTRIM(@phone)),'') IS NULL THROW 51021,'Required customer fields.',1;
 IF @customer_id IS NULL BEGIN
 INSERT dbo.customers(first_name,last_name,phone) VALUES(@first_name,@last_name,@phone);
 SET @customer_id=CONVERT(int,SCOPE_IDENTITY()); END
 ELSE BEGIN UPDATE dbo.customers SET first_name=@first_name,last_name=@last_name,phone=@phone WHERE customer_id=@customer_id;
 IF @@ROWCOUNT<>1 THROW 51022,'Customer not found.',1; END;
 SELECT @customer_id customer_id;
 COMMIT;
 END TRY
 BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK;
 THROW;
 END CATCH;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_delete_customer @customer_id int
AS
BEGIN
 SET NOCOUNT ON; SET XACT_ABORT ON;
 BEGIN TRY
 BEGIN TRANSACTION;
 EXEC dbo.usp_lock;
 DELETE FROM dbo.customers WHERE customer_id=@customer_id;
 IF @@ROWCOUNT<>1 THROW 51022,'Customer not found.',1;
 COMMIT;
 END TRY
 BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK;
 THROW;
 END CATCH;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_save_vehicle @customer_id int,@license_plate nvarchar(20),@brand nvarchar(50),@model nvarchar(50),@color nvarchar(30),@vehicle_type varchar(30),@vehicle_id int=NULL
AS
BEGIN
 SET NOCOUNT ON; SET XACT_ABORT ON;
 BEGIN TRY
 BEGIN TRANSACTION;
 EXEC dbo.usp_lock;
 IF @vehicle_id IS NULL BEGIN
 INSERT dbo.vehicles(customer_id,license_plate,brand,model,color,vehicle_type) VALUES(@customer_id,@license_plate,@brand,@model,@color,@vehicle_type);
 SET @vehicle_id=CONVERT(int,SCOPE_IDENTITY()); END
 ELSE BEGIN
 IF EXISTS(SELECT 1 FROM dbo.bookings WHERE vehicle_id=@vehicle_id) THROW 51023,'Vehicle with booking history is immutable in this version.',1;
 UPDATE dbo.vehicles SET customer_id=@customer_id,license_plate=@license_plate,brand=@brand,model=@model,color=@color,vehicle_type=@vehicle_type WHERE vehicle_id=@vehicle_id;
 IF @@ROWCOUNT<>1 THROW 51024,'Vehicle not found.',1; END;
 SELECT @vehicle_id vehicle_id;
 COMMIT;
 END TRY
 BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK;
 THROW;
 END CATCH;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_delete_vehicle @vehicle_id int
AS
BEGIN
 SET NOCOUNT ON; SET XACT_ABORT ON;
 BEGIN TRY
 BEGIN TRANSACTION;
 EXEC dbo.usp_lock;
 DELETE FROM dbo.vehicles WHERE vehicle_id=@vehicle_id;
 IF @@ROWCOUNT<>1 THROW 51024,'Vehicle not found.',1;
 COMMIT;
 END TRY
 BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK;
 THROW;
 END CATCH;
END;
GO
GRANT EXECUTE ON dbo.usp_save_customer TO washy_realistic_app;
GRANT EXECUTE ON dbo.usp_delete_customer TO washy_realistic_app;
GRANT EXECUTE ON dbo.usp_save_vehicle TO washy_realistic_app;
GRANT EXECUTE ON dbo.usp_delete_vehicle TO washy_realistic_app;
