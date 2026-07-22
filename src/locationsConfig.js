// ==========================================================================
// locationsConfig.js
// ผูก location (จากตาราง locations) เข้ากับกลุ่ม module_key ย่อยๆ (จาก checklist_templates)
// เนื่องจากฐานข้อมูลไม่มีตารางเชื่อม locations <-> module_key โดยตรง
// จึงกำหนด mapping นี้ไว้ในแอปแทน — แก้ไขที่นี่ได้เลยถ้าจำนวนกลุ่มเปลี่ยนในอนาคต
// ==========================================================================

export const ROLES = {
  NURSE: { key: 'NURSE', label: 'พยาบาล (Nurse)' },
  EMR_EMT: { key: 'EMR_EMT', label: 'เจ้าหน้าที่ EMR/EMT' },
  PN: { key: 'PN', label: 'ผู้ช่วยพยาบาล (PN)' },
  PHARMACIST: { key: 'PHARMACIST', label: 'เภสัชกร (Pharmacist)' },
  ADMIN: { key: 'ADMIN', label: 'ผู้ดูแลระบบ (Admin)' },
};

// รถพยาบาล: โมดูลย่อยคงที่ 4 อย่าง (daily ไม่ผูก module_key เพราะเป็นฟอร์มธรรมดา)
export const AMBULANCE_MODULES = [
  { id: 'daily', label: 'บันทึกประจำวัน', subtitle: 'ผู้ตรวจ เลขไมล์ ปริมาณน้ำมัน และสรุปสถานะ', moduleKey: null },
  { id: 'weekly', label: 'ตรวจสภาพรถประจำสัปดาห์', subtitle: '19 รายการ — สภาพเครื่องยนต์และตัวรถ', moduleKey: 'ambulance_weekly' },
  { id: 'equipment', label: 'รายการอุปกรณ์', subtitle: '33 รายการ — ครบ/ชำรุด', moduleKey: 'ambulance_equipment' },
  { id: 'medication', label: 'เวชภัณฑ์', subtitle: 'ติดตามวันหมดอายุ', moduleKey: 'ambulance_medication' },
];

