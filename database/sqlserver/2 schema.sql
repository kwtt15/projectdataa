-- สร้างฐานข้อมูลใหม่ แยกจาก washy เดิม รันครั้งเดียว
USE master;
GO
IF DB_ID(N'washy_realistic') IS NULL EXEC(N'CREATE DATABASE washy_realistic');
GO
USE washy_realistic;
GO
CREATE TABLE dbo.customers(customer_id int IDENTITY PRIMARY KEY,first_name nvarchar(50) NOT NULL,last_name nvarchar(50) NOT NULL,phone varchar(15) NOT NULL UNIQUE,created_at datetime2 NOT NULL DEFAULT SYSDATETIME());
CREATE TABLE dbo.vehicles(vehicle_id int IDENTITY PRIMARY KEY,customer_id int NOT NULL REFERENCES dbo.customers(customer_id),license_plate nvarchar(20) NOT NULL UNIQUE,brand nvarchar(50) NOT NULL,model nvarchar(50) NOT NULL,color nvarchar(30) NOT NULL,vehicle_type varchar(30) NOT NULL);
CREATE TABLE dbo.member_cards(member_card_id int IDENTITY PRIMARY KEY,customer_id int NOT NULL REFERENCES dbo.customers(customer_id),card_number varchar(20) NOT NULL UNIQUE,member_type varchar(30) NOT NULL,remaining_credit int NOT NULL CHECK(remaining_credit>=0),expiry_date date NOT NULL,status varchar(20) NOT NULL CHECK(status IN('Active','Expired','Suspended')));
CREATE TABLE dbo.service_packages(package_id int IDENTITY PRIMARY KEY,package_name nvarchar(100) NOT NULL UNIQUE,price decimal(10,2) NOT NULL CHECK(price>0),duration_minutes int NOT NULL CHECK(duration_minutes BETWEEN 1 AND 600),status varchar(20) NOT NULL CHECK(status IN('Active','Inactive')));
CREATE TABLE dbo.wash_bays(bay_id int IDENTITY PRIMARY KEY,bay_name nvarchar(30) NOT NULL UNIQUE,status varchar(20) NOT NULL CHECK(status IN('Available','Occupied','Maintenance')));
CREATE TABLE dbo.staff(staff_id int IDENTITY PRIMARY KEY,first_name nvarchar(50) NOT NULL,last_name nvarchar(50) NOT NULL,phone varchar(15) NOT NULL,position varchar(20) NOT NULL CHECK(position IN('Technician','Detailer','Supervisor','Cashier')),status varchar(20) NOT NULL CHECK(status IN('Active','Inactive','On_Leave')));
CREATE TABLE dbo.bookings(booking_id int IDENTITY PRIMARY KEY,vehicle_id int NOT NULL REFERENCES dbo.vehicles(vehicle_id),package_id int NOT NULL REFERENCES dbo.service_packages(package_id),bay_id int NOT NULL REFERENCES dbo.wash_bays(bay_id),staff_id int NOT NULL REFERENCES dbo.staff(staff_id),member_card_id int NULL REFERENCES dbo.member_cards(member_card_id),start_time datetime2 NOT NULL,end_time datetime2 NOT NULL,booking_status varchar(20) NOT NULL CHECK(booking_status IN('Pending','In_Progress','Completed','Cancelled')),price_snapshot decimal(10,2) NOT NULL CHECK(price_snapshot>0),created_at datetime2 NOT NULL DEFAULT SYSDATETIME(),CHECK(start_time<end_time));
CREATE TABLE dbo.payments(payment_id int IDENTITY PRIMARY KEY,booking_id int NOT NULL REFERENCES dbo.bookings(booking_id),payment_date datetime2 NOT NULL DEFAULT SYSDATETIME(),amount decimal(10,2) NOT NULL CHECK(amount>0),payment_method varchar(20) NOT NULL CHECK(payment_method IN('Cash','PromptPay','Credit_Card','Member_Credit')));
CREATE TABLE dbo.materials(material_id int IDENTITY PRIMARY KEY,material_name nvarchar(100) NOT NULL UNIQUE,unit nvarchar(20) NOT NULL,unit_cost decimal(10,2) NOT NULL CHECK(unit_cost>=0),stock_qty decimal(10,2) NOT NULL CHECK(stock_qty>=0));
CREATE TABLE dbo.material_usage(usage_id int IDENTITY PRIMARY KEY,booking_id int NOT NULL REFERENCES dbo.bookings(booking_id),material_id int NOT NULL REFERENCES dbo.materials(material_id),quantity_used decimal(10,2) NOT NULL CHECK(quantity_used>0),unit_cost_snapshot decimal(10,2) NOT NULL CHECK(unit_cost_snapshot>=0));
CREATE INDEX ix_bookings_bay_time ON dbo.bookings(bay_id,start_time,end_time) INCLUDE(booking_status);
CREATE INDEX ix_bookings_staff_time ON dbo.bookings(staff_id,start_time,end_time) INCLUDE(booking_status);
CREATE INDEX ix_bookings_vehicle_time ON dbo.bookings(vehicle_id,start_time,end_time) INCLUDE(booking_status);
CREATE INDEX ix_payments_booking ON dbo.payments(booking_id) INCLUDE(amount,payment_method);
CREATE INDEX ix_usage_booking ON dbo.material_usage(booking_id) INCLUDE(quantity_used,unit_cost_snapshot);
GO
