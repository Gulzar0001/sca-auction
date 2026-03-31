import { useEffect, useRef, useState } from 'react';
import { getPlayers, createPlayer, updatePlayer, deletePlayer, getCategories, getTeams, setCaptain } from '../api';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const ROLES = ['Batsman', 'Bowler', 'All-Rounder'];
const EMPTY = { name: '', image: '', role: 'Batsman', category: '', locality: '', stats: '', basePrice: '', isCapt: false };

export default function PlayersPanel() {
  const [players, setPlayers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [teams, setTeams] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [captainModal, setCaptainModal] = useState(null);
  const [captainTeam, setCaptainTeam] = useState('');
  const [filter, setFilter] = useState('all');
  const [photoPreview, setPhotoPreview] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef();

  async function load() {
    const [p, c, t] = await Promise.all([getPlayers(), getCategories(), getTeams()]);
    setPlayers(p.data);
    setCategories(c.data);
    setTeams(t.data);
    if (!form.category && c.data.length > 0) setForm(f => ({ ...f, category: c.data[0]._id }));
  }

  useEffect(() => { load(); }, []);

  function startEdit(player) {
    setEditing(player._id);
    setForm({
      name: player.name,
      image: player.image || '',
      role: player.role,
      category: player.category?._id || player.category,
      locality: player.locality || '',
      stats: player.stats || '',
      basePrice: player.basePrice,
      isCapt: player.isCapt,
    });
    setPhotoPreview(player.image ? (player.image.startsWith('/uploads') ? `${API}${player.image}` : player.image) : '');
  }

  function resetForm() { setEditing(null); setForm({ ...EMPTY, category: categories[0]?._id || '' }); setError(''); setPhotoPreview(''); if (fileRef.current) fileRef.current.value = ''; }

  async function handlePhotoChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    setPhotoPreview(URL.createObjectURL(file));
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('logo', file);
      const res = await fetch(`${API}/api/upload/logo`, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setForm(f => ({ ...f, image: data.url }));
    } catch (err) {
      setError(err.message);
      setPhotoPreview('');
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const cat = categories.find(c => c._id === form.category);
      const data = {
        ...form,
        basePrice: form.basePrice !== '' ? Number(form.basePrice) : (cat?.basePrice || 0),
      };
      if (editing) await updatePlayer(editing, data);
      else await createPlayer(data);
      await load(); resetForm();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally { setLoading(false); }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this player?')) return;
    await deletePlayer(id); load();
  }

  async function handleSetCaptain() {
    if (!captainModal || !captainTeam) return;
    try {
      await setCaptain(captainModal, captainTeam);
      setCaptainModal(null); setCaptainTeam('');
      load();
    } catch (err) { setError(err.response?.data?.error || err.message); }
  }

  const catSelected = categories.find(c => c._id === form.category);
  const filtered = filter === 'all' ? players : players.filter(p => {
    if (filter === 'captain') return p.isCapt;
    if (filter === 'pending') return p.status === 'pending';
    if (filter === 'sold') return p.status === 'sold';
    return (p.category?.name || '').toLowerCase().includes(filter);
  });

  return (
    <div style={styles.root}>
      <h1 style={styles.pageTitle}>Players</h1>

      {error && <div style={styles.error}>{error}</div>}

      <div style={styles.layout}>
        {/* Form */}
        <div style={styles.formCard}>
          <div style={styles.cardHeader}>{editing ? 'Edit Player' : 'Add Player'}</div>
          <form onSubmit={handleSubmit} style={styles.form}>
            <Field label="Name" required>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Player name" required />
            </Field>
            <Field label="Role">
              <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                {ROLES.map(r => <option key={r}>{r}</option>)}
              </select>
            </Field>
            <Field label="Category">
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                {categories.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label={`Base Price (${catSelected?.name || ''} default: ${catSelected?.basePrice || '—'})`}>
              <input type="number" value={form.basePrice}
                onChange={e => setForm(f => ({ ...f, basePrice: e.target.value }))}
                placeholder={`Leave blank for category default (${catSelected?.basePrice || '?'})`} />
            </Field>
            <Field label="Locality">
              <input value={form.locality} onChange={e => setForm(f => ({ ...f, locality: e.target.value }))} placeholder="e.g. Gulberg, Model Town" />
            </Field>
            <Field label="Stats (optional)">
              <input value={form.stats} onChange={e => setForm(f => ({ ...f, stats: e.target.value }))} placeholder="e.g. Avg: 45, SR: 130" />
            </Field>
            <Field label="Player Photo (optional)">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => fileRef.current.click()}
                  disabled={uploading}
                  style={styles.uploadBtn}
                >
                  {uploading ? 'Uploading…' : photoPreview ? '⟳ Change Photo' : '↑ Upload Photo'}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handlePhotoChange}
                />
                {photoPreview && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                    <img src={photoPreview} alt="preview"
                      style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', border: '1px solid rgba(255,255,255,0.1)' }} />
                    <button type="button" onClick={() => { setPhotoPreview(''); setForm(f => ({ ...f, image: '' })); if (fileRef.current) fileRef.current.value = ''; }}
                      style={{ fontSize: 11, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>
                      Remove
                    </button>
                  </div>
                )}
              </div>
            </Field>
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button type="submit" disabled={loading} style={styles.submitBtn}>
                {loading ? 'Saving…' : editing ? 'Update' : 'Add Player'}
              </button>
              {editing && <button type="button" onClick={resetForm} style={styles.cancelBtn}>Cancel</button>}
            </div>
          </form>
        </div>

        {/* Player list */}
        <div style={{ flex: 1 }}>
          <div style={styles.filterRow}>
            {['all', 'platinum', 'diamond', 'gold', 'captain', 'pending', 'sold'].map(f => (
              <button key={f} onClick={() => setFilter(f)}
                style={{ ...styles.filterBtn, ...(filter === f ? styles.filterActive : {}) }}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          <div style={styles.playerList}>
            {filtered.map(player => (
              <div key={player._id} style={styles.playerRow}>
                <img
                  src={player.image ? (player.image.startsWith('/uploads') ? `${API}${player.image}` : player.image) : avatarSvg}
                  alt={player.name}
                  style={styles.thumb}
                  onError={e => { e.target.src = avatarSvg; }}
                />
                <div style={{ flex: 1 }}>
                  <div style={styles.pName}>
                    {player.name}
                    {player.isCapt && <span style={styles.captBadge}>Captain</span>}
                    {player.demotionCount > 0 && <span style={styles.demBadge}>Demoted</span>}
                  </div>
                  <div style={styles.pMeta}>
                    {player.role} · {player.locality || '—'} ·{' '}
                    <CategoryBadge name={player.category?.name} />
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                    <span style={styles.pPrice}>{player.basePrice} pts base</span>
                    <StatusBadge status={player.status} />
                    {player.team && <span style={{ color: '#22c55e', fontSize: 11 }}>→ {player.team?.name || 'Team'}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {!player.isCapt && (
                    <ActionBtn label="👑 Captain" onClick={() => { setCaptainModal(player._id); setCaptainTeam(''); }} />
                  )}
                  <ActionBtn label="Edit" onClick={() => startEdit(player)} />
                  <ActionBtn label="Delete" danger onClick={() => handleDelete(player._id)} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Captain modal */}
      {captainModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <div style={styles.cardHeader}>Assign as Captain</div>
            <select value={captainTeam} onChange={e => setCaptainTeam(e.target.value)} style={{ marginBottom: 12 }}>
              <option value="">Select team...</option>
              {teams.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleSetCaptain} disabled={!captainTeam} style={styles.submitBtn}>Assign</button>
              <button onClick={() => setCaptainModal(null)} style={styles.cancelBtn}>Cancel</button>
            </div>
          </div>
        </div>
      )}
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

function CategoryBadge({ name }) {
  const n = (name || '').toLowerCase();
  const c = n.includes('plat') ? '#e8e8f0' : n.includes('diamond') ? '#7dd3fc' : '#f0c040';
  return <span style={{ color: c, fontSize: 11, fontFamily: 'Barlow Condensed, sans-serif' }}>{name}</span>;
}

function StatusBadge({ status }) {
  const colors = { pending: '#6b7280', live: '#f0c040', sold: '#22c55e', unsold: '#ef4444' };
  return (
    <span style={{
      color: colors[status] || '#6b7280', fontSize: 11,
      fontFamily: 'Barlow Condensed, sans-serif', letterSpacing: 1, textTransform: 'uppercase',
    }}>{status}</span>
  );
}

const avatarSvg = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'%3E%3Crect width='80' height='80' fill='%231e2535'/%3E%3Ccircle cx='40' cy='30' r='16' fill='%23374151'/%3E%3Cellipse cx='40' cy='70' rx='24' ry='16' fill='%23374151'/%3E%3C/svg%3E`;

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
  filterRow: { display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' },
  filterBtn: { padding: '5px 12px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: '#4a5568', fontSize: 12, cursor: 'pointer', fontFamily: 'Barlow Condensed, sans-serif', letterSpacing: 1 },
  filterActive: { background: 'rgba(240,192,64,0.1)', borderColor: 'rgba(240,192,64,0.3)', color: '#f0c040' },
  playerList: { display: 'flex', flexDirection: 'column', gap: 8 },
  playerRow: { display: 'flex', gap: 12, alignItems: 'center', padding: '10px 14px', background: 'rgba(22,27,39,0.8)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10 },
  thumb: { width: 44, height: 44, borderRadius: 8, objectFit: 'cover', background: '#1e2535', flexShrink: 0 },
  pName: { fontSize: 15, fontWeight: 600, color: '#f0f2f8', display: 'flex', gap: 6, alignItems: 'center' },
  captBadge: { background: 'rgba(240,192,64,0.15)', color: '#f0c040', border: '1px solid rgba(240,192,64,0.3)', padding: '1px 7px', borderRadius: 10, fontSize: 10, fontFamily: 'Barlow Condensed, sans-serif', letterSpacing: 1 },
  demBadge: { background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', padding: '1px 7px', borderRadius: 10, fontSize: 10, fontFamily: 'Barlow Condensed, sans-serif' },
  pMeta: { color: '#6b7280', fontSize: 13, marginTop: 2, display: 'flex', gap: 4, alignItems: 'center' },
  pPrice: { color: '#4a5568', fontSize: 12 },
  modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  modal: { background: '#161b27', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: 24, minWidth: 300 },
};