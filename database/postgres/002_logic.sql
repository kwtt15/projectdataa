-- All business timestamps are Asia/Bangkok wall time, matching the source UI.
CREATE FUNCTION booking_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(873219);
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Use cancellation, not deletion.'; END IF;
 IF TG_OP='INSERT' AND NEW.booking_status<>'Pending' THEN RAISE EXCEPTION 'New booking must be Pending.'; END IF;
 IF TG_OP='UPDATE' THEN
  IF ROW(NEW.vehicle_id,NEW.package_id,NEW.bay_id,NEW.staff_id,NEW.member_card_id,NEW.start_time,NEW.end_time,NEW.price_snapshot)
     IS DISTINCT FROM ROW(OLD.vehicle_id,OLD.package_id,OLD.bay_id,OLD.staff_id,OLD.member_card_id,OLD.start_time,OLD.end_time,OLD.price_snapshot)
  THEN RAISE EXCEPTION 'Booking details are immutable; cancel and recreate.'; END IF;
  IF NEW.booking_status<>OLD.booking_status AND NOT
    ((OLD.booking_status='Pending' AND NEW.booking_status IN('In_Progress','Cancelled')) OR
     (OLD.booking_status='In_Progress' AND NEW.booking_status='Completed'))
  THEN RAISE EXCEPTION 'Invalid status transition.'; END IF;
 END IF;
 IF NEW.start_time::date<>NEW.end_time::date OR NEW.start_time::time<'08:00'::time OR NEW.end_time::time>'18:00'::time
 THEN RAISE EXCEPTION 'Business hours 08:00-18:00.'; END IF;
 IF NEW.booking_status IN('Pending','In_Progress') AND EXISTS(
  SELECT 1 FROM bookings b WHERE b.booking_id<>NEW.booking_id AND
   (b.bay_id=NEW.bay_id OR b.staff_id=NEW.staff_id OR b.vehicle_id=NEW.vehicle_id) AND
   b.start_time<NEW.end_time AND NEW.start_time<b.end_time AND b.booking_status IN('Pending','In_Progress'))
 THEN RAISE EXCEPTION 'Overlapping bay, staff or vehicle.'; END IF;
 IF TG_OP='UPDATE' AND OLD.booking_status='Pending' AND NEW.booking_status='In_Progress' AND NEW.member_card_id IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM member_cards c JOIN vehicles v ON v.customer_id=c.customer_id
    WHERE c.member_card_id=NEW.member_card_id AND v.vehicle_id=NEW.vehicle_id AND c.status='Active' AND c.expiry_date>=NEW.start_time::date)
  THEN RAISE EXCEPTION 'Invalid member card.'; END IF;
  UPDATE member_cards SET remaining_credit=remaining_credit-1 WHERE member_card_id=NEW.member_card_id AND remaining_credit>0;
  IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient member credits.'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER booking_guard BEFORE INSERT OR UPDATE OR DELETE ON bookings FOR EACH ROW EXECUTE FUNCTION booking_guard();

CREATE FUNCTION sync_booking_bays() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 UPDATE wash_bays w SET status=CASE WHEN EXISTS(SELECT 1 FROM bookings b WHERE b.bay_id=w.bay_id AND b.booking_status='In_Progress')
 THEN 'Occupied' WHEN w.status='Maintenance' THEN 'Maintenance' ELSE 'Available' END WHERE w.bay_id=NEW.bay_id;
 RETURN NEW;
END $$;
CREATE TRIGGER sync_booking_bays AFTER INSERT OR UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION sync_booking_bays();

CREATE FUNCTION material_stock_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(873219);
 IF NOT EXISTS(SELECT 1 FROM bookings WHERE booking_id=NEW.booking_id AND booking_status='In_Progress')
 THEN RAISE EXCEPTION 'Materials require In_Progress booking.'; END IF;
 UPDATE materials SET stock_qty=stock_qty-NEW.quantity_used WHERE material_id=NEW.material_id AND stock_qty>=NEW.quantity_used;
 IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient material stock.'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER material_stock_guard BEFORE INSERT ON material_usage FOR EACH ROW EXECUTE FUNCTION material_stock_guard();

CREATE VIEW vw_daily_car_wash_revenue_summary AS
WITH receipts AS(SELECT booking_id,SUM(CASE WHEN payment_method='Member_Credit' THEN 0 ELSE amount END) cash_received,
 SUM(CASE WHEN payment_method='Member_Credit' THEN amount ELSE 0 END) member_value FROM payments GROUP BY booking_id)
SELECT b.start_time::date service_date,b.package_id,p.package_name,b.bay_id,w.bay_name,COUNT(*) completed_cars,
 SUM(b.price_snapshot) service_value,SUM(COALESCE(r.cash_received,0)) cash_received,SUM(COALESCE(r.member_value,0)) member_redemption_value
FROM bookings b JOIN service_packages p USING(package_id) JOIN wash_bays w USING(bay_id) LEFT JOIN receipts r USING(booking_id)
WHERE b.booking_status='Completed' GROUP BY b.start_time::date,b.package_id,p.package_name,b.bay_id,w.bay_name;

