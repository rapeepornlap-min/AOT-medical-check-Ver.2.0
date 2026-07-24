import React, { useState, useEffect, useMemo } from 'react';
import { loginWithUsername, logout } from './lib/auth';
import { saveInspection } from './lib/inspections';
import { getLocationsForRole, getChecklistItems, getModuleItemCounts, getCategoryReadinessSummary, getExpiringItems } from './lib/checklist';
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
function LoginScreen({ onLoggedIn }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
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
        <h1 className="auth-title">Medical Checklist</h1>
        <p className="auth-subtitle">รถพยาบาล · อุปกรณ์ · เวชภัณฑ์ · ยา</p>
        <form onSubmit={handleSubmit} className="auth-form">
          <label className="field-label" htmlFor="username">ชื่อผู้ใช้ (Username)</label>
          <input id="username" type="text" className="text-input" placeholder="เช่น nurse1" value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" />
          <label className="field-label" style={{ marginTop: 16 }} htmlFor="password">รหัสผ่าน</label>
          <input id="password" type="password" className="text-input" placeholder="รหัสผ่าน" value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <div className="form-error">{error}</div>}
          <button type="submit" className="btn-primary" style={{ marginTop: 24 }} disabled={loading}>
            {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบตรวจสอบ'}
          </button>
        </form>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------
// เมนูหลัก — ดึง locations ที่ role นี้เข้าถึงได้จาก Supabase แล้วจัดกลุ่มตาม category
// -------------------------------------------------------------------------
function MainMenu({ user, onSelectCategory, onLogout, onOpenDashboard }) {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    (async () => {
      const res = await getLocationsForRole(user.role);
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
      <TopBar title="AOT MEDICAL CLINIC" sub={`${user.name} · ${ROLES[user.role]?.label || user.role}`} onBack={onLogout} backLabel="ออกจากระบบ" />
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
        {!loading && !loadError && user.role === 'ADMIN' && (
          <button className="menu-card" onClick={onOpenDashboard}>
            <div className="menu-card-dot" />
            <div className="menu-card-num">รายการที่ 5</div>
            <div className="menu-card-label">Dashboard</div>
            <div className="menu-card-subtitle">สรุปความพร้อมใช้งานภาพรวมทุกจุด</div>
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
function LocationPicker({ categoryMeta, locations, onSelectLocation, onBack }) {
  return (
    <div className="screen">
      <TopBar title={categoryMeta.label} sub="เลือกจุดที่ต้องการตรวจสอบ" onBack={onBack} />
      <main className="menu-grid">
        {locations.map((loc, idx) => (
          <button key={loc.id} className="menu-card" onClick={() => onSelectLocation(loc)}>
            <div className="menu-card-dot" />
            <div className="menu-card-num">จุดที่ {idx + 1}</div>
            <div className="menu-card-label">{loc.label}</div>
          </button>
        ))}
      </main>
    </div>
  );
}

// -------------------------------------------------------------------------
// เลือกกลุ่ม module_key ย่อยภายใน location หนึ่งๆ
// -------------------------------------------------------------------------
function ModuleGroupPicker({ location, user, onSelectModule, onBack }) {
  const groups = (LOCATION_MODULE_GROUPS[location.code] || []).filter(
    (g) => !g.allowedRoles || g.allowedRoles.includes(user.role)
  );
  const [counts, setCounts] = useState({});

  useEffect(() => {
    const keys = groups.map((g) => g.moduleKey);
    if (keys.length === 0) return;
    getModuleItemCounts(keys).then((res) => {
      if (res.data) setCounts(res.data);
    });
  }, [location.code]);

  return (
    <div className="screen">
      <TopBar title={location.label} sub="เลือกรายการที่ต้องการตรวจสอบ" onBack={onBack} />
      <main className="menu-grid">
        {groups.map((g) => (
          <button
            key={g.moduleKey}
            className="menu-card"
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
          </button>
        ))}
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
          </button>
        ))}
      </main>
    </div>
  );
}

// ---------- โมดูล: บันทึกประจำวัน (ฟอร์มธรรมดา ไม่ใช้ checklist_templates) ----------
function DailyLogModule({ vehicle, user, onBack, onSaved }) {
  const isReadOnly = user.role === 'ADMIN';
  const [mileage, setMileage] = useState('');
  const [fuel, setFuel] = useState('F');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fuelLevels = [
    { key: 'F', label: 'เต็ม (F)' }, { key: '3/4', label: '3/4' }, { key: '1/2', label: '1/2' },
    { key: '1/4', label: '1/4' }, { key: 'E', label: 'ต่ำ (E)' },
  ];

  const handleSave = async () => {
    if (!mileage.trim()) { setError('กรุณากรอกเลขไมล์'); return; }
    setSaving(true);
    setError('');
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
      <main className="form-body">
        <label className="field-label">เลขไมล์ (กม.) *</label>
        <input className="text-input" placeholder="เช่น 123456" value={mileage} onChange={(e) => setMileage(e.target.value)} />

        <label className="field-label" style={{ marginTop: 16 }}>ปริมาณน้ำมัน</label>
        <div className="fuel-buttons">
          {fuelLevels.map((f) => (
            <button key={f.key} type="button" className={`fuel-btn ${fuel === f.key ? 'fuel-btn-active' : ''}`} onClick={() => setFuel(f.key)}>{f.label}</button>
          ))}
        </div>

        <label className="field-label" style={{ marginTop: 16 }}>หมายเหตุ / ปัญหาที่พบ</label>
        <textarea className="text-input textarea" placeholder="ระบุปัญหาหรือข้อสังเกต..." value={note} onChange={(e) => setNote(e.target.value)} />

        <div className="checklist-standard" style={{ marginTop: 16 }}>ผู้บันทึก: {user.name}</div>

        {error && <div className="form-error">{error}</div>}
        <button className="btn-primary" style={{ marginTop: 16 }} disabled={saving} onClick={handleSave}>
          {saving ? 'กำลังบันทึก...' : 'บันทึกการตรวจสอบวันนี้'}
        </button>
      </main>
    </div>
  );
}

// -------------------------------------------------------------------------
// ฟอร์มตรวจสอบแบบ Dynamic — ใช้ได้กับทุก module_key ที่ดึงจาก checklist_templates
// รองรับ: is_header (หัวข้อคั่น), has_expiry (วันหมดอายุ), numeric_input (กรอกจำนวน),
//         photo_attach (ปุ่มแนบรูป), reminder_note (ป้ายเตือน)
// -------------------------------------------------------------------------
function DynamicChecklistForm({ locationCode, moduleKey, moduleLabel, user, onBack, onDone, accentColor }) {
  const isReadOnly = user.role === 'ADMIN';
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [answers, setAnswers] = useState({}); // id -> { status, note, expiry, amount, photo }
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    (async () => {
      const res = await getChecklistItems(moduleKey);
      if (res.error) setLoadError(res.error);
      else setItems(res.data || []);
      setLoading(false);
    })();
  }, [moduleKey]);

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

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError('');
    const result = await saveInspection({
      locationCode,
      moduleKey,
      inspectorId: user.id,
      inspectorName: user.name,
      overallStatus,
      items: rows.map((it) => {
        const a = answers[it.id] || {};
        return {
          code: it.item_code,
          name: it.item_name,
          status: it.has_expiry ? medStatus(a.expiry) : (it.numeric_input ? 'OK' : a.status || null),
          expiryDate: a.expiry || null,
          amount: it.numeric_input ? (a.amount || '') : null,
          note: [a.note, a.photo ? `แนบรูปถ่ายแล้ว${it.unit ? '' : ''}` : ''].filter(Boolean).join(' · '),
        };
      }),
    });
    setSubmitting(false);
    if (result.error) setSubmitError(result.error); else onDone();
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
      <TopBar title={moduleLabel} sub={`${formatThaiDateTime(new Date())} · ${rows.length} รายการ`} onBack={onBack} />
      <main className="form-body">
        <div className="checklist" style={isReadOnly ? { pointerEvents: 'none', opacity: 0.55 } : undefined}>
          {items.map((it) => {
            if (it.is_header) {
              return <div className="checklist-header" key={it.id}>{it.item_name}</div>;
            }
            const a = answers[it.id] || {};
            return (
              <div className="checklist-row" key={it.id} style={accentColor ? { borderLeft: `5px solid ${accentColor}` } : undefined}>
                <div className="checklist-content">
                  <div className="checklist-item-label">{it.item_name}</div>
                  {it.standard_qty && <div className="checklist-standard">จำนวน: {it.standard_qty}</div>}
                  {it.reminder_note && <div className="reminder-banner">🔔 {it.reminder_note}</div>}

                 {it.has_expiry && (
                    <>
                      <div className="field-label" style={{ marginBottom: 6 }}>วันหมดอายุ (Exp.)</div>
                      <div className="med-row">
                        <input type="date" className="text-input" value={a.expiry || ''} onChange={(e) => setAnswer(it.id, { expiry: e.target.value })} />
                        <span className={`med-status-pill ${medStatusClass[medStatus(a.expiry)]}`}>{medStatusLabel[medStatus(a.expiry)]}</span>
                      </div>
                    </>
                  )}

                  {it.numeric_input && (
                    <div className="med-row">
                      <input type="number" className="text-input" placeholder="จำนวน" value={a.amount || ''} onChange={(e) => setAnswer(it.id, { amount: e.target.value })} />
                      {it.unit && <span className="unit-label">{it.unit}</span>}
                    </div>
                  )}

                  {!it.has_expiry && !it.numeric_input && (
                    <div className="status-buttons">
                      <button type="button" className={`status-btn status-ok ${a.status === 'OK' ? 'status-btn-active' : ''}`} onClick={() => setAnswer(it.id, { status: 'OK' })}>
                        {it.status_label_ok || 'พร้อมใช้'}
                      </button>
                      <button type="button" className={`status-btn status-not-ok ${a.status === 'NOT_OK' ? 'status-btn-active' : ''}`} onClick={() => setAnswer(it.id, { status: 'NOT_OK' })}>
                        {it.status_label_bad || 'ไม่พร้อมใช้'}
                      </button>
                    </div>
                  )}

                  <input type="text" className="text-input note-input" placeholder="หมายเหตุ (ถ้ามี)" value={a.note || ''} onChange={(e) => setAnswer(it.id, { note: e.target.value })} />

                  {it.photo_attach && (
                    <button type="button" className={`photo-btn ${a.photo ? 'photo-btn-active' : ''}`} onClick={() => setAnswer(it.id, { photo: !a.photo })}>
                      {a.photo ? '📷 แนบรูปถ่ายแล้ว' : '📷 แนบรูปถ่าย'}
                    </button>
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
            {isReadOnly ? (
              <div className="empty-state">👁 โหมดดูอย่างเดียว (Admin) — ไม่สามารถบันทึกหรือแก้ไขข้อมูลได้</div>
            ) : (
              <>
                {submitError && <div className="form-error">{submitError}</div>}
                <button className="btn-primary" disabled={!allAnswered || submitting} onClick={handleSubmit}>
                  {submitting ? 'กำลังบันทึก...' : 'บันทึกผลการตรวจสอบ'}
                </button>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
function ReadinessPieChart({ summary }) {
  const totalReady = summary.reduce((s, r) => s + Number(r.ready_count), 0);
  const totalNotReady = summary.reduce((s, r) => s + Number(r.not_ready_count), 0);
  const total = totalReady + totalNotReady;
  const readyPct = total > 0 ? (totalReady / total) * 100 : 0;
  const gradient = `conic-gradient(#1D9A63 0% ${readyPct}%, #D64545 ${readyPct}% 100%)`;

  return (
    <div className="dashboard-pie-wrap">
      <div className="dashboard-pie" style={{ background: gradient }}>
        <div className="dashboard-pie-center">
          <div className="dashboard-pie-pct">{total > 0 ? Math.round(readyPct) : 0}%</div>
          <div className="dashboard-pie-label">พร้อมใช้</div>
        </div>
      </div>
      <div className="dashboard-pie-legend">
        <div><span className="legend-dot" style={{ background: '#1D9A63' }} /> พร้อมใช้ ({totalReady})</div>
        <div><span className="legend-dot" style={{ background: '#D64545' }} /> ไม่พร้อมใช้ ({totalNotReady})</div>
      </div>
    </div>
  );
}

function CategoryBreakdownList({ summary }) {
  const labels = { AMBULANCE: 'รถพยาบาล', FIELD_BAG: 'กระเป๋าออกตรวจฉุกเฉิน', EMERGENCY_BAG: 'กระเป๋า บ.ฉุกเฉิน', STATION: 'Station' };
  return (
    <div className="dashboard-category-list">
      {summary.map((row) => (
        <div className="dashboard-category-row" key={row.category}>
          <span>{labels[row.category] || row.category}</span>
          <span>{row.ready_count}/{row.total_count} พร้อมใช้</span>
        </div>
      ))}
    </div>
  );
}

function ExpiringAlertsList({ items }) {
  if (items.length === 0) return <div className="empty-state">ไม่มีรายการใกล้หมดอายุ</div>;
  return (
    <div className="dashboard-expiring-list">
      {items.map((it, idx) => (
        <div className="dashboard-expiring-row" key={idx}>
          <div className="dashboard-expiring-name">{it.item_name}</div>
          <div className="dashboard-expiring-loc">{it.location_label}</div>
          <span className={`med-status-pill ${it.status === 'EXPIRED' ? 'med-status-expired' : 'med-status-near'}`}>
            {it.status === 'EXPIRED' ? 'หมดอายุแล้ว' : 'ใกล้หมดอายุ'} · {it.expiry_date}
          </span>
        </div>
      ))}
    </div>
  );
}

function DashboardScreen({ onBack }) {
  const [summary, setSummary] = useState([]);
  const [expiring, setExpiring] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    (async () => {
      const [sumRes, expRes] = await Promise.all([getCategoryReadinessSummary(), getExpiringItems()]);
      if (sumRes.error || expRes.error) setLoadError(sumRes.error || expRes.error);
      else {
        setSummary(sumRes.data || []);
        setExpiring(expRes.data || []);
      }
      setLoading(false);
    })();
  }, []);

  return (
    <div className="screen">
      <TopBar title="Dashboard" sub="สรุปความพร้อมใช้งานภาพรวม" onBack={onBack} />
      <main className="form-body">
        {loading && <div className="empty-state">กำลังโหลดข้อมูล...</div>}
        {loadError && <div className="form-error">โหลดข้อมูลไม่สำเร็จ: {loadError}</div>}
        {!loading && !loadError && (
          <>
            <ReadinessPieChart summary={summary} />
            <CategoryBreakdownList summary={summary} />
            <h3 style={{ marginTop: 24, marginBottom: 12 }}>รายการใกล้หมดอายุ / หมดอายุ</h3>
            <ExpiringAlertsList items={expiring} />
          </>
        )}
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
    return <LocationPicker categoryMeta={CATEGORY_META.AMBULANCE} locations={locations} onSelectLocation={setVehicle} onBack={onExit} />;
  }
  if (!module) {
    return <ModuleMenu vehicle={vehicle} onSelectModule={setModule} onBack={() => setVehicle(null)} />;
  }
  const onBack = () => setModule(null);
  const onSaved = () => setSaved(true);

  if (module.id === 'daily') return <DailyLogModule vehicle={vehicle} user={user} onBack={onBack} onSaved={onSaved} />;
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
// App หลัก
// -------------------------------------------------------------------------
export default function App() {
  const [user, setUser] = useState(null);
  const [activeCategory, setActiveCategory] = useState(null);
  const [showDashboard, setShowDashboard] = useState(false);

  const handleLogout = async () => {
    await logout();
    setUser(null);
    setActiveCategory(null);
    setShowDashboard(false);
  };

  if (!user) return <LoginScreen onLoggedIn={setUser} />;

  if (showDashboard) {
    return <DashboardScreen onBack={() => setShowDashboard(false)} />;
  }

  if (!activeCategory) {
    return <MainMenu user={user} onSelectCategory={setActiveCategory} onLogout={handleLogout} onOpenDashboard={() => setShowDashboard(true)} />;
  }

  if (activeCategory.id === 'AMBULANCE') {
    return <AmbulanceWorkspace locations={activeCategory.locations} user={user} onExit={() => setActiveCategory(null)} />;
  }

  return <GenericWorkspace category={activeCategory} user={user} onExit={() => setActiveCategory(null)} />;
}
