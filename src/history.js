/**
 * Match History Manager for Pixel Monopoly
 * Stores and manages local record of finished matches
 */

import { getTokenEmoji, renderTokenHTML } from './profile.js';

const STORAGE_KEY = 'monopoly_match_history';
const MAX_HISTORY = 40;

export class MatchHistoryManager {
  constructor() {
    this.matches = this.loadMatches();
    this.matchStartTime = null;
    this.matchStartTurn = 0;
  }

  startMatchTimer(currentTurn = 0) {
    this.matchStartTime = Date.now();
    this.matchStartTurn = currentTurn;
  }

  loadMatches() {
    try {
      if (typeof localStorage !== 'undefined') {
        const data = localStorage.getItem(STORAGE_KEY);
        if (data) {
          const parsed = JSON.parse(data);
          if (Array.isArray(parsed)) return parsed;
        }
      }
    } catch (e) {
      console.warn('Failed to load match history:', e);
    }
    return [];
  }

  saveMatches() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.matches));
      }
    } catch (e) {
      console.warn('Failed to save match history:', e);
    }
  }

  recordMatch({ state, myPlayerId, isLocalMode, roomCode }) {
    if (!state || !state.winner) return null;

    const endTime = Date.now();
    const startTime = this.matchStartTime || (endTime - 60000);
    const durationSec = Math.max(1, Math.round((endTime - startTime) / 1000));
    const mins = Math.floor(durationSec / 60);
    const secs = durationSec % 60;
    const durationStr = mins > 0 ? `${mins} мин ${secs} сек` : `${secs} сек`;

    const winner = state.winner;
    const isWinner = String(winner.id) === String(myPlayerId);
    const me = state.players.find(p => String(p.id) === String(myPlayerId)) || {};

    // Calculate properties & houses count for each player
    const playerPropStats = {};
    state.players.forEach(p => {
      playerPropStats[p.id] = { propCount: 0, housesCount: 0 };
    });

    if (state.properties) {
      Object.values(state.properties).forEach(prop => {
        if (prop.ownerId && playerPropStats[prop.ownerId]) {
          playerPropStats[prop.ownerId].propCount += 1;
          playerPropStats[prop.ownerId].housesCount += (prop.houses || 0);
        }
      });
    }

    const playersList = state.players.map(p => {
      const stats = playerPropStats[p.id] || { propCount: 0, housesCount: 0 };
      const isThisWinner = String(p.id) === String(winner.id);
      const isThisMe = String(p.id) === String(myPlayerId);
      return {
        id: p.id,
        name: p.name,
        token: p.token,
        customToken: p.customToken || null,
        color: p.color || '#2563eb',
        cash: p.cash || 0,
        netWorth: p.netWorth || p.cash || 0,
        propCount: stats.propCount,
        housesCount: stats.housesCount,
        isBankrupt: Boolean(p.isBankrupt),
        hasLeft: Boolean(p.hasLeft),
        isWinner: isThisWinner,
        isMe: isThisMe
      };
    });

    const now = new Date();
    const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    const dateFormatted = `${now.getDate()} ${months[now.getMonth()]}, ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const myPropStats = playerPropStats[myPlayerId] || { propCount: 0, housesCount: 0 };

    const matchRecord = {
      id: 'match_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      timestamp: Date.now(),
      dateStr: dateFormatted,
      mode: isLocalMode ? 'Локальная' : (roomCode ? `Онлайн (${roomCode})` : 'Онлайн'),
      roomCode: roomCode || null,
      isLocal: Boolean(isLocalMode),
      durationStr,
      turnsCount: (state.logs?.length ? Math.round(state.logs.length / 2) : 1),
      winner: {
        id: winner.id,
        name: winner.name,
        token: winner.token,
        customToken: winner.customToken || null,
        color: winner.color || '#2563eb'
      },
      isMeWinner: isWinner,
      myResult: isWinner ? 'WIN' : (me.isBankrupt ? 'BANKRUPT' : 'DEFEAT'),
      coinsEarned: isWinner ? 50 : 0,
      myCash: me.cash || 0,
      myNetWorth: me.netWorth || me.cash || 0,
      myPropCount: myPropStats.propCount,
      myHousesCount: myPropStats.housesCount,
      playersCount: state.players.length,
      players: playersList
    };

    this.matches.unshift(matchRecord);
    if (this.matches.length > MAX_HISTORY) {
      this.matches = this.matches.slice(0, MAX_HISTORY);
    }
    this.saveMatches();
    this.matchStartTime = null;

    return matchRecord;
  }

  getMatches(filter = 'all') {
    if (filter === 'wins') {
      return this.matches.filter(m => m.isMeWinner);
    }
    if (filter === 'defeats') {
      return this.matches.filter(m => !m.isMeWinner);
    }
    return this.matches;
  }

  clearHistory() {
    this.matches = [];
    this.saveMatches();
  }
}

export const matchHistoryManager = new MatchHistoryManager();
