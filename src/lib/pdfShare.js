/**
 * แชร์/ดาวน์โหลด PDF — บนมือถือใช้ Web Share API (เปิดเมนูแชร์/บันทึกไฟล์ของเครื่อง)
 * บน PC เปิดดูในแท็บใหม่โดยตรงเสมอ ไม่เด้งกล่องแชร์ของ Windows
 *
 * preOpenedWindow: แท็บที่เปิดไว้ล่วงหน้า (แบบ synchronous ตอนกดปุ่ม) ก่อนจะเริ่มโหลดข้อมูล/สร้าง PDF
 * ซึ่งจำเป็น เพราะถ้าเปิดแท็บใหม่หลังจาก await ข้อมูลจาก Supabase แล้ว เบราว์เซอร์จะมองว่าไม่ได้มาจาก
 * การกดของผู้ใช้โดยตรงอีกต่อไป แล้วบล็อก popup ทำให้ปุ่ม PDF "กดแล้วไม่มีอะไรเกิดขึ้น"
 */
function isMobileDevice() {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function sharePDF(doc, filename, preOpenedWindow) {
  const blob = doc.output('blob');

  if (isMobileDevice() && navigator.canShare) {
    const file = new File([blob], filename, { type: 'application/pdf' });
    if (navigator.canShare({ files: [file] })) {
      if (preOpenedWindow && !preOpenedWindow.closed) preOpenedWindow.close();
      try {
        await navigator.share({ files: [file], title: filename });
        return;
      } catch (err) {
        // ผู้ใช้กดยกเลิกการแชร์ หรืออุปกรณ์ไม่รองรับจริง — ไปต่อที่ fallback ด้านล่าง
        // (preOpenedWindow ถูกปิดไปแล้ว จึงเปิดแท็บใหม่แทนในขั้นตอนถัดไป)
      }
    }
  }

  // ใช้ data: URL แทน blob: URL — เพราะ Safari บนมือถือ (รวมถึง in-app browser บางตัว) มีบั๊กที่
  // blob: URL เปิดในหน้าต่าง/แท็บที่แยกออกมาแล้วขึ้นเป็นหน้าว่างเปล่า โหลดเนื้อหาไม่ขึ้น
  // ส่วน data: URL ไม่มีข้อจำกัดเรื่องบริบทข้ามหน้าต่างแบบนี้ จึงเสถียรกว่าในทุกแพลตฟอร์ม
  try {
    const dataUrl = await blobToDataUrl(blob);
    if (preOpenedWindow && !preOpenedWindow.closed) {
      preOpenedWindow.location.href = dataUrl;
    } else {
      window.open(dataUrl, '_blank');
    }
  } catch (err) {
    const blobUrl = URL.createObjectURL(blob);
    if (preOpenedWindow && !preOpenedWindow.closed) {
      preOpenedWindow.location.href = blobUrl;
    } else {
      window.open(blobUrl, '_blank');
    }
  }
}