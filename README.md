# 🏏 SCA Auction System

Real-time cricket auction system for Street Cricket Association.

## Tech Stack
- **Backend**: Node.js + Express + MongoDB + Socket.io
- **Frontend**: React (Vite) + Socket.io-client

## Project Structure
```
sca-auction/
├── backend/
│   ├── models/         # Category, Player, Team, AuctionState
│   ├── routes/         # categories, players, teams, auction
│   ├── server.js
│   └── .env
└── client/
    └── src/
        ├── pages/      # PublicScreen, Admin
        ├── components/ # AuctionControl, PlayersPanel, TeamsPanel, CategoriesPanel
        ├── context/    # SocketContext
        └── api.js
```

## Setup

### 1. Prerequisites
- Node.js (v18+)
- MongoDB running locally (`mongod`)

### 2. Backend
```bash
cd backend
npm install
# Edit .env if needed (default: mongodb://localhost:27017/sca-auction, port 5000)
npm run dev
```

### 3. Frontend
```bash
cd client
npm install
npm run dev
```

### 4. Open
- **Public Broadcast Screen**: http://localhost:5173/auction
- **Admin Dashboard**: http://localhost:5173/admin

## Workflow
1. Go to Admin → **Categories**: verify/edit Platinum/Diamond/Gold base prices + increments
2. Go to Admin → **Teams**: add 2 teams, set initial purse
3. Go to Admin → **Players**: add all players, assign captains to teams
4. Go to Admin → **Auction**: click "Start Auction"
5. Wild Card round → declare or skip
6. Auction round → click "Next Player", use team bid buttons, click SOLD/Unsold
7. After each round ends → click "Next Round"
8. Repeat until complete

## Auction Rules
- **Rounds**: WC-Plat → Plat → WC-Diamond → Diamond → Gold → (R2: WC-Diamond → Diamond → Gold) → (R3: Diamond if needed)
- **Demotion**: Unsold Platinum players → demoted to Diamond in Round 2
- **Wild Card**: 1 per team, usable in WC rounds only, includes RTM option
- **Composition**: System blocks bids if team's slot is already filled
- **Purse**: System blocks bids if team has insufficient purse

## Socket Events
| Event | Direction | Description |
|-------|-----------|-------------|
| `auction:update` | Server→Client | Full state update |
| `player:sold` | Server→Client | Player sold overlay |
| `auction:bid` | Server→Client | New bid placed |
| `auction:wildcard` | Server→Client | Wild card declared |
| `auction:reset` | Server→Client | Auction reset |
| `teams:updated` | Server→Client | Team data changed |
| `players:updated` | Server→Client | Player data changed |
