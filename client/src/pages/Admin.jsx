import { useState } from 'react';
import AuctionControl from '../components/AuctionControl';
import PlayersPanel from '../components/PlayersPanel';
import TeamsPanel from '../components/TeamsPanel';
import CategoriesPanel from '../components/CategoriesPanel';

const NAV = [
  { id: 'auction', icon: '🏏', label: 'Auction' },
  { id: 'players', icon: '🧍', label: 'Players' },
  { id: 'teams', icon: '🏆', label: 'Teams' },
  { id: 'categories', icon: '💎', label: 'Categories' },
];

export default function Admin() {
  const [active, setActive] = useState('auction');

  return (
    <div style={styles.root}>
      {/* Sidebar */}
      <aside style={styles.sidebar}>
        <div style={styles.sidebarLogo}>
          <span style={styles.logoText}>SCA</span>
          <span style={styles.logoSub}>Admin</span>
        </div>
        <nav style={styles.nav}>
          {NAV.map(item => (
            <button
              key={item.id}
              onClick={() => setActive(item.id)}
              style={{
                ...styles.navBtn,
                ...(active === item.id ? styles.navBtnActive : {})
              }}
            >
              <span style={styles.navIcon}>{item.icon}</span>
              <span style={styles.navLabel}>{item.label}</span>
              {active === item.id && <div style={styles.navIndicator} />}
            </button>
          ))}
        </nav>
        <div style={styles.sidebarFooter}>
          <a href="/auction" target="_blank" style={styles.publicLink}>
            📺 Public Screen ↗
          </a>
        </div>
      </aside>

      {/* Content */}
      <main style={styles.content}>
        {active === 'auction' && <AuctionControl />}
        {active === 'players' && <PlayersPanel />}
        {active === 'teams' && <TeamsPanel />}
        {active === 'categories' && <CategoriesPanel />}
      </main>
    </div>
  );
}

const styles = {
  root: {
    display: 'flex', height: '100vh', overflow: 'hidden',
    background: '#0d1018', fontFamily: 'Barlow, sans-serif',
  },
  sidebar: {
    width: 200, flexShrink: 0,
    background: 'rgba(22,27,39,0.95)',
    borderRight: '1px solid rgba(255,255,255,0.06)',
    display: 'flex', flexDirection: 'column',
    padding: '20px 0',
  },
  sidebarLogo: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: '0 20px 24px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    marginBottom: 16,
  },
  logoText: {
    fontFamily: 'Bebas Neue, sans-serif', fontSize: 36, letterSpacing: 4,
    color: '#f0c040', textShadow: '0 0 20px rgba(240,192,64,0.4)',
  },
  logoSub: { fontSize: 11, color: '#4a5568', letterSpacing: 3, fontFamily: 'Barlow Condensed, sans-serif' },
  nav: { display: 'flex', flexDirection: 'column', gap: 2, padding: '0 8px', flex: 1 },
  navBtn: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '10px 14px', borderRadius: 10,
    background: 'transparent', color: '#6b7280',
    fontFamily: 'Barlow, sans-serif', fontSize: 14, fontWeight: 500,
    position: 'relative', overflow: 'hidden',
    transition: 'all 0.2s',
    border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left',
  },
  navBtnActive: { background: 'rgba(240,192,64,0.1)', color: '#f0f2f8' },
  navIcon: { fontSize: 16 },
  navLabel: { flex: 1 },
  navIndicator: {
    position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
    width: 3, height: 20, background: '#f0c040', borderRadius: '0 2px 2px 0',
  },
  sidebarFooter: {
    padding: '16px 16px 0',
    borderTop: '1px solid rgba(255,255,255,0.06)',
    marginTop: 'auto',
  },
  publicLink: {
    display: 'block', padding: '8px 10px', borderRadius: 8,
    background: 'rgba(255,255,255,0.04)', color: '#8892aa',
    fontSize: 12, textDecoration: 'none', textAlign: 'center',
    fontFamily: 'Barlow Condensed, sans-serif', letterSpacing: 1,
    transition: 'all 0.2s',
  },
  content: {
    flex: 1, overflow: 'auto', padding: '24px',
    background: '#0d1018',

    
  },
};
