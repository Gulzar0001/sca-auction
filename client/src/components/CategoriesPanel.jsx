import { useEffect, useState } from 'react';
import { getCategories, createCategory, updateCategory, deleteCategory } from '../api';

const EMPTY = { name: '', basePrice: '', increment: '', color: '#f0c040', order: 3 };

export default function CategoriesPanel() {
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function load() {
    const res = await getCategories();
    setCategories(res.data);
  }

  useEffect(() => { load(); }, []);

  function startEdit(cat) {
    setEditing(cat._id);
    setForm({ name: cat.name, basePrice: cat.basePrice, increment: cat.increment, color: cat.color, order: cat.order });
  }

  function resetForm() { setEditing(null); setForm(EMPTY); setError(''); }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const data = { ...form, basePrice: Number(form.basePrice), increment: Number(form.increment), order: Number(form.order) };
      if (editing) await updateCategory(editing, data);
      else await createCategory(data);
      await load(); resetForm();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally { setLoading(false); }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this category? This may break existing players.')) return;
    await deleteCategory(id); load();
  }

  return (
    <div style={styles.root}>
      <h1 style={styles.pageTitle}>Categories</h1>
      <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 8 }}>
        Categories control base prices and bid increments. Changes here affect all new players.
        Order: 1 = Platinum (highest), 2 = Diamond, 3 = Gold.
      </p>
      {error && <div style={styles.error}>{error}</div>}

      <div style={styles.layout}>
        {/* Form */}
        <div style={styles.formCard}>
          <div style={styles.cardHeader}>{editing ? 'Edit Category' : 'Add Category'}</div>
          <form onSubmit={handleSubmit} style={styles.form}>
            <Field label="Name" required>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Platinum" required />
            </Field>
            <Field label="Base Price">
              <input type="number" value={form.basePrice} onChange={e => setForm(f => ({ ...f, basePrice: e.target.value }))} placeholder="e.g. 50" required />
            </Field>
            <Field label="Bid Increment">
              <input type="number" value={form.increment} onChange={e => setForm(f => ({ ...f, increment: e.target.value }))} placeholder="e.g. 15" required />
            </Field>
            <Field label="Order (1=highest tier)">
              <input type="number" value={form.order} onChange={e => setForm(f => ({ ...f, order: e.target.value }))} min={1} />
            </Field>
            <Field label="Color (hex)">
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                  style={{ width: 40, height: 36, padding: 2, borderRadius: 6, background: '#1e2535', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }} />
                <input value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} placeholder="#hex" style={{ flex: 1 }} />
              </div>
            </Field>
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button type="submit" disabled={loading} style={styles.submitBtn}>
                {loading ? 'Saving…' : editing ? 'Update' : 'Add'}
              </button>
              {editing && <button type="button" onClick={resetForm} style={styles.cancelBtn}>Cancel</button>}
            </div>
          </form>
        </div>

        {/* Category cards */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {categories.map(cat => (
            <div key={cat._id} style={{ ...styles.catCard, borderLeftColor: cat.color }}>
              <div style={styles.catLeft}>
                <div style={{ width: 14, height: 14, borderRadius: 4, background: cat.color, flexShrink: 0, marginTop: 2 }} />
                <div>
                  <div style={styles.catName}>{cat.name}</div>
                  <div style={{ fontSize: 12, color: '#4a5568', fontFamily: 'Barlow Condensed, sans-serif', letterSpacing: 1 }}>
                    Order {cat.order}
                  </div>
                </div>
              </div>
              <div style={styles.catNumbers}>
                <div style={styles.catNum}>
                  <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 28, color: cat.color, lineHeight: 1 }}>{cat.basePrice}</span>
                  <span style={styles.catNumLabel}>Base Price</span>
                </div>
                <div style={styles.catDivider} />
                <div style={styles.catNum}>
                  <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 28, color: '#f0f2f8', lineHeight: 1 }}>+{cat.increment}</span>
                  <span style={styles.catNumLabel}>Increment</span>
                </div>
                <div style={{ display: 'flex', gap: 6, marginLeft: 16 }}>
                  <ActionBtn label="Edit" onClick={() => startEdit(cat)} />
                  <ActionBtn label="Delete" danger onClick={() => handleDelete(cat._id)} />
                </div>
              </div>
            </div>
          ))}
          {categories.length === 0 && (
            <div style={{ color: '#4a5568', fontSize: 14, fontStyle: 'italic', padding: 16 }}>
              No categories yet. Default ones (Platinum, Diamond, Gold) are seeded on server start.
            </div>
          )}
        </div>
      </div>
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
  submitBtn: { padding: '9px 20px', borderRadius: 8, background: 'rgba(240,192,64,0.15)', border: '1px solid rgba(240,192,64,0.4)', color: '#f0c040', fontSize: 14, fontWeight: 600, fontFamily: 'Barlow Condensed, sans-serif', cursor: 'pointer' },
  cancelBtn: { padding: '9px 16px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#8892aa', fontSize: 14, cursor: 'pointer', fontFamily: 'Barlow Condensed, sans-serif' },
  catCard: { background: 'rgba(22,27,39,0.8)', border: '1px solid rgba(255,255,255,0.07)', borderLeftWidth: 3, borderRadius: 12, padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  catLeft: { display: 'flex', gap: 10, alignItems: 'flex-start' },
  catName: { fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, letterSpacing: 1, color: '#f0f2f8' },
  catNumbers: { display: 'flex', alignItems: 'center', gap: 16 },
  catNum: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 },
  catNumLabel: { fontSize: 10, color: '#4a5568', fontFamily: 'Barlow Condensed, sans-serif', letterSpacing: 1 },
  catDivider: { width: 1, height: 32, background: 'rgba(255,255,255,0.08)' },
};