CREATE FUNCTION usp_create_booking(p_vehicle_id int,p_package_id int,p_bay_id int,p_staff_id int,p_start_time timestamp,p_member_card_id int DEFAULT NULL)
RETURNS TABLE(booking_id int,end_time timestamp,price_snapshot numeric) LANGUAGE plpgsql AS $$
DECLARE v_price numeric; v_minutes int; v_end timestamp; v_id int;
BEGIN
 PERFORM pg_advisory_xact_lock(873219);
 SELECT s.price,s.duration_minutes INTO v_price,v_minutes FROM service_packages s WHERE s.package_id=p_package_id AND s.status='Active';
 IF v_price IS NULL OR p_start_time IS NULL THEN RAISE EXCEPTION 'Invalid package or time.'; END IF;
 v_end := p_start_time + make_interval(mins=>v_minutes);
 IF NOT EXISTS(SELECT 1 FROM wash_bays WHERE bay_id=p_bay_id AND status='Available') THEN RAISE EXCEPTION 'Bay unavailable.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM staff WHERE staff_id=p_staff_id AND status='Active' AND position IN('Technician','Detailer')) THEN RAISE EXCEPTION 'Staff unavailable.'; END IF;
 IF p_member_card_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM member_cards c JOIN vehicles v ON v.customer_id=c.customer_id
  WHERE v.vehicle_id=p_vehicle_id AND c.member_card_id=p_member_card_id AND c.status='Active' AND c.expiry_date>=p_start_time::date
  AND c.remaining_credit>(SELECT COUNT(*) FROM bookings b WHERE b.member_card_id=c.member_card_id AND b.booking_status='Pending'))
 THEN RAISE EXCEPTION 'Card invalid or credits already reserved.'; END IF;
 INSERT INTO bookings(vehicle_id,package_id,bay_id,staff_id,member_card_id,start_time,end_time,booking_status,price_snapshot)
 VALUES(p_vehicle_id,p_package_id,p_bay_id,p_staff_id,p_member_card_id,p_start_time,v_end,'Pending',v_price) RETURNING bookings.booking_id INTO v_id;
 RETURN QUERY SELECT v_id,v_end,v_price;
END $$;

CREATE FUNCTION usp_start_booking(p_booking_id int) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(873219);
 IF NOT EXISTS(SELECT 1 FROM bookings b JOIN wash_bays w USING(bay_id) JOIN staff s USING(staff_id)
 WHERE b.booking_id=p_booking_id AND b.booking_status='Pending' AND w.status='Available' AND s.status='Active')
 THEN RAISE EXCEPTION 'Booking cannot start.'; END IF;
 IF EXISTS(SELECT 1 FROM bookings b JOIN bookings x ON(b.bay_id=x.bay_id OR b.staff_id=x.staff_id OR b.vehicle_id=x.vehicle_id)
 WHERE b.booking_id=p_booking_id AND x.booking_status='In_Progress') THEN RAISE EXCEPTION 'Resource still working on another booking.'; END IF;
 UPDATE bookings SET booking_status='In_Progress' WHERE booking_id=p_booking_id;
END $$;

CREATE FUNCTION usp_cancel_booking(p_booking_id int) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(873219);
 UPDATE bookings SET booking_status='Cancelled' WHERE booking_id=p_booking_id AND booking_status='Pending';
 IF NOT FOUND THEN RAISE EXCEPTION 'Only Pending bookings may be cancelled.'; END IF;
END $$;

CREATE FUNCTION usp_use_material(p_booking_id int,p_material_id int,p_quantity numeric) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_cost numeric;
BEGIN
 PERFORM pg_advisory_xact_lock(873219);
 SELECT unit_cost INTO v_cost FROM materials WHERE material_id=p_material_id;
 IF v_cost IS NULL OR p_quantity IS NULL OR p_quantity<=0 THEN RAISE EXCEPTION 'Invalid material or quantity.'; END IF;
 INSERT INTO material_usage(booking_id,material_id,quantity_used,unit_cost_snapshot) VALUES(p_booking_id,p_material_id,p_quantity,v_cost);
END $$;

CREATE FUNCTION usp_complete_booking(p_booking_id int,p_payment_method varchar) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_price numeric; v_card int;
BEGIN
 PERFORM pg_advisory_xact_lock(873219);
 SELECT price_snapshot,member_card_id INTO v_price,v_card FROM bookings WHERE booking_id=p_booking_id AND booking_status='In_Progress';
 IF v_price IS NULL THEN RAISE EXCEPTION 'Only In_Progress bookings may complete.'; END IF;
 IF p_payment_method IS NULL OR (v_card IS NULL AND p_payment_method NOT IN('Cash','PromptPay','Credit_Card')) OR
  (v_card IS NOT NULL AND p_payment_method<>'Member_Credit') THEN RAISE EXCEPTION 'Payment method does not match booking.'; END IF;
 IF EXISTS(SELECT 1 FROM payments WHERE booking_id=p_booking_id) THEN
  IF NOT EXISTS(SELECT 1 FROM payments WHERE booking_id=p_booking_id AND amount=v_price AND payment_method=p_payment_method)
  THEN RAISE EXCEPTION 'Existing payment does not match; review before completion.'; END IF;
 ELSE
  INSERT INTO payments(booking_id,amount,payment_method) VALUES(p_booking_id,v_price,p_payment_method);
 END IF;
 UPDATE bookings SET booking_status='Completed' WHERE booking_id=p_booking_id;
