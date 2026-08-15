/**
 * วาดเครื่องหมายถูก (✅) แบบเวกเตอร์ลงในเซลล์ตาราง PDF
 *
 * เหตุผลที่ต้องวาดเองแทนการพิมพ์อีโมจิ/สัญลักษณ์ ✅✓ ตรงๆ: ฟอนต์ Sarabun ที่ฝังในไฟล์ PDF
 * เป็นฟอนต์ตัวอักษรธรรมดา ไม่มีกลุ่มตัวอักษรอีโมจิ/สัญลักษณ์ (Dingbats) รวมอยู่ด้วย ถ้าพิมพ์ ✅ หรือ ✓
 * ตรงๆ ตัวอักษรจะไม่มีอยู่ในฟอนต์ ทำให้เซลล์นั้นว่างเปล่า (บั๊กเดิมที่เคยเจอ) การวาดเป็นเส้นเวกเตอร์เองแบบนี้
 * จะไม่ขึ้นกับฟอนต์เลย แสดงผลได้แน่นอนทุกเครื่อง
 */
export function drawCheckIcon(doc, cell, color) {
  if (!cell) return;
  const { x, y, width: w, height: h } = cell;
  const p1 = [x + w * 0.22, y + h * 0.52];
  const p2 = [x + w * 0.42, y + h * 0.74];
  const p3 = [x + w * 0.80, y + h * 0.26];

  doc.setDrawColor(color);
  doc.setLineWidth(Math.max(0.35, Math.min(w, h) * 0.09));
  if (typeof doc.setLineCap === 'function') doc.setLineCap('round');
  if (typeof doc.setLineJoin === 'function') doc.setLineJoin('round');
  doc.line(p1[0], p1[1], p2[0], p2[1]);
  doc.line(p2[0], p2[1], p3[0], p3[1]);
}