// กลุ่ม module_key ย่อยของแต่ละ location (key = locations.code)
// allowedRoles (ถ้าใส่ไว้) = จำกัดเฉพาะบทบาทนี้เท่านั้นที่เห็นกลุ่มนี้
// accent (ถ้าใส่ไว้) = สีแถบซ้ายของการ์ด (ใช้ทั้งหน้าเลือกเมนูและหน้ารายการยาแต่ละตัว)
// ADMIN ใส่ไว้ในทุกกลุ่มเสมอ เพราะ admin ต้องดูได้ทุกรายการ (แต่บันทึก/แก้ไขไม่ได้ — คุมที่ RLS + UI แยกอีกชั้น)
export const LOCATION_MODULE_GROUPS = {
  medicine_bag: [
    { moduleKey: 'medicine_bag_oral', label: 'ยารับประทาน', accent: '#1D9A63' },
    { moduleKey: 'medicine_bag_external', label: 'ยาใช้ภายนอก', accent: '#1D9A63' },
    { moduleKey: 'medicine_bag_injectable', label: 'ยาฉีด', accent: '#B8760A' },
    { moduleKey: 'medicine_bag_highAlert', label: 'ยา High Alert Drug', accent: '#D64545' },
    { moduleKey: 'medicine_bag_fluids', label: 'น้ำเกลือและเวชภัณฑ์' },
    { moduleKey: 'medicine_bag_supplies', label: 'อุปกรณ์ให้สารน้ำและทำแผล' },
    { moduleKey: 'medicine_bag_instruments', label: 'เครื่องมือตรวจร่างกายและอุปกรณ์อื่นๆ' },
  ],
  pediatric_bag: [
    { moduleKey: 'pediatric_bag_syrup', label: 'ยาน้ำเด็ก' },
    { moduleKey: 'pediatric_bag_supplies', label: 'อุปกรณ์และของใช้' },
  ],
  emergency_bag: [
    { moduleKey: 'field_emergency_bag_front', label: 'กระเป๋าช่องหน้า' },
    { moduleKey: 'field_emergency_bag_largePocket', label: 'กระเป๋าช่องใหญ่' },
    { moduleKey: 'field_emergency_bag_sides', label: 'กระเป๋าด้านข้าง 2 ข้าง' },
    { moduleKey: 'field_emergency_bag_topSmall', label: 'กระเป๋าเล็กด้านบน' },
    { moduleKey: 'field_emergency_bag_blueSmall', label: 'กระเป๋าเล็กสีน้ำเงิน' },
    { moduleKey: 'field_emergency_bag_greenSmall', label: 'กระเป๋าเล็กสีเขียว' },
    { moduleKey: 'field_emergency_bag_redSmall', label: 'กระเป๋าเล็กสีแดง' },
    { moduleKey: 'field_emergency_bag_oxygen', label: 'กระเป๋าออกซิเจน' },
    { moduleKey: 'field_emergency_bag_defib', label: 'เครื่อง Defibrillator' },
  ],
  aircraft_bag: [
    { moduleKey: 'aircraft_set_type1', label: 'ชุดที่ 1/1, 2/1' },
    { moduleKey: 'aircraft_set_type2', label: 'ชุดที่ 1/2, 2/2, 3/2' },
    { moduleKey: 'aircraft_set_type3', label: 'ชุดที่ 1/3, 2/3, 3/3' },
    { moduleKey: 'aircraft_medco', label: 'Med-Co' },
    { moduleKey: 'aircraft_care_area', label: 'Care Area' },
    { moduleKey: 'aircraft_rendezvous', label: 'Rendezvous' },
    { moduleKey: 'aircraft_loading', label: 'Loading' },
  ],
  sat1: [
    { moduleKey: 'sat1_emt', label: 'เครื่อง/อุปกรณ์ EMR-EMT', allowedRoles: ['EMR_EMT', 'ADMIN'] },
    { moduleKey: 'sat1_buggy', label: 'รถไฟฟ้า (รถกอล์ฟ)', allowedRoles: ['EMR_EMT', 'ADMIN'] },
    { moduleKey: 'sat1_nurse', label: 'ฝ่ายพยาบาล', allowedRoles: ['NURSE', 'ADMIN'] },
    { moduleKey: 'sat1_pharma_tablet', label: 'คลังยา Sat-1 · ยาเม็ด', allowedRoles: ['PHARMACIST', 'PN', 'ADMIN'] },
    { moduleKey: 'sat1_pharma_injection', label: 'คลังยา Sat-1 · ยาฉีดสามัญ', allowedRoles: ['PHARMACIST', 'PN', 'ADMIN'] },
    { moduleKey: 'sat1_pharma_external', label: 'คลังยา Sat-1 · ยาใช้ภายนอก', allowedRoles: ['PHARMACIST', 'PN', 'ADMIN'] },
    { moduleKey: 'sat1_pharma_pediatric_syrup', label: 'คลังยา Sat-1 · ยาน้ำเด็ก', allowedRoles: ['PHARMACIST', 'PN', 'ADMIN'] },
  ],
  concg: [
    { moduleKey: 'concg_emt', label: 'เครื่อง/อุปกรณ์ EMR-EMT', allowedRoles: ['EMR_EMT', 'ADMIN'] },
    { moduleKey: 'concg_nurse', label: 'ฝ่ายพยาบาล (Emergency Cart)', allowedRoles: ['NURSE', 'ADMIN'] },
    { moduleKey: 'auto_pulse', label: 'เครื่อง Auto Pulse', allowedRoles: ['EMR_EMT', 'ADMIN'] },
  ],
  er: [
    { moduleKey: 'station_er_emergency_cart', label: 'Emergency Cart (ฝ่ายพยาบาล)', allowedRoles: ['NURSE', 'ADMIN'] },
    { moduleKey: 'station_er_emt', label: 'เครื่อง/อุปกรณ์ EMR-EMT', allowedRoles: ['EMR_EMT', 'ADMIN'] },
    { moduleKey: 'auto_pulse', label: 'เครื่อง Auto Pulse', allowedRoles: ['EMR_EMT', 'ADMIN'] },
  ],
  observe: [
    { moduleKey: 'station_observe', label: 'รายการตรวจ Station Observe' },
  ],
};

// ป้ายชื่อหมวดใหญ่ + ลำดับที่แสดงในเมนูหลัก
// key ต้องตรงกับค่าจริงในตาราง locations.category (ตาม constraint locations_category_check
// ซึ่งอนุญาตแค่ 4 ค่า: AMBULANCE, FIELD_BAG, EMERGENCY_BAG, STATION)
// FIELD_BAG = "กระเป๋าออกตรวจฉุกเฉิน" ครอบคลุม 3 location: กระเป๋ายา / กระเป๋าฉุกเฉิน (ภาคพื้น) / กระเป๋ายาเด็ก
// EMERGENCY_BAG = "กระเป๋า บ.ฉุกเฉิน" (บนอากาศยาน) เดี่ยว
export const CATEGORY_META = {
  AMBULANCE: { num: '1', label: 'รถพยาบาล', subtitle: 'ตรวจสภาพความพร้อมใช้งานของรถพยาบาล ALS', order: 1 },
  FIELD_BAG: { num: '2', label: 'กระเป๋าออกตรวจฉุกเฉิน', subtitle: 'กระเป๋ายา, กระเป๋าฉุกเฉิน, กระเป๋ายาเด็ก', order: 2 },
  EMERGENCY_BAG: { num: '3', label: 'กระเป๋า บ.ฉุกเฉิน', subtitle: 'ตรวจความพร้อมกระเป๋าฉุกเฉินบนอากาศยาน', order: 3 },
  STATION: { num: '4', label: 'Station', subtitle: 'ตรวจความพร้อมของสถานีพยาบาลประจำจุด', order: 4 },
};
