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
export async function getChecklistItems(moduleKey) {
  const { data, error } = await supabase
    .from('checklist_templates')
    .select('*')
    .eq('module_key', moduleKey)
    .order('sort_order');
  if (error) return { error: error.message };
  return { data };
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
    .select('id')
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

  const map = {};
  items.forEach((it) => { map[it.item_code] = it; });
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
    .select('location_id, module_key, overall_status')
    .in('location_id', locationIds);
  if (error) return { error: error.message };
  const map = {};
  data.forEach((row) => {
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