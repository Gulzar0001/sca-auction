import { useEffect, useRef, useState } from 'react';
import { getTeams, createTeam, updateTeam, deleteTeam } from '../api';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];
const EMPTY = { name: '', color: '#3b82f6', initialPurse: 100, logo: '' };

export default function TeamsPanel() {
  const [teams, setTeams] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [logoPreview, setLogoPreview] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef();

  async function load() {
    const res = await getTeams();
    setTeams(res.data);
  }

  useEffect(() => { load(); }, []);

  function startEdit(team) {
    setEditing(team._id);
    setForm({ name: team.name, color: team.color, initialPurse: team.initialPurse, logo: team.logo || '' });
    setLogoPreview(team.logo ? (team.logo.startsWith('/uploads') ? `${API}${team.logo}` : team.logo) : '');
  }

  function resetForm() { setEditing(null); setForm(EMPTY); setError(''); setLogoPreview(''); if (fileRef.current) fileRef.current.value = ''; }

  async function handleLogoChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    setLogoPreview(URL.createObjectURL(file));
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('logo', file);
      const res = await fetch(`${API}/api/upload/logo`, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setForm(f => ({ ...f, logo: data.url }));
    } catch (err) {
      setError(err.message);
      setLogoPreview('');
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const data = { ...form, initialPurse: Number(form.initialPurse) };
      if (editing) await updateTeam(editing, data);
      else await createTeam(data);
      await load(); resetForm();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally { setLoading(false); }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this team?')) return;
    await deleteTeam(id); load();
  }

  return (
    <div style={styles.root}>
      <h1 style={styles.pageTitle}>Teams</h1>
      {error && <div style={styles.error}>{error}</div>}

      <div style={styles.layout}>
        {/* Form */}
        <div style={styles.formCard}>
          <div style={styles.cardHeader}>{editing ? 'Edit Team' : 'Add Team'}</div>
          <form onSubmit={handleSubmit} style={styles.form}>
            <Field label="Team Name" required>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Team name" required />
            </Field>
            <Field label="Initial Purse (points)">
              <input type="number" value={form.initialPurse}
                onChange={e => setForm(f => ({ ...f, initialPurse: e.target.value }))} />
            </Field>
            <Field label="Team Color">
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                {COLORS.map(c => (
                  <button type="button" key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
                    style={{
                      width: 28, height: 28, borderRadius: 6, background: c, border: 'none',
                      outline: form.color === c ? '2px solid white' : '2px solid transparent',
                      cursor: 'pointer', transition: 'outline 0.15s',
                    }} />
                ))}
              </div>
              <input value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                placeholder="#hex" style={{ marginTop: 6 }} />
            </Field>
            <Field label="Team Logo (optional)">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => fileRef.current.click()}
                  disabled={uploading}
                  style={styles.uploadBtn}
                >
                  {uploading ? 'Uploading…' : logoPreview ? '⟳ Change Logo' : '↑ Upload Logo'}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleLogoChange}
                />
                {logoPreview && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                    <img src={logoPreview} alt="logo preview"
                      style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', border: '1px solid rgba(255,255,255,0.1)' }} />
                    <button type="button" onClick={() => { setLogoPreview(''); setForm(f => ({ ...f, logo: '' })); if (fileRef.current) fileRef.current.value = ''; }}
                      style={{ fontSize: 11, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>
                      Remove
                    </button>
                  </div>
                )}
              </div>
            </Field>
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button type="submit" disabled={loading} style={styles.submitBtn}>
                {loading ? 'Saving…' : editing ? 'Update' : 'Add Team'}
              </button>
              {editing && <button type="button" onClick={resetForm} style={styles.cancelBtn}>Cancel</button>}
            </div>
          </form>
        </div>

        {/* Team list */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {teams.map(team => (
            <div key={team._id} style={styles.teamCard}>
              <div style={styles.teamHeader}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 6, height: 48, borderRadius: 3, background: team.color, flexShrink: 0 }} />
                  <div>
                    <div style={styles.teamName}>{team.name}</div>
                    <div style={styles.teamMeta}>
                      Captain: <span style={{ color: '#f0f2f8' }}>{team.captain?.name || '—'}</span>
                    </div>
                  </div>
                </div>
                <div style={styles.teamNumbers}>
                  <div style={styles.numBlock}>
                    <span style={styles.numVal}>{team.purseRemaining ?? team.initialPurse}</span>
                    <span style={styles.numLabel}>Remaining</span>
                  </div>
                  <div style={styles.numDivider} />
                  <div style={styles.numBlock}>
                    <span style={styles.numVal}>{team.initialPurse}</span>
                    <span style={styles.numLabel}>Initial</span>
                  </div>
                  <div style={styles.numDivider} />
                  <div style={styles.numBlock}>
                    <span style={styles.numVal}>{team.playersBought?.length || 0}</span>
                    <span style={styles.numLabel}>Players</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginLeft: 8 }}>
                    <ActionBtn label="Edit" onClick={() => startEdit(team)} />
                    <ActionBtn label="Delete" danger onClick={() => handleDelete(team._id)} />
                  </div>
                </div>
              </div>

              <div style={styles.slotsRow}>
                <SlotGroup label="Platinum" filled={team.platSlotFilled ? 1 : 0} max={1} color="#e8e8f0" />
                <SlotGroup label="Diamond" filled={team.diamondSlotsFilled || 0} max={3} color="#7dd3fc" />
                <SlotGroup label="Gold" filled={team.goldSlotsFilled || 0} max={2} color="#f0c040" />
                <div style={{ marginLeft: 'auto', fontSize: 12, color: team.wildCardUsed ? '#22c55e' : '#4a5568' }}>
                  {team.wildCardUsed ? '⚡ Wild Card used' : '⚡ Wild Card available'}
                </div>
              </div>

              {team.playersBought?.length > 0 && (
                <div style={styles.roster}>
                  {team.playersBought.map(p => (
                    <div key={p._id || p} style={styles.rosterChip}>
                      <span style={{ fontSize: 12, color: '#f0f2f8' }}>{p.name || '—'}</span>
                      {p.currentPrice > 0 && <span style={{ fontSize: 11, color: '#22c55e' }}>{p.currentPrice}pts</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SlotGroup({ label, filled, max, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 11, color: '#4a5568', fontFamily: 'Barlow Condensed, sans-serif', letterSpacing: 1, minWidth: 60 }}>{label}</span>
      {Array.from({ length: max }).map((_, i) => (
        <div key={i} style={{
          width: 14, height: 14, borderRadius: 3,
          background: i < filled ? color : 'rgba(255,255,255,0.06)',
          border: `1px solid ${i < filled ? color : 'rgba(255,255,255,0.1)'}`,
        }} />
      ))}
      <span style={{ fontSize: 11, color: '#4a5568', marginLeft: 2 }}>{filled}/{max}</span>
    </div>
  );
}

function Field({ label, children, required }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 12, color: '#6b7280', fontFamily: 'Barlow Condensed, sans-serif', letterSpacing: 1 }}>
        {label}{required && <span style={{ color: '#ef4444' }}> *</span>}
      </label>
      {children}
    </div>
  );
}

function ActionBtn({ label, onClick, danger }) {
  return (
    <button onClick={onClick} style={{
      padding: '4px 10px', borderRadius: 6, fontSize: 12,
      background: danger ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.05)',
      border: `1px solid ${danger ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.1)'}`,
      color: danger ? '#ef4444' : '#8892aa', cursor: 'pointer',
      fontFamily: 'Barlow Condensed, sans-serif',
    }}>{label}</button>
  );
}

const styles = {
  root: { display: 'flex', flexDirection: 'column', gap: 16 },
  pageTitle: { fontFamily: 'Bebas Neue, sans-serif', fontSize: 32, letterSpacing: 2, color: '#f0f2f8' },
  error: { background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', padding: '10px 16px', borderRadius: 8, fontSize: 14 },
  layout: { display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16 },
  formCard: { background: 'rgba(22,27,39,0.8)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '18px 20px' },
  cardHeader: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 13, letterSpacing: 2, color: '#4a5568', textTransform: 'uppercase', marginBottom: 14 },
  form: { display: 'flex', flexDirection: 'column', gap: 10 },
  uploadBtn: { padding: '8px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#8892aa', fontSize: 13, fontFamily: 'Barlow Condensed, sans-serif', cursor: 'pointer', textAlign: 'left' },
  submitBtn: { padding: '9px 20px', borderRadius: 8, background: 'rgba(240,192,64,0.15)', border: '1px solid rgba(240,192,64,0.4)', color: '#f0c040', fontSize: 14, fontWeight: 600, fontFamily: 'Barlow Condensed, sans-serif', cursor: 'pointer' },
  cancelBtn: { padding: '9px 16px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#8892aa', fontSize: 14, cursor: 'pointer', fontFamily: 'Barlow Condensed, sans-serif' },
  teamCard: { background: 'rgba(22,27,39,0.8)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 },
  teamHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  teamName: { fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, letterSpacing: 1, color: '#f0f2f8' },
  teamMeta: { fontSize: 13, color: '#4a5568', marginTop: 2 },
  teamNumbers: { display: 'flex', alignItems: 'center', gap: 10 },
  numBlock: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 },
  numVal: { fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, color: '#f0f2f8', lineHeight: 1 },
  numLabel: { fontSize: 10, color: '#4a5568', fontFamily: 'Barlow Condensed, sans-serif', letterSpacing: 1 },
  numDivider: { width: 1, height: 28, background: 'rgba(255,255,255,0.08)' },
  slotsRow: { display: 'flex', gap: 20, alignItems: 'center', padding: '8px 0', borderTop: '1px solid rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.05)' },
  roster: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  rosterChip: { display: 'flex', gap: 6, alignItems: 'center', padding: '3px 10px', borderRadius: 20, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' },
};