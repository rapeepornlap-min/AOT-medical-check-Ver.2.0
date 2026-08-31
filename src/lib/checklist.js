// src/lib/checklist.js
import { supabase } from './supabaseClient';

/**
 * ดึง locations ทั้งหมดที่ role ของผู้ใช้เข้าถึงได้ (allowed_roles มี role นี้อยู่)
 */
export async function getLocationsForRole(role) {
  const { data, error } = await supabase
    .from('locations')
    .select('id, category, code, label, sort_order, allowed_roles')
    .contains('allowed_roles', [role])
    .order('sort_order');
  if (error) return { error: error.message };
  return { data };
}

/**
 * ดึงรายการ checklist ของ module_key หนึ่งๆ เรียงตาม sort_order
 */
export async function getChecklistItems(moduleKey, locationCode) {
  const { data, error } = await supabase
    .from('checklist_templates')
    .select('*')
    .eq('module_key', moduleKey)
    .order('sort_order');
  if (error) return { error: error.message };
  // included_location_codes ว่าง/NULL = แสดงทุกจุด, มีค่า = แสดงเฉพาะจุดที่ระบุไว้เท่านั้น
  const filtered = locationCode
    ? data.filter((it) => !it.included_location_codes || it.included_location_codes.length === 0 || it.included_location_codes.includes(locationCode))
    : data;
  return { data: filtered };
}
/**
 * ดึงค่าที่บันทึกไว้ล่าสุดของ location + module หนึ่งๆ (เพื่อนำมา pre-fill ฟอร์ม)
 * คืนค่าเป็น object { item_code: { status, expiry_date, amount, note } }
 */
export async function getLatestInspectionAnswers(locationCode, moduleKey) {
  const { data: location, error: locError } = await supabase
    .from('locations')
    .select('id')
    .eq('code', locationCode)
    .single();
  if (locError || !location) return { data: {} };

  const { data: lastInspection, error: insError } = await supabase
    .from('inspections')
    .select('id, submitted_at')
    .eq('location_id', location.id)
    .eq('module_key', moduleKey)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (insError || !lastInspection) return { data: {} };

  const { data: items, error: itemsError } = await supabase
    .from('inspection_items')
    .select('item_code, status, expiry_date, amount, note, photo_url')
    .eq('inspection_id', lastInspection.id);
  if (itemsError || !items) return { data: {} };

  // "จำนวนที่ตรวจนับได้จริง" และ "สถานะครบ/ไม่ครบ" ให้ค้างไว้ใช้ได้ตลอดสัปดาห์เดิมที่ตรวจ แต่พอขึ้นสัปดาห์ใหม่
  // (เริ่มวันจันทร์) ให้เคลียร์ทั้งสองค่านี้ทิ้ง บังคับให้ตรวจและนับใหม่ (ฟิลด์อื่น เช่น วันหมดอายุ/หมายเหตุ ยังคง prefill ตามเดิม)
  const BKK_OFFSET_MS = 7 * 60 * 60 * 1000;
  const nowBkk = new Date(Date.now() + BKK_OFFSET_MS);
  const dow = nowBkk.getUTCDay(); // 0=อาทิตย์..6=เสาร์ (เวลากรุงเทพฯ)
  const diffToMonday = dow === 0 ? 6 : dow - 1;
  const weekStartBkk = new Date(Date.UTC(nowBkk.getUTCFullYear(), nowBkk.getUTCMonth(), nowBkk.getUTCDate() - diffToMonday));
  const weekStartUtc = new Date(weekStartBkk.getTime() - BKK_OFFSET_MS);
  const isSameWeek = new Date(lastInspection.submitted_at) >= weekStartUtc;

  const map = {};
  items.forEach((it) => {
    const entry = { ...it };
    if (!isSameWeek) {
      delete entry.amount;
      delete entry.status;
    }
    map[it.item_code] = entry;
  });
  return { data: map };
}
/**
 * นับจำนวนรายการ (ไม่รวมหัวข้อคั่น) ของแต่ละ module_key ที่ระบุ
 * คืนค่าเป็น object { moduleKey: จำนวน }
 */
export async function getModuleItemCounts(moduleKeys) {
  const { data, error } = await supabase
    .from('checklist_templates')
    .select('module_key, is_header')
    .in('module_key', moduleKeys);
  if (error) return { error: error.message };
  const counts = {};
  data.forEach((row) => {
    if (row.is_header) return;
    counts[row.module_key] = (counts[row.module_key] || 0) + 1;
  });
  return { data: counts };
}
/**
 * สรุปความพร้อมใช้งานแยกตามหมวด (สำหรับ Dashboard กราฟวงกลม)
 */
