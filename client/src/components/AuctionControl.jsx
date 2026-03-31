import { useEffect, useState, useCallback } from 'react';
import { useSocket } from '../context/SocketContext';
import {
  getAuctionState, initRounds, advanceRound, startPlayer,
  placeBid, markSold, markUnsold, declareWildCard,
  useRTM, skipWildCard, resetAuction, getAvailablePlayers, getPlayers
} from '../api';

const PHASE_LABELS = {
  'idle': 'Not Started',
  'wildcard-plat': '⚡ Wild Card — Platinum',
  'plat': '🥇 Platinum Round',
  'wildcard-diamond': '⚡ Wild Card — Diamond',
  'diamond': '💎 Diamond Round',
  'gold': '🪙 Gold Round',
  'complete': '✅ Auction Complete',
};

// Sub-label describing the current pool composition to the admin
function phaseSubtitle(state) {
  if (!state) return '';
  const { roundPhase, roundNumber } = state;
  if (roundPhase === 'plat') return `1 Platinum slot per team`;
  if (roundPhase === 'diamond' && roundNumber === 1) return 'Original Diamond players only';
  if (roundPhase === 'diamond' && roundNumber >= 2) return `Diamonds + demoted Platinum players`;
  if (roundPhase === 'gold' && roundNumber >= 2) return 'Remaining + unsold Gold players';
  return '';
}

