import React, { useState, useEffect, useMemo, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { loginWithUsername, logout, changePassword } from './lib/auth';
import { saveInspection } from './lib/inspections';
import { getLocationsForRole, getChecklistItems, getModuleItemCounts, getExpiringItems, getReadinessByPeriod, getNotReadyByPeriod, getAmbulanceCompliance, getLocationsWithResponsible, getLatestStatusByLocation, getAmbulanceDailyLoggedToday, getTodayDailyLog, getPendingAcknowledgments, acknowledgeInspection, getAcknowledgmentSummary, getLatestInspectionAnswers, getInspectionProblemItems, getCategoryLocationSummary, getCategoryReadinessTrend, getOverallReadinessTrend, getCategoryTopProblems, getCategoryModuleBreakdown } from './lib/checklist';
import { supabase } from './lib/supabaseClient';
import { generateItemCalendarPDF, generateLocationCalendarPDF, generateQuarterlySummaryPDF } from './lib/pdfItemCalendarReport';
import { generateDailyLogReportPDF } from './lib/pdfDailyLogReport';
import { generateMonthlyReportPDF } from './lib/pdfReport';
import { generateDetailedMonthlyReportPDF } from './lib/pdfDetailReport';
import { generateComplianceCalendarPDF } from './lib/pdfCalendarReport';
import { generateProblemSummaryReportPDF } from './lib/pdfProblemSummaryReport';
import { ROLES, AMBULANCE_MODULES, LOCATION_MODULE_GROUPS, CATEGORY_META } from './locationsConfig';
import './App.css';
import logo from './assets/logo.png';

function formatThaiDateTime(date) {
  return date.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const diff = (new Date(dateStr) - new Date(todayISO())) / (1000 * 60 * 60 * 24);
  return Math.round(diff);
}
function medStatus(dateStr) {
  const d = daysUntil(dateStr);
  if (d === null) return 'UNSET';
  if (d < 0) return 'EXPIRED';
  if (d <= 90) return 'NEAR';
  return 'OK';
}
const medStatusLabel = { OK: 'ปกติ', NEAR: 'ใกล้หมด', EXPIRED: 'หมดอายุ', UNSET: 'ยังไม่ระบุ' };
const medStatusClass = { OK: 'med-status-ok', NEAR: 'med-status-near', EXPIRED: 'med-status-expired', UNSET: 'med-status-unset' };

// เทียบจำนวนที่ตรวจนับได้จริงกับมาตรฐาน (รองรับทั้งเลขเดี่ยวและแบบ comma "1,1")
// เท่ากับมาตรฐานทุกตัว -> 'OK' (ครบ), น้อยกว่ามาตรฐานตัวใดตัวหนึ่ง -> 'NOT_OK' (ไม่ครบ)
// กรณีอื่น (มากกว่ามาตรฐาน, กรอกไม่ครบ/ไม่ใช่ตัวเลข) -> null คือไม่ auto เปลี่ยนสถานะให้
function compareAmountToStandard(amountStr, standardStr) {
  if (!standardStr || amountStr === undefined || amountStr === '') return null;
  const stdParts = String(standardStr).split(',').map((s) => s.trim());
  const amtParts = String(amountStr).split(',').map((s) => s.trim());
  if (stdParts.length !== amtParts.length) return null;
  if (stdParts.some((s) => s === '' || isNaN(Number(s)))) return null;
  if (amtParts.some((s) => s === '' || isNaN(Number(s)))) return null;
  const stdNums = stdParts.map(Number);
  const amtNums = amtParts.map(Number);
  if (stdNums.every((n, i) => amtNums[i] === n)) return 'OK';
  if (stdNums.some((n, i) => amtNums[i] < n)) return 'NOT_OK';
  return null;
}

function LiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="topbar-time">{now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</span>;
}

function TopBar({ title, sub, onBack, backLabel }) {
  return (
    <header className="topbar">
      <div>
        <div className="topbar-title">{title}</div>
        {sub && <div className="topbar-sub">{sub}</div>}
      </div>
      <div className="topbar-right">
        <LiveClock />
        {onBack && <button className="btn-ghost" onClick={onBack}>{backLabel || '‹ กลับ'}</button>}
      </div>
    </header>
  );
}

// -------------------------------------------------------------------------
// หน้าจอ Login จริง — ผ่าน Supabase Auth (username/password)
// -------------------------------------------------------------------------
function LoginScreen({ onLoggedIn, onForgotPassword }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) { setError('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน'); return; }
    setError('');
    setLoading(true);
    const result = await loginWithUsername(username, password);
    setLoading(false);
    if (result.error) { setError(result.error); return; }
    onLoggedIn(result.user);
  };

  return (
    <div className="screen center">
      <div className="auth-card">
        <img src={logo} alt="AOT Airport Clinic" style={{ width: '100%', maxWidth: 260, margin: '0 auto 16px', display: 'block' }} />
        <h1 className="auth-title">AOT Medical Readiness <span className="auth-title-accent">System</span></h1>
        <p className="auth-subtitle">รถพยาบาล · อุปกรณ์ · เวชภัณฑ์ · ยา</p>
        <form onSubmit={handleSubmit} className="auth-form">
          <label className="field-label" htmlFor="username">ชื่อผู้ใช้ (Username)</label>
          <input id="username" type="text" className="text-input" placeholder="เช่น nurse1" value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" />
          <label className="field-label" style={{ marginTop: 16 }} htmlFor="password">รหัสผ่าน</label>
          <div className="input-with-icon">
            <input id="password" type={showPassword ? 'text' : 'password'} className="text-input" placeholder="รหัสผ่าน" value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="button" className="input-icon-btn" onClick={() => setShowPassword((v) => !v)} aria-label="แสดง/ซ่อนรหัสผ่าน">
              {showPassword ? '🙈' : '👁'}
            </button>
          </div>
          {error && <div className="form-error">{error}</div>}
          <button type="submit" className="btn-primary" style={{ marginTop: 24 }} disabled={loading}>
            {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบตรวจสอบ'}
          </button>
          <div style={{ textAlign: 'right', marginTop: 10 }}>
            <span className="link-forgot" onClick={onForgotPassword}>🔑 เปลี่ยนรหัสผ่าน</span>
          </div>
        </form>

        <div className="auth-divider">
          <div className="auth-divider-line" />
          <div className="auth-divider-badge">✈️</div>
          <div className="auth-divider-line" />
        </div>

        <div className="auth-features">
          <div className="auth-feature">
            <div className="auth-feature-ic">🛡️</div>
            <div className="auth-feature-title">ปลอดภัย</div>
            <div className="auth-feature-sub">มั่นใจในความปลอดภัยของข้อมูล</div>
          </div>
          <div className="auth-feature">
            <div className="auth-feature-ic">📋</div>
            <div className="auth-feature-title">ตรวจสอบง่าย</div>
            <div className="auth-feature-sub">เช็ครถ อุปกรณ์ ยา ได้ครบถ้วน</div>
          </div>
          <div className="auth-feature">
            <div className="auth-feature-ic">🕐</div>
            <div className="auth-feature-title">รวดเร็ว ทันเวลา</div>
            <div className="auth-feature-sub">พร้อมใช้งานตลอด 24 ชั่วโมง</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------
// เมนูหลัก — ดึง locations ที่ role นี้เข้าถึงได้จาก Supabase แล้วจัดกลุ่มตาม category
// -------------------------------------------------------------------------
function MainMenu({ user, onSelectCategory, onLogout, onOpenDashboard, onOpenPendingAck }) {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    (async () => {
      const res = await getLocationsWithResponsible(user.role);
      if (res.error) setLoadError(res.error);
      else setLocations(res.data || []);
      setLoading(false);
    })();
  }, [user.role]);

  const categories = useMemo(() => {
    const byCategory = {};
    locations.forEach((loc) => {
      if (!byCategory[loc.category]) byCategory[loc.category] = [];
      byCategory[loc.category].push(loc);
    });
    return Object.keys(byCategory)
      .map((cat) => ({ id: cat, meta: CATEGORY_META[cat] || { label: cat, subtitle: '', order: 99 }, locations: byCategory[cat] }))
      .sort((a, b) => a.meta.order - b.meta.order);
  }, [locations]);

  return (
    <div className="screen">
      <TopBar title="AOT MEDICAL READINESS SYSTEM" sub={`${user.name} · ${ROLES[user.role]?.label || user.role}`} onBack={onLogout} backLabel="ออกจากระบบ" />
      <main className="menu-grid">
        {loading && <div className="empty-state">กำลังโหลดรายการ...</div>}
        {loadError && <div className="form-error">โหลดข้อมูลไม่สำเร็จ: {loadError}</div>}
        {!loading && !loadError && categories.map((cat) => (
          <button key={cat.id} className="menu-card" onClick={() => onSelectCategory(cat)}>
            <div className="menu-card-dot" />
            <div className="menu-card-num">รายการที่ {cat.meta.num}</div>
            <div className="menu-card-label">{cat.meta.label}</div>
            <div className="menu-card-subtitle">{cat.meta.subtitle}</div>
          </button>
        ))}
        {!loading && !loadError && (user.role === 'ADMIN' || user.role === 'VISITOR') && (
          <button className="menu-card" onClick={onOpenDashboard}>
            <div className="menu-card-dot" />
            <div className="menu-card-num">รายการที่ 5</div>
            <div className="menu-card-label">Dashboard</div>
            <div className="menu-card-subtitle">สรุปความพร้อมใช้งานภาพรวมทุกจุด</div>
          </button>
        )}
        {!loading && !loadError && user.role === 'EMR_EMT' && (
          <button className="menu-card" onClick={onOpenPendingAck}>
            <div className="menu-card-dot" />
            <div className="menu-card-label">🔔 รอรับทราบ</div>
            <div className="menu-card-subtitle">การตรวจของคันที่คุณรับผิดชอบ</div>
          </button>
        )}
        {!loading && !loadError && categories.length === 0 && <div className="empty-state">ไม่มีรายการที่ท่านมีสิทธิ์ตรวจสอบ</div>}
      </main>
    </div>
  );
}

// -------------------------------------------------------------------------
// เลือกสถานที่ย่อยภายในหมวด (ใช้เมื่อ category มีมากกว่า 1 location เช่น รถพยาบาล, Station)
// -------------------------------------------------------------------------
const STATUS_LABELS_TH = { READY: 'พร้อมใช้งาน', NOT_READY: 'ไม่พร้อมใช้งาน', PARTIAL: 'ตรวจไม่ครบ' };

