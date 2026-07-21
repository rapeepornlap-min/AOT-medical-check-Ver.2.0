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