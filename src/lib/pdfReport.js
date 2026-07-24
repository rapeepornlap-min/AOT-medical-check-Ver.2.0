import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { sarabunRegularBase64 } from '../assets/fonts/sarabunRegularBase64';
import { sarabunBoldBase64 } from '../assets/fonts/sarabunBoldBase64';
import { getReadinessByPeriod, getNotReadyByPeriod, getAmbulanceCompliance, getExpiringItems } from './checklist';

const NAVY = '#1B3A6B';
const OK = '#1D9A63';
const WARN = '#B8760A';
const BAD = '#D64545';

const CATEGORY_LABELS = { AMBULANCE: 'รถพยาบาล', FIELD_BAG: 'กระเป๋าออกตรวจฉุกเฉิน', EMERGENCY_BAG: 'กระเป๋า บ.ฉุกเฉิน', STATION: 'Station' };

function registerThaiFont(doc) {
  doc.addFileToVFS('Sarabun-Regular.ttf', sarabunRegularBase64);
  doc.addFont('Sarabun-Regular.ttf', 'Sarabun', 'normal');
  doc.addFileToVFS('Sarabun-Bold.ttf', sarabunBoldBase64);
  doc.addFont('Sarabun-Bold.ttf', 'Sarabun', 'bold');
  doc.setFont('Sarabun', 'normal');
}

function monthLabel(date) {
  return date.toLocaleDateString('th-TH', { year: 'numeric', month: 'long' });
}