function LocationPicker({ categoryMeta, locations, user, isAmbulance, onSelectLocation, onBack }) {
  const [statusMap, setStatusMap] = useState({});
  const [dailyLoggedMap, setDailyLoggedMap] = useState({});

  useEffect(() => {
    const ids = locations.map((l) => l.id);
    if (ids.length === 0) return;
    getLatestStatusByLocation(ids).then((res) => {
      if (res.data) setStatusMap(res.data);
    });
    if (isAmbulance) {
      getAmbulanceDailyLoggedToday(ids).then((res) => {
        if (res.data) setDailyLoggedMap(res.data);
      });
    }
  }, [locations, isAmbulance]);

  const expectedKeysFor = (loc) => {
    if (isAmbulance) return AMBULANCE_MODULES.filter((m) => m.moduleKey).map((m) => m.moduleKey);
    const groups = (LOCATION_MODULE_GROUPS[loc.code] || []).filter(
      (g) => !g.allowedRoles || g.allowedRoles.includes(user?.role) || user?.role === 'VISITOR'
    );
    return groups.map((g) => g.moduleKey).filter(Boolean);
  };

  const statusFor = (loc) => {
    const expected = expectedKeysFor(loc);
    const checked = statusMap[loc.id] || {};
    let base;
    if (expected.length === 0) base = undefined;
    else if (expected.some((k) => checked[k] === 'NOT_READY')) base = 'NOT_READY';
    else if (expected.some((k) => checked[k] === 'PARTIAL')) base = 'PARTIAL';
    else {
      const missing = expected.filter((k) => !(k in checked));
      if (missing.length > 0) {
        const anyExpectedChecked = expected.some((k) => k in checked);
        base = anyExpectedChecked ? 'PARTIAL' : undefined;
      } else base = 'READY';
    }
    if (isAmbulance && dailyLoggedMap[loc.id] === false) return 'NOT_READY';
    return base;
  };

  return (
    <div className="screen">
      <TopBar title={categoryMeta.label} sub="เลือกจุดที่ต้องการตรวจสอบ" onBack={onBack} />
      <main className="menu-grid">
        {locations.map((loc) => {
          const status = statusFor(loc);
          const pillClass = status === 'READY' ? 'pill-ok' : status === 'NOT_READY' ? 'pill-danger' : status === 'PARTIAL' ? 'pill-warn' : 'pill-none';
          const pillLabel = STATUS_LABELS_TH[status] || 'ยังไม่มีการตรวจ';
          return (
            <button key={loc.id} className="menu-card" onClick={() => onSelectLocation(loc)}>
              <div className="menu-card-label">{loc.label}</div>
              {loc.responsible_name && (
                <div className="menu-card-person">👤 {loc.responsible_name}</div>
              )}
              <div className="menu-card-status">
                <span className={`dash-pill ${pillClass}`}>{pillLabel}</span>
              </div>
            </button>
          );
        })}
      </main>
    </div>
  );
}