export async function getCategoryReadinessSummary() {
  const { data, error } = await supabase
    .from('category_readiness_summary')
    .select('*');
  if (error) return { error: error.message };
  return { data };
}

/**
 * รายการที่ใกล้หมดอายุ/หมดอายุแล้ว (สำหรับ Dashboard แจ้งเตือน)
 */
export async function getExpiringItems() {
  const { data, error } = await supabase
    .from('expiring_items_summary')
    .select('*')
    .order('expiry_date');
  if (error) return { error: error.message };
  return { data };
}
/**
 * ความพร้อมใช้งานแยกตาม category กรองตามช่วงเวลา
 * periodStart: ISO string ของจุดเริ่มต้นช่วงเวลา, หรือ null = ทั้งหมด (ไม่กรอง)
 */
export async function getReadinessByPeriod(periodStart) {
  const { data, error } = await supabase.rpc('dashboard_readiness_by_period', {
    p_start: periodStart || '1970-01-01T00:00:00Z',
  });
  if (error) return { error: error.message };
  return { data };
}

/**
 * รายจุดที่ไม่พร้อมใช้ ในช่วงเวลาที่กำหนด
 */
export async function getNotReadyByPeriod(periodStart) {
  const { data, error } = await supabase.rpc('dashboard_not_ready_by_period', {
    p_start: periodStart || '1970-01-01T00:00:00Z',
  });
  if (error) return { error: error.message };
  return { data };
}

/**
 * ความครบถ้วนของการตรวจรถพยาบาลตามรอบ (ประจำวัน/ประจำสัปดาห์)
 */
export async function getAmbulanceCompliance() {
  const { data, error } = await supabase.rpc('dashboard_ambulance_compliance');
  if (error) return { error: error.message };
  return { data };
}
/**
 * รายละเอียดทุกรายการที่ตรวจในช่วงเวลาที่กำหนด (สำหรับรายงานละเอียด)
 */
export async function getFullDetailByPeriod(periodStart) {
  const { data, error } = await supabase.rpc('dashboard_full_detail_by_period', {
    p_start: periodStart || '1970-01-01T00:00:00Z',
  });
  if (error) return { error: error.message };
  return { data };
}

/**
 * ปฏิทินตรวจประจำวัน/สัปดาห์ ของเดือนที่ระบุ (สำหรับรายงานปฏิทินการตรวจ)
 */
export async function getDailyCalendar(year, month) {
  const { data, error } = await supabase.rpc('dashboard_daily_calendar', { p_year: year, p_month: month });
  if (error) return { error: error.message };
  return { data };
}

export async function getWeeklyCalendar(year, month) {
  const { data, error } = await supabase.rpc('dashboard_weekly_calendar', { p_year: year, p_month: month });
  if (error) return { error: error.message };
  return { data };
}
/**
 * ดึง location พร้อม responsible_name (ใช้แทน getLocationsForRole เดิมตอนต้องการชื่อผู้รับผิดชอบด้วย)
 */
export async function getLocationsWithResponsible(role) {
  const { data, error } = await supabase
    .from('locations')
    .select('id, category, code, label, sort_order, allowed_roles, responsible_name')
    .contains('allowed_roles', [role])
    .order('sort_order');
  if (error) return { error: error.message };
  return { data };
}

/**
 * ผลตรวจล่าสุดของแต่ละ module_key ในแต่ละ location — คืนค่าเป็น { location_id: { module_key: status } }
 * (ใช้เทียบกับจำนวน module ทั้งหมดที่ location นั้นต้องตรวจ เพื่อรู้ว่า "ตรวจครบ" หรือยัง)
 */