export default function AuctionControl() {
  const { socket } = useSocket();
  const [state, setState] = useState(null);
  const [teams, setTeams] = useState([]);
  const [queuePlayers, setQueuePlayers] = useState([]);
  const [wcPlayers, setWcPlayers] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState('');
  const [timer, setTimer] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [selectedWcTeam, setSelectedWcTeam] = useState('');
  const [selectedWcPlayer, setSelectedWcPlayer] = useState('');

  const fetchState = useCallback(async () => {
    try {
      const res = await getAuctionState();
      setState(res.data.state);
      setTeams(res.data.teams || []);
    } catch (e) { setError('Failed to fetch state'); }
  }, []);

  const fetchQueuePlayers = useCallback(async (queue) => {
    if (!queue || queue.length === 0) { setQueuePlayers([]); return; }
    try {
      const res = await getPlayers();
      const allPlayers = res.data;
      const queueSet = new Set(queue.map(String));
      // Include pending AND unsold — demoted plats re-enter as unsold
      setQueuePlayers(allPlayers.filter(p => queueSet.has(String(p._id)) && p.status !== 'sold'));
    } catch (e) {}
  }, []);

  useEffect(() => { fetchState(); }, []);

  useEffect(() => {
    if (!socket) return;
    socket.on('auction:update', (data) => {
      setState(data.state);
      setTeams(data.teams || []);
    });
    return () => socket.off('auction:update');
  }, [socket]);

  useEffect(() => {
    if (state?.currentQueue) fetchQueuePlayers(state.currentQueue);
  }, [state?.currentQueue]);

  // Timer countdown
  useEffect(() => {
    if (state?.status === 'live' && state?.timerSeconds) {
      setTimer(state.timerSeconds);
      setTimerRunning(true);
    } else {
      setTimerRunning(false);
    }
  }, [state?.currentPlayer, state?.status]);

  useEffect(() => {
    if (!timerRunning) return;
    if (timer <= 0) {
      setTimerRunning(false);
      return;
    }
    const t = setTimeout(() => setTimer(t => t - 1), 1000);
    return () => clearTimeout(t);
  }, [timer, timerRunning]);

  // Reset timer on bid
  useEffect(() => {
    if (socket) {
      socket.on('auction:bid', () => {
        if (state?.timerSeconds) setTimer(state.timerSeconds);
      });
      return () => socket.off('auction:bid');
    }
  }, [socket, state?.timerSeconds]);

  async function handle(fn, label) {
    setError(''); setLoading(label);
    try { await fn(); }
    catch (e) { setError(e.response?.data?.error || e.message); }
    finally { setLoading(''); }
  }

  async function loadWcPlayers() {
    try {
      const res = await getAvailablePlayers();
      setWcPlayers(res.data);
    } catch (e) {}
  }

  const s = state;
  const isLive = s?.status === 'live';
  const isIdle = s?.status === 'idle' || !s?.status;
  const isWcPhase = ['wildcard-plat', 'wildcard-diamond'].includes(s?.roundPhase);
  const isAuctionPhase = ['plat', 'diamond', 'gold'].includes(s?.roundPhase);
  const currentPlayer = s?.currentPlayer;
  const currentTeamId = s?.currentTeam?._id || s?.currentTeam;

  // Players still available in queue (pending or unsold — demoted plats come back as unsold)
  const availableInQueue = queuePlayers.filter(p => ['pending', 'unsold'].includes(p.status));

  return (
    <div style={styles.root}>
      <div style={styles.topBar}>
        <div>
          <h1 style={styles.pageTitle}>Auction Control</h1>
          <div style={styles.phaseLabel}>
            {PHASE_LABELS[s?.roundPhase] || 'Not Started'} · Round {s?.roundNumber || '—'}
          </div>
          {phaseSubtitle(s) ? (
            <div style={styles.phaseSub}>{phaseSubtitle(s)}</div>
          ) : null}
        </div>
        <div style={styles.topActions}>
          {!s || s.roundPhase === 'idle' ? (
            <Btn label="🚀 Start Auction" color="accent" loading={loading === 'init'}
              onClick={() => handle(initRounds, 'init')} />
          ) : s.roundPhase !== 'complete' ? (
            <Btn label="⏭ Next Phase" color="secondary" loading={loading === 'advance'}
              onClick={() => handle(advanceRound, 'advance')} />
          ) : null}
          <Btn label="🔄 Reset All" color="danger" loading={loading === 'reset'}
            onClick={() => { if (window.confirm('Reset entire auction?')) handle(resetAuction, 'reset'); }} />
        </div>
      </div>

      {error && <div style={styles.error}>{error} <button onClick={() => setError('')} style={styles.errClose}>✕</button></div>}

      <div style={styles.grid}>
        {/* Left column: Current player + bid controls */}
        <div style={styles.leftCol}>
          {/* Current player card */}
          <div style={styles.card}>
            <div style={styles.cardHeader}>Current Player</div>
            {currentPlayer ? (
              <div style={styles.playerCard}>
                <div style={styles.playerCardLeft}>
                  <img
                    src={currentPlayer.image || avatarSvg}
                    alt={currentPlayer.name}
                    style={styles.playerThumb}
                    onError={e => { e.target.src = avatarSvg; }}
                  />
                </div>
                <div style={styles.playerCardInfo}>
                  <div style={styles.playerCardName}>{currentPlayer.name}</div>
                  <div style={styles.playerCardMeta}>{currentPlayer.role} · {currentPlayer.locality}</div>
                  <CategoryBadge name={currentPlayer.category?.name} />
                </div>
                <div style={styles.playerCardPricing}>
                  <div style={styles.pLabel}>BASE</div>
                  <div style={styles.pBase}>{currentPlayer.basePrice}</div>
                  <div style={styles.pLabel}>CURRENT</div>
                  <div style={styles.pCurrent}>{s.currentBid}</div>
                  {s.timerSeconds > 0 && (
                    <div style={{ ...styles.timerDisplay, color: timer <= 5 ? '#ef4444' : '#f0c040' }}>
                      ⏱ {timer}s
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div style={styles.noPlayer}>
                {isAuctionPhase
                  ? 'Click "Next Player" to begin'
                  : isWcPhase
                    ? 'Wild Card round — declare or skip'
                    : 'Start auction to begin'}
              </div>
            )}
          </div>

          {/* Bid controls */}
          {isLive && (
            <div style={styles.card}>
              <div style={styles.cardHeader}>
                Bid Controls
                {s?.rtmPending && <span style={styles.rtmAlert}>⚡ RTM Pending</span>}
              </div>
              <div style={styles.bidGrid}>
                {teams.map(team => {
                  const isLeading = team._id === currentTeamId;
                  const canBid = team.purseRemaining >= (s.currentBid + (currentPlayer?.category?.increment || 5));
                  const isRtmTeam = s?.rtmPending && s?.wcTeam?._id !== team._id && s?.wcTeam !== team._id;
                  return (
                    <div key={team._id} style={{
                      ...styles.teamBidCard,
                      borderColor: isLeading ? '#f0c040' : 'rgba(255,255,255,0.08)',
                      background: isLeading ? 'rgba(240,192,64,0.08)' : 'rgba(30,37,53,0.5)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 4, height: 28, borderRadius: 2, background: team.color || '#3b82f6' }} />
                        <div>
                          <div style={styles.tbName}>{team.name}</div>
                          <div style={styles.tbPurse}>{team.purseRemaining} pts</div>
                        </div>
                        {isLeading && <span style={styles.leadChip}>LEADING</span>}
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {/* Regular bid */}
                        {!s.rtmPending && (
                          <Btn
                            label={`Bid +${currentPlayer?.category?.increment || '?'}`}
                            color={canBid ? 'team' : 'disabled'}
                            small
                            disabled={!canBid}
                            loading={loading === `bid-${team._id}`}
                            onClick={() => handle(() => placeBid(team._id), `bid-${team._id}`)}
                          />
                        )}
                        {/* RTM button */}
                        {s.rtmPending && isRtmTeam && (
                          <Btn
                            label="⚡ RTM"
                            color="accent"
                            small
                            loading={loading === `rtm-${team._id}`}
                            onClick={() => handle(() => useRTM(team._id), `rtm-${team._id}`)}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Sold / Unsold */}
              <div style={styles.soldRow}>
                <Btn label="🔨 SOLD" color="success" loading={loading === 'sold'}
                  disabled={!currentTeamId}
                  onClick={() => handle(markSold, 'sold')} />
                <Btn label="❌ Unsold" color="danger" loading={loading === 'unsold'}
                  onClick={() => handle(markUnsold, 'unsold')} />
              </div>
            </div>
          )}

          {/* Next player / queue */}
          {isAuctionPhase && !isLive && (
            <div style={styles.card}>
              <div style={styles.cardHeader}>
                Queue — {availableInQueue.length} remaining
                {s?.roundPhase === 'diamond' && s?.roundNumber > 1 && availableInQueue.some(p => p.originalCategory !== p.category) && (
                  <span style={styles.demotedChip}>incl. demoted Plat</span>
                )}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                {availableInQueue.slice(0, 8).map(p => (
                  <button key={p._id} style={styles.queueChip}
                    onClick={() => handle(() => startPlayer(p._id), `sp-${p._id}`)}>
                    {p.name}
                  </button>
                ))}
              </div>
              <Btn label="▶ Next Random Player" color="accent"
                loading={loading === 'sp-auto'}
                onClick={() => handle(() => startPlayer(null), 'sp-auto')} />
            </div>
          )}
        </div>

        {/* Right column: WC panel + Team rosters */}
        <div style={styles.rightCol}>
          {/* Wild card panel */}
          {isWcPhase && (
            <div style={styles.card}>
              <div style={styles.cardHeader}>⚡ Wild Card Round</div>
              <p style={styles.wcDesc}>
                {s.roundPhase === 'wildcard-plat'
                  ? 'Teams can use Wild Card to pick any Diamond or Gold player at Platinum base price.'
                  : 'Teams can use Wild Card to pick any Gold player at Diamond base price.'}
              </p>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <select value={selectedWcTeam} onChange={e => { setSelectedWcTeam(e.target.value); loadWcPlayers(); }}
                  style={{ flex: 1 }}>
                  <option value="">Select team...</option>
                  {teams.filter(t => !t.wildCardUsed).map(t => (
                    <option key={t._id} value={t._id}>{t.name}</option>
                  ))}
                </select>
                <select value={selectedWcPlayer} onChange={e => setSelectedWcPlayer(e.target.value)}
                  style={{ flex: 1 }}>
                  <option value="">Select player...</option>
                  {wcPlayers.map(p => (
                    <option key={p._id} value={p._id}>{p.name} ({p.category?.name})</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Btn label="⚡ Declare Wild Card" color="accent"
                  disabled={!selectedWcTeam || !selectedWcPlayer}
                  loading={loading === 'wc'}
                  onClick={() => handle(() => declareWildCard(selectedWcTeam, selectedWcPlayer), 'wc')} />
                <Btn label="Skip →" color="secondary"
                  loading={loading === 'skipwc'}
                  onClick={() => handle(skipWildCard, 'skipwc')} />
              </div>
            </div>
          )}

          {/* Teams overview */}
          <div style={styles.card}>
            <div style={styles.cardHeader}>Teams Overview</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {teams.map(team => (
                <TeamOverviewCard key={team._id} team={team} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TeamOverviewCard({ team }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={styles.teamOverCard}>
      <div style={styles.teamOverTop} onClick={() => setOpen(o => !o)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 4, height: 36, borderRadius: 2, background: team.color || '#3b82f6' }} />
          <div>
            <div style={styles.teamOverName}>{team.name}</div>
            <div style={styles.teamOverStats}>
              <span style={{ color: '#22c55e' }}>{team.purseRemaining} pts</span>
              <span style={{ color: '#4a5568' }}>·</span>
              <span style={{ color: '#8892aa' }}>{team.playersBought?.length || 0} players</span>
              {team.wildCardUsed && <span style={{ color: '#22c55e', fontSize: 11 }}>WC ✓</span>}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <SlotPill label="P" filled={team.platSlotFilled ? 1 : 0} max={1} color="#e8e8f0" />
          <SlotPill label="D" filled={team.diamondSlotsFilled || 0} max={team.maxDiamondSlots || 2} color="#7dd3fc" />
          <SlotPill label="G" filled={team.goldSlotsFilled || 0} max={team.maxGoldSlots || 3} color="#f0c040" />
          <span style={{ color: '#4a5568', fontSize: 12, marginLeft: 4 }}>{open ? '▲' : '▼'}</span>
        </div>
      </div>
      {open && team.playersBought?.length > 0 && (
        <div style={styles.teamRoster}>
          {team.playersBought.map(p => (
            <div key={p._id || p} style={styles.rosterRow}>
              <span style={{ color: '#f0f2f8', fontSize: 13 }}>{p.name || '—'}</span>
              {p.role && <span style={{ color: '#4a5568', fontSize: 12 }}>{p.role}</span>}
              {p.currentPrice > 0 && <span style={{ color: '#22c55e', fontSize: 12, marginLeft: 'auto' }}>{p.currentPrice} pts</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SlotPill({ label, filled, max, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      <span style={{ fontSize: 10, color: '#4a5568', marginRight: 2 }}>{label}</span>
      {Array.from({ length: max }).map((_, i) => (
        <div key={i} style={{
          width: 8, height: 8, borderRadius: 2,
          background: i < filled ? color : 'rgba(255,255,255,0.07)',
          border: `1px solid ${i < filled ? color : 'rgba(255,255,255,0.1)'}`,
        }} />
      ))}
    </div>
  );
}

function CategoryBadge({ name }) {
  const n = (name || '').toLowerCase();
  const style = n.includes('plat') ? 'badge-plat' : n.includes('diamond') ? 'badge-diamond' : 'badge-gold';
  return <span className={`badge ${style}`}>{name || '—'}</span>;
}

function Btn({ label, color, onClick, loading, disabled, small }) {
  const colors = {
    accent: { bg: 'rgba(240,192,64,0.15)', border: 'rgba(240,192,64,0.4)', text: '#f0c040', hover: 'rgba(240,192,64,0.25)' },
    success: { bg: 'rgba(34,197,94,0.15)', border: 'rgba(34,197,94,0.4)', text: '#22c55e', hover: 'rgba(34,197,94,0.25)' },
    danger: { bg: 'rgba(239,68,68,0.15)', border: 'rgba(239,68,68,0.4)', text: '#ef4444', hover: 'rgba(239,68,68,0.25)' },
    secondary: { bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.12)', text: '#8892aa', hover: 'rgba(255,255,255,0.1)' },
    team: { bg: 'rgba(59,130,246,0.15)', border: 'rgba(59,130,246,0.4)', text: '#60a5fa', hover: 'rgba(59,130,246,0.25)' },
    disabled: { bg: 'rgba(255,255,255,0.03)', border: 'rgba(255,255,255,0.06)', text: '#2d3748', hover: 'rgba(255,255,255,0.03)' },
  };
  const c = colors[disabled ? 'disabled' : color] || colors.secondary;
  return (
    <button
      onClick={onClick}
      disabled={disabled || !!loading}
      style={{
        padding: small ? '6px 12px' : '9px 18px',
        borderRadius: 8, border: `1px solid ${c.border}`,
        background: c.bg, color: c.text,
        fontSize: small ? 12 : 14, fontWeight: 600,
        fontFamily: 'Barlow Condensed, sans-serif', letterSpacing: 0.5,
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.15s',
      }}
    >
      {loading ? '…' : label}
    </button>
  );
}

const avatarSvg = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'%3E%3Crect width='80' height='80' fill='%231e2535'/%3E%3Ccircle cx='40' cy='30' r='16' fill='%23374151'/%3E%3Cellipse cx='40' cy='70' rx='24' ry='16' fill='%23374151'/%3E%3C/svg%3E`;

const styles = {
  root: { display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1100 },
  topBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  pageTitle: { fontFamily: 'Bebas Neue, sans-serif', fontSize: 32, letterSpacing: 2, color: '#f0f2f8' },
  phaseLabel: { fontFamily: 'Barlow Condensed, sans-serif', fontSize: 14, color: '#f0c040', letterSpacing: 2, marginTop: 2 },
  phaseSub: { fontFamily: 'Barlow Condensed, sans-serif', fontSize: 12, color: '#4a5568', letterSpacing: 1, marginTop: 2 },
  topActions: { display: 'flex', gap: 8 },
  error: {
    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
    color: '#ef4444', padding: '10px 16px', borderRadius: 8,
    fontSize: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  },
  errClose: { background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 14 },
  grid: { display: 'grid', gridTemplateColumns: '1fr 380px', gap: 16 },
  leftCol: { display: 'flex', flexDirection: 'column', gap: 16 },
  rightCol: { display: 'flex', flexDirection: 'column', gap: 16 },
  card: {
    background: 'rgba(22,27,39,0.8)', border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 14, padding: '18px 20px',
  },
  cardHeader: {
    fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 13,
    letterSpacing: 2, color: '#4a5568', textTransform: 'uppercase',
    marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10,
  },
  rtmAlert: {
    background: 'rgba(240,192,64,0.15)', color: '#f0c040',
    border: '1px solid rgba(240,192,64,0.3)',
    padding: '2px 10px', borderRadius: 12, fontSize: 11, letterSpacing: 1,
  },
  demotedChip: {
    background: 'rgba(240,192,64,0.1)', color: '#f0c040',
    border: '1px solid rgba(240,192,64,0.2)',
    padding: '1px 8px', borderRadius: 10, fontSize: 10, letterSpacing: 1,
  },
  playerCard: { display: 'flex', gap: 14, alignItems: 'center' },
  playerCardLeft: { flexShrink: 0 },
  playerThumb: { width: 64, height: 64, borderRadius: 10, objectFit: 'cover', background: '#1e2535' },
  playerCardInfo: { flex: 1, display: 'flex', flexDirection: 'column', gap: 4 },
  playerCardName: { fontFamily: 'Bebas Neue, sans-serif', fontSize: 24, letterSpacing: 1, color: '#f0f2f8' },
  playerCardMeta: { color: '#6b7280', fontSize: 13 },
  playerCardPricing: {
    display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end',
    minWidth: 100,
  },
  pLabel: { fontFamily: 'Barlow Condensed, sans-serif', fontSize: 10, letterSpacing: 2, color: '#4a5568' },
  pBase: { fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, color: '#4a5568', lineHeight: 1 },
  pCurrent: { fontFamily: 'Bebas Neue, sans-serif', fontSize: 36, color: '#f0c040', lineHeight: 1 },
  timerDisplay: { fontFamily: 'Bebas Neue, sans-serif', fontSize: 20, lineHeight: 1, transition: 'color 0.3s' },
  noPlayer: { color: '#4a5568', fontSize: 14, fontStyle: 'italic', padding: '10px 0' },
  bidGrid: { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 },
  teamBidCard: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '10px 14px', borderRadius: 10, border: '1px solid',
    transition: 'all 0.2s',
  },
  tbName: { fontWeight: 600, fontSize: 14, color: '#f0f2f8' },
  tbPurse: { fontSize: 13, color: '#8892aa' },
  leadChip: {
    background: 'rgba(240,192,64,0.15)', color: '#f0c040',
    border: '1px solid rgba(240,192,64,0.3)',
    padding: '1px 8px', borderRadius: 10,
    fontFamily: 'Barlow Condensed, sans-serif', fontSize: 10, letterSpacing: 1,
  },
  soldRow: { display: 'flex', gap: 10, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)' },
  queueChip: {
    padding: '5px 12px', borderRadius: 8,
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    color: '#8892aa', fontSize: 13, cursor: 'pointer',
    fontFamily: 'Barlow, sans-serif', transition: 'all 0.15s',
  },
  wcDesc: { color: '#6b7280', fontSize: 13, marginBottom: 12, lineHeight: 1.5 },
  teamOverCard: {
    background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 10, overflow: 'hidden',
  },
  teamOverTop: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '10px 14px', cursor: 'pointer',
    transition: 'background 0.2s',
  },
  teamOverName: { fontWeight: 600, fontSize: 15, color: '#f0f2f8' },
  teamOverStats: { display: 'flex', gap: 6, fontSize: 13, marginTop: 2, alignItems: 'center' },
  teamRoster: { padding: '8px 14px', borderTop: '1px solid rgba(255,255,255,0.05)' },
  rosterRow: {
    display: 'flex', gap: 8, alignItems: 'center',
    padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
  },
};