// -------------------------------------------------------------------------
// เลือกกลุ่ม module_key ย่อยภายใน location หนึ่งๆ
// -------------------------------------------------------------------------
function ModuleGroupPicker({ location, user, onSelectModule, onBack }) {
  const groups = (LOCATION_MODULE_GROUPS[location.code] || []).filter(
    (g) => !g.allowedRoles || g.allowedRoles.includes(user.role) || user.role === 'VISITOR'
  );
  const [counts, setCounts] = useState({});
  const [moduleStatus, setModuleStatus] = useState({});

  useEffect(() => {
    const keys = groups.map((g) => g.moduleKey);
    if (keys.length === 0) return;
    getModuleItemCounts(keys).then((res) => {
      if (res.data) setCounts(res.data);
    });
    getLatestStatusByLocation([location.id]).then((res) => {
      if (res.data) setModuleStatus(res.data[location.id] || {});
    });
  }, [location.code]);

  return (
    <div className="screen">
      <TopBar title={location.label} sub="เลือกรายการที่ต้องการตรวจสอบ" onBack={onBack} />
      <div style={{ padding: '16px 24px 0', maxWidth: 640, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button
          type="button"
          className="dash-pdf-btn"
          style={{ width: '100%' }}
          onClick={() => requestMonthlyReport(`รายงานตารางรายเดือน — ${location.label}`, (year, month) => generateLocationCalendarPDF(location.code, location.label, groups, year, month))}
        >
          📊 รายงานตารางรายเดือน (รวมทุกชุด)
        </button>
        {location.code === 'aircraft_bag' && (
          <button
            type="button"
            className="dash-pdf-btn"
            style={{ width: '100%' }}
            onClick={() => requestQuarterlyReport('รายงานสรุปรายไตรมาส', (year, qStartMonth) => generateQuarterlySummaryPDF(location.code, location.label, groups, year, qStartMonth))}
          >
            📊 รายงานสรุปรายไตรมาส
          </button>
        )}
      </div>
      <main className="menu-grid">
        {groups.map((g) => {
          const tintClass = g.accent === '#1D9A63' ? 'menu-card-green'
            : g.accent === '#B8760A' ? 'menu-card-yellow'
            : g.accent === '#D64545' ? 'menu-card-red' : '';
          const checkedStatus = moduleStatus[g.moduleKey];
          const checkedPillClass = checkedStatus === 'READY' ? 'pill-ok' : checkedStatus === 'NOT_READY' ? 'pill-danger' : checkedStatus === 'PARTIAL' ? 'pill-warn' : 'pill-none';
          const checkedPillLabel = checkedStatus === 'READY' ? '✓ ตรวจแล้ว' : checkedStatus === 'NOT_READY' ? '✓ ตรวจแล้ว (พบปัญหา)' : checkedStatus === 'PARTIAL' ? '📝 ตรวจไม่ครบ (บันทึกร่างไว้)' : 'ยังไม่ตรวจ';
          return (
          <button
            key={g.moduleKey}
            className={`menu-card ${tintClass}`}
            style={g.accent ? { borderLeftColor: g.accent } : undefined}
            onClick={() => onSelectModule(g)}
          >
            <div className="menu-card-dot" style={g.accent ? { background: g.accent } : undefined} />
            <div className="menu-card-label">
              {g.warn && <span style={{ marginRight: 6 }}>⚠️</span>}
              {g.label}
            </div>
            {counts[g.moduleKey] !== undefined && (
              <div className="menu-card-subtitle">{counts[g.moduleKey]} รายการ</div>
            )}
            <div className="menu-card-status">
              <span className={`dash-pill ${checkedPillClass}`}>{checkedPillLabel}</span>
            </div>
        </button>
          );
        })}
        {groups.length === 0 && <div className="empty-state">ไม่มีรายการที่ท่านมีสิทธิ์ตรวจสอบในจุดนี้</div>}  
      </main>
    </div>
  );
}

// -------------------------------------------------------------------------
// รถพยาบาล: เลือกคันรถ > เมนูย่อย 4 โมดูล
// -------------------------------------------------------------------------
function ModuleMenu({ vehicle, onSelectModule, onBack }) {
  return (
    <div className="screen">
      <TopBar title={`${vehicle.label} — ALS`} sub="เลือกรายการที่ต้องการตรวจสอบ" onBack={onBack} />
      <main className="menu-grid">
        {AMBULANCE_MODULES.map((m) => (
          <button key={m.id} className="menu-card" onClick={() => onSelectModule(m)}>
            <div className="menu-card-dot" />
            <div className="menu-card-label">{m.label}</div>
            <div className="menu-card-subtitle">{m.subtitle}</div>
            {m.moduleKey && (
              <button
                type="button"
                className="menu-card-report-btn"
                onClick={(e) => { e.stopPropagation(); requestMonthlyReport(`รายงานตารางรายเดือน — ${vehicle.label} · ${m.label}`, (year, month) => generateItemCalendarPDF(vehicle.code, m.moduleKey, m.label, year, month)); }}
              >
                📊 รายงานตารางรายเดือน
              </button>
            )}
            {m.id === 'daily' && (
              <button
                type="button"
                className="menu-card-report-btn"
                onClick={(e) => { e.stopPropagation(); requestMonthlyReport(`รายงานบันทึกประจำวัน — ${vehicle.label}`, (year, month) => generateDailyLogReportPDF(vehicle.code, year, month)); }}
              >
                📊 รายงานตารางรายเดือน
              </button>
            )}
          </button>
        ))}
      </main>
    </div>
  );
}

// ---------- โมดูล: บันทึกประจำวัน (ฟอร์มธรรมดา ไม่ใช้ checklist_templates) ----------
function DailyLogModule({ vehicle, user, onBack, onSaved }) {
  const isAdmin = user.role === 'ADMIN';
  const isVisitor = user.role === 'VISITOR';
  const [mileage, setMileage] = useState('');
  const [fuel, setFuel] = useState('F');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [alreadyLoggedToday, setAlreadyLoggedToday] = useState(false);

  useEffect(() => {
    getTodayDailyLog(vehicle.code).then((res) => {
      if (res.data) {
        setMileage(res.data.mileage || '');
        setFuel(res.data.fuel_level || 'F');
        setNote(res.data.note || '');
        setAlreadyLoggedToday(true);
      }
    });
  }, [vehicle.code]);

  const fuelLevels = [
    { key: 'F', label: 'เต็ม (F)' }, { key: '3/4', label: '3/4' }, { key: '1/2', label: '1/2' },
    { key: '1/4', label: '1/4' }, { key: 'E', label: 'ต่ำ (E)' },
  ];

  const handleSave = async () => {
    if (!mileage.trim()) { setError('กรุณากรอกเลขไมล์'); return; }
    setSaving(true);
    setError('');
    if (isVisitor) {
      // โหมดทดลองสำหรับผู้เยี่ยมชม — จำลองการบันทึกให้ แต่ไม่เขียนข้อมูลลงฐานข้อมูลจริง
      setTimeout(() => { setSaving(false); onSaved(); }, 400);
      return;
    }
    const result = await saveInspection({
      locationCode: vehicle.code,
      moduleKey: 'ambulance_daily',
      inspectorId: user.id,
      inspectorName: user.name,
      overallStatus: 'READY',
      items: [],
      mileage,
      fuelLevel: fuel,
      note,
    });
    setSaving(false);
    if (result.error) setError(result.error); else onSaved();
  };

  return (
    <div className="screen">
      <TopBar title="บันทึกประจำวัน" sub={`${vehicle.label} · ${formatThaiDateTime(new Date())}`} onBack={onBack} />
      <main className="form-body" style={isAdmin ? { pointerEvents: 'none', opacity: 0.55 } : undefined}>
        {isVisitor && (
          <div className="reminder-banner" style={{ marginBottom: 12 }}>
            🧪 โหมดทดลองสำหรับผู้เยี่ยมชม — กรอก/กดได้ตามปกติ แต่ระบบจะไม่บันทึกข้อมูลนี้ลงฐานข้อมูลจริง
          </div>
        )}
        {alreadyLoggedToday && (
          <div className="reminder-banner" style={{ marginBottom: 12 }}>
            ✅ วันนี้บันทึกไปแล้ว — ข้อมูลด้านล่างคือค่าที่บันทึกล่าสุด แก้ไขแล้วกดบันทึกซ้ำได้ถ้าต้องการอัปเดต
          </div>
        )}
        <label className="field-label">เลขไมล์ (กม.) *</label>
        <input className="text-input" placeholder="เช่น 123456" value={mileage} onChange={(e) => setMileage(e.target.value)} />

        <label className="field-label" style={{ marginTop: 16 }}>ปริมาณน้ำมัน</label>
        <div className="fuel-buttons">
          {fuelLevels.map((f) => (
            <button key={f.key} type="button" className={`fuel-btn ${fuel === f.key ? 'fuel-btn-active' : ''}`} onClick={() => setFuel(f.key)}>{f.label}</button>
          ))}
        </div>
        {(fuel === '1/2' || fuel === '1/4') && (
          <div className="reminder-banner" style={{ marginTop: 10 }}>⚠️ ปริมาณน้ำมันเหลือน้อย ควรเติมน้ำมันก่อนรอบตรวจถัดไป</div>
        )}

        <label className="field-label" style={{ marginTop: 16 }}>หมายเหตุ / ปัญหาที่พบ</label>
        <textarea className="text-input textarea" placeholder="ระบุปัญหาหรือข้อสังเกต..." value={note} onChange={(e) => setNote(e.target.value)} />

        <div className="checklist-standard" style={{ marginTop: 16 }}>ผู้บันทึก: {user.name}</div>

        {error && <div className="form-error">{error}</div>}
        {isAdmin ? (
          <div className="empty-state">👁 โหมดดูอย่างเดียว (Admin) — ไม่สามารถบันทึกหรือแก้ไขข้อมูลได้</div>
        ) : (
          <button className="btn-primary" style={{ marginTop: 16 }} disabled={saving} onClick={handleSave}>
            {saving ? 'กำลังบันทึก...' : isVisitor ? 'ลองบันทึก (โหมดทดลอง)' : 'บันทึกการตรวจสอบวันนี้'}
          </button>
        )}
      </main>
    </div>
  );
}

// -------------------------------------------------------------------------
// ฟอร์มตรวจสอบแบบ Dynamic — ใช้ได้กับทุก module_key ที่ดึงจาก checklist_templates
// รองรับ: is_header (หัวข้อคั่น), has_expiry (วันหมดอายุ), numeric_input (กรอกจำนวน),
//         photo_attach (ปุ่มแนบรูป), reminder_note (ป้ายเตือน)
// -------------------------------------------------------------------------
const ACCENT_BG = { '#1D9A63': '#EAF7F0', '#B8760A': '#FDF3E3', '#D64545': '#FBEAEA' };
function DynamicChecklistForm({ locationCode, moduleKey, moduleLabel, user, onBack, onDone, accentColor }) {
  const isAdmin = user.role === 'ADMIN';
  const isVisitor = user.role === 'VISITOR';
  const isReadOnly = isAdmin || isVisitor;
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [answers, setAnswers] = useState({}); // id -> { status, note, expiry, amount, photo }
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const [prefilled, setPrefilled] = useState(false);
  const [uploadingId, setUploadingId] = useState(null);

  const handlePhotoSelect = async (it, file) => {
    if (!file) return;
    if (isVisitor) {
      // โหมดทดลอง — โชว์ preview จากไฟล์ในเครื่องผู้ใช้เอง ไม่อัปโหลดขึ้น Storage จริง
      setAnswer(it.id, { photoUrl: URL.createObjectURL(file) });
      return;
    }
    setUploadingId(it.id);
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${locationCode}/${moduleKey}/${it.id}-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from('inspection-photos')
      .upload(path, file, { upsert: true });
    if (uploadError) {
      alert('แนบรูปไม่สำเร็จ: ' + uploadError.message);
      setUploadingId(null);
      return;
    }
    const { data: publicUrlData } = supabase.storage.from('inspection-photos').getPublicUrl(path);
    setAnswer(it.id, { photoUrl: publicUrlData.publicUrl });
    setUploadingId(null);
  };

  useEffect(() => {
    (async () => {
      const res = await getChecklistItems(moduleKey, locationCode);
      if (res.error) { setLoadError(res.error); setLoading(false); return; }
      const loadedItems = res.data || [];
      setItems(loadedItems);

      const lastRes = await getLatestInspectionAnswers(locationCode, moduleKey);
      const lastAnswers = lastRes.data || {};
      if (Object.keys(lastAnswers).length > 0) {
        const initial = {};
        loadedItems.forEach((it) => {
          const prev = lastAnswers[it.item_code];
          if (!prev) return;
          initial[it.id] = {
            status: prev.status === 'OK' || prev.status === 'NOT_OK' ? prev.status : undefined,
            expiry: prev.expiry_date || undefined,
            amount: prev.amount != null ? String(prev.amount) : undefined,
            note: prev.note || undefined,
            photoUrl: prev.photo_url || undefined,
          };
        });
        setAnswers(initial);
        setPrefilled(true);
      }
      setLoading(false);
    })();
  }, [moduleKey, locationCode]);

  const rows = items.filter((it) => !it.is_header);
  const setAnswer = (id, patch) => setAnswers((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), ...patch } }));

  const isAnswered = (it) => {
    const a = answers[it.id] || {};
    if (it.has_expiry) return !!a.expiry;
    if (it.numeric_input) return a.amount !== undefined && a.amount !== '';
    return a.status === 'OK' || a.status === 'NOT_OK';
  };
  const allAnswered = rows.every(isAnswered);

  const isProblem = (it) => {
    const a = answers[it.id] || {};
    if (it.has_expiry) return medStatus(a.expiry) === 'EXPIRED';
    if (it.numeric_input) return false;
    return a.status === 'NOT_OK';
  };
  const problemCount = rows.filter(isProblem).length;
  const overallStatus = problemCount === 0 ? 'READY' : 'NOT_READY';

  const buildItemRows = () => rows.map((it) => {
    const a = answers[it.id] || {};
    return {
      code: it.item_code,
      name: it.item_name,
      status: it.has_expiry ? (a.expiry ? medStatus(a.expiry) : null) : (it.numeric_input ? (a.amount ? 'OK' : null) : (a.status || null)),
      expiryDate: a.expiry || null,
      amount: a.amount || null,
      note: a.note || null,
      photoUrl: a.photoUrl || null,
    };
  });

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError('');
    if (isVisitor) {
      // โหมดทดลองสำหรับผู้เยี่ยมชม — จำลองการบันทึกให้ แต่ไม่เขียนข้อมูลลงฐานข้อมูลจริง
      setTimeout(() => { setSubmitting(false); onDone(); }, 400);
      return;
    }
    const result = await saveInspection({
      locationCode,
      moduleKey,
      inspectorId: user.id,
      inspectorName: user.name,
      overallStatus,
      items: buildItemRows(),
    });
    setSubmitting(false);
    if (result.error) setSubmitError(result.error); else onDone();
  };

  // ถ้ากดกลับก่อนตรวจครบทุกรายการ ให้บันทึกฉบับร่างไว้ก่อน (สถานะ "ตรวจไม่ครบ")
  // เพื่อให้กลับมาตรวจต่อจากเดิมได้ในครั้งหน้า ไม่ต้องเริ่มใหม่และไม่เสียข้อมูลที่กรอกไปแล้ว
  const handleBack = async () => {
    if (isReadOnly || rows.length === 0 || !rows.some(isAnswered)) {
      onBack();
      return;
    }
    await saveInspection({
      locationCode,
      moduleKey,
      inspectorId: user.id,
      inspectorName: user.name,
      overallStatus: allAnswered ? overallStatus : 'PARTIAL',
      items: buildItemRows(),
    });
    onBack();
  };

  if (loading) {
    return (
      <div className="screen">
        <TopBar title={moduleLabel} onBack={onBack} />
        <main className="form-body"><div className="empty-state">กำลังโหลดรายการตรวจสอบ...</div></main>
      </div>
    );
  }
  if (loadError) {
    return (
      <div className="screen">
        <TopBar title={moduleLabel} onBack={onBack} />
        <main className="form-body"><div className="form-error">โหลดรายการไม่สำเร็จ: {loadError}</div></main>
      </div>
    );
  }

  return (
    <div className="screen">
      <TopBar title={moduleLabel} sub={`${formatThaiDateTime(new Date())} · ${rows.length} รายการ`} onBack={handleBack} />
      <main className="form-body">
        {isVisitor && (
          <div className="reminder-banner" style={{ marginBottom: 12 }}>
            🧪 โหมดทดลองสำหรับผู้เยี่ยมชม — กรอก/กดได้ตามปกติ แต่ระบบจะไม่บันทึกข้อมูลนี้ลงฐานข้อมูลจริง
          </div>
        )}
        {prefilled && (
          <div className="reminder-banner" style={{ marginBottom: 12 }}>
            🔄 แสดงข้อมูลจากการตรวจครั้งล่าสุด กรุณาตรวจสอบและแก้ไขให้ตรงกับสภาพจริงก่อนบันทึก
          </div>
        )}
        <div className="checklist" style={isAdmin ? { pointerEvents: 'none', opacity: 0.55 } : undefined}>
          {items.map((it) => {
            if (it.is_header) {
              return <div className="checklist-header" key={it.id}>{it.item_name}</div>;
            }
            const a = answers[it.id] || {};
            const rowAccent = it.is_high_alert ? '#D64545' : accentColor;
            return (
              <div className={`checklist-row ${it.is_high_alert ? 'checklist-row-highalert' : ''}`} key={it.id} style={rowAccent ? { borderLeft: `5px solid ${rowAccent}`, background: ACCENT_BG[rowAccent] || undefined } : undefined}>
              
                <div className="checklist-content">
                  <div className="checklist-item-label">
                    {it.is_high_alert && <span className="high-alert-badge">⚠️ High Alert</span>}
                    {it.item_name}
                  </div>
                  {it.standard_qty && <div className="checklist-standard">จำนวน: {it.standard_qty}</div>}
                  {it.reminder_note && <div className="reminder-banner">🔔 {it.reminder_note}</div>}

                 {it.has_expiry && (
                    <>
                      <div className="field-label" style={{ marginBottom: 6 }}>วันหมดอายุ (Exp.)</div>
                      <div className="med-row">
                        <input type="date" className="text-input" value={a.expiry || ''} onChange={(e) => setAnswer(it.id, { expiry: e.target.value })} />
                        <span className={`med-status-pill ${medStatusClass[medStatus(a.expiry)]}`}>{medStatusLabel[medStatus(a.expiry)]}</span>
                      </div>
                      <div className="field-label" style={{ marginTop: 10, marginBottom: 6 }}>จำนวนที่ตรวจนับได้จริง</div>
                      <div className="med-row">
                        <input type="text" className="text-input" style={{ fontSize: 22, fontWeight: 700, textAlign: 'center' }} placeholder={it.standard_qty ? `มาตรฐาน ${it.standard_qty}` : 'จำนวน'} value={a.amount || ''} onChange={(e) => setAnswer(it.id, { amount: e.target.value })} />
                        {it.unit && <span className="unit-label">{it.unit}</span>}
                      </div>
                      {it.standard_qty && !isNaN(Number(it.standard_qty)) && a.amount !== undefined && a.amount !== '' && Number(a.amount) !== Number(it.standard_qty) && (
                        <div className="reminder-banner" style={{ marginTop: 6 }}>
                          ⚠️ จำนวนไม่ตรงกับมาตรฐาน (มาตรฐาน {it.standard_qty}{it.unit ? ` ${it.unit}` : ''}, ตรวจนับได้ {a.amount}{it.unit ? ` ${it.unit}` : ''})
                        </div>
                      )}
                    </>
                  )}

                  {it.numeric_input && (
                    <div className="med-row">
                      <input type="text" className="text-input" style={{ fontSize: 22, fontWeight: 700, textAlign: 'center' }} placeholder="จำนวน" value={a.amount || ''} onChange={(e) => setAnswer(it.id, { amount: e.target.value })} />
                      {it.unit && <span className="unit-label">{it.unit}</span>}
                    </div>
                  )}

                  {!it.has_expiry && !it.numeric_input && (
                    <>
                      <div className="status-buttons">
                        <button type="button" className={`status-btn status-ok ${a.status === 'OK' ? 'status-btn-active' : ''}`} onClick={() => setAnswer(it.id, { status: 'OK' })}>
                          {it.status_label_ok || 'พร้อมใช้'}
                        </button>
                        <button type="button" className={`status-btn status-not-ok ${a.status === 'NOT_OK' ? 'status-btn-active' : ''}`} onClick={() => setAnswer(it.id, { status: 'NOT_OK' })}>
                          {it.status_label_bad || 'ไม่พร้อมใช้'}
                        </button>
                      </div>
                      {(it.unit || (it.standard_qty && it.standard_qty.split(',').every((n) => !isNaN(Number(n.trim())) && n.trim() !== ''))) && (
                        <>
                          <div className="field-label" style={{ marginTop: 10, marginBottom: 6 }}>จำนวนที่ตรวจนับได้จริง</div>
                          <div className="med-row">
                            <input
                              type="text"
                              className="text-input"
                              style={{ fontSize: 22, fontWeight: 700, textAlign: 'center' }}
                              placeholder={`มาตรฐาน ${it.standard_qty}`}
                              value={a.amount || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                const autoStatus = compareAmountToStandard(val, it.standard_qty);
                                setAnswer(it.id, autoStatus ? { amount: val, status: autoStatus } : { amount: val });
                              }}
                            />
                            {it.unit && <span className="unit-label">{it.unit}</span>}
                          </div>
                        </>
                      )}
                    </>
                  )}

                  <input type="text" className="text-input note-input" placeholder="หมายเหตุ (ถ้ามี)" value={a.note || ''} onChange={(e) => setAnswer(it.id, { note: e.target.value })} />

                  {it.photo_attach && (
                    <div className="photo-attach-block">
                      {a.photoUrl && (
                        <img src={a.photoUrl} alt="รูปที่แนบ" className="photo-preview" />
                      )}
                      <label className={`photo-btn ${a.photoUrl ? 'photo-btn-active' : ''}`}>
                        {uploadingId === it.id ? '⏳ กำลังอัปโหลด...' : a.photoUrl ? '📷 เปลี่ยนรูป' : '📷 แนบรูปถ่าย'}
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          style={{ display: 'none' }}
                          onChange={(e) => handlePhotoSelect(it, e.target.files[0])}
                          disabled={uploadingId === it.id}
                        />
                      </label>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {rows.length === 0 && <div className="empty-state">ยังไม่มีรายการตรวจสอบสำหรับหมวดนี้</div>}
        </div>

        {rows.length > 0 && (
          <>
            <div className="summary-bar">
              <span>สรุปผล</span>
              <span className={`summary-value ${overallStatus === 'READY' ? 'summary-ok' : 'summary-not-ok'}`}>
                {overallStatus === 'READY' ? 'พร้อมใช้งาน' : `ไม่พร้อมใช้งาน (${problemCount} รายการ)`}
              </span>
            </div>
            <div className="checklist-standard" style={{ marginBottom: 10 }}>ผู้บันทึก: {user.name}</div>
            {isAdmin ? (
              <div className="empty-state">👁 โหมดดูอย่างเดียว (Admin) — ไม่สามารถบันทึกหรือแก้ไขข้อมูลได้</div>
            ) : (
              <>
                {submitError && <div className="form-error">{submitError}</div>}
                <button className="btn-primary" disabled={!allAnswered || submitting} onClick={handleSubmit}>
                  {submitting ? 'กำลังบันทึก...' : isVisitor ? 'ลองบันทึกผลการตรวจสอบ (โหมดทดลอง)' : 'บันทึกผลการตรวจสอบ'}
                </button>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}

// -------------------------------------------------------------------------
// Dashboard (ADMIN เท่านั้น) — สรุปความพร้อมใช้งาน กรองตามช่วงเวลา + ความครบถ้วนตามรอบ
// -------------------------------------------------------------------------
const PERIOD_OPTIONS = [
  { key: 'today', label: 'วันนี้' },
  { key: 'week', label: 'สัปดาห์นี้' },
  { key: 'month', label: 'เดือนนี้' },
  { key: 'all', label: 'ทั้งหมด' },
];

function periodStartDate(key) {
  const now = new Date();
  if (key === 'today') return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  if (key === 'week') {
    const day = now.getDay();
    const diffToMonday = day === 0 ? 6 : day - 1;
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMonday).toISOString();
  }
  if (key === 'month') return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  return null;
}

const CATEGORY_LABELS = { AMBULANCE: 'รถพยาบาล', FIELD_BAG: 'กระเป๋าออกตรวจฉุกเฉิน', EMERGENCY_BAG: 'กระเป๋า บ.ฉุกเฉิน', STATION: 'Station' };

function MiniDonut({ pct }) {
  return (
    <div className="mini-donut" style={{ background: `conic-gradient(#22D3EE 0% ${pct}%, rgba(255,255,255,0.12) ${pct}% 100%)` }}>
      <div className="mini-donut-center">{pct}%</div>
    </div>
  );
}

function OverallReadinessCard({ summary, periodLabel }) {
  const totalReady = summary.reduce((s, r) => s + Number(r.ready_count), 0);
  const totalNotReady = summary.reduce((s, r) => s + Number(r.not_ready_count), 0);
  const total = totalReady + totalNotReady;
  const readyPct = total > 0 ? Math.round((totalReady / total) * 100) : 0;
  const gradient = total > 0 ? `conic-gradient(#1D9A63 0% ${readyPct}%, #D64545 ${readyPct}% 100%)` : `#8797AE`;

  return (
    <div className="dash-overall-card">
      <div>
        <div className="dash-overall-caption">ความพร้อมใช้งาน ({periodLabel})</div>
        <div className="dash-overall-pct">{total > 0 ? `${readyPct}%` : 'ไม่มีข้อมูล'}</div>
        <div className="dash-overall-detail">
          {total > 0 ? `${totalReady} พร้อมใช้ · ${totalNotReady} ไม่พร้อมใช้ จาก ${total} จุดที่ตรวจ` : 'ยังไม่มีการตรวจสอบในช่วงนี้'}
        </div>
      </div>
      <div className="dash-overall-donut-wrap" style={{ background: gradient }}>
        <div className="dash-overall-donut-center">{total > 0 ? `${readyPct}%` : '–'}</div>
      </div>
    </div>
  );
}

function ComplianceStrip({ compliance }) {
  const labels = { ambulance_daily: 'ตรวจประจำวัน (รถพยาบาล) วันนี้', ambulance_weekly: 'ตรวจประจำสัปดาห์ (รถพยาบาล) สัปดาห์นี้' };
  return (
    <div className="dash-compliance-list">
      {compliance.map((row) => {
        const complete = row.total_count > 0 && row.done_count >= row.total_count;
        return (
          <div className="dash-compliance-row" key={row.module_key}>
            <span>{labels[row.module_key] || row.module_key}</span>
            <span className={`dash-pill ${complete ? 'pill-ok' : 'pill-warn'}`}>
              {complete ? `ครบ ${row.done_count}/${row.total_count} คัน` : `ยังขาด ${row.total_count - row.done_count}/${row.total_count} คัน`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const CATEGORY_ICONS = { AMBULANCE: '🚑', FIELD_BAG: '🎒', EMERGENCY_BAG: '🛩️', STATION: '🏥' };

function CategoryGrid({ summary }) {
  return (
    <div className="dash-category-grid">
      {summary.map((row) => {
        const total = Number(row.ready_count) + Number(row.not_ready_count);
        const pct = total > 0 ? Math.round((Number(row.ready_count) / total) * 100) : 0;
        return (
          <div className="dash-category-card" key={row.category}>
            <div className="dash-category-icon">{CATEGORY_ICONS[row.category] || '📍'}</div>
            <MiniDonut pct={pct} />
            <div className="dash-category-label">{CATEGORY_LABELS[row.category] || row.category}</div>
            <div className="dash-category-sub">{total > 0 ? `${row.ready_count}/${total} พร้อมใช้` : 'ไม่มีข้อมูล'}</div>
          </div>
        );
      })}
      {summary.length === 0 && <div className="empty-state">ยังไม่มีข้อมูลในช่วงเวลานี้</div>}
    </div>
  );
}

function NotReadyList({ items, onSelect }) {
  if (items.length === 0) return <div className="empty-state">ไม่มีจุดที่ต้องแก้ไขในช่วงเวลานี้</div>;
  return (
    <div className="dash-notready-list">
      {items.map((it, idx) => (
        <button type="button" className="dash-notready-row" key={idx} onClick={() => onSelect(it)}>
          <div>
            <div className="dash-notready-name">{it.location_label} · {it.module_key}</div>
            <div className="dash-notready-sub">{it.problem_count} รายการไม่พร้อมใช้ · แตะเพื่อดูรายละเอียด</div>
          </div>
          <span className="dash-pill pill-danger">ไม่พร้อมใช้</span>
        </button>
      ))}
    </div>
  );
}

function NotReadyDetailScreen({ item, onBack }) {
  const [problems, setProblems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getInspectionProblemItems(item.inspection_id).then((res) => {
      setProblems(res.data || []);
      setLoading(false);
    });
  }, [item.inspection_id]);

  return (
    <div className="screen dashboard-dark">
      <TopBar title={item.location_label} sub={item.module_key} onBack={onBack} />
      <main className="form-body">
        <div className="dash-notready-sub" style={{ marginBottom: 12 }}>
          ตรวจล่าสุด: {formatThaiDateTime(new Date(item.submitted_at))}
        </div>
        {loading && <div className="empty-state">กำลังโหลด...</div>}
        {!loading && problems.length === 0 && <div className="empty-state">ไม่พบรายละเอียดรายการที่ไม่พร้อมใช้</div>}
        {!loading && problems.map((p, idx) => (
          <div className="dash-notready-row" key={idx} style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
            <div className="dash-notready-name">{p.item_name}</div>
            {p.expiry_date && <div className="dash-notready-sub">วันหมดอายุ: {p.expiry_date}</div>}
            {p.amount && <div className="dash-notready-sub">จำนวนที่ตรวจนับได้: {p.amount}</div>}
            {p.note && <div className="dash-notready-sub">หมายเหตุ: {p.note}</div>}
          </div>
        ))}
      </main>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <>
      <div className="skel skel-card" />
      <div className="skel skel-title" />
      <div className="skel skel-row" />
      <div className="skel skel-row" />
      <div className="skel skel-title" />
      <div className="skel-grid">
        <div className="skel skel-tile" />
        <div className="skel skel-tile" />
        <div className="skel skel-tile" />
        <div className="skel skel-tile" />
      </div>
      <div className="skel skel-title" />
      <div className="skel skel-row" />
      <div className="skel skel-row" />
      <div className="skel skel-row" />
    </>
  );
}

function RadialGauge({ pct, color, label, size = 72, thickness = 7 }) {
  const r = (size - thickness) / 2;
  const c = size / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (circumference * (pct || 0)) / 100;
  return (
    <div style={{ textAlign: 'center' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={c} cy={c} r={r} fill="none" stroke="#1B2540" strokeWidth={thickness} />
        <circle
          cx={c} cy={c} r={r} fill="none" stroke={color} strokeWidth={thickness}
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round" transform={`rotate(-90 ${c} ${c})`}
        />
        <text x={c} y={c + size * 0.07} fill="#E7ECFB" fontSize={size * 0.21} fontWeight="700" textAnchor="middle">{pct}%</text>
      </svg>
      {label && <div style={{ color: '#8B96B3', fontSize: 11, marginTop: 2 }}>{label}</div>}
    </div>
  );
}

function ProgressBarRow({ label, pct }) {
  const color = pct >= 90 ? 'linear-gradient(90deg,#22D3EE,#34D399)'
    : pct >= 60 ? 'linear-gradient(90deg,#FBBF24,#FB923C)'
    : 'linear-gradient(90deg,#FB7185,#F43F5E)';
  const pctColor = pct >= 90 ? '#22D3EE' : pct >= 60 ? '#FBBF24' : '#FB7185';
  return (
    <div className="bar-row">
      <div className="bar-row-top">
        <span className="bar-row-label">{label}</span>
        <span className="bar-row-pct" style={{ color: pctColor }}>{pct}%</span>
      </div>
      <div className="bar-track"><div className="bar-fill" style={{ width: `${pct}%`, background: color }} /></div>
    </div>
  );
}

function CategoryInsightScreen({ onBack }) {
  const [category, setCategory] = useState('AMBULANCE');
  const [period, setPeriod] = useState('month');
  const [locSummary, setLocSummary] = useState([]);
  const [trend, setTrend] = useState([]);
  const [topProblems, setTopProblems] = useState([]);
  const [moduleBreakdown, setModuleBreakdown] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const start = periodStartDate(period);
      const [locRes, trendRes, probRes, modRes] = await Promise.all([
        getCategoryLocationSummary(category, start),
        getCategoryReadinessTrend(category, 14),
        getCategoryTopProblems(category, start, 8),
        getCategoryModuleBreakdown(category),
      ]);
      setLocSummary(locRes.data || []);
      setTrend(trendRes.data || []);
      setTopProblems(probRes.data || []);
      setModuleBreakdown(modRes.data || []);
      setLoading(false);
    })();
  }, [category, period]);

  const groupedModules = {};
  moduleBreakdown.forEach((m) => {
    if (!groupedModules[m.location_label]) groupedModules[m.location_label] = [];
    groupedModules[m.location_label].push(m);
  });

  const validTrend = trend.filter((t) => t.ready_pct !== null && t.ready_pct !== undefined);
  const last7 = validTrend.slice(-7);
  const weekAvg = last7.length > 0 ? Math.round(last7.reduce((s, t) => s + Number(t.ready_pct), 0) / last7.length) : 0;
  const monthAvg = validTrend.length > 0 ? Math.round(validTrend.reduce((s, t) => s + Number(t.ready_pct), 0) / validTrend.length) : 0;

  return (
    <div className="screen dashboard-dark">
      <TopBar title="เปรียบเทียบตามหมวด" sub={CATEGORY_LABELS[category]} onBack={onBack} />
      <main className="form-body dashboard-wide">
        <div className="filter-bar">
          <div className="filter-group">
            <span className="filter-label">หมวด</span>
            <select className="filter-select" value={category} onChange={(e) => setCategory(e.target.value)}>
              {Object.keys(CATEGORY_LABELS).map((c) => (
                <option key={c} value={c}>{CATEGORY_ICONS[c]} {CATEGORY_LABELS[c]}</option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <span className="filter-label">ช่วงเวลา</span>
            <select className="filter-select" value={period} onChange={(e) => setPeriod(e.target.value)}>
              {PERIOD_OPTIONS.map((p) => (
                <option key={p.key} value={p.key}>{p.label}</option>
              ))}
            </select>
          </div>
        </div>

        {loading && <DashboardSkeleton />}
        {!loading && (
          <>
            <h3 className="dash-section-title">เทรนด์ความพร้อมใช้งาน 14 วันล่าสุด</h3>
            <div className="dash-overall-card" style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#26324A" />
                  <XAxis dataKey="day" tickFormatter={(d) => d ? d.slice(5) : ''} stroke="#8B96B3" fontSize={11} />
                  <YAxis domain={[0, 100]} stroke="#8B96B3" fontSize={11} />
                  <Tooltip contentStyle={{ background: '#141B2E', border: '1px solid #26324A', color: '#E7ECFB' }} />
                  <Line type="monotone" dataKey="ready_pct" stroke="#22D3EE" strokeWidth={3} dot={{ r: 3 }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div style={{ display: 'flex', gap: 14, justifyContent: 'center', marginTop: 14 }}>
              <RadialGauge pct={weekAvg} color="#22D3EE" label="เฉลี่ย 7 วันล่าสุด" />
              <RadialGauge pct={monthAvg} color="#A78BFA" label="เฉลี่ย 14 วันล่าสุด" />
            </div>

            <h3 className="dash-section-title">เปรียบเทียบความพร้อมใช้งานแต่ละจุด</h3>
            {locSummary.map((row) => {
              const pct = row.total_count > 0 ? Math.round((row.ready_count / row.total_count) * 100) : 0;
              return <ProgressBarRow key={row.location_id} label={row.location_label} pct={pct} />;
            })}
            {locSummary.length === 0 && <div className="empty-state">ไม่มีข้อมูลในช่วงเวลานี้</div>}

            <h3 className="dash-section-title">อันดับรายการที่มีปัญหาบ่อยสุด</h3>
            {topProblems.map((p, idx) => (
              <div className="dash-notready-row" key={idx}>
                <div>
                  <div className="dash-notready-name">#{idx + 1} {p.item_name}</div>
                </div>
                <span className="dash-pill pill-danger">{p.problem_count} ครั้ง</span>
              </div>
            ))}
            {topProblems.length === 0 && <div className="empty-state">ไม่พบรายการที่มีปัญหาในช่วงเวลานี้</div>}

            <h3 className="dash-section-title">สัดส่วนความพร้อมแยกตามโมดูลย่อย</h3>
            {Object.entries(groupedModules).map(([locLabel, mods]) => (
              <div key={locLabel} style={{ marginBottom: 14 }}>
                <div className="dash-notready-name" style={{ marginBottom: 6 }}>{locLabel}</div>
                {mods.map((m) => (
                  <div className="dash-compliance-row" key={m.module_key}>
                    <span>{m.module_key}</span>
                    <span className={`dash-pill ${m.overall_status === 'READY' ? 'pill-ok' : m.overall_status === 'NOT_READY' ? 'pill-danger' : 'pill-none'}`}>
                      {m.overall_status === 'READY' ? 'พร้อมใช้' : m.overall_status === 'NOT_READY' ? 'ไม่พร้อมใช้' : m.overall_status || 'ยังไม่ตรวจ'}
                    </span>
                  </div>
                ))}
              </div>
            ))}
            {Object.keys(groupedModules).length === 0 && <div className="empty-state">ไม่มีข้อมูล</div>}
          </>
        )}
      </main>
    </div>
  );
}

function ExpiringAlertsList({ items }) {
  if (items.length === 0) return <div className="empty-state">ไม่มีรายการใกล้หมดอายุ</div>;
  return (
    <div className="dashboard-expiring-list">
      {items.map((it, idx) => (
        <div className="dashboard-expiring-row" key={idx}>
          <div className="dashboard-expiring-top">
            <span className="dashboard-expiring-ic">🗓️</span>
            <div>
              <div className="dashboard-expiring-name">{it.item_name}</div>
              <div className="dashboard-expiring-loc">{it.location_label}</div>
            </div>
          </div>
          <span className={`med-status-pill ${it.status === 'EXPIRED' ? 'med-status-expired' : 'med-status-near'}`}>
            {it.status === 'EXPIRED' ? 'หมดอายุแล้ว' : 'ใกล้หมดอายุ'} · {it.expiry_date}
          </span>
        </div>
      ))}
    </div>
  );
}

// -------------------------------------------------------------------------
// Dashboard shell ใหม่: sidebar + topbar + การ์ดสรุป (ตามดีไซน์ที่อนุมัติ)
// -------------------------------------------------------------------------
const DASHBOARD_NAV = [
  { key: 'overview', icon: '🏠', label: 'แดชบอร์ด' },
  { key: 'reportSummary', icon: '📄', label: 'รายงานสรุป' },
  { key: 'reportDetail', icon: '📋', label: 'รายงานละเอียด' },
  { key: 'operations', icon: '🗓️', label: 'ปฏิบัติการตรวจ' },
  { key: 'insight', icon: '📊', label: 'เปรียบเทียบตามหมวด' },
  { key: 'notready', icon: '⛔', label: 'รายการไม่พร้อมใช้' },
  { key: 'ack', icon: '✅', label: 'การรับทราบผู้รับผิดชอบรถ' },
  { key: 'expiring', icon: '⏳', label: 'ใกล้หมดอายุ' },
  { key: 'settings', icon: '⚙️', label: 'ตั้งค่า' },
];

function DashboardSidebar({ activeKey, onNavigate }) {
  return (
    <aside className="dsb-sidebar">
      <div className="dsb-brand">
        <span className="dsb-brand-ic">🛡️</span>
        <span className="dsb-brand-text">AOT Medical Readiness System</span>
      </div>
      <nav className="dsb-nav">
        {DASHBOARD_NAV.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`dsb-nav-item ${activeKey === item.key ? 'dsb-nav-item-active' : ''}`}
            onClick={() => onNavigate(item.key)}
          >
            <span className="dsb-nav-ic">{item.icon}</span>
            <span className="dsb-nav-label">{item.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}

function DashboardTopBar({ user, alertCount, onExit }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <header className="dtb-bar">
      <div className="dtb-clock">
        <span className="dtb-clock-ic">🕐</span>
        <div>
          <div className="dtb-clock-label">อัปเดตล่าสุด</div>
          <div className="dtb-clock-value">
            {now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} · {now.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' })}
          </div>
        </div>
      </div>
      <div className="dtb-right">
        <div className="dtb-bell">
          🔔
          {alertCount > 0 && <span className="dtb-bell-badge">{alertCount}</span>}
        </div>
        <div className="dtb-user">
          <div className="dtb-user-avatar">👤</div>
          <div>
            <div className="dtb-user-name">{user.name}</div>
            <div className="dtb-user-role">{ROLES[user.role]?.label || user.role}</div>
          </div>
        </div>
        <button type="button" className="dtb-exit" onClick={onExit}>ออก</button>
      </div>
    </header>
  );
}

function StatCardReadiness({ pct, detail, periodLabel }) {
  return (
    <div className="dstat-card">
      <div>
        <div className="dstat-label">ความพร้อมใช้งาน ({periodLabel})</div>
        <div className="dstat-big">{pct !== null ? `${pct}%` : '–'}</div>
        <div className="dstat-detail">{detail}</div>
      </div>
      <RadialGauge pct={pct || 0} color="#22D3EE" label="" size={92} thickness={9} />
    </div>
  );
}

function StatCardCompliance({ icon, label, done, total }) {
  const missing = Math.max(total - done, 0);
  const complete = total > 0 && missing === 0;
  return (
    <div className="dstat-card dstat-card-compliance">
      <div>
        <div className="dstat-label">{label}</div>
        {total === 0 ? (
          <div className="dstat-compliance-text">ไม่มีข้อมูล</div>
        ) : complete ? (
          <div className="dstat-compliance-text dstat-compliance-ok">ครบแล้ว <b>{done}/{total}</b> คัน</div>
        ) : (
          <div className="dstat-compliance-text">ยังขาด <b>{missing}/{total}</b> คัน</div>
        )}
      </div>
      <div className={`dstat-icon-box ${complete ? 'dstat-icon-box-ok' : ''}`}>{icon}</div>
    </div>
  );
}

function DashboardScreen({ user, onBack }) {
  const [period, setPeriod] = useState('today');
  const [summary, setSummary] = useState([]);
  const [notReady, setNotReady] = useState([]);
  const [compliance, setCompliance] = useState([]);
  const [expiring, setExpiring] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [ackSummary, setAckSummary] = useState([]);
  const [selectedNotReady, setSelectedNotReady] = useState(null);
  const [showCategoryInsight, setShowCategoryInsight] = useState(false);
  const [overallTrend, setOverallTrend] = useState([]);

  const notReadyRef = useRef(null);
  const ackRef = useRef(null);
  const expiringRef = useRef(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const start = periodStartDate(period);
      const [sumRes, notReadyRes, compRes, expRes, ackRes] = await Promise.all([
        getReadinessByPeriod(start),
        getNotReadyByPeriod(start),
        getAmbulanceCompliance(),
        getExpiringItems(),
        getAcknowledgmentSummary(start),
      ]);
      const err = sumRes.error || notReadyRes.error || compRes.error || expRes.error || ackRes.error;
      if (err) setLoadError(err);
      else {
        setSummary(sumRes.data || []);
        setNotReady(notReadyRes.data || []);
        setCompliance(compRes.data || []);
        setExpiring(expRes.data || []);
        setAckSummary(ackRes.data || []);
      }
      setLoading(false);
    })();
  }, [period]);

  useEffect(() => {
    getOverallReadinessTrend(14).then((res) => setOverallTrend(res.data || []));
  }, []);

  const periodLabel = PERIOD_OPTIONS.find((p) => p.key === period)?.label || '';

  const totalReady = summary.reduce((s, r) => s + Number(r.ready_count), 0);
  const totalNotReady = summary.reduce((s, r) => s + Number(r.not_ready_count), 0);
  const totalChecked = totalReady + totalNotReady;
  const readyPct = totalChecked > 0 ? Math.round((totalReady / totalChecked) * 100) : null;
  const readyDetail = totalChecked > 0
    ? `${totalReady} พร้อมใช้ • ${totalNotReady} ไม่พร้อมใช้ จาก ${totalChecked} จุดที่ตรวจ`
    : 'ยังไม่มีการตรวจสอบในช่วงนี้';

  const dailyRow = compliance.find((r) => r.module_key === 'ambulance_daily') || { total_count: 0, done_count: 0 };
  const weeklyRow = compliance.find((r) => r.module_key === 'ambulance_weekly') || { total_count: 0, done_count: 0 };

  const validTrend = overallTrend.filter((t) => t.ready_pct !== null && t.ready_pct !== undefined);
  const last7 = validTrend.slice(-7);
  const weekAvg = last7.length > 0 ? Math.round(last7.reduce((s, t) => s + Number(t.ready_pct), 0) / last7.length) : 0;
  const fullAvg = validTrend.length > 0 ? Math.round(validTrend.reduce((s, t) => s + Number(t.ready_pct), 0) / validTrend.length) : 0;

  const scrollTo = (ref) => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const handleNav = (key) => {
    if (key === 'reportSummary') generateMonthlyReportPDF();
    else if (key === 'reportDetail') generateDetailedMonthlyReportPDF();
    else if (key === 'insight') setShowCategoryInsight(true);
    else if (key === 'operations') onBack();
    else if (key === 'notready') scrollTo(notReadyRef);
    else if (key === 'ack') scrollTo(ackRef);
    else if (key === 'expiring') scrollTo(expiringRef);
  };

  if (selectedNotReady) {
    return <NotReadyDetailScreen item={selectedNotReady} onBack={() => setSelectedNotReady(null)} />;
  }
  if (showCategoryInsight) {
    return <CategoryInsightScreen onBack={() => setShowCategoryInsight(false)} />;
  }

  return (
    <div className="dboard-shell dashboard-dark">
      <DashboardSidebar activeKey="overview" onNavigate={handleNav} />
      <div className="dboard-main">
        <DashboardTopBar user={user} alertCount={notReady.length} onExit={onBack} />
        <main className="dboard-content">
          <div className="dboard-greeting">
            <div>
              <h1 className="dboard-greeting-title">สวัสดี, {user?.name}</h1>
              <div className="dboard-greeting-sub">ภาพรวมการตรวจเช็คอุปกรณ์ทางการแพทย์</div>
            </div>
            <div className="filter-group">
              <span className="filter-label">ช่วงเวลา</span>
              <select className="filter-select" value={period} onChange={(e) => setPeriod(e.target.value)}>
                {PERIOD_OPTIONS.map((p) => (
                  <option key={p.key} value={p.key}>{p.label}</option>
                ))}
              </select>
            </div>
          </div>

          {loading && <DashboardSkeleton />}
          {loadError && <div className="form-error">โหลดข้อมูลไม่สำเร็จ: {loadError}</div>}
          {!loading && !loadError && (
            <>
              <div className="dstat-row">
                <StatCardReadiness pct={readyPct} detail={readyDetail} periodLabel={periodLabel} />
                <StatCardCompliance icon="🚑" label="ตรวจประจำวัน (รถพยาบาล)" done={Number(dailyRow.done_count)} total={Number(dailyRow.total_count)} />
                <StatCardCompliance icon="🗓️" label="ตรวจประจำสัปดาห์ (สัปดาห์นี้)" done={Number(weeklyRow.done_count)} total={Number(weeklyRow.total_count)} />
              </div>

              <h3 className="dash-section-title">แยกตามหมวด</h3>
              <CategoryGrid summary={summary} />

              <div className="dash-two-col" style={{ marginTop: 20 }}>
                <div className="dstat-panel">
                  <h3 className="dash-section-title" style={{ marginTop: 0 }}>เทรนด์ความพร้อมใช้งาน 14 วันล่าสุด</h3>
                  <div style={{ height: 220 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={overallTrend}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#26324A" />
                        <XAxis dataKey="day" tickFormatter={(d) => d ? d.slice(5) : ''} stroke="#8B96B3" fontSize={11} />
                        <YAxis domain={[0, 100]} stroke="#8B96B3" fontSize={11} />
                        <Tooltip contentStyle={{ background: '#141B2E', border: '1px solid #26324A', color: '#E7ECFB' }} />
                        <Line type="monotone" dataKey="ready_pct" stroke="#22D3EE" strokeWidth={3} dot={{ r: 3 }} connectNulls />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="dstat-panel">
                  <h3 className="dash-section-title" style={{ marginTop: 0 }}>เปรียบเทียบความพร้อมใช้งาน</h3>
                  <div className="dcompare-row">
                    <RadialGauge pct={weekAvg} color="#22D3EE" label="เฉลี่ย 7 วันล่าสุด" size={110} thickness={10} />
                    <RadialGauge pct={fullAvg} color="#A78BFA" label="เฉลี่ย 14 วันล่าสุด" size={110} thickness={10} />
                  </div>
                </div>
              </div>

              <div className="dash-two-col" style={{ marginTop: 20 }} ref={notReadyRef}>
                <div>
                  <h3 className="dash-section-title" style={{ marginTop: 0 }}>รายการที่ยังไม่พร้อมใช้ ({periodLabel})</h3>
                  <NotReadyList items={notReady} onSelect={setSelectedNotReady} />
                </div>
                <div ref={ackRef}>
                  <h3 className="dash-section-title" style={{ marginTop: 0 }}>การรับทราบของผู้รับผิดชอบรถ ({periodLabel})</h3>
                  <div className="dash-notready-list">
                    {ackSummary.length === 0 && <div className="empty-state">ยังไม่มีข้อมูลในช่วงเวลานี้</div>}
                    {ackSummary.map((row) => {
                      const complete = row.total_inspections > 0 && row.acknowledged_count >= row.total_inspections;
                      return (
                        <div className="dash-notready-row" key={row.location_label}>
                          <div>
                            <div className="dash-notready-name">{row.location_label} · {row.responsible_name || 'ยังไม่กำหนดผู้รับผิดชอบ'}</div>
                            <div className="dash-notready-sub">รับทราบแล้ว {row.acknowledged_count}/{row.total_inspections} รายการ</div>
                          </div>
                          <span className={`dash-pill ${complete ? 'pill-ok' : 'pill-warn'}`}>{complete ? 'ครบ' : 'ยังไม่ครบ'}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <h3 className="dash-section-title" ref={expiringRef}>ใกล้หมดอายุ / หมดอายุ</h3>
              <ExpiringAlertsList items={expiring} />

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 20 }}>
                <button className="dash-pdf-btn dash-pdf-btn-outline" onClick={() => requestMonthlyReport('ปฏิทินการตรวจ', (year, month) => generateComplianceCalendarPDF(year, month))}>🗓️ ปฏิทินการตรวจ</button>
                <button className="dash-pdf-btn dash-pdf-btn-outline" onClick={() => generateProblemSummaryReportPDF()}>⚠️ สรุปรายการที่มีปัญหา</button>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
function ChangePasswordScreen({ onBack }) {
  const [username, setUsername] = useState('');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    setError('');
    if (!username.trim() || !oldPassword || !newPassword || !confirmPassword) {
      setError('กรุณากรอกข้อมูลให้ครบทุกช่อง');
      return;
    }
    if (newPassword.length < 6) {
      setError('รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('รหัสผ่านใหม่และรหัสยืนยันไม่ตรงกัน');
      return;
    }
    setSaving(true);
    const result = await changePassword(username.trim(), oldPassword, newPassword);
    setSaving(false);
    if (result.error) { setError(result.error); return; }
    setSuccess(true);
  };

  if (success) {
    return (
      <div className="screen center">
        <div className="auth-card">
          <div className="success-check">✓</div>
          <h1 className="auth-title">เปลี่ยนรหัสผ่านสำเร็จ</h1>
          <p className="auth-subtitle">ใช้รหัสผ่านใหม่ในการเข้าสู่ระบบครั้งต่อไป</p>
          <button className="btn-primary" style={{ marginTop: 24 }} onClick={onBack}>กลับสู่หน้าเข้าสู่ระบบ</button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen center">
      <div className="auth-card">
        <h1 className="auth-title">เปลี่ยนรหัสผ่าน</h1>
        <p className="auth-subtitle">กรอกชื่อผู้ใช้และรหัสผ่านเดิมเพื่อยืนยันตัวตน</p>

        <label className="field-label">ชื่อผู้ใช้ (Username)</label>
        <input type="text" className="text-input" value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" />

        <label className="field-label" style={{ marginTop: 16 }}>รหัสผ่านเดิม</label>
        <input type="password" className="text-input" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} />

        <label className="field-label" style={{ marginTop: 16 }}>รหัสผ่านใหม่</label>
        <input type="password" className="text-input" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />

        <label className="field-label" style={{ marginTop: 16 }}>ยืนยันรหัสผ่านใหม่</label>
        <input type="password" className="text-input" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />

        {error && <div className="form-error">{error}</div>}
        <button className="btn-primary" style={{ marginTop: 20 }} disabled={saving} onClick={handleSubmit}>
          {saving ? 'กำลังบันทึก...' : 'บันทึกรหัสผ่านใหม่'}
        </button>
        <button className="btn-ghost-navy" style={{ marginTop: 12, width: '100%' }} onClick={onBack}>‹ กลับสู่หน้าเข้าสู่ระบบ</button>
      </div>
    </div>
  );
}
const MODULE_LABELS_TH = {
  ambulance_daily: 'บันทึกประจำวัน', ambulance_weekly: 'ตรวจสภาพประจำสัปดาห์',
  ambulance_equipment: 'รายการอุปกรณ์', ambulance_medication: 'เวชภัณฑ์',
};

const FUEL_LABELS_TH = { F: 'เต็ม (F)', '3/4': '3/4', '1/2': '1/2', '1/4': '1/4', E: 'ต่ำ (E)' };

function PendingAcknowledgmentsScreen({ user, onBack }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [ackingId, setAckingId] = useState(null);

  const load = async () => {
    setLoading(true);
    const res = await getPendingAcknowledgments();
    if (res.error) setError(res.error); else setItems(res.data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleAck = async (inspectionId) => {
    setAckingId(inspectionId);
    const res = await acknowledgeInspection(inspectionId, user.id);
    setAckingId(null);
    if (!res.error) load();
  };

  return (
    <div className="screen">
      <TopBar title="รอรับทราบ" sub="รายการตรวจของคันที่คุณรับผิดชอบ" onBack={onBack} />
      <main className="form-body">
        {loading && <div className="empty-state">กำลังโหลดข้อมูล...</div>}
        {error && <div className="form-error">โหลดข้อมูลไม่สำเร็จ: {error}</div>}
        {!loading && !error && items.length === 0 && (
          <div className="empty-state">✓ รับทราบครบทุกรายการแล้ว</div>
        )}
        {!loading && !error && items.map((it) => (
          <div className="ack-card" key={it.inspection_id}>
            <div className="ack-card-top">
              <div className="ack-card-title">{it.location_label} · {MODULE_LABELS_TH[it.module_key] || it.module_key}</div>
              <span className={`dash-pill ${it.overall_status === 'READY' ? 'pill-ok' : 'pill-danger'}`}>
                {it.overall_status === 'READY' ? 'พร้อมใช้งาน' : 'ไม่พร้อมใช้งาน'}
              </span>
            </div>
            <div className="ack-card-sub">ผู้ตรวจ: {it.inspector_name} · {formatThaiDateTime(new Date(it.submitted_at))}</div>
            {it.module_key === 'ambulance_daily' && (
              <div className="checklist-standard" style={{ marginTop: 6 }}>
                เลขไมล์: {it.mileage || '-'} กม. · น้ำมัน: {FUEL_LABELS_TH[it.fuel_level] || it.fuel_level || '-'}
                {it.note && <><br />หมายเหตุ: {it.note}</>}
              </div>
            )}
            {it.problem_summary && (
              <div className="ack-problem-box">⚠️ {it.problem_summary}</div>
            )}
            <button className="btn-primary" style={{ marginTop: 10 }} disabled={ackingId === it.inspection_id} onClick={() => handleAck(it.inspection_id)}>
              {ackingId === it.inspection_id ? 'กำลังบันทึก...' : '✓ รับทราบ'}
            </button>
          </div>
        ))}
      </main>
    </div>
  );
}
function SuccessScreen({ onBackToMenu }) {
  return (
    <div className="screen center">
      <div className="auth-card">
        <div className="success-check">✓</div>
        <h1 className="auth-title">บันทึกผลสำเร็จ</h1>
        <p className="auth-subtitle">ข้อมูลการตรวจสอบถูกบันทึกเรียบร้อยแล้ว</p>
        <button className="btn-primary" style={{ marginTop: 24 }} onClick={onBackToMenu}>กลับสู่เมนูหลัก</button>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------
// Workspace รถพยาบาล — เลือกคันรถ > เมนูย่อย 4 โมดูล > ฟอร์ม
// -------------------------------------------------------------------------
function AmbulanceWorkspace({ locations, user, onExit }) {
  const [vehicle, setVehicle] = useState(null);
  const [module, setModule] = useState(null);
  const [saved, setSaved] = useState(false);

  if (saved) {
    return <SuccessScreen onBackToMenu={() => { setSaved(false); setModule(null); }} />;
  }
  if (!vehicle) {
    return <LocationPicker categoryMeta={CATEGORY_META.AMBULANCE} locations={locations} user={user} isAmbulance onSelectLocation={setVehicle} onBack={onExit} />;
  }
  if (!module) {
    return <ModuleMenu vehicle={vehicle} onSelectModule={setModule} onBack={() => setVehicle(null)} />;
  }
  const onBack = () => setModule(null);
  const onSaved = () => setSaved(true);

  if (module.id === 'daily') return <DailyLogModule vehicle={vehicle} user={user} onBack={onBack} onSaved={onSaved} />;
  return (
    <DynamicChecklistForm
      locationCode={vehicle.code}
      moduleKey={module.moduleKey}
      moduleLabel={`${module.label} — ${vehicle.label}`}
      user={user}
      onBack={onBack}
      onDone={onSaved}
    />
  );
}

// -------------------------------------------------------------------------
// Workspace ทั่วไป — สำหรับหมวดที่ไม่ใช่รถพยาบาล (กระเป๋ายา/กระเป๋าฉุกเฉิน/Station ฯลฯ)
// -------------------------------------------------------------------------
function GenericWorkspace({ category, user, onExit }) {
  const [location, setLocation] = useState(category.locations.length === 1 ? category.locations[0] : null);
  const [moduleGroup, setModuleGroup] = useState(null);
  const [saved, setSaved] = useState(false);

  if (saved) {
    return <SuccessScreen onBackToMenu={() => { setSaved(false); setModuleGroup(null); }} />;
  }
  if (!location) {
    return <LocationPicker categoryMeta={category.meta} locations={category.locations} user={user} onSelectLocation={setLocation} onBack={onExit} />;
  }
  if (!moduleGroup) {
    const backAction = category.locations.length === 1 ? onExit : () => setLocation(null);
    return <ModuleGroupPicker location={location} user={user} onSelectModule={setModuleGroup} onBack={backAction} />;
  }
  return (
    <DynamicChecklistForm
      locationCode={location.code}
      moduleKey={moduleGroup.moduleKey}
      moduleLabel={`${moduleGroup.label} — ${location.label}`}
      user={user}
      onBack={() => setModuleGroup(null)}
      onDone={() => setSaved(true)}
      accentColor={moduleGroup.accent}
    />
  );
}

// -------------------------------------------------------------------------
// ตัวเลือกเดือน/ปีก่อนออกรายงานตารางรายเดือน (เพื่อดูรายงานย้อนหลังได้)
// -------------------------------------------------------------------------
const THAI_MONTH_NAMES = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

/**
 * เรียกใช้แทนการยิงฟังก์ชันสร้างรายงานตรงๆ — จะเด้งให้เลือกเดือน/ปีก่อนเสมอ
 * onGenerate: (year, month) => void — ฟังก์ชันสร้างรายงานจริง เรียกพร้อมปี ค.ศ. และเดือน (1-12) ที่เลือก
 */
function requestMonthlyReport(title, onGenerate) {
  window.dispatchEvent(new CustomEvent('aot-pick-month', { detail: { title, onGenerate } }));
}

function MonthPickerModal({ request, onClose }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  useEffect(() => {
    if (request) { setYear(now.getFullYear()); setMonth(now.getMonth() + 1); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  if (!request) return null;
  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

  return (
    <div className="pdf-modal-overlay" onClick={onClose}>
      <div className="month-picker-box" onClick={(e) => e.stopPropagation()}>
        <div className="pdf-modal-header">
          <span className="pdf-modal-title">{request.title}</span>
          <button type="button" className="pdf-modal-close" onClick={onClose} aria-label="ปิด">✕</button>
        </div>
        <div className="month-picker-body">
          <label className="field-label">เลือกเดือน/ปีที่ต้องการดูรายงาน</label>
          <div className="month-picker-selects">
            <select className="filter-select" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {THAI_MONTH_NAMES.map((m, i) => (
                <option key={i} value={i + 1}>{m}</option>
              ))}
            </select>
            <select className="filter-select" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {years.map((y) => (
                <option key={y} value={y}>{y + 543}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="btn-primary"
            style={{ marginTop: 18 }}
            onClick={() => { request.onGenerate(year, month); onClose(); }}
          >
            ดูรายงาน
          </button>
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------
// ตัวเลือกไตรมาส/ปีก่อนออกรายงานสรุปรายไตรมาส (เพื่อดูรายงานย้อนหลังได้)
// -------------------------------------------------------------------------
const QUARTER_OPTIONS = [
  { qStartMonth: 10, label: 'ไตรมาส 1 (ต.ค. - ธ.ค.)' },
  { qStartMonth: 1, label: 'ไตรมาส 2 (ม.ค. - มี.ค.)' },
  { qStartMonth: 4, label: 'ไตรมาส 3 (เม.ย. - มิ.ย.)' },
  { qStartMonth: 7, label: 'ไตรมาส 4 (ก.ค. - ก.ย.)' },
];

function currentQuarterStartMonth(now) {
  const month = now.getMonth() + 1;
  if (month >= 10) return 10;
  if (month >= 7) return 7;
  if (month >= 4) return 4;
  return 1;
}

/**
 * เรียกใช้แทนการยิงฟังก์ชันสร้างรายงานตรงๆ — จะเด้งให้เลือกไตรมาส/ปีก่อนเสมอ
 * onGenerate: (year, qStartMonth) => void — ฟังก์ชันสร้างรายงานจริง เรียกพร้อมปี ค.ศ. และเดือนเริ่มไตรมาส (1/4/7/10) ที่เลือก
 */
function requestQuarterlyReport(title, onGenerate) {
  window.dispatchEvent(new CustomEvent('aot-pick-quarter', { detail: { title, onGenerate } }));
}

function QuarterPickerModal({ request, onClose }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [qStartMonth, setQStartMonth] = useState(currentQuarterStartMonth(now));

  useEffect(() => {
    if (request) { setYear(now.getFullYear()); setQStartMonth(currentQuarterStartMonth(now)); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  if (!request) return null;
  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

  return (
    <div className="pdf-modal-overlay" onClick={onClose}>
      <div className="month-picker-box" onClick={(e) => e.stopPropagation()}>
        <div className="pdf-modal-header">
          <span className="pdf-modal-title">{request.title}</span>
          <button type="button" className="pdf-modal-close" onClick={onClose} aria-label="ปิด">✕</button>
        </div>
        <div className="month-picker-body">
          <label className="field-label">เลือกไตรมาส/ปีที่ต้องการดูรายงาน</label>
          <div className="month-picker-selects">
            <select className="filter-select" value={qStartMonth} onChange={(e) => setQStartMonth(Number(e.target.value))}>
              {QUARTER_OPTIONS.map((q) => (
                <option key={q.qStartMonth} value={q.qStartMonth}>{q.label}</option>
              ))}
            </select>
            <select className="filter-select" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {years.map((y) => (
                <option key={y} value={y}>{y + 543}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="btn-primary"
            style={{ marginTop: 18 }}
            onClick={() => { request.onGenerate(year, qStartMonth); onClose(); }}
          >
            ดูรายงาน
          </button>
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------
// ตัวแสดง PDF ในหน้าเดิม (แทนการเปิดแท็บ/หน้าต่างใหม่ ซึ่งใช้ไม่ได้ใน in-app browser หลายตัว)
// -------------------------------------------------------------------------
function PdfViewerModal({ pdf, onClose }) {
  if (!pdf) return null;
  return (
    <div className="pdf-modal-overlay" onClick={onClose}>
      <div className="pdf-modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="pdf-modal-header">
          <span className="pdf-modal-title">{pdf.filename}</span>
          <div className="pdf-modal-actions">
            <a className="pdf-modal-btn" href={pdf.dataUrl} download={pdf.filename}>⬇ ดาวน์โหลด</a>
            <button type="button" className="pdf-modal-close" onClick={onClose} aria-label="ปิด">✕</button>
          </div>
        </div>
        <iframe title={pdf.filename} src={pdf.dataUrl} className="pdf-modal-iframe" />
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------
// App หลัก
// -------------------------------------------------------------------------
export default function App() {
  const [user, setUser] = useState(null);
  const [activeCategory, setActiveCategory] = useState(null);
  const [showDashboard, setShowDashboard] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [showPendingAck, setShowPendingAck] = useState(false);
  const [pdfModal, setPdfModal] = useState(null);
  const [monthPickerRequest, setMonthPickerRequest] = useState(null);
  const [quarterPickerRequest, setQuarterPickerRequest] = useState(null);

  useEffect(() => {
    const handler = (e) => setPdfModal(e.detail);
    window.addEventListener('aot-show-pdf', handler);
    return () => window.removeEventListener('aot-show-pdf', handler);
  }, []);

  useEffect(() => {
    const handler = (e) => setMonthPickerRequest(e.detail);
    window.addEventListener('aot-pick-month', handler);
    return () => window.removeEventListener('aot-pick-month', handler);
  }, []);

  useEffect(() => {
    const handler = (e) => setQuarterPickerRequest(e.detail);
    window.addEventListener('aot-pick-quarter', handler);
    return () => window.removeEventListener('aot-pick-quarter', handler);
  }, []);

  const handleLogout = async () => {
    await logout();
    setUser(null);
    setActiveCategory(null);
    setShowDashboard(false);
    setShowPendingAck(false);
  };

  let screen;
  if (!user) {
    screen = showForgotPassword
      ? <ChangePasswordScreen onBack={() => setShowForgotPassword(false)} />
      : <LoginScreen onLoggedIn={setUser} onForgotPassword={() => setShowForgotPassword(true)} />;
  } else if (showPendingAck) {
    screen = <PendingAcknowledgmentsScreen user={user} onBack={() => setShowPendingAck(false)} />;
  } else if (showDashboard) {
    screen = <DashboardScreen user={user} onBack={() => setShowDashboard(false)} />;
  } else if (!activeCategory) {
    screen = <MainMenu user={user} onSelectCategory={setActiveCategory} onLogout={handleLogout} onOpenDashboard={() => setShowDashboard(true)} onOpenPendingAck={() => setShowPendingAck(true)} />;
  } else if (activeCategory.id === 'AMBULANCE') {
    screen = <AmbulanceWorkspace locations={activeCategory.locations} user={user} onExit={() => setActiveCategory(null)} />;
  } else {
    screen = <GenericWorkspace category={activeCategory} user={user} onExit={() => setActiveCategory(null)} />;
  }

  return (
    <>
      {screen}
      <PdfViewerModal pdf={pdfModal} onClose={() => setPdfModal(null)} />
      <MonthPickerModal request={monthPickerRequest} onClose={() => setMonthPickerRequest(null)} />
      <QuarterPickerModal request={quarterPickerRequest} onClose={() => setQuarterPickerRequest(null)} />
    </>
  );
}