export async function getLatestStatusByLocation(locationIds) {
  const { data, error } = await supabase
    .from('latest_inspection_per_location')
    .select('location_id, module_key, overall_status, submitted_at')
    .in('location_id', locationIds);
  if (error) return { error: error.message };

  // นับว่า "ตรวจแล้ว" เฉพาะการตรวจที่อยู่ในสัปดาห์นี้เท่านั้น (ขึ้นสัปดาห์ใหม่ทุกวันจันทร์)
  // ให้สอดคล้องกับกฎ "นับ/ตรวจครั้งเดียวต่อสัปดาห์" — การตรวจจากสัปดาห์ก่อนถือว่ายังไม่ตรวจของสัปดาห์นี้
  const BKK_OFFSET_MS = 7 * 60 * 60 * 1000;
  const nowBkk = new Date(Date.now() + BKK_OFFSET_MS);
  const dow = nowBkk.getUTCDay();
  const diffToMonday = dow === 0 ? 6 : dow - 1;
  const weekStartBkk = new Date(Date.UTC(nowBkk.getUTCFullYear(), nowBkk.getUTCMonth(), nowBkk.getUTCDate() - diffToMonday));
  const weekStartUtc = new Date(weekStartBkk.getTime() - BKK_OFFSET_MS);

  const map = {};
  data.forEach((row) => {
    if (new Date(row.submitted_at) < weekStartUtc) return; // เก่ากว่าสัปดาห์นี้ ไม่นับว่าตรวจแล้ว
    if (!map[row.location_id]) map[row.location_id] = {};
    map[row.location_id][row.module_key] = row.overall_status;
  });
  return { data: map };
}
/**
 * เช็คว่ารถพยาบาลแต่ละคันบันทึก "ประจำวัน" (ambulance_daily) ของวันนี้แล้วหรือยัง (เขตเวลาไทย)
 * คืนค่าเป็น object { location_id: true/false }
 */
export async function getAmbulanceDailyLoggedToday(locationIds) {
  const { data, error } = await supabase.rpc('get_ambulance_daily_logged_today', {
    p_location_ids: locationIds,
  });
  if (error) return { error: error.message };
  const map = {};
  data.forEach((row) => { map[row.location_id] = row.logged_today; });
  return { data: map };
}
/**
 * ดึงข้อมูล "ประจำวัน" (ambulance_daily) ที่บันทึกไว้ล่าสุดของวันนี้ (เขตเวลาไทย) ถ้ามี
 * คืนค่าเป็น { mileage, fuel_level, note } หรือ null ถ้ายังไม่มีการบันทึกวันนี้
 */
export async function getTodayDailyLog(locationCode) {
  const { data: location, error: locError } = await supabase
    .from('locations')
    .select('id')
    .eq('code', locationCode)
    .single();
  if (locError || !location) return { data: null };

  const { data, error } = await supabase
    .from('inspections')
    .select('mileage, fuel_level, note, submitted_at')
    .eq('location_id', location.id)
    .eq('module_key', 'ambulance_daily')
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return { data: null };

  const bkkDate = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
  if (bkkDate(data.submitted_at) !== today) return { data: null };

  return { data };
}
/**
 * รายการที่ผู้ใช้ปัจจุบันต้องรับทราบ (คันที่ตัวเองรับผิดชอบ ยังไม่รับทราบ)
 */
export async function getPendingAcknowledgments() {
  const { data, error } = await supabase.rpc('get_pending_acknowledgments');
  if (error) return { error: error.message };
  return { data };
}

/**
 * บันทึกการรับทราบ
 */
export async function acknowledgeInspection(inspectionId, userId) {
  const { error } = await supabase
    .from('inspection_acknowledgments')
    .insert({ inspection_id: inspectionId, acknowledged_by: userId });
  if (error) return { error: error.message };
  return { success: true };
}

/**
 * สรุปสถานะรับทราบต่อคัน (สำหรับ Admin Dashboard)
 */
export async function getAcknowledgmentSummary(periodStart) {
  const { data, error } = await supabase.rpc('get_acknowledgment_summary', {
    p_start: periodStart || '1970-01-01T00:00:00Z',
  });
  if (error) return { error: error.message };
  return { data };
}
/**
 * วันหยุดนักขัตฤกษ์ในเดือนที่ระบุ (สำหรับเว้นวันหยุดในรายงานตารางรายเดือน)
 * คืนค่าเป็น array ของ "วันที่" (1-31)
 */
export async function getPublicHolidays(year, month) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  const { data, error } = await supabase
    .from('public_holidays')
    .select('holiday_date')
    .gte('holiday_date', start)
    .lte('holiday_date', end);
  if (error) return { error: error.message };
  const days = data.map((row) => Number(row.holiday_date.slice(8, 10)));
  return { data: days };
}

/**
 * ดึงรายการยา/เวชภัณฑ์/อุปกรณ์ที่มีปัญหาทั้งหมด (ใกล้หมดอายุ, หมดอายุ, ไม่ครบ) จากการตรวจล่าสุดของทุกจุด
 * ใช้สำหรับรายงานสรุปภาพรวมปัญหาแยกตาม station
 */
