/**
 * แชร์/ดาวน์โหลด PDF บนมือถือ — ใช้ Web Share API ถ้ารองรับ (เปิดเมนูแชร์/บันทึกไฟล์ของเครื่อง)
 * ถ้าเบราว์เซอร์ไม่รองรับ จะ fallback ไปเปิดดูในแท็บใหม่แทน
 */
export async function sharePDF(doc, filename) {
  const blob = doc.output('blob');

  if (navigator.canShare) {
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