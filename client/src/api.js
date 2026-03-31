import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

// Categories
export const getCategories = () => api.get('/categories');
export const createCategory = (data) => api.post('/categories', data);
export const updateCategory = (id, data) => api.put(`/categories/${id}`, data);
export const deleteCategory = (id) => api.delete(`/categories/${id}`);

// Players
export const getPlayers = () => api.get('/players');
export const createPlayer = (data) => api.post('/players', data);
export const updatePlayer = (id, data) => api.put(`/players/${id}`, data);
export const deletePlayer = (id) => api.delete(`/players/${id}`);
export const setCaptain = (playerId, teamId) => api.post(`/players/${playerId}/set-captain`, { teamId });

// Teams
export const getTeams = () => api.get('/teams');
export const createTeam = (data) => api.post('/teams', data);
export const updateTeam = (id, data) => api.put(`/teams/${id}`, data);
export const deleteTeam = (id) => api.delete(`/teams/${id}`);

// Auction
export const getAuctionState = () => api.get('/auction/state');
export const initRounds = () => api.post('/auction/init-rounds');
export const advanceRound = () => api.post('/auction/advance-round');
export const startPlayer = (playerId) => api.post('/auction/start-player', playerId ? { playerId } : {});
export const placeBid = (teamId) => api.post('/auction/bid', { teamId });
export const markSold = () => api.post('/auction/sold');
export const markUnsold = () => api.post('/auction/unsold');
export const declareWildCard = (teamId, playerId) => api.post('/auction/wildcard', { teamId, playerId });
export const useRTM = (teamId) => api.post('/auction/rtm', { teamId });
export const skipWildCard = () => api.post('/auction/skip-wildcard');
export const resetAuction = () => api.post('/auction/reset');
export const getAvailablePlayers = () => api.get('/auction/available-players');

export default api;
