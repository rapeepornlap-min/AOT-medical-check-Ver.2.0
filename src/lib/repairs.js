// src/lib/repairs.js — ระบบแจ้งซ่อม
// การมองเห็น/สิทธิ์ทั้งหมดคุมที่ฐานข้อมูล (RLS): ผู้แจ้งเห็นของตัวเอง, ผู้ดูแลงานซ่อมเห็นเฉพาะฝ่ายตัวเอง, ADMIN เห็นทั้งหมด
import { supabase } from './supabaseClient';

export const URGENCY_LABELS = { NORMAL: 'ปกติ', URGENT: 'ด่วน', CRITICAL: 'ด่วนมาก' };
export const STATUS_LABELS = { PENDING: 'รอดำเนินการ', IN_PROGRESS: 'กำลังซ่อม', DONE: 'เสร็จสิ้น', CANCELLED: 'ยกเลิก' };
export const DEPARTMENT_LABELS = { NURSING: 'ฝ่ายพยาบาล', EMR_EMT: 'ฝ่าย EMR/EMT' };

export async function uploadRepairPhoto(file) {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `repairs/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from('inspection-photos').upload(path, file, { upsert: false });
  if (error) return { error: error.message };
  const { data } = supabase.storage.from('inspection-photos').getPublicUrl(path);
  return { url: data.publicUrl };
}

export async function createRepairRequest({ user, locationId, locationCode, locationLabel, moduleKey, itemCode, itemName, description, urgency, photoUrl }) {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData?.session) return { error: 'เซสชันหมดอายุ กรุณาออกจากระบบแล้วเข้าสู่ระบบใหม่' };
  const { error } = await supabase.from('repair_requests').insert({
    location_id: locationId || null,
    location_code: locationCode || null,
    location_label: locationLabel,
    module_key: moduleKey || null,
    item_code: itemCode || null,
    item_name: itemName,
    description,
    urgency: urgency || 'NORMAL',
    photo_url: photoUrl || null,
    reporter_id: user.id,
    reporter_name: user.name,
  });
  if (error) return { error: 'แจ้งซ่อมไม่สำเร็จ: ' + error.message };
  return { success: true };
}

// คืนรายการที่ผู้ใช้คนนี้มีสิทธิ์เห็น (ฐานข้อมูลกรองให้แล้ว) เรียงใหม่ไปเก่า
export async function getRepairRequests() {
  const { data, error } = await supabase
    .from('repair_requests')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) return { error: error.message };
  return { data: data || [] };
}

// ฝ่ายที่ผู้ใช้เป็นผู้ดูแลงานซ่อม (null = ไม่ใช่ผู้ดูแล)
export async function getMyRepairManagerDept(userId) {
  const { data, error } = await supabase.from('users').select('repair_manager_dept').eq('id', userId).single();
  if (error) return { data: null };
  return { data: data?.repair_manager_dept || null };
}

export async function updateRepairStatus(id, status, handlerNote) {
  const patch = { status };
  if (handlerNote !== undefined) patch.handler_note = handlerNote || null;
  const { data, error } = await supabase.from('repair_requests').update(patch).eq('id', id).select('id');
  if (error) return { error: 'อัปเดตไม่สำเร็จ: ' + error.message };
  if (!data || data.length === 0) return { error: 'ไม่มีสิทธิ์อัปเดตรายการนี้' };
  return { success: true };
}