END $$;

CREATE FUNCTION usp_save_customer(p_first_name varchar,p_last_name varchar,p_phone varchar,p_customer_id int DEFAULT NULL)
RETURNS TABLE(customer_id int) LANGUAGE plpgsql AS $$
DECLARE v_id int;
BEGIN
 PERFORM pg_advisory_xact_lock(873219);
 IF COALESCE(trim(p_first_name),'')='' OR COALESCE(trim(p_last_name),'')='' OR COALESCE(trim(p_phone),'')=''
 THEN RAISE EXCEPTION 'Required customer fields.'; END IF;
 IF p_customer_id IS NULL THEN
  INSERT INTO customers(first_name,last_name,phone) VALUES(p_first_name,p_last_name,p_phone) RETURNING customers.customer_id INTO v_id;
 ELSE
  UPDATE customers c SET first_name=p_first_name,last_name=p_last_name,phone=p_phone WHERE c.customer_id=p_customer_id RETURNING c.customer_id INTO v_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Customer not found.'; END IF;
 END IF;
 RETURN QUERY SELECT v_id;
END $$;
CREATE FUNCTION usp_delete_customer(p_customer_id int) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(873219);
 DELETE FROM customers WHERE customer_id=p_customer_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Customer not found.'; END IF;
END $$;
CREATE FUNCTION usp_save_vehicle(p_customer_id int,p_license_plate varchar,p_brand varchar,p_model varchar,p_color varchar,p_vehicle_type varchar,p_vehicle_id int DEFAULT NULL)
RETURNS TABLE(vehicle_id int) LANGUAGE plpgsql AS $$
DECLARE v_id int;
BEGIN
 PERFORM pg_advisory_xact_lock(873219);
 IF p_vehicle_id IS NULL THEN
  INSERT INTO vehicles(customer_id,license_plate,brand,model,color,vehicle_type) VALUES(p_customer_id,p_license_plate,p_brand,p_model,p_color,p_vehicle_type)
  RETURNING vehicles.vehicle_id INTO v_id;
 ELSE
  IF EXISTS(SELECT 1 FROM bookings b WHERE b.vehicle_id=p_vehicle_id) THEN RAISE EXCEPTION 'Vehicle with booking history is immutable in this version.'; END IF;
  UPDATE vehicles v SET customer_id=p_customer_id,license_plate=p_license_plate,brand=p_brand,model=p_model,color=p_color,vehicle_type=p_vehicle_type
  WHERE v.vehicle_id=p_vehicle_id RETURNING v.vehicle_id INTO v_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vehicle not found.'; END IF;
 END IF;
 RETURN QUERY SELECT v_id;
END $$;
CREATE FUNCTION usp_delete_vehicle(p_vehicle_id int) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(873219);
 DELETE FROM vehicles WHERE vehicle_id=p_vehicle_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Vehicle not found.'; END IF;
END $$;

CREATE FUNCTION sp_process_car_wash_booking(p_vehicle_id int,p_package_id int,p_bay_id int,p_staff_id int,p_start_time timestamp,
 p_payment_method varchar,p_member_card_id int DEFAULT NULL,p_paid_amount numeric DEFAULT NULL)
RETURNS TABLE(booking_id int,end_time timestamp,price_snapshot numeric,booking_status varchar,payment_method varchar) LANGUAGE plpgsql AS $$
DECLARE v_id int; v_end timestamp; v_price numeric;
BEGIN
 PERFORM pg_advisory_xact_lock(873219);
 SELECT b.booking_id,b.end_time,b.price_snapshot INTO v_id,v_end,v_price FROM usp_create_booking(p_vehicle_id,p_package_id,p_bay_id,p_staff_id,p_start_time,p_member_card_id) b;
 IF p_payment_method IS NULL OR (p_member_card_id IS NULL AND p_payment_method NOT IN('Cash','PromptPay','Credit_Card')) OR
  (p_member_card_id IS NOT NULL AND p_payment_method<>'Member_Credit') THEN RAISE EXCEPTION 'Payment method does not match member card.'; END IF;
 IF p_member_card_id IS NULL AND (p_paid_amount IS NULL OR p_paid_amount<>v_price) THEN RAISE EXCEPTION 'Cash/transfer/card amount must equal service price.'; END IF;
 IF p_member_card_id IS NOT NULL AND COALESCE(p_paid_amount,0)<>0 THEN RAISE EXCEPTION 'Member redemption must not include new cash.'; END IF;
 PERFORM usp_start_booking(v_id);
 INSERT INTO payments(booking_id,amount,payment_method) VALUES(v_id,v_price,p_payment_method);
 RETURN QUERY SELECT v_id,v_end,v_price,'In_Progress'::varchar,p_payment_method;
END $$;