export async function getAllProblemItems() {
  const { data, error } = await supabase.rpc('get_all_problem_items');
  if (error) return { error: error.message };
  return { data: data || [] };
}

/**
 * ดึงข้อมูล "บันทึกประจำวัน" (ambulance_daily) ทั้งเดือนของคันรถหนึ่งๆ สำหรับรายงานตารางรายเดือน
 * คืนค่าเป็น { locationLabel, entries: [{day, inspector_name, mileage, fuel_level, note, overall_status}] }
 */
export async function getAmbulanceDailyLogCalendar(locationCode, year, month) {
  const { data: location, error: locError } = await supabase
    .from('locations')
    .select('label')
    .eq('code', locationCode)
    .single();
  if (locError || !location) return { error: locError?.message || 'ไม่พบสถานที่' };

  const { data, error } = await supabase.rpc('get_ambulance_daily_log_calendar', {
    p_location_code: locationCode,
    p_year: year,
    p_month: month,
  });
  if (error) return { error: error.message };

  return { data: { locationLabel: location.label, entries: data || [] } };
}

/**
 * ดึงข้อมูลตารางเช็คลิสต์รายเดือน (รายการ x วันที่) ของจุด+โมดูลหนึ่งๆ
 * คืนค่าเป็น { locationLabel, items: [{item_id, item_name, standard_qty}], statusMap: {"itemId-day": "OK"/"NOT_OK"/...} }
 */
export async function getItemCalendarData(locationCode, moduleKey, year, month) {
  const { data: location, error: locError } = await supabase
    .from('locations')
    .select('label')
    .eq('code', locationCode)
    .single();
  if (locError || !location) return { error: locError?.message || 'ไม่พบสถานที่' };

  const { data, error } = await supabase.rpc('get_item_calendar_data', {
    p_location_code: locationCode,
    p_module_key: moduleKey,
    p_year: year,
    p_month: month,
  });
  if (error) return { error: error.message };

  const itemsMap = {};
  const statusMap = {};
  data.forEach((row) => {
    if (!itemsMap[row.item_id]) {
      itemsMap[row.item_id] = { item_id: row.item_id, item_name: row.item_name, standard_qty: row.standard_qty, sort_order: row.sort_order };
    }
    if (row.day) statusMap[`${row.item_id}-${row.day}`] = row.status;
  });
  const items = Object.values(itemsMap).sort((a, b) => a.sort_order - b.sort_order);

  return { data: { locationLabel: location.label, items, statusMap } };
}
/**
 * ดึงรายการที่ "ไม่พร้อมใช้" (NOT_OK) ของการตรวจครั้งหนึ่งๆ สำหรับหน้ารายละเอียดใน Dashboard
 */
export async function getInspectionProblemItems(inspectionId) {
  const { data, error } = await supabase.rpc('get_inspection_problem_items', {
    p_inspection_id: inspectionId,
  });
  if (error) return { error: error.message };
  return { data };
}

/**
 * ===== หน้า "เปรียบเทียบตามหมวด" =====
 */
export async function getCategoryLocationSummary(category, periodStart) {
  const { data, error } = await supabase.rpc('get_category_location_summary', {
    p_category: category,
    p_start: periodStart || '1970-01-01T00:00:00Z',
  });
  if (error) return { error: error.message };
  return { data };
}

export async function getCategoryReadinessTrend(category, days = 14) {
  const { data, error } = await supabase.rpc('get_category_readiness_trend', {
    p_category: category,
    p_days: days,
  });
  if (error) return { error: error.message };
  return { data };
}

export async function getOverallReadinessTrend(days = 14) {
  const { data, error } = await supabase.rpc('get_overall_readiness_trend', {
    p_days: days,
  });
  if (error) return { error: error.message };
  return { data };
}

export async function getCategoryTopProblems(category, periodStart, limit = 8) {
  const { data, error } = await supabase.rpc('get_category_top_problems', {
    p_category: category,
    p_start: periodStart || '1970-01-01T00:00:00Z',
    p_limit: limit,
  });
  if (error) return { error: error.message };
  return { data };
}

export async function getCategoryModuleBreakdown(category) {
  const { data, error } = await supabase.rpc('get_category_module_breakdown', {
    p_category: category,
  });
  if (error) return { error: error.message };
  return { data };
}