import { useEffect, useState, useRef } from 'react';
import { useSocket } from '../context/SocketContext';
import { getAuctionState } from '../api';

const AVATAR = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'%3E%3Crect width='200' height='200' fill='%231e2535'/%3E%3Ccircle cx='100' cy='75' r='40' fill='%23374151'/%3E%3Cellipse cx='100' cy='170' rx='60' ry='40' fill='%23374151'/%3E%3C/svg%3E`;

function getCategoryStyle(catName) {
  const n = (catName || '').toLowerCase();
  if (n.includes('plat')) return { color: '#e8e8f0', glow: 'rgba(232,232,240,0.3)', label: 'PLATINUM', badge: '#c0c0d0' };
  if (n.includes('diamond')) return { color: '#7dd3fc', glow: 'rgba(125,211,252,0.3)', label: 'DIAMOND', badge: '#7dd3fc' };
  return { color: '#f0c040', glow: 'rgba(240,192,64,0.3)', label: 'GOLD', badge: '#f0c040' };
}

function getRoundLabel(phase, round) {
  const map = {
    'wildcard-plat': '⚡ WILD CARD — PLATINUM',
    'plat': `PLATINUM ROUND · R${round}`,
    'wildcard-diamond': '⚡ WILD CARD — DIAMOND',
    'diamond': `DIAMOND ROUND · R${round}`,
    'gold': `GOLD ROUND · R${round}`,
    'complete': 'AUCTION COMPLETE',
    'idle': 'AWAITING AUCTION',
  };
  return map[phase] || phase?.toUpperCase();
}

export default function PublicScreen() {
  const { socket } = useSocket();
  const [auctionData, setAuctionData] = useState(null);
  const [teams, setTeams] = useState([]);
  const [soldOverlay, setSoldOverlay] = useState(null);
  const [priceKey, setPriceKey] = useState(0);
  const [wcOverlay, setWcOverlay] = useState(null);
  const prevPrice = useRef(0);

  async function fetchState() {
    try {
      const res = await getAuctionState();
      setAuctionData(res.data.state);
      setTeams(res.data.teams || []);
    } catch (e) { console.error(e); }
  }

  useEffect(() => {
    fetchState();
  }, []);

  useEffect(() => {
    if (!socket) return;

    socket.on('auction:update', (data) => {
      setAuctionData(data.state);
      setTeams(data.teams || []);
      if (data.state?.currentBid !== prevPrice.current) {
        prevPrice.current = data.state?.currentBid;
        setPriceKey(k => k + 1);
      }
    });

    socket.on('player:sold', (data) => {
      setSoldOverlay(data);
      setTimeout(() => setSoldOverlay(null), 4000);
    });

    socket.on('auction:wildcard', (data) => {
      setWcOverlay(data);
      setTimeout(() => setWcOverlay(null), 3500);
    });

    socket.on('auction:bid', () => {
      setPriceKey(k => k + 1);
    });

    return () => {
      socket.off('auction:update');
      socket.off('player:sold');
      socket.off('auction:wildcard');
      socket.off('auction:bid');
    };
  }, [socket]);

  const state = auctionData;
  const player = state?.currentPlayer;
  const currentTeam = state?.currentTeam;
  const catStyle = player?.category ? getCategoryStyle(player.category.name) : getCategoryStyle('gold');
  const isLive = state?.status === 'live';
  const isSoldState = state?.status === 'sold';

  return (
    <div style={styles.root}>
      {/* Background glow based on category */}
      <div style={{
        ...styles.bgGlow,
        background: `radial-gradient(ellipse 60% 50% at 75% 40%, ${catStyle.glow} 0%, transparent 70%)`
      }} />

      {/* Header bar */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.scaLogo}>SCA</span>
          <span style={styles.scaSubtitle}>Street Cricket Association</span>
        </div>
        <div style={styles.roundBadge}>
          <span style={{ color: catStyle.color }}>
            {getRoundLabel(state?.roundPhase, state?.roundNumber)}
          </span>
        </div>
        <div style={styles.headerRight}>
          <div style={{ ...styles.statusDot, background: isLive ? '#22c55e' : '#6b7280' }} />
          <span style={{ color: '#8892aa', fontSize: 13, fontFamily: 'var(--font-condensed)' }}>
            {isLive ? 'LIVE' : state?.status?.toUpperCase() || 'IDLE'}
          </span>
        </div>
      </header>

      {/* Main content */}
      <main style={styles.main}>
        {/* LEFT: Player info + stats + bid info */}
        <section style={styles.leftSection}>
          {player ? (
            <>
              {/* Category badge */}
              <div style={styles.categoryRow}>
                <span style={{ ...styles.catBadge, color: catStyle.color, borderColor: catStyle.color, background: `${catStyle.glow}` }}>
                  ◆ {player.category?.name?.toUpperCase() || 'PLAYER'}
                </span>
                {state?.wcActive && (
                  <span style={styles.wcBadge}>⚡ WILD CARD</span>
                )}
              </div>

              {/* Player name */}
              <h1 style={styles.playerName}>{player.name}</h1>

              {/* Role · Locality */}
              <div style={styles.playerMeta}>
                <span>{player.role}</span>
                <span style={styles.metaDot}>·</span>
                <span>{player.locality || 'SCA League'}</span>
              </div>

              {/* Stats */}
              {player.stats && (
                <div style={styles.statsBlock}>
                  <span style={styles.statsText}>{player.stats}</span>
                </div>
              )}

              {/* Divider */}
              <div style={styles.divider} />

              {/* Pricing */}
              <div style={styles.pricingBlock}>
                <div style={styles.priceRow}>
                  <div style={styles.priceItem}>
                    <span style={styles.priceLabel}>BASE PRICE</span>
                    <span style={styles.basePrice}>{player.basePrice} <span style={styles.pts}>pts</span></span>
                  </div>
                  <div style={styles.priceSep} />
                  <div style={styles.priceItem}>
                    <span style={styles.priceLabel}>CURRENT BID</span>
                    <span key={priceKey} style={{
                      ...styles.currentPrice,
                      color: catStyle.color,
                      animation: 'price-pop 0.4s ease'
                    }}>
                      {state?.currentBid || player.basePrice}
                      <span style={styles.pts}> pts</span>
                    </span>
                  </div>
                </div>

                {/* Current highest bidder */}
                {currentTeam && (
                  <div style={{ ...styles.highestBidder, borderColor: catStyle.color }}>
                    <span style={styles.bidderLabel}>HIGHEST BIDDER</span>
                    <span style={{ ...styles.bidderName, color: catStyle.color }}>
                      {currentTeam.name || teams.find(t => t._id === currentTeam)?.name || '—'}
                    </span>
                  </div>
                )}

                {!currentTeam && isLive && (
                  <div style={styles.noBidYet}>
                    <span>No bids yet — starting at {player.basePrice} pts</span>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div style={styles.idleState}>
              <div style={styles.idleLogo}>SCA</div>
              <div style={styles.idleText}>
                {state?.status === 'complete' ? 'Auction Complete' : 'Awaiting Next Player…'}
              </div>
              <div style={styles.idleSub}>
                {getRoundLabel(state?.roundPhase, state?.roundNumber)}
              </div>
            </div>
          )}
        </section>

        {/* RIGHT: Player photo */}
        <section style={styles.rightSection}>
          <div style={styles.photoWrapper}>
            <img
              src={player?.image || AVATAR}
              alt={player?.name || 'Player'}
              style={styles.playerPhoto}
              onError={e => { e.target.src = AVATAR; }}
            />
            <div style={{ ...styles.photoGlow, background: `radial-gradient(ellipse 80% 60% at 50% 100%, ${catStyle.glow} 0%, transparent 70%)` }} />
          </div>
        </section>
      </main>

      {/* Bottom: Teams strip */}
      <footer style={styles.footer}>
        <div style={styles.teamsStrip}>
          {teams.length === 0 && (
            <span style={{ color: '#4a5568', fontSize: 13 }}>No teams yet</span>
          )}
          {teams.map(team => {
            const isLeading = currentTeam && (currentTeam._id === team._id || currentTeam === team._id);
            return (
              <div key={team._id} style={{
                ...styles.teamCard,
                borderColor: isLeading ? catStyle.color : 'rgba(255,255,255,0.07)',
                background: isLeading ? `${catStyle.glow}` : 'rgba(30,37,53,0.8)',
                boxShadow: isLeading ? `0 0 20px ${catStyle.glow}` : 'none',
              }}>
                <div style={{ ...styles.teamColorBar, background: team.color || '#3b82f6' }} />
                <div style={styles.teamInfo}>
                  <div style={styles.teamName}>{team.name}</div>
                  <div style={styles.teamStats}>
                    <span style={{ color: isLeading ? catStyle.color : '#22c55e' }}>
                      {team.purseRemaining ?? team.initialPurse} pts
                    </span>
                    <span style={styles.teamStatSep}>·</span>
                    <span style={{ color: '#8892aa' }}>{team.playersBought?.length || 0} players</span>
                  </div>
                </div>
                {isLeading && (
                  <div style={styles.leadingBadge}>LEADING</div>
                )}
                {team.wildCardUsed && (
                  <div style={styles.wcUsedBadge}>WC ✓</div>
                )}
              </div>
            );
          })}
        </div>

        {/* Roster mini-view */}
        <div style={styles.rosterStrip}>
          {teams.map(team => (
            <div key={team._id} style={styles.rosterCard}>
              <div style={{ ...styles.rosterTeamName, color: team.color || '#3b82f6' }}>{team.name}</div>
              <div style={styles.rosterSlots}>
                <SlotBar label="P" filled={team.platSlotFilled ? 1 : 0} max={1} color="#e8e8f0" />
                <SlotBar label="D" filled={team.diamondSlotsFilled || 0} max={3} color="#7dd3fc" />
                <SlotBar label="G" filled={team.goldSlotsFilled || 0} max={2} color="#f0c040" />
              </div>
            </div>
          ))}
        </div>
      </footer>

      {/* SOLD overlay */}
      {soldOverlay && (
        <div style={styles.soldOverlay}>
          <div style={styles.soldBox}>
            <div style={styles.soldHammer}>🔨</div>
            <div style={styles.soldWord}>SOLD!</div>
            <div style={styles.soldPlayer}>{soldOverlay.player?.name}</div>
            <div style={styles.soldTo}>to <span style={{ color: '#f0c040' }}>{soldOverlay.team?.name}</span></div>
            <div style={styles.soldPrice}>{soldOverlay.price} pts</div>
          </div>
        </div>
      )}

      {/* Wild Card overlay */}
      {wcOverlay && (
        <div style={styles.wcOverlayWrap}>
          <div style={styles.wcOverlayBox}>
            <div style={{ fontSize: 36 }}>⚡</div>
            <div style={styles.wcOverlayTitle}>WILD CARD!</div>
            <div style={styles.wcOverlayText}>
              <span style={{ color: '#f0c040' }}>{wcOverlay.team}</span> declares Wild Card on{' '}
              <span style={{ color: '#7dd3fc' }}>{wcOverlay.player}</span>
            </div>
            <div style={{ color: '#8892aa', fontSize: 14, marginTop: 4 }}>
              Base price elevated to {wcOverlay.basePrice} pts
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SlotBar({ label, filled, max, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
      <span style={{ fontSize: 10, color: '#4a5568', width: 12 }}>{label}</span>
      {Array.from({ length: max }).map((_, i) => (
        <div key={i} style={{
          width: 10, height: 10, borderRadius: 2,
          background: i < filled ? color : 'rgba(255,255,255,0.08)',
          border: `1px solid ${i < filled ? color : 'rgba(255,255,255,0.1)'}`,
        }} />
      ))}
    </div>
  );
}

const styles = {
  root: {
    minHeight: '100vh',
    background: '#0d1018',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    position: 'relative',
    fontFamily: 'Barlow, sans-serif',
  },
  bgGlow: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    zIndex: 0,
    transition: 'background 1s ease',
  },
  header: {
    position: 'relative', zIndex: 2,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 32px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    background: 'rgba(13,16,24,0.9)',
    backdropFilter: 'blur(10px)',
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 10 },
  scaLogo: {
    fontFamily: 'Bebas Neue, sans-serif',
    fontSize: 28, letterSpacing: 4,
    color: '#f0c040',
    textShadow: '0 0 20px rgba(240,192,64,0.5)',
  },
  scaSubtitle: { color: '#4a5568', fontSize: 12, fontFamily: 'Barlow Condensed, sans-serif', letterSpacing: 2 },
  roundBadge: {
    fontFamily: 'Barlow Condensed, sans-serif',
    fontSize: 15, fontWeight: 700, letterSpacing: 3,
    padding: '6px 20px',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 20,
    background: 'rgba(255,255,255,0.03)',
  },
  headerRight: { display: 'flex', alignItems: 'center', gap: 8 },
  statusDot: { width: 8, height: 8, borderRadius: '50%', transition: 'background 0.3s' },

  main: {
    flex: 1, position: 'relative', zIndex: 1,
    display: 'flex', alignItems: 'stretch',
    padding: '0',
    overflow: 'hidden',
  },

  leftSection: {
    flex: '0 0 55%',
    padding: '48px 48px 32px',
    display: 'flex', flexDirection: 'column',
    justifyContent: 'center',
    zIndex: 2,
  },
  categoryRow: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 },
  catBadge: {
    fontFamily: 'Barlow Condensed, sans-serif',
    fontSize: 13, fontWeight: 700, letterSpacing: 3,
    padding: '4px 14px', borderRadius: 20,
    border: '1px solid',
    textTransform: 'uppercase',
  },
  wcBadge: {
    background: 'rgba(240,192,64,0.2)', color: '#f0c040',
    border: '1px solid rgba(240,192,64,0.4)',
    fontFamily: 'Barlow Condensed, sans-serif',
    fontSize: 12, fontWeight: 700, letterSpacing: 2,
    padding: '4px 12px', borderRadius: 20,
  },
  playerName: {
    fontFamily: 'Bebas Neue, sans-serif',
    fontSize: 'clamp(52px, 7vw, 96px)',
    lineHeight: 1,
    letterSpacing: 2,
    color: '#f0f2f8',
    marginBottom: 10,
    textShadow: '0 2px 20px rgba(0,0,0,0.5)',
  },
  playerMeta: {
    display: 'flex', alignItems: 'center', gap: 8,
    color: '#8892aa', fontSize: 18,
    fontFamily: 'Barlow Condensed, sans-serif',
    letterSpacing: 1, marginBottom: 16,
  },
  metaDot: { color: '#2d3748' },
  statsBlock: { marginBottom: 20 },
  statsText: { color: '#6b7280', fontSize: 15, fontStyle: 'italic' },

  divider: { width: 60, height: 2, background: 'rgba(255,255,255,0.1)', marginBottom: 24 },

  pricingBlock: { display: 'flex', flexDirection: 'column', gap: 16 },
  priceRow: { display: 'flex', alignItems: 'center', gap: 0 },
  priceItem: { display: 'flex', flexDirection: 'column', gap: 4 },
  priceSep: { width: 1, height: 50, background: 'rgba(255,255,255,0.1)', margin: '0 32px' },
  priceLabel: {
    fontFamily: 'Barlow Condensed, sans-serif',
    fontSize: 11, letterSpacing: 3, color: '#4a5568',
    textTransform: 'uppercase',
  },
  basePrice: {
    fontFamily: 'Bebas Neue, sans-serif',
    fontSize: 42, color: '#4a5568', letterSpacing: 1,
  },
  currentPrice: {
    fontFamily: 'Bebas Neue, sans-serif',
    fontSize: 72, letterSpacing: 1, lineHeight: 1,
    transition: 'color 0.3s',
  },
  pts: { fontSize: '0.4em', fontFamily: 'Barlow Condensed, sans-serif', letterSpacing: 2 },

  highestBidder: {
    display: 'flex', alignItems: 'center', gap: 14,
    padding: '10px 20px', borderRadius: 10,
    border: '1px solid',
    background: 'rgba(255,255,255,0.03)',
    width: 'fit-content',
    transition: 'all 0.3s',
  },
  bidderLabel: { fontFamily: 'Barlow Condensed, sans-serif', fontSize: 11, letterSpacing: 3, color: '#4a5568' },
  bidderName: { fontFamily: 'Bebas Neue, sans-serif', fontSize: 26, letterSpacing: 2 },

  noBidYet: {
    color: '#4a5568', fontSize: 14,
    fontFamily: 'Barlow Condensed, sans-serif', letterSpacing: 1,
    fontStyle: 'italic',
  },

  idleState: {
    display: 'flex', flexDirection: 'column',
    gap: 12, paddingTop: 40,
  },
  idleLogo: {
    fontFamily: 'Bebas Neue, sans-serif',
    fontSize: 120, color: 'rgba(240,192,64,0.08)', letterSpacing: 10, lineHeight: 1,
  },
  idleText: { fontFamily: 'Bebas Neue, sans-serif', fontSize: 36, color: '#4a5568', letterSpacing: 4 },
  idleSub: { fontFamily: 'Barlow Condensed, sans-serif', fontSize: 14, color: '#2d3748', letterSpacing: 3 },

  rightSection: {
    flex: '0 0 45%',
    position: 'relative',
    overflow: 'hidden',
  },
  photoWrapper: {
    position: 'absolute', inset: 0,
    display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
  },
  playerPhoto: {
    height: '95%',
    maxWidth: '100%',
    objectFit: 'contain',
    objectPosition: 'center bottom',
    filter: 'drop-shadow(0 20px 60px rgba(0,0,0,0.8))',
    transition: 'all 0.5s ease',
  },
  photoGlow: {
    position: 'absolute', inset: 0, pointerEvents: 'none',
    transition: 'background 1s ease',
  },

  footer: {
    position: 'relative', zIndex: 2,
    borderTop: '1px solid rgba(255,255,255,0.06)',
    background: 'rgba(13,16,24,0.95)',
    padding: '14px 32px',
    display: 'flex', flexDirection: 'column', gap: 10,
  },
  teamsStrip: {
    display: 'flex', gap: 12, alignItems: 'center',
  },
  teamCard: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '8px 16px',
    borderRadius: 10, border: '1px solid',
    transition: 'all 0.3s ease',
    position: 'relative', overflow: 'hidden',
    minWidth: 160,
  },
  teamColorBar: { width: 3, height: 32, borderRadius: 2, flexShrink: 0 },
  teamInfo: { display: 'flex', flexDirection: 'column', gap: 2 },
  teamName: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 15, letterSpacing: 1 },
  teamStats: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 },
  teamStatSep: { color: '#2d3748' },
  leadingBadge: {
    position: 'absolute', right: 10,
    fontFamily: 'Barlow Condensed, sans-serif',
    fontSize: 10, fontWeight: 700, letterSpacing: 2,
    color: '#f0c040', opacity: 0.8,
  },
  wcUsedBadge: {
    position: 'absolute', right: 10, bottom: 6,
    fontFamily: 'Barlow Condensed, sans-serif',
    fontSize: 10, color: '#22c55e', letterSpacing: 1,
  },

  rosterStrip: {
    display: 'flex', gap: 32, alignItems: 'center',
  },
  rosterCard: { display: 'flex', alignItems: 'center', gap: 12 },
  rosterTeamName: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 13, letterSpacing: 1, minWidth: 80 },
  rosterSlots: { display: 'flex', gap: 8, alignItems: 'center' },

  // SOLD overlay
  soldOverlay: {
    position: 'fixed', inset: 0, zIndex: 100,
    background: 'rgba(0,0,0,0.85)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    backdropFilter: 'blur(8px)',
  },
  soldBox: {
    textAlign: 'center', animation: 'sold-slam 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
  },
  soldHammer: { fontSize: 64, filter: 'drop-shadow(0 0 30px rgba(240,192,64,0.8))' },
  soldWord: {
    fontFamily: 'Bebas Neue, sans-serif',
    fontSize: 120, color: '#f0c040', letterSpacing: 8, lineHeight: 1,
    textShadow: '0 0 60px rgba(240,192,64,0.6)',
  },
  soldPlayer: { fontFamily: 'Bebas Neue, sans-serif', fontSize: 36, color: '#f0f2f8', letterSpacing: 3 },
  soldTo: { fontFamily: 'Barlow Condensed, sans-serif', fontSize: 20, color: '#8892aa', letterSpacing: 2 },
  soldPrice: { fontFamily: 'Bebas Neue, sans-serif', fontSize: 48, color: '#22c55e', letterSpacing: 2 },

  // WC overlay
  wcOverlayWrap: {
    position: 'fixed', top: 80, left: '50%', transform: 'translateX(-50%)',
    zIndex: 50, animation: 'fadeIn 0.4s ease',
  },
  wcOverlayBox: {
    background: 'rgba(20,25,40,0.95)',
    border: '1px solid rgba(240,192,64,0.4)',
    borderRadius: 16, padding: '20px 32px',
    textAlign: 'center', backdropFilter: 'blur(10px)',
    boxShadow: '0 0 40px rgba(240,192,64,0.2)',
  },
  wcOverlayTitle: {
    fontFamily: 'Bebas Neue, sans-serif', fontSize: 36, color: '#f0c040', letterSpacing: 4,
  },
  wcOverlayText: { fontSize: 16, color: '#f0f2f8', marginTop: 4 },
};
