/**
 * แชร์/ดาวน์โหลด PDF — บนมือถือใช้ Web Share API (เปิดเมนูแชร์/บันทึกไฟล์ของเครื่อง)
 * บน PC เปิดดูในแท็บใหม่โดยตรงเสมอ ไม่เด้งกล่องแชร์ของ Windows
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
        // ผู้ใช้กดยกเลิกการแชร์ หรืออุปกรณ์ไม่รองรับจริง — ไปต่อที่ fallback ด้านล่าง
      }
    }
  }

  const blobUrl = URL.createObjectURL(blob);
  window.open(blobUrl, '_blank');
}