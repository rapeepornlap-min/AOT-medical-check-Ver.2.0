import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { sarabunRegularBase64 } from '../assets/fonts/sarabunRegularBase64';
import { sarabunBoldBase64 } from '../assets/fonts/sarabunBoldBase64';
import { getItemCalendarData } from './checklist';
import { sharePDF } from './pdfShare';

const NAVY = '#1B3A6B';
const OK = '#1D9A63';
const BAD = '#D64545';
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

  const res = await getItemCalendarData(locationCode, moduleKey, year, month);
  if (res.error) {
    alert('ดึงข้อมูลไม่สำเร็จ: ' + res.error);
    return;
  }
  const { locationLabel, items, statusMap } = res.data;

  const daysInMonth = new Date(year, month, 0).getDate();
  const weekendDays = new Set();
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    if (dow === 0 || dow === 6) weekendDays.add(d);
  }

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
  const body = items.map((it, idx) => [
    String(idx + 1),
    it.item_name,
    it.standard_qty || '',
    ...Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      const status = statusMap[`${it.item_id}-${day}`];
      if (status === 'OK') return 'OK';
      if (status === 'NOT_OK' || status === 'EXPIRED') return 'X';
      return '';
    }),
  ]);

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
        if (data.cell.raw === 'OK') data.cell.styles.textColor = OK;
        else if (data.cell.raw === 'X') data.cell.styles.textColor = BAD;
        if (weekendDays.has(day)) data.cell.styles.fillColor = WEEKEND_BG;
      }
      if (data.section === 'head' && colIdx >= 3 && weekendDays.has(day)) {
        data.cell.styles.fillColor = WEEKEND_HEAD_BG;
      }
    },
  });

  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('Sarabun', 'normal');
    doc.setFontSize(8);
    doc.setTextColor('#9AA5B5');
    doc.text(`จัดทำโดยระบบ AOT Medical Check · พิมพ์เมื่อ ${now.toLocaleDateString('th-TH')}`, 8, 205);
  }

  await sharePDF(doc, `Checklist_${locationLabel}_${moduleLabel}_${monthLabel(year, month).replace(' ', '_')}.pdf`, preOpenedWindow);
}