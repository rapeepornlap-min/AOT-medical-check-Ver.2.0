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

export async function generateItemCalendarPDF(locationCode, moduleKey, moduleLabel, preOpenedWindow) {
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

  const daysInMonth = new Date(year, month, 0).getDate();
  const weekendDays = new Set();
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    if (dow === 0 || dow === 6) weekendDays.add(d);
  }
  // วันหยุด = เสาร์-อาทิตย์ หรือวันหยุดนักขัตฤกษ์ — เว้นจากการเติมเครื่องหมายถูกอัตโนมัติของทั้งสัปดาห์
  const nonWorkDays = new Set([...weekendDays, ...holidayDays]);

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  registerThaiFont(doc);

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

  const body = items.map((it, idx) => {
    // ถ้าสัปดาห์ไหนมีการติ๊ก OK ในวันทำงานอย่างน้อย 1 วัน ให้ถือว่าทั้งสัปดาห์นั้น (เฉพาะวันทำงาน) ตรวจครบ
    // เว้นเสาร์-อาทิตย์และวันหยุดนักขัตฤกษ์ไว้เสมอ ไม่เติมเครื่องหมายถูกอัตโนมัติให้
    const okWeeks = new Set();
    for (let d = 1; d <= daysInMonth; d++) {
      if (!nonWorkDays.has(d) && statusMap[`${it.item_id}-${d}`] === 'OK') okWeeks.add(dayToWeek[d]);
    }
    return [
      String(idx + 1),
      it.item_name,
      it.standard_qty || '',
      ...Array.from({ length: daysInMonth }, (_, i) => {
        const day = i + 1;
        const status = statusMap[`${it.item_id}-${day}`];
        // ใกล้หมดอายุ ต้องขึ้นเครื่องหมาย "/" เตือนเสมอ ไม่ให้กฎเติมครบสัปดาห์บังหายไป
        if (status === 'NEAR') return 'NEAR';
        if (nonWorkDays.has(day)) {
          if (status === 'OK') return 'OK';
          if (status === 'NOT_OK' || status === 'EXPIRED') return 'X';
          return '-';
        }
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
        else if (data.cell.raw === 'NEAR') { data.cell.text = ['/']; data.cell.styles.textColor = WARN; data.cell.styles.fontStyle = 'bold'; }
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
    },
  });

  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('Sarabun', 'normal');
    doc.setFontSize(8);
    doc.setTextColor('#9AA5B5');
    doc.text('เครื่องหมาย "-" หมายถึงวันหยุด (เสาร์-อาทิตย์/วันนักขัตฤกษ์) · "/" สีส้ม หมายถึงใกล้หมดอายุ — ติ๊ก 1 วันในสัปดาห์ถือว่าครบทั้งสัปดาห์ (เฉพาะวันทำงาน)', 8, 200);
    doc.text(`จัดทำโดยระบบ AOT Medical Check · พิมพ์เมื่อ ${now.toLocaleDateString('th-TH')}`, 8, 205);
  }

  await sharePDF(doc, `Checklist_${locationLabel}_${moduleLabel}_${monthLabel(year, month).replace(' ', '_')}.pdf`, preOpenedWindow);
}