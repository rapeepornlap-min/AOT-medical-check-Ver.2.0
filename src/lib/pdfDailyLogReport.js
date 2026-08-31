import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { sarabunRegularBase64 } from '../assets/fonts/sarabunRegularBase64';
import { sarabunBoldBase64 } from '../assets/fonts/sarabunBoldBase64';
import { getAmbulanceDailyLogCalendar, getPublicHolidays } from './checklist';
import { sharePDF } from './pdfShare';
import { drawCheckIcon } from './pdfCheckmark';

const NAVY = '#1B3A6B';
const OK = '#1D9A63';
const BAD = '#D64545';

const FUEL_LABELS_TH = { F: 'เต็ม (F)', '3/4': '3/4', '1/2': '1/2', '1/4': '1/4', E: 'ต่ำ (E)' };

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

function dayOfWeekLabel(year, month, day) {
  return new Date(year, month - 1, day).toLocaleDateString('th-TH', { weekday: 'short' });
}

export async function generateDailyLogReportPDF(locationCode, year, month) {
  const now = new Date();
  year = year || now.getFullYear();
  month = month || now.getMonth() + 1;

  const [res, holidayRes] = await Promise.all([
    getAmbulanceDailyLogCalendar(locationCode, year, month),
    getPublicHolidays(year, month),
  ]);
  if (res.error) {
    alert('ดึงข้อมูลไม่สำเร็จ: ' + res.error);
    return;
  }
  const { locationLabel, entries } = res.data;
  const holidayDays = new Set(holidayRes.data || []);

  const entryByDay = {};
  entries.forEach((e) => { entryByDay[e.day] = e; });

  const daysInMonth = new Date(year, month, 0).getDate();
  const workDays = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    const isWeekend = dow === 0 || dow === 6;
    if (!isWeekend && !holidayDays.has(d)) workDays.push(d);
  }

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  registerThaiFont(doc);

  doc.setFontSize(15);
  doc.setFont('Sarabun', 'bold');
  doc.setTextColor(NAVY);
  doc.text(`รายงานบันทึกประจำวัน — ${locationLabel}`, 14, 16);
  doc.setFontSize(10);
  doc.setFont('Sarabun', 'normal');
  doc.setTextColor('#6B7686');
  doc.text(`ประจำเดือน ${monthLabel(year, month)} · ฝ่ายการแพทย์ ท่าอากาศยานสุวรรณภูมิ`, 14, 22);
  doc.setDrawColor(NAVY);
  doc.setLineWidth(0.6);
  doc.line(14, 26, 196, 26);

  const head = [['วันที่', 'ผู้ตรวจ', 'เลขไมล์ (กม.)', 'น้ำมัน', 'หมายเหตุ', 'สถานะ']];
  const body = workDays.map((d) => {
    const e = entryByDay[d];
    const dateLabel = `${String(d).padStart(2, '0')}/${String(month).padStart(2, '0')} (${dayOfWeekLabel(year, month, d)})`;
    if (!e) {
      return [dateLabel, '', '', '', '', 'ยังไม่บันทึก'];
    }
    return [
      dateLabel,
      e.inspector_name || '',
      e.mileage || '',
      FUEL_LABELS_TH[e.fuel_level] || e.fuel_level || '',
      e.note || '',
      'บันทึกแล้ว',
    ];
  });

  autoTable(doc, {
    startY: 30,
    head,
    body,
    styles: { font: 'Sarabun', fontSize: 9, cellPadding: 2.5, valign: 'middle' },
    headStyles: { fillColor: NAVY, textColor: '#ffffff', font: 'Sarabun', fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 28, halign: 'left' },
      1: { cellWidth: 32 },
      2: { cellWidth: 24, halign: 'right' },
      3: { cellWidth: 20 },
      4: { cellWidth: 40, halign: 'left' },
      5: { cellWidth: 22, halign: 'center' },
    },
    margin: { left: 14, right: 14 },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 5) {
        if (data.cell.raw === 'บันทึกแล้ว') data.cell.text = [];
        else data.cell.styles.textColor = BAD;
      }
    },
    didDrawCell: (data) => {
      if (data.section === 'body' && data.column.index === 5 && data.cell.raw === 'บันทึกแล้ว') {
        drawCheckIcon(doc, data.cell, OK);
      }
    },
  });

  const loggedCount = workDays.filter((d) => entryByDay[d]).length;
  const finalY = doc.lastAutoTable.finalY + 8;
  doc.setFont('Sarabun', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(NAVY);
  doc.text(`สรุป: บันทึกครบ ${loggedCount}/${workDays.length} วันทำการ`, 14, finalY);

  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('Sarabun', 'normal');
    doc.setFontSize(8);
    doc.setTextColor('#9AA5B5');
    doc.text('ตารางนี้เว้นวันเสาร์-อาทิตย์และวันหยุดนักขัตฤกษ์ไว้ ไม่นับเป็นวันขาดบันทึก', 14, 283);
    doc.text(`จัดทำโดยระบบ AOT Medical Check · พิมพ์เมื่อ ${now.toLocaleDateString('th-TH')}`, 14, 288);
  }

  await sharePDF(doc, `บันทึกประจำวัน_${locationLabel}_${monthLabel(year, month).replace(' ', '_')}.pdf`);
}