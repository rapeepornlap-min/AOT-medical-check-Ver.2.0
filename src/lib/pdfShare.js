/**
 * แสดง PDF ให้ผู้ใช้ดู/ดาวน์โหลด/แชร์
 *
 * เหตุผลที่ไม่เปิดแท็บ/หน้าต่างใหม่อีกต่อไป: หลายๆ ที่ที่ลิงก์แอปถูกเปิด (LINE, Claude app, แอปอื่นๆ
 * ที่มี in-app browser ของตัวเอง) ใช้ WebView ที่จำกัดสิทธิ์มาก — window.open() มักถูกบล็อกไปเลย
 * หรือเปิดแท็บเปล่าแล้ว navigate ต่อไม่ได้ ทั้ง blob: และ data: URL ก็ยังเจอปัญหาเดิม
 * วิธีที่เสถียรที่สุดคือไม่พึ่งแท็บ/หน้าต่างใหม่เลย แต่โชว์ PDF อยู่ในหน้าเดิม (modal + iframe) แทน
 * ซึ่งใช้ได้ในทุกบริบทเพราะไม่ต้องขอสิทธิ์เปิดอะไรเพิ่ม
 */
function isMobileDevice() {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
}

export async function sharePDF(doc, filename) {
  const blob = doc.output('blob');

  if (isMobileDevice() && navigator.canShare) {
    const file = new File([blob], filename, { type: 'application/pdf' });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: filename });
        return;
      } catch (err) {
        // ผู้ใช้กดยกเลิกการแชร์ หรืออุปกรณ์ไม่รองรับจริง — ไปต่อที่ modal viewer ด้านล่าง
      }
    }
  }

  const dataUrl = doc.output('datauristring');
  window.dispatchEvent(new CustomEvent('aot-show-pdf', { detail: { dataUrl, filename } }));
}