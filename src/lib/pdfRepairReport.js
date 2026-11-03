import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { sarabunRegularBase64 } from '../assets/fonts/sarabunRegularBase64';
import { sarabunBoldBase64 } from '../assets/fonts/sarabunBoldBase64';
import { getRepairRequests, STATUS_LABELS, URGENCY_LABELS, DEPARTMENT_LABELS } from './repairs';
import { sharePDF } from './pdfShare';

const NAVY = '#1B3A6B';
const OK = '#1D9A63';
const BAD = '#D64545';
const WARN = '#B8760A';

function registerThaiFont(doc) {
  doc.addFileToVFS('Sarabun-Regular.ttf', sarabunRegularBase64);
  doc.addFont('Sarabun-Regular.ttf', 'Sarabun', 'normal');
  doc.addFileToVFS('Sarabun-Bold.ttf', sarabunBoldBase64);
  doc.addFont('Sarabun-Bold.ttf', 'Sarabun', 'bold');
  doc.setFont('Sarabun', 'normal');
}

function fmt(d) {
  return d ? new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) : '-';
}

/**
 * PDF สรุปรายการแจ้งซ่อม — รวมเฉพาะรายการที่ผู้ใช้มีสิทธิ์เห็น (ฐานข้อมูลกรองตามฝ่ายให้อยู่แล้ว)
 * @param {{year:number, month:number}|null} period เดือนที่ต้องการ (month 1-12) หรือ null = ทั้งหมด
 * @param {string} scopeLabel ข้อความบอกขอบเขต เช่น "ฝ่ายพยาบาล" / "ทุกฝ่าย" / "รายการที่ฉันแจ้ง"
 */
export async function generateRepairReportPDF(period, scopeLabel) {
  const res = await getRepairRequests();
  if (res.error) {
    alert('ดึงข้อมูลไม่สำเร็จ: ' + res.error);
    return;
  }
  let rows = res.data;
  let periodText = 'ทุกช่วงเวลา';
  if (period) {
    rows = rows.filter((r) => {
      const d = new Date(r.created_at);
      return d.getFullYear() === period.year && d.getMonth() + 1 === period.month;
    });
    periodText = new Date(period.year, period.month - 1, 1).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
  }

  const now = new Date();
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  registerThaiFont(doc);

  doc.setFontSize(16);
  doc.setFont('Sarabun', 'bold');
  doc.setTextColor(NAVY);
  doc.text('รายงานสรุปรายการแจ้งซ่อม', 14, 16);
  doc.setFontSize(10);
  doc.setFont('Sarabun', 'normal');
  doc.setTextColor('#6B7686');
  doc.text(`${scopeLabel} · ${periodText} · ฝ่ายการแพทย์ ท่าอากาศยานสุวรรณภูมิ`, 14, 22);
  doc.setDrawColor(NAVY);
  doc.setLineWidth(0.6);
  doc.line(14, 26, 283, 26);

  // กล่องสรุปจำนวนตามสถานะ
  const count = (s) => rows.filter((r) => r.status === s).length;
  const summary = [
    ['ทั้งหมด', rows.length, NAVY],
    [STATUS_LABELS.PENDING, count('PENDING'), BAD],
    [STATUS_LABELS.IN_PROGRESS, count('IN_PROGRESS'), WARN],
    [STATUS_LABELS.DONE, count('DONE'), OK],
    [STATUS_LABELS.CANCELLED, count('CANCELLED'), '#6B7686'],
  ];
  let x = 14;
  summary.forEach(([label, n, color]) => {
    doc.setDrawColor(color);
    doc.setLineWidth(0.4);
    doc.roundedRect(x, 30, 50, 14, 2, 2);
    doc.setFont('Sarabun', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(color);
    doc.text(String(n), x + 5, 40);
    doc.setFont('Sarabun', 'normal');
    doc.setFontSize(9);
    doc.setTextColor('#6B7686');
    doc.text(label, x + 18, 40);
    x += 54;
  });

  if (rows.length === 0) {
    doc.setFontSize(12);
    doc.setTextColor('#6B7686');
    doc.text('ไม่มีรายการแจ้งซ่อมในช่วงเวลานี้', 14, 58);
  } else {
    autoTable(doc, {
      startY: 50,
      head: [['วันที่แจ้ง', 'ฝ่าย', 'จุดตรวจ/รถ', 'รายการอุปกรณ์', 'อาการ', 'เร่งด่วน', 'ผู้แจ้ง', 'สถานะ', 'ผู้รับเรื่อง / หมายเหตุ', 'เสร็จเมื่อ']],
      body: rows.map((r) => [
        fmt(r.created_at),
        DEPARTMENT_LABELS[r.department] || r.department,
        r.location_label,
        r.item_name,
        r.description,
        URGENCY_LABELS[r.urgency] || r.urgency,
        r.reporter_name,
        STATUS_LABELS[r.status] || r.status,
        [r.handler_name, r.handler_note].filter(Boolean).join(' · ') || '-',
        r.status === 'DONE' ? fmt(r.completed_at) : '-',
      ]),
      styles: { font: 'Sarabun', fontSize: 8, cellPadding: 1.8, valign: 'top' },
      headStyles: { fillColor: NAVY, textColor: '#ffffff', font: 'Sarabun', fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 20 }, 1: { cellWidth: 22 }, 2: { cellWidth: 28 }, 3: { cellWidth: 38 }, 4: { cellWidth: 48 },
        5: { cellWidth: 16, halign: 'center' }, 6: { cellWidth: 26 }, 7: { cellWidth: 20, halign: 'center' }, 8: { cellWidth: 34 }, 9: { cellWidth: 17, halign: 'center' },
      },
      margin: { left: 14, right: 14 },
      didParseCell: (data) => {
        if (data.section !== 'body') return;
        const raw = String(data.cell.raw);
        if (data.column.index === 5) {
          if (raw === URGENCY_LABELS.CRITICAL) { data.cell.styles.textColor = BAD; data.cell.styles.fontStyle = 'bold'; }
          else if (raw === URGENCY_LABELS.URGENT) data.cell.styles.textColor = WARN;
        }
        if (data.column.index === 7) {
          if (raw === STATUS_LABELS.DONE) data.cell.styles.textColor = OK;
          else if (raw === STATUS_LABELS.PENDING) data.cell.styles.textColor = BAD;
          else if (raw === STATUS_LABELS.IN_PROGRESS) data.cell.styles.textColor = WARN;
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
    doc.text(`จัดทำโดยระบบ AOT Medical Readiness System · พิมพ์เมื่อ ${now.toLocaleDateString('th-TH')} · หน้า ${i}/${pageCount}`, 14, 203);
  }

  const tag = period ? `${period.year}-${String(period.month).padStart(2, '0')}` : 'ทั้งหมด';
  await sharePDF(doc, `รายงานแจ้งซ่อม_${tag}.pdf`);
}