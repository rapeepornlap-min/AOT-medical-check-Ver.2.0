// src/lib/auth.js
import { supabase } from './supabaseClient';

const EMAIL_DOMAIN = '@aot-medical.internal';

export async function loginWithUsername(username, password) {
  const email = `${username.trim().toLowerCase()}${EMAIL_DOMAIN}`;

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (authError) {
    return { error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' };
  }

  // extra_roles = สิทธิ์เพิ่มเติมของบางบัญชี (เช่น พยาบาลที่ต้องตรวจได้ทั้งฝั่ง EMR/EMT)
  // ถ้ายังไม่ได้เพิ่มคอลัมน์ใน DB (query พลาด) ให้ถอยกลับไปอ่านแบบเดิมเพื่อไม่ให้ล็อกอินพัง
  let { data: profile, error: profileError } = await supabase
    .from('users')
    .select('id, full_name, role, is_active, extra_roles')
    .eq('id', authData.user.id)
    .single();
  if (profileError) {
    ({ data: profile, error: profileError } = await supabase
      .from('users')
      .select('id, full_name, role, is_active')
      .eq('id', authData.user.id)
      .single());
  }

  if (profileError || !profile || !profile.is_active) {
    await supabase.auth.signOut();
    return { error: 'บัญชีนี้ยังไม่ได้เปิดใช้งาน กรุณาติดต่อผดูแลระบบ' };
  }

  return {
    user: {
      id: profile.id,
      username: username.trim().toLowerCase(),
      name: profile.full_name,
      role: profile.role,
      extraRoles: profile.extra_roles || [],
    },
  };
}

export async function logout() {
  await supabase.auth.signOut();
}

export async function changePassword(username, oldPassword, newPassword) {
  const email = `${username.trim().toLowerCase()}${EMAIL_DOMAIN}`;

  const { error: verifyError } = await supabase.auth.signInWithPassword({ email, password: oldPassword });
  if (verifyError) {
    return { error: 'รหัสผ่านเดิมไม่ถูกต้อง' };
  }

  const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
  if (updateError) {
    return { error: 'เปลี่ยนรหัสผ่านไม่สำเร็จ: ' + updateError.message };
  }

  return { success: true };
}