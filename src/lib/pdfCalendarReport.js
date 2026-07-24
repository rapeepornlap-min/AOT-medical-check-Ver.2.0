import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { sarabunRegularBase64 } from '../assets/fonts/sarabunRegularBase64';
import { sarabunBoldBase64 } from '../assets/fonts/sarabunBoldBase64';
import { getDailyCalendar, getWeeklyCalendar } from './checklist';

const NAVY = '#1B3A6B';
const OK = '#1D9A63';
const BAD = '#D64545';

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

function buildGrid(rows, columnKey) {
  const vehicles = [...new Set(rows.map((r) => r.location_label))].sort();
  const columns = [...new Set(rows.map((r) => r[columnKey]))].sort((a, b) => a - b);
  const map = {};
  rows.forEach((r) => { map[`${r.location_label}-${r[columnKey]}`] = r.done; });
  return { vehicles, columns, map };
}

export async function generateComplianceCalendarPDF() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [dailyRes, weeklyRes] = await Promise.all([
    getDailyCalendar(year, month),
    getWeeklyCalendar(year, month),
  ]);
  const dailyRows = dailyRes.data || [];
  const weeklyRows = weeklyRes.data || [];

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  registerThaiFont(doc);

  doc.setFontSize(16);
  doc.setFont('Sarabun', 'bold');
  doc.setTextColor(NAVY);
  doc.text('ปฏิทินการตรวจสอบรถพยาบาล (พิสูจน์การตรวจครบตามรอบ)', 14, 16);
  doc.setFontSize(10);
  doc.setFont('Sarabun', 'normal');
  doc.setTextColor('#6B7686');
  doc.text(`ประจำเดือน${monthLabel(now)} · ฝ่ายการแพทย์ ท่าอากาศยานสุวรรณภูมิ`, 14, 22);
  doc.setDrawColor(NAVY);
  doc.setLineWidth(0.6);
  doc.line(14, 26, 283, 26);

  // ---- ตารางที่ 1: ปฏิทินรายวัน ----
  doc.setFont('Sarabun', 'bold');
  doc.setFontSize(12);
  doc.text('1. ปฏิทินตรวจประจำวัน', 14, 34);

  const workdaySet = new Set(dailyRows.filter((r) => r.is_workday).map((r) => r.day_number));
  const daily = buildGrid(dailyRows, 'day_number');
  const dailyHead = ['คันรถ', ...daily.columns.map((c) => String(c))];
  const dailyBody = daily.vehicles.map((v) => {
    const workdayCols = daily.columns.filter((c) => workdaySet.has(c));
    const doneCount = workdayCols.filter((c) => daily.map[`${v}-${c}`]).length;
    return [
      `${v} (${doneCount}/${workdayCols.length})`,
      ...daily.columns.map((c) => {
        if (!workdaySet.has(c)) return '-';
        return daily.map[`${v}-${c}`] ? '✓' : '·';
      }),
    ];
  });
  autoTable(doc, {
    startY: 38,
    head: [dailyHead],
    body: dailyBody,
    styles: { font: 'Sarabun', fontSize: 6.5, halign: 'center', cellPadding: 1 },
    headStyles: { fillColor: NAVY, textColor: '#ffffff', font: 'Sarabun', fontStyle: 'bold', fontSize: 6.5 },
    columnStyles: { 0: { halign: 'left', fontStyle: 'bold', cellWidth: 26 } },
    margin: { left: 14, right: 14 },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index > 0) {
        if (data.cell.raw === '✓') data.cell.styles.textColor = OK;
        else if (data.cell.raw === '-') data.cell.styles.textColor = '#C4CBD6';
        else data.cell.styles.textColor = BAD;
      }
    },
  });
  doc.setFontSize(8);
  doc.setFont('Sarabun', 'normal');
  doc.setTextColor('#9AA5B5');
  doc.text('เครื่องหมาย "-" หมายถึงวันหยุด (เสาร์-อาทิตย์/วันนักขัตฤกษ์) ไม่นับเป็นวันขาดตรวจ', 14, doc.lastAutoTable.finalY + 5);

  let y = doc.lastAutoTable.finalY + 14;

  // ---- ตารางที่ 2: ปฏิทินรายสัปดาห์ ----
  doc.setFont('Sarabun', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(NAVY);
  doc.text('2. ปฏิทินตรวจประจำสัปดาห์', 14, y);

  const weekly = buildGrid(weeklyRows, 'week_number');
  const weeklyHead = ['คันรถ', ...weekly.columns.map((c) => `สัปดาห์ ${c}`)];
  const weeklyBody = weekly.vehicles.map((v) => {
    const doneCount = weekly.columns.filter((c) => weekly.map[`${v}-${c}`]).length;
    return [
      `${v} (${doneCount}/${weekly.columns.length})`,
      ...weekly.columns.map((c) => (weekly.map[`${v}-${c}`] ? '✓' : '·')),
    ];
  });
  autoTable(doc, {
    startY: y + 4,
    head: [weeklyHead],
    body: weeklyBody,
    styles: { font: 'Sarabun', fontSize: 8, halign: 'center', cellPadding: 2 },
    headStyles: { fillColor: NAVY, textColor: '#ffffff', font: 'Sarabun', fontStyle: 'bold' },
    columnStyles: { 0: { halign: 'left', fontStyle: 'bold', cellWidth: 30 } },
    margin: { left: 14, right: 14 },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index > 0) {
        data.cell.styles.textColor = data.cell.raw === '✓' ? OK : BAD;
      }
    },
  });

  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('Sarabun', 'normal');
    doc.setFontSize(8);
    doc.setTextColor('#9AA5B5');
    doc.text(`จัดทำโดยระบบ AOT Medical Check · พิมพ์เมื่อ ${now.toLocaleDateString('th-TH')}`, 14, 202);
  }

  doc.save(`ปฏิทินการตรวจ_${monthLabel(now).replace(' ', '_')}.pdf`);
}