import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { sarabunRegularBase64 } from '../assets/fonts/sarabunRegularBase64';
import { sarabunBoldBase64 } from '../assets/fonts/sarabunBoldBase64';
import { getFullDetailByPeriod } from './checklist';

const NAVY = '#1B3A6B';
const OK = '#1D9A63';
const BAD = '#D64545';

const CATEGORY_LABELS = { AMBULANCE: 'รถพยาบาล', FIELD_BAG: 'กระเป๋าออกตรวจฉุกเฉิน', EMERGENCY_BAG: 'กระเป๋า บ.ฉุกเฉิน', STATION: 'Station' };
const STATUS_LABELS = { OK: 'พร้อมใช้', NOT_OK: 'ไม่พร้อมใช้', EXPIRED: 'หมดอายุ', NEAR: 'ใกล้หมดอายุ' };

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

export async function generateDetailedMonthlyReportPDF() {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const res = await getFullDetailByPeriod(periodStart);
  const rows = res.data || [];

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  registerThaiFont(doc);

  doc.setFontSize(16);
  doc.setFont('Sarabun', 'bold');
  doc.setTextColor(NAVY);
  doc.text('รายงานละเอียดรายการตรวจสอบทั้งหมด', 14, 18);
  doc.setFontSize(10);
  doc.setFont('Sarabun', 'normal');
  doc.setTextColor('#6B7686');
  doc.text(`ประจำเดือน${monthLabel(now)} · ฝ่ายการแพทย์ ท่าอากาศยานสุวรรณภูมิ · ทั้งหมด ${rows.length} รายการ`, 14, 25);
  doc.setDrawColor(NAVY);
  doc.setLineWidth(0.6);
  doc.line(14, 29, 196, 29);

  if (rows.length === 0) {
    doc.setFont('Sarabun', 'normal');
    doc.setFontSize(11);
    doc.setTextColor('#6B7686');
    doc.text('ไม่มีรายการตรวจสอบในเดือนนี้', 14, 45);
  } else {
    autoTable(doc, {
      startY: 35,
      head: [['หมวด', 'จุดตรวจ', 'โมดูล', 'รายการ', 'สถานะ', 'หมายเหตุ', 'ผู้ตรวจ', 'วันที่']],
      body: rows.map((r) => [
        CATEGORY_LABELS[r.category] || r.category,
        r.location_label,
        r.module_key,
        r.item_name,
        STATUS_LABELS[r.status] || r.status || '-',
        r.note || (r.expiry_date ? `Exp. ${r.expiry_date}` : '') || (r.amount ? `จำนวน ${r.amount}` : '') || '-',
        r.inspector_name,
        new Date(r.submitted_at).toLocaleDateString('th-TH'),
      ]),
      styles: { font: 'Sarabun', fontSize: 7.5, cellPadding: 1.6 },
      headStyles: { fillColor: NAVY, textColor: '#ffffff', font: 'Sarabun', fontStyle: 'bold', fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 20 }, 1: { cellWidth: 20 }, 2: { cellWidth: 22 },
        3: { cellWidth: 38 }, 4: { cellWidth: 18, halign: 'center' },
        5: { cellWidth: 28 }, 6: { cellWidth: 20 }, 7: { cellWidth: 16, halign: 'center' },
      },
      margin: { left: 14, right: 14 },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 4) {
          if (data.cell.raw === 'ไม่พร้อมใช้' || data.cell.raw === 'หมดอายุ') data.cell.styles.textColor = BAD;
          else if (data.cell.raw === 'พร้อมใช้') data.cell.styles.textColor = OK;
        }
      },
    });
  }

  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('Sarabun', 'normal');
    doc.setFontSize(8);
    doc.setTextColor('#9AA5B5');
    doc.text(`จัดทำโดยระบบ AOT Medical Check · พิมพ์เมื่อ ${now.toLocaleDateString('th-TH')} · หน้า ${i}/${pageCount}`, 14, 289);
  }

  doc.save(`รายงานละเอียด_${monthLabel(now).replace(' ', '_')}.pdf`);
}