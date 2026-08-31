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
function drawModuleSection(doc, { year, month, locationLabel, moduleLabel, items, statusMap, amountMap }) {
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
      it.numeric_input && it.unit ? `${it.standard_qty || ''} (${it.unit})` : (it.standard_qty || ''),
      ...Array.from({ length: daysInMonth }, (_, i) => {
        const day = i + 1;
        const status = statusMap[`${it.item_id}-${day}`];
        // รายการที่กรอกเป็นตัวเลข (เช่น ปริมาณออกซิเจน) — ถ้ามีการบันทึกจริงในวันนั้น ให้โชว์ตัวเลขจริงแทนเครื่องหมายถูก
        if (it.numeric_input) {
          const amt = amountMap && amountMap[`${it.item_id}-${day}`];
          if (amt) return amt;
        }
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

export async function generateItemCalendarPDF(locationCode, moduleKey, moduleLabel, year, month) {
  const now = new Date();
  year = year || now.getFullYear();
  month = month || now.getMonth() + 1;

  const [res, holidayRes] = await Promise.all([
    getItemCalendarData(locationCode, moduleKey, year, month),
    getPublicHolidays(year, month),
  ]);
  if (res.error) {
    alert('ดึงข้อมูลไม่สำเร็จ: ' + res.error);
    return;
  }
  const { locationLabel, items, statusMap, amountMap } = res.data;
  const holidayDays = new Set(holidayRes.data || []);

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  registerThaiFont(doc);

  drawModuleSection._holidayDays = holidayDays;
  drawModuleSection(doc, { year, month, locationLabel, moduleLabel, items, statusMap, amountMap });
  addFootnotes(doc, now);

  await sharePDF(doc, `Checklist_${locationLabel}_${moduleLabel}_${monthLabel(year, month).replace(' ', '_')}.pdf`);
}

/**
 * รายงานตารางรายเดือนแบบรวมทุกกระเป๋า/ชุดของจุดเดียว เป็นไฟล์เดียว (แต่ละชุดขึ้นหน้าใหม่แยกกัน)
 * moduleGroups: [{ moduleKey, label }] ตามที่ตั้งค่าไว้ใน LOCATION_MODULE_GROUPS ของจุดนั้น
 */
export async function generateLocationCalendarPDF(locationCode, locationLabel, moduleGroups, year, month) {
  const now = new Date();
  year = year || now.getFullYear();
  month = month || now.getMonth() + 1;

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
    const { items, statusMap, amountMap } = results[idx].data;
    drawModuleSection(doc, { year, month, locationLabel, moduleLabel: g.label, items, statusMap, amountMap });
  });

  addFootnotes(doc, now);

  await sharePDF(doc, `Checklist_${locationLabel}_รวมทุกชุด_${monthLabel(year, month).replace(' ', '_')}.pdf`);
}

const QUARTER_LABELS = { 10: 'ไตรมาส 1', 1: 'ไตรมาส 2', 4: 'ไตรมาส 3', 7: 'ไตรมาส 4' };
const STATUS_LABELS_TH = { OK: 'ครบ', NOT_OK: 'ไม่ครบ', NEAR: 'ใกล้หมดอายุ', EXPIRED: 'หมดอายุ' };
const STATUS_COLORS_TH = { OK, NOT_OK: BAD, NEAR: WARN, EXPIRED: BAD };

function currentQuarterMonths(now) {
  const BKK_OFFSET_MS = 7 * 60 * 60 * 1000;
  const nowBkk = new Date(now.getTime() + BKK_OFFSET_MS);
  const month = nowBkk.getUTCMonth() + 1;
  const year = nowBkk.getUTCFullYear();
  let qStartMonth;
  if (month >= 10) qStartMonth = 10;
  else if (month >= 7) qStartMonth = 7;
  else if (month >= 4) qStartMonth = 4;
  else qStartMonth = 1;
  return { qStartMonth, year };
}

function quarterMonthsFor(year, qStartMonth) {
  return [qStartMonth, qStartMonth + 1, qStartMonth + 2].map((m) => ({ year, month: m }));
}

/**
 * รายงานสรุปรายไตรมาส — ตารางสรุป (ไม่ใช่ตารางรายวันแบบเดือน) แสดงสถานะ/วันที่ตรวจล่าสุดของแต่ละรายการ
 * ในไตรมาสที่ระบุ (3 เดือน) เหมาะกับจุดที่ตรวจแบบไตรมาสละครั้ง เช่น กระเป๋า บ.ฉุกเฉิน
 * year, qStartMonth: ถ้าไม่ระบุจะใช้ไตรมาสปัจจุบัน (สำหรับดูรายงานย้อนหลัง ให้ระบุปี ค.ศ. และเดือนเริ่มไตรมาส 1/4/7/10)
 */
export async function generateQuarterlySummaryPDF(locationCode, locationLabel, moduleGroups, year, qStartMonth) {
  const now = new Date();
  if (!year || !qStartMonth) {
    const current = currentQuarterMonths(now);
    year = year || current.year;
    qStartMonth = qStartMonth || current.qStartMonth;
  }
  const months = quarterMonthsFor(year, qStartMonth);

  const holidayResults = await Promise.all(months.map((m) => getPublicHolidays(m.year, m.month)));
  const holidayDays = new Set(holidayResults.flatMap((r) => r.data || []));

  const dataByModule = await Promise.all(
    moduleGroups.map((g) => Promise.all(months.map((m) => getItemCalendarData(locationCode, g.moduleKey, m.year, m.month))))
  );

  const failed = dataByModule.flat().find((r) => r.error);
  if (failed) {
    alert('ดึงข้อมูลไม่สำเร็จ: ' + failed.error);
    return;
  }

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  registerThaiFont(doc);

  const quarterLabel = `${QUARTER_LABELS[qStartMonth]} (${monthLabel(months[0].year, months[0].month)} – ${monthLabel(months[2].year, months[2].month)})`;

  doc.setFontSize(16);
  doc.setFont('Sarabun', 'bold');
  doc.setTextColor(NAVY);
  doc.text(`รายงานสรุปรายไตรมาส — ${locationLabel}`, 14, 16);
  doc.setFontSize(10);
  doc.setFont('Sarabun', 'normal');
  doc.setTextColor('#6B7686');
  doc.text(quarterLabel, 14, 22);
  doc.setDrawColor(NAVY);
  doc.setLineWidth(0.6);
  doc.line(14, 26, 196, 26);

  let y = 34;
  moduleGroups.forEach((g, gIdx) => {
    const monthDatas = months.map((m, i) => ({ ...m, ...dataByModule[gIdx][i].data }));
    const items = monthDatas[0].items;

    const rows = items.map((it) => {
      let best = null;
      monthDatas.forEach(({ year, month, statusMap, amountMap, expiryMap }) => {
        const daysInMonth = new Date(year, month, 0).getDate();
        for (let d = 1; d <= daysInMonth; d++) {
          const s = statusMap[`${it.item_id}-${d}`];
          if (!s) continue;
          const dateVal = new Date(year, month - 1, d);
          if (!best || dateVal > best.dateVal) {
            best = {
              dateVal, status: s,
              amount: amountMap && amountMap[`${it.item_id}-${d}`],
              expiry: expiryMap && expiryMap[`${it.item_id}-${d}`],
              day: d, month, year,
            };
          }
        }
      });
      return { it, best };
    });

    if (y > 265) { doc.addPage(); y = 20; }
    doc.setFillColor(NAVY);
    doc.rect(14, y, 182, 8, 'F');
    doc.setFont('Sarabun', 'bold');
    doc.setFontSize(11);
    doc.setTextColor('#FFFFFF');
    const checkedCount = rows.filter((r) => r.best).length;
    doc.text(`${g.label}  (ตรวจแล้ว ${checkedCount}/${rows.length} รายการ)`, 17, y + 5.8);
    y += 8;

    autoTable(doc, {
      startY: y,
      head: [['รายการ', 'มาตรฐาน', 'นับได้จริง', 'วันหมดอายุ', 'สถานะ', 'วันที่ตรวจล่าสุด']],
      body: rows.map(({ it, best }) => {
        const standardText = it.standard_qty ? `${it.standard_qty}${it.unit ? ' ' + it.unit : ''}` : '-';
        const countedText = best && best.amount ? `${best.amount}${it.unit ? ' ' + it.unit : ''}` : '-';
        const expiryText = best && best.expiry ? best.expiry : (it.has_expiry ? '-' : '—');
        const statusText = !best ? 'ยังไม่ตรวจ' : (STATUS_LABELS_TH[best.status] || best.status);
        const dateText = best ? `${String(best.day).padStart(2, '0')}/${String(best.month).padStart(2, '0')}/${best.year}` : '-';
        return [it.item_name, standardText, countedText, expiryText, statusText, dateText];
      }),
      styles: { font: 'Sarabun', fontSize: 8.5, cellPadding: 2.2 },
      headStyles: { fillColor: '#E3E8EF', textColor: NAVY, font: 'Sarabun', fontStyle: 'bold', fontSize: 8.5 },
      columnStyles: {
        0: { cellWidth: 46 },
        1: { cellWidth: 26, halign: 'center' },
        2: { cellWidth: 26, halign: 'center' },
        3: { cellWidth: 26, halign: 'center' },
        4: { cellWidth: 30, halign: 'center' },
        5: { cellWidth: 28, halign: 'center' },
      },
      margin: { left: 14, right: 14 },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 4) {
          const { best } = rows[data.row.index];
          if (!best) data.cell.styles.textColor = '#9AA5B5';
          else data.cell.styles.textColor = STATUS_COLORS_TH[best.status] || '#1F2937';
        }
      },
    });
    y = doc.lastAutoTable.finalY + 8;
  });

  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('Sarabun', 'normal');
    doc.setFontSize(8);
    doc.setTextColor('#9AA5B5');
    doc.text('รายงานนี้สรุปสถานะการตรวจล่าสุดของแต่ละรายการภายในไตรมาสปัจจุบัน (ไม่ใช่ตารางรายวัน)', 14, 283);
    doc.text(`จัดทำโดยระบบ AOT Medical Readiness System · พิมพ์เมื่อ ${now.toLocaleDateString('th-TH')}`, 14, 288);
  }

  await sharePDF(doc, `รายงานสรุปรายไตรมาส_${locationLabel}_${QUARTER_LABELS[qStartMonth].replace(' ', '')}_${months[0].year}.pdf`);
}