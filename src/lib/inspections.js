// src/lib/inspections.js
import { supabase } from './supabaseClient';

export async function saveInspection({
  locationCode,
  moduleKey,
  inspectorId,
  inspectorName,
  overallStatus,
  items,
  mileage,
  fuelLevel,
  note,
}) {
  const { data: location, error: locError } = await supabase
    .from('locations')
    .select('id')
    .eq('code', locationCode)
    .single();

  if (locError || !location) {
    return { error: ไม่พบจุดตรวจสอบ (location code: ${locationCode}) กรุณาตรวจสอบข้อมูลใน locations ก่อน };
  }

  const { data: inspection, error: insError } = await supabase
    .from('inspections')
    .insert({
      location_id: location.id,
      module_key: moduleKey,
      inspector_id: inspectorId,
      inspector_name: inspectorName,
      overall_status: overallStatus,
      mileage: mileage || null,
      fuel_level: fuelLevel || null,
      note: note || null,
    })
    .select('id')
    .single();

  if (insError) {
    return { error: 'บันทึกไม่สำเร็จ: ' + insError.message };
  }

  const itemRows = items.map((it) => ({
    inspection_id: inspection.id,
    item_code: it.code,
    item_name: it.name,
    status: it.status || null,
    expiry_date: it.expiryDate || null,
    amount: it.amount || null,
    note: it.note || null,
  }));

  const { error: itemsError } = await supabase.from('inspection_items').insert(itemRows);
  if (itemsError) {
    return { error: 'บันทึกรายการย่อยไม่สำเร็จ: ' + itemsError.message };
  }

  return { success: true, inspectionId: inspection.id };
}

export async function getCategoryReadinessSummary() {
  const { data, error } = await supabase.from('category_readiness_summary').select('*');
  if (error) return { error: error.message };
  return { data };
}

export async function getExpiringItems() {
  const { data, error } = await supabase.from('expiring_items_summary').select('*');
  if (error) return { error: error.message };
  return { data };
}