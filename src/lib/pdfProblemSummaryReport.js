import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { sarabunRegularBase64 } from '../assets/fonts/sarabunRegularBase64';
import { sarabunBoldBase64 } from '../assets/fonts/sarabunBoldBase64';
import { getAllProblemItems } from './checklist';
import { sharePDF } from './pdfShare';

const NAVY = '#1B3A6B';
const OK = '#1D9A63';
const BAD = '#D64545';
const WARN = '#B8760A';

const ISSUE_LABELS = { NEAR: 'ใกล้หมดอายุ', EXPIRED: 'หมดอายุ', NOT_OK: 'ไม่ครบ / ไม่พร้อมใช้งาน' };
const ISSUE_COLORS = { NEAR: WARN, EXPIRED: BAD, NOT_OK: BAD };

function registerThaiFont(doc) {
  doc.addFileToVFS('Sarabun-Regular.ttf', sarabunRegularBase64);
  doc.addFont('Sarabun-Regular.ttf', 'Sarabun', 'normal');
  doc.addFileToVFS('Sarabun-Bold.ttf', sarabunBoldBase64);
  doc.addFont('Sarabun-Bold.ttf', 'Sarabun', 'bold');
  doc.setFont('Sarabun', 'normal');
}

function detailText(row) {
  if (row.issue_type === 'NEAR' || row.issue_type === 'EXPIRED') {
    return row.expiry_date ? `วันหมดอายุ: ${row.expiry_date}` : '';
  }
  const parts = [];
  if (row.amount) parts.push(`จำนวนที่นับได้: ${row.amount}`);
  if (row.note) parts.push(`หมายเหตุ: ${row.note}`);
  return parts.join(' · ');
}

export async function generateProblemSummaryReportPDF() {
  const res = await getAllProblemItems();
  if (res.error) {
    alert('ดึงข้อมูลไม่สำเร็จ: ' + res.error);
    return;
  }
  const rows = res.data;
  const now = new Date();

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  registerThaiFont(doc);

  doc.setFontSize(16);
  doc.setFont('Sarabun', 'bold');
  doc.setTextColor(NAVY);
  doc.text('รายงานสรุปรายการที่มีปัญหา แยกตาม Station', 14, 16);
  doc.setFontSize(10);
  doc.setFont('Sarabun', 'normal');
  doc.setTextColor('#6B7686');
  doc.text('ใกล้หมดอายุ · หมดอายุ · ไม่ครบ / ไม่พร้อมใช้งาน (จากการตรวจล่าสุดของแต่ละจุด) · ฝ่ายการแพทย์ ท่าอากาศยานสุวรรณภูมิ', 14, 22);
  doc.setDrawColor(NAVY);
  doc.setLineWidth(0.6);
  doc.line(14, 26, 196, 26);

  if (rows.length === 0) {
    doc.setFont('Sarabun', 'normal');
    doc.setFontSize(12);
    doc.setTextColor(OK);
    doc.text('✓ ไม่พบรายการที่มีปัญหาในขณะนี้ ทุกจุดตรวจล่าสุดพร้อมใช้งานปกติ', 14, 40);
  } else {
    // จัดกลุ่มตาม station (location_label)
    const byLocation = {};
    rows.forEach((r) => {
      if (!byLocation[r.location_label]) byLocation[r.location_label] = [];
      byLocation[r.location_label].push(r);
    });

    let y = 34;
    const summaryCounts = { NEAR: 0, EXPIRED: 0, NOT_OK: 0 };
    rows.forEach((r) => { summaryCounts[r.issue_type] = (summaryCounts[r.issue_type] || 0) + 1; });
    doc.setFont('Sarabun', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(NAVY);
    doc.text(
      `รวมทั้งหมด ${rows.length} รายการ · ใกล้หมดอายุ ${summaryCounts.NEAR || 0} · หมดอายุ ${summaryCounts.EXPIRED || 0} · ไม่ครบ/ไม่พร้อมใช้งาน ${summaryCounts.NOT_OK || 0}`,
      14, y
    );
    y += 8;

    Object.keys(byLocation).forEach((locLabel) => {
      const locRows = byLocation[locLabel];
      if (y > 265) { doc.addPage(); y = 20; }

      doc.setFillColor(NAVY);
      doc.rect(14, y, 182, 8, 'F');
      doc.setFont('Sarabun', 'bold');
      doc.setFontSize(11);
      doc.setTextColor('#FFFFFF');
      doc.text(`${locLabel}  (${locRows.length} รายการ)`, 17, y + 5.8);
      y += 8;

      autoTable(doc, {
        startY: y,
        head: [['รายการ', 'ประเภทปัญหา', 'รายละเอียด']],
        body: locRows.map((r) => [r.item_name, ISSUE_LABELS[r.issue_type] || r.issue_type, detailText(r)]),
        styles: { font: 'Sarabun', fontSize: 9, cellPadding: 2.5, valign: 'top' },
        headStyles: { fillColor: '#E3E8EF', textColor: NAVY, font: 'Sarabun', fontStyle: 'bold', fontSize: 9 },
        columnStyles: { 0: { cellWidth: 62 }, 1: { cellWidth: 40 }, 2: { cellWidth: 80 } },
        margin: { left: 14, right: 14 },
        didParseCell: (data) => {
          if (data.section === 'body' && data.column.index === 1) {
            const row = locRows[data.row.index];
            data.cell.styles.textColor = ISSUE_COLORS[row.issue_type] || '#1F2937';
            data.cell.styles.fontStyle = 'bold';
          }
        },
      });
      y = doc.lastAutoTable.finalY + 8;
    });
  }

  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('Sarabun', 'normal');
    doc.setFontSize(8);
    doc.setTextColor('#9AA5B5');
    doc.text('รายงานนี้แสดงข้อมูลจากผลตรวจล่าสุดของแต่ละจุด (ไม่ใช่ตามรอบสัปดาห์) ณ เวลาที่พิมพ์', 14, 283);
    doc.text(`จัดทำโดยระบบ AOT Medical Readiness System · พิมพ์เมื่อ ${now.toLocaleDateString('th-TH')} ${now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}`, 14, 288);
  }

  await sharePDF(doc, `รายงานสรุปปัญหา_${now.toLocaleDateString('th-TH').replace(/\//g, '-')}.pdf`);
}