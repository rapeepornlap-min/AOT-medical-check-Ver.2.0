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