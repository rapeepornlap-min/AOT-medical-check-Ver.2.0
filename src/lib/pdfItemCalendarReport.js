import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { sarabunRegularBase64 } from '../assets/fonts/sarabunRegularBase64';
import { sarabunBoldBase64 } from '../assets/fonts/sarabunBoldBase64';
import { getItemCalendarData, getPublicHolidays } from './checklist';
import { sharePDF } from './pdfShare';
import { drawCheckIcon } from './pdfCheckmark';

const NAVY = '#1B3A6B';
const OK = '#1D9A63';
const BAD = '#D64545';
const WARN = '#B8760A';
const WEEKEND_BG = '#D9D9D9';
const WEEKEND_HEAD_BG = '#8B93A3';

function registerThaiFont(doc) {
  doc.addFileToVFS('Sarabun-Regular.ttf', sarabunRegularBase64);
  doc.addFont('Sarabun-Regular.ttf', 'Sarabun', 'normal');
  doc.addFileToVFS('Sarabun-Bold.ttf', sarabunBoldBase64);
  doc.addFont('Sarabun-Bold.ttf', 'Sarabun', 'bold');
  doc.setFont('Sarabun', 'normal');
}

function monthLabel(year, month) {
  return new Date(year, month - 1, 1).toLocaleDateString('th-TH', { year: 'numeric', month: 'long' });
}

/**
 * วาดตารางเช็คลิสต์ 1 ชุด (1 โมดูล/กระเป๋า) ลงในหน้าปัจจุบันของ doc
 * ใช้ร่วมกันทั้งรายงานแบบทีละชุด (generateItemCalendarPDF) และแบบรวมทุกชุด (generateLocationCalendarPDF)
 */
function drawModuleSection(doc, { year, month, locationLabel, moduleLabel, items, statusMap }) {
  const daysInMonth = new Date(year, month, 0).getDate();

  doc.setFontSize(14);
  doc.setFont('Sarabun', 'bold');
  doc.setTextColor(NAVY);
  doc.text(`Check list ${locationLabel} — ${moduleLabel}`, 8, 12);
  doc.setFontSize(10);
  doc.setFont('Sarabun', 'normal');
  doc.setTextColor('#6B7686');
  doc.text(`ประจำเดือน ${monthLabel(year, month)}`, 8, 18);

  const head = ['No.', 'รายการ', 'จำนวน', ...Array.from({ length: daysInMonth }, (_, i) => String(i + 1))];

  // จัดกลุ่มวันเป็น "สัปดาห์" ตามปฏิทิน (ขึ้นสัปดาห์ใหม่ทุกวันอาทิตย์)
  const dayToWeek = {};
  let weekIdx = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    if (dow === 0 && d !== 1) weekIdx += 1;
    dayToWeek[d] = weekIdx;
  }

  const weekendDays = new Set();
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    if (dow === 0 || dow === 6) weekendDays.add(d);
  }
  // วันหยุด = เสาร์-อาทิตย์ หรือวันหยุดนักขัตฤกษ์ — เว้นจากการเติมเครื่องหมายถูกอัตโนมัติของทั้งสัปดาห์
  const holidayDays = drawModuleSection._holidayDays || new Set();
  const nonWorkDays = new Set([...weekendDays, ...holidayDays]);

  const body = items.map((it, idx) => {
    const okWeeks = new Set();
    const nearWeeks = new Set();
    for (let d = 1; d <= daysInMonth; d++) {
      if (nonWorkDays.has(d)) continue;
      const s = statusMap[`${it.item_id}-${d}`];
      if (s === 'OK') okWeeks.add(dayToWeek[d]);
      else if (s === 'NEAR') nearWeeks.add(dayToWeek[d]);
    }
    return [
      String(idx + 1),
      it.item_name,
      it.standard_qty || '',
      ...Array.from({ length: daysInMonth }, (_, i) => {
        const day = i + 1;
        const status = statusMap[`${it.item_id}-${day}`];
        if (nonWorkDays.has(day)) {
          if (status === 'OK') return 'OK';
          if (status === 'NEAR') return 'NEAR';
          if (status === 'NOT_OK' || status === 'EXPIRED') return 'X';
          return '-';
        }
        if (nearWeeks.has(dayToWeek[day])) return 'NEAR';
        if (status === 'OK' || okWeeks.has(dayToWeek[day])) return 'OK';
        if (status === 'NOT_OK' || status === 'EXPIRED') return 'X';
        return '';
      }),
    ];
  });

  autoTable(doc, {
    startY: 24,
    head: [head],
    body,
    styles: { font: 'Sarabun', fontSize: 6.5, halign: 'center', cellPadding: 1 },
    headStyles: { fillColor: NAVY, textColor: '#ffffff', font: 'Sarabun', fontStyle: 'bold', fontSize: 6.5 },
    columnStyles: {
      0: { cellWidth: 8 },
      1: { halign: 'left', cellWidth: 42 },
      2: { cellWidth: 14 },
    },
    margin: { left: 8, right: 8 },
    didParseCell: (data) => {
      const colIdx = data.column.index;
      const day = colIdx - 2;
      if (data.section === 'body' && colIdx >= 3) {
        if (data.cell.raw === 'OK') data.cell.text = [];
        else if (data.cell.raw === 'X') data.cell.styles.textColor = BAD;
        else if (data.cell.raw === 'NEAR') data.cell.text = [];
        else if (data.cell.raw === '-') data.cell.styles.textColor = '#9AA5B5';
        if (nonWorkDays.has(day)) data.cell.styles.fillColor = WEEKEND_BG;
      }
      if (data.section === 'head' && colIdx >= 3 && nonWorkDays.has(day)) {
        data.cell.styles.fillColor = WEEKEND_HEAD_BG;
      }
    },
    didDrawCell: (data) => {
      const colIdx = data.column.index;
      if (data.section === 'body' && colIdx >= 3 && data.cell.raw === 'OK') {
        drawCheckIcon(doc, data.cell, OK);
      }
      if (data.section === 'body' && colIdx >= 3 && data.cell.raw === 'NEAR') {
        drawCheckIcon(doc, data.cell, WARN);
      }
    },
  });
}

function addFootnotes(doc, now) {
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('Sarabun', 'normal');
    doc.setFontSize(8);
    doc.setTextColor('#9AA5B5');
    doc.text('เครื่องหมาย "-" หมายถึงวันหยุด (เสาร์-อาทิตย์/วันนักขัตฤกษ์) · เครื่องหมายถูกสีส้ม หมายถึงใกล้หมดอายุ — ติ๊ก 1 วันในสัปดาห์ถือว่าครบทั้งสัปดาห์ (เฉพาะวันทำงาน)', 8, 200);
    doc.text(`จัดทำโดยระบบ AOT Medical Readiness System · พิมพ์เมื่อ ${now.toLocaleDateString('th-TH')} · หน้า ${i}/${pageCount}`, 8, 205);
  }
}

export async function generateItemCalendarPDF(locationCode, moduleKey, moduleLabel) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [res, holidayRes] = await Promise.all([
    getItemCalendarData(locationCode, moduleKey, year, month),
    getPublicHolidays(year, month),
  ]);
  if (res.error) {
    alert('ดึงข้อมูลไม่สำเร็จ: ' + res.error);
    return;
  }
  const { locationLabel, items, statusMap } = res.data;
  const holidayDays = new Set(holidayRes.data || []);

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  registerThaiFont(doc);

  drawModuleSection._holidayDays = holidayDays;
  drawModuleSection(doc, { year, month, locationLabel, moduleLabel, items, statusMap });
  addFootnotes(doc, now);

  await sharePDF(doc, `Checklist_${locationLabel}_${moduleLabel}_${monthLabel(year, month).replace(' ', '_')}.pdf`);
}

/**
 * รายงานตารางรายเดือนแบบรวมทุกกระเป๋า/ชุดของจุดเดียว เป็นไฟล์เดียว (แต่ละชุดขึ้นหน้าใหม่แยกกัน)
 * moduleGroups: [{ moduleKey, label }] ตามที่ตั้งค่าไว้ใน LOCATION_MODULE_GROUPS ของจุดนั้น
 */
export async function generateLocationCalendarPDF(locationCode, locationLabel, moduleGroups) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const holidayRes = await getPublicHolidays(year, month);
  const holidayDays = new Set(holidayRes.data || []);
  drawModuleSection._holidayDays = holidayDays;

  const results = await Promise.all(
    moduleGroups.map((g) => getItemCalendarData(locationCode, g.moduleKey, year, month))
  );

  const failed = results.find((r) => r.error);
  if (failed) {
    alert('ดึงข้อมูลไม่สำเร็จ: ' + failed.error);
    return;
  }

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  registerThaiFont(doc);

  moduleGroups.forEach((g, idx) => {
    if (idx > 0) doc.addPage();
    const { items, statusMap } = results[idx].data;
    drawModuleSection(doc, { year, month, locationLabel, moduleLabel: g.label, items, statusMap });
  });

  addFootnotes(doc, now);

  await sharePDF(doc, `Checklist_${locationLabel}_รวมทุกชุด_${monthLabel(year, month).replace(' ', '_')}.pdf`);
}