USE washy_realistic;
GO
SELECT 'customers' table_name,COUNT(*) rows_found FROM dbo.customers
UNION ALL SELECT 'vehicles',COUNT(*) FROM dbo.vehicles
UNION ALL SELECT 'member_cards',COUNT(*) FROM dbo.member_cards
UNION ALL SELECT 'service_packages',COUNT(*) FROM dbo.service_packages
UNION ALL SELECT 'wash_bays',COUNT(*) FROM dbo.wash_bays
UNION ALL SELECT 'staff',COUNT(*) FROM dbo.staff
UNION ALL SELECT 'materials',COUNT(*) FROM dbo.materials
UNION ALL SELECT 'bookings',COUNT(*) FROM dbo.bookings
UNION ALL SELECT 'payments',COUNT(*) FROM dbo.payments
UNION ALL SELECT 'material_usage',COUNT(*) FROM dbo.material_usage;
IF (SELECT COUNT(*) FROM dbo.bookings)<>630 THROW 51301,'Expected 630 bookings.',1;
IF (SELECT COUNT(*) FROM dbo.payments)<>540 THROW 51302,'Expected 540 payments.',1;
IF (SELECT COUNT(*) FROM dbo.material_usage)<>1200 THROW 51303,'Unexpected usage count.',1;
IF EXISTS(SELECT 1 FROM dbo.bookings WHERE created_at>start_time) THROW 51304,'Creation after visit.',1;
IF EXISTS(SELECT 1 FROM dbo.bookings b OUTER APPLY(SELECT SUM(amount) total FROM dbo.payments p WHERE p.booking_id=b.booking_id) p WHERE (b.booking_status='Completed' AND ISNULL(p.total,0)<>b.price_snapshot) OR(b.booking_status IN('Pending','Cancelled') AND p.total IS NOT NULL)) THROW 51305,'Payment mismatch.',1;
IF EXISTS(SELECT 1 FROM dbo.payments p JOIN dbo.bookings b ON b.booking_id=p.booking_id WHERE p.payment_date<>b.end_time) THROW 51306,'Unexpected receipt time.',1;
IF EXISTS(SELECT 1 FROM dbo.materials WHERE stock_qty<0) OR EXISTS(SELECT 1 FROM dbo.member_cards WHERE remaining_credit<0) THROW 51307,'Negative stock/credit.',1;
PRINT 'PASS: counts, chronology, payments and non-negative balances';
SELECT TOP(100) b.booking_id,CONCAT(c.first_name,N' ',c.last_name) customer_name,v.license_plate,v.brand,v.model,p.package_name,b.start_time,b.end_time,b.booking_status,b.price_snapshot FROM dbo.bookings b JOIN dbo.vehicles v ON v.vehicle_id=b.vehicle_id JOIN dbo.customers c ON c.customer_id=v.customer_id JOIN dbo.service_packages p ON p.package_id=b.package_id ORDER BY b.start_time DESC;
SELECT * FROM dbo.vw_daily_car_wash_revenue_summary;