export async function generateMonthlyReportPDF() {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [sumRes, notReadyRes, compRes, expRes] = await Promise.all([
    getReadinessByPeriod(periodStart),
    getNotReadyByPeriod(periodStart),
    getAmbulanceCompliance(),
    getExpiringItems(),
  ]);

  const summary = sumRes.data || [];
  const notReady = notReadyRes.data || [];
  const compliance = compRes.data || [];
  const expiring = expRes.data || [];

  const totalReady = summary.reduce((s, r) => s + Number(r.ready_count), 0);
  const totalNotReady = summary.reduce((s, r) => s + Number(r.not_ready_count), 0);
  const total = totalReady + totalNotReady;
  const readyPct = total > 0 ? Math.round((totalReady / total) * 100) : 0;

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  registerThaiFont(doc);

  // ---- หัวรายงาน ----
  doc.setFontSize(16);
  doc.setFont('Sarabun', 'bold');
  doc.setTextColor(NAVY);
  doc.text('รายงานสรุปความพร้อมใช้งานอุปกรณ์การแพทย์', 18, 20);
  doc.setFontSize(10);
  doc.setFont('Sarabun', 'normal');
  doc.setTextColor('#6B7686');
  doc.text(`ประจำเดือน${monthLabel(now)} · ฝ่ายการแพทย์ ท่าอากาศยานสุวรรณภูมิ`, 18, 27);
  doc.setDrawColor(NAVY);
  doc.setLineWidth(0.6);
  doc.line(18, 31, 192, 31);

  let y = 40;

  // ---- ภาพรวม ----
  doc.setFont('Sarabun', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(NAVY);
  doc.text('1. สรุปภาพรวมทั้งเดือน', 18, y);
  y += 6;
  autoTable(doc, {
    startY: y,
    head: [['ความพร้อมใช้งานเฉลี่ย', 'จุดตรวจทั้งหมด', 'พร้อมใช้', 'ไม่พร้อมใช้']],
    body: [[`${total > 0 ? readyPct + '%' : 'ไม่มีข้อมูล'}`, `${total} ครั้ง`, `${totalReady} ครั้ง`, `${totalNotReady} ครั้ง`]],
    styles: { font: 'Sarabun', fontSize: 9.5, halign: 'center' },
    headStyles: { fillColor: NAVY, textColor: '#ffffff', font: 'Sarabun', fontStyle: 'bold' },
    margin: { left: 18, right: 18 },
  });
  y = doc.lastAutoTable.finalY + 10;

  // ---- แยกตามหมวด ----
  doc.setFont('Sarabun', 'bold');
  doc.setFontSize(12);
  doc.text('2. ความพร้อมใช้งานแยกตามหมวด', 18, y);
  y += 6;
  autoTable(doc, {
    startY: y,
    head: [['หมวด', 'พร้อมใช้', 'ไม่พร้อมใช้', 'รวม', '% พร้อมใช้']],
    body: summary.length > 0 ? summary.map((row) => {
      const t = Number(row.ready_count) + Number(row.not_ready_count);
      const p = t > 0 ? Math.round((Number(row.ready_count) / t) * 100) : 0;
      return [CATEGORY_LABELS[row.category] || row.category, row.ready_count, row.not_ready_count, t, `${p}%`];
    }) : [['ไม่มีข้อมูลในเดือนนี้', '', '', '', '']],
    styles: { font: 'Sarabun', fontSize: 9.5, halign: 'center' },
    columnStyles: { 0: { halign: 'left' } },
    headStyles: { fillColor: NAVY, textColor: '#ffffff', font: 'Sarabun', fontStyle: 'bold' },
    margin: { left: 18, right: 18 },
  });
  y = doc.lastAutoTable.finalY + 10;

  // ---- ความครบถ้วนตามรอบ ----
  doc.setFont('Sarabun', 'bold');
  doc.setFontSize(12);
  doc.text('3. ความครบถ้วนของการตรวจรถพยาบาลตามรอบ', 18, y);
  y += 6;
  const compLabels = { ambulance_daily: 'ตรวจประจำวัน', ambulance_weekly: 'ตรวจประจำสัปดาห์' };
  autoTable(doc, {
    startY: y,
    head: [['รอบตรวจ', 'ทำครบแล้ว', 'ทั้งหมด', 'อัตราความครบถ้วน']],
    body: compliance.map((row) => [
      compLabels[row.module_key] || row.module_key,
      row.done_count, row.total_count,
      row.total_count > 0 ? `${Math.round((row.done_count / row.total_count) * 100)}%` : '-',
    ]),
    styles: { font: 'Sarabun', fontSize: 9.5, halign: 'center' },
    columnStyles: { 0: { halign: 'left' } },
    headStyles: { fillColor: NAVY, textColor: '#ffffff', font: 'Sarabun', fontStyle: 'bold' },
    margin: { left: 18, right: 18 },
  });
  y = doc.lastAutoTable.finalY + 10;

  // ---- รายจุดที่ไม่พร้อมใช้ ----
  if (y > 240) { doc.addPage(); y = 20; }
  doc.setFont('Sarabun', 'bold');
  doc.setFontSize(12);
  doc.text('4. รายจุดที่ไม่พร้อมใช้ในเดือนนี้', 18, y);
  y += 6;
  autoTable(doc, {
    startY: y,
    head: [['จุดตรวจ / โมดูล', 'จำนวนรายการที่ไม่พร้อมใช้']],
    body: notReady.length > 0
      ? notReady.map((it) => [`${it.location_label} · ${it.module_key}`, it.problem_count])
      : [['ไม่มีจุดที่ต้องแก้ไขในเดือนนี้', '']],
    styles: { font: 'Sarabun', fontSize: 9.5 },
    columnStyles: { 1: { halign: 'center' } },
    headStyles: { fillColor: NAVY, textColor: '#ffffff', font: 'Sarabun', fontStyle: 'bold' },
    margin: { left: 18, right: 18 },
  });
  y = doc.lastAutoTable.finalY + 10;

  // ---- รายการหมดอายุ ----
  if (y > 230) { doc.addPage(); y = 20; }
  doc.setFont('Sarabun', 'bold');
  doc.setFontSize(12);
  doc.text('5. รายการยา/เวชภัณฑ์ที่ใกล้หมดอายุ / หมดอายุ', 18, y);
  y += 6;
  autoTable(doc, {
    startY: y,
    head: [['รายการ', 'จุดที่พบ', 'วันหมดอายุ', 'สถานะ']],
    body: expiring.length > 0
      ? expiring.map((it) => [it.item_name, it.location_label, it.expiry_date, it.status === 'EXPIRED' ? 'หมดอายุแล้ว' : 'ใกล้หมดอายุ'])
      : [['ไม่มีรายการใกล้หมดอายุ', '', '', '']],
    styles: { font: 'Sarabun', fontSize: 9.5 },
    columnStyles: { 2: { halign: 'center' }, 3: { halign: 'center' } },
    headStyles: { fillColor: NAVY, textColor: '#ffffff', font: 'Sarabun', fontStyle: 'bold' },
    margin: { left: 18, right: 18 },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 3) {
        if (data.cell.raw === 'หมดอายุแล้ว') { data.cell.styles.textColor = BAD; }
        else if (data.cell.raw === 'ใกล้หมดอายุ') { data.cell.styles.textColor = WARN; }
      }
    },
  });

  // ---- Footer ----
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('Sarabun', 'normal');
    doc.setFontSize(8);
    doc.setTextColor('#9AA5B5');
    doc.text(`จัดทำโดยระบบ AOT Medical Check · พิมพ์เมื่อ ${now.toLocaleDateString('th-TH')}`, 18, 289);
  }

  doc.save(`รายงานความพร้อมใช้งาน_${monthLabel(now).replace(' ', '_')}.pdf`);
}