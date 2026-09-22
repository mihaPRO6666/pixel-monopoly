/**
 * Leaderboard & Ranking Manager for Pixel Monopoly
 * Tracks strictly real players (local profile, peers from multiplayer, games played)
 */
import { profileManager, getTokenEmoji } from './profile.js';

// List of legacy fictional names and test accounts to permanently filter out
const FICTIONAL_NAMES = new Set([
  'Рокфеллер',
  'Алмазный Барон',
  'Автомагнат',
  'Венчурный Бро',
  'Крипто-Дог',
  'Дино-Инвестор',
  'Кот-Рантье',
  // Test accounts from automated Playwright tests
  'Misha#7777',
  'ProdTester#0001',
  'Misha#1234'
]);

// Version stamp — bump this to wipe stale test data from everyone's localStorage
const LEADERBOARD_VERSION = 'v2';

// Helper to verify if a player is registered (via Discord)
export function isPlayerRegistered(p) {
  if (!p) return false;
  return Boolean(p.isRegistered === true || p.discordId || p.authProvider === 'discord' || String(p.id).startsWith('discord_'));
}

class LeaderboardManager {
  constructor() {
    this._migrateVersion();
    this.records = this.loadRecords();
    this.currentSort = 'wins';
  }

  _migrateVersion() {
    const stored = localStorage.getItem('monopoly_leaderboard_version');
    if (stored !== LEADERBOARD_VERSION) {
      // Wipe stale records that may include test players from older builds
      localStorage.removeItem('monopoly_leaderboard');
      localStorage.setItem('monopoly_leaderboard_version', LEADERBOARD_VERSION);
    }
  }

  loadRecords() {
    const saved = localStorage.getItem('monopoly_leaderboard');
    let validRecords = [];
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          // Permanently purge any fictional players, bots, and UNREGISTERED players
          validRecords = parsed.filter(r => 
            r && 
            r.id && 
            !String(r.id).startsWith('champ_') && 
            !FICTIONAL_NAMES.has(r.name) && 
            !r.isBot &&
            isPlayerRegistered(r)
          );
        }
      } catch (e) {
        console.warn('Failed to parse leaderboard:', e);
      }
    }
    // Clean up local storage immediately
    this.saveRecords(validRecords);
    return validRecords;
  }

  saveRecords(records = this.records) {
    this.records = records;
    try {
      localStorage.setItem('monopoly_leaderboard', JSON.stringify(this.records));
    } catch (e) {
      console.warn('Failed to save leaderboard:', e);
    }
  }

  syncMyRegisteredRecord() {
    if (!profileManager.isRegisteredUser()) return;
    const myProfile = profileManager.profile;
    const myStats = myProfile.stats || {};
    const existing = this.records.find(r => String(r.id) === String(myProfile.id));
    if (existing) {
      existing.name = myProfile.name;
      existing.token = myProfile.token;
      existing.customToken = myProfile.token === 'custom' ? myProfile.customToken : null;
      existing.color = myProfile.color;
      existing.bg = myProfile.bg || 'default';
      existing.profileBg = myProfile.bg || 'default';
      existing.coins = myProfile.coins || 0;
      existing.wins = myStats.wins || 0;
      existing.games = myStats.gamesPlayed || 0;
      existing.netWorth = myStats.maxNetWorth || 0;
      existing.isRegistered = true;
      existing.discordId = myProfile.discordId || null;
      existing.avatarUrl = myProfile.avatarUrl || null;
    } else {
      this.records.push({
        id: myProfile.id,
        name: myProfile.name,
        token: myProfile.token,
        customToken: myProfile.token === 'custom' ? myProfile.customToken : null,
        color: myProfile.color,
        bg: myProfile.bg || 'default',
        profileBg: myProfile.bg || 'default',
        coins: myProfile.coins || 0,
        wins: myStats.wins || 0,
        games: myStats.gamesPlayed || 0,
        netWorth: myStats.maxNetWorth || 0,
        isRegistered: true,
        discordId: myProfile.discordId || null,
        avatarUrl: myProfile.avatarUrl || null
      });
    }
    this.saveRecords();
  }

  registerPlayer(player) {
    if (!player || player.isBot) return;
    if (FICTIONAL_NAMES.has(player.name) || String(player.id).startsWith('champ_')) return;
    // Strictly registered players only!
    if (!isPlayerRegistered(player)) return;

    const myProfile = profileManager.profile;
    if (String(player.id) === String(myProfile.id)) {
      this.syncMyRegisteredRecord();
      return;
    }

    const stats = player.stats || {};
    const existing = this.records.find(r => String(r.id) === String(player.id));
    if (existing) {
      existing.name = player.name || existing.name;
      if (player.token) existing.token = getTokenEmoji(player.token);
      if (player.color) existing.color = player.color;
      if (player.bg || player.profileBg) {
        existing.bg = player.bg || player.profileBg;
        existing.profileBg = player.bg || player.profileBg;
      }
      if (typeof player.coins === 'number') {
        existing.coins = Math.max(existing.coins || 0, player.coins);
      }
      if (player.discordId) existing.discordId = player.discordId;
      if (player.avatarUrl) existing.avatarUrl = player.avatarUrl;
      existing.isRegistered = true;
      if (typeof stats.wins === 'number' && stats.wins > (existing.wins || 0)) {
        existing.wins = stats.wins;
      }
      if (typeof stats.gamesPlayed === 'number' && stats.gamesPlayed > (existing.games || 0)) {
        existing.games = stats.gamesPlayed;
      }
      if (typeof stats.maxNetWorth === 'number' && stats.maxNetWorth > (existing.netWorth || 0)) {
        existing.netWorth = stats.maxNetWorth;
      }
    } else {
      this.records.push({
        id: player.id,
        name: player.name || 'Игрок',
        token: getTokenEmoji(player.token || '🎩'),
        color: player.color || '#2563eb',
        bg: player.bg || player.profileBg || 'default',
        profileBg: player.bg || player.profileBg || 'default',
        coins: typeof player.coins === 'number' ? player.coins : 0,
        isRegistered: true,
        discordId: player.discordId || null,
        avatarUrl: player.avatarUrl || null,
        wins: stats.wins || 0,
        games: stats.gamesPlayed || (stats.wins ? stats.wins : 0),
        netWorth: stats.maxNetWorth || 0
      });
    }

    this.saveRecords();
  }

  recordGameFinished(players, winnerId) {
    if (!players || !Array.isArray(players)) return;

    players.forEach(p => {
      if (p.isBot || FICTIONAL_NAMES.has(p.name) || String(p.id).startsWith('champ_')) return;

      const isWinner = String(p.id) === String(winnerId);
      const isMe = String(p.id) === String(profileManager.profile.id);

      if (isMe) {
        profileManager.recordGameResult(isWinner, p.cash || 0, p.netWorth || p.cash || 0);
        if (profileManager.isRegisteredUser()) {
          this.syncMyRegisteredRecord();
        }
        return;
      }

      // Remote players: only record if registered!
      if (!isPlayerRegistered(p)) return;

      const existing = this.records.find(r => String(r.id) === String(p.id));
      const currentNw = p.netWorth || p.cash || 0;
      if (existing) {
        existing.games = (existing.games || 0) + 1;
        if (isWinner) {
          existing.wins = (existing.wins || 0) + 1;
          existing.coins = (existing.coins || 0) + 50;
        }
        if (typeof p.coins === 'number') {
          existing.coins = Math.max(existing.coins || 0, p.coins);
        }
        if (currentNw > (existing.netWorth || 0)) existing.netWorth = currentNw;
        existing.name = p.name;
        existing.token = getTokenEmoji(p.token);
        existing.color = p.color;
        if (p.bg || p.profileBg) {
          existing.bg = p.bg || p.profileBg;
          existing.profileBg = p.bg || p.profileBg;
        }
        if (p.discordId) existing.discordId = p.discordId;
        if (p.avatarUrl) existing.avatarUrl = p.avatarUrl;
        existing.isRegistered = true;
      } else {
        this.records.push({
          id: p.id,
          name: p.name,
          token: getTokenEmoji(p.token),
          color: p.color || '#2563eb',
          bg: p.bg || p.profileBg || 'default',
          profileBg: p.bg || p.profileBg || 'default',
          coins: (typeof p.coins === 'number' ? p.coins : 0) + (isWinner ? 50 : 0),
          isRegistered: true,
          discordId: p.discordId || null,
          avatarUrl: p.avatarUrl || null,
          wins: isWinner ? 1 : 0,
          games: 1,
          netWorth: currentNw
        });
      }
    });

    this.saveRecords();
  }

  getRankings(sortBy = this.currentSort) {
    this.currentSort = sortBy;
    const myProfile = profileManager.profile;
    const myStats = myProfile.stats || {};
    
    // Purge any accidental non-real or unregistered entries
    let list = this.records.filter(r => 
      r && 
      !String(r.id).startsWith('champ_') && 
      !FICTIONAL_NAMES.has(r.name) &&
      !r.isBot &&
      isPlayerRegistered(r) &&
      String(r.id) !== String(myProfile.id)
    );

    // ONLY include current user if they are registered via Discord!
    if (profileManager.isRegisteredUser()) {
      const myEntry = {
        id: myProfile.id,
        name: myProfile.name,
        token: myProfile.token,
        customToken: myProfile.token === 'custom' ? myProfile.customToken : null,
        color: myProfile.color,
        wins: myStats.wins || 0,
        games: myStats.gamesPlayed || 0,
        netWorth: myStats.maxNetWorth || 0,
        isRegistered: true,
        discordId: myProfile.discordId || null,
        avatarUrl: myProfile.avatarUrl || null,
        isMe: true
      };
      list.push(myEntry);
    }

    if (sortBy === 'wins') {
      list.sort((a, b) => (b.wins - a.wins) || (b.netWorth - a.netWorth) || (b.games - a.games));
    } else if (sortBy === 'games' || sortBy === 'matches') {
      list.sort((a, b) => (b.games - a.games) || (b.wins - a.wins) || (b.netWorth - a.netWorth));
    } else if (sortBy === 'cash') {
      list.sort((a, b) => (b.netWorth - a.netWorth) || (b.wins - a.wins));
    } else if (sortBy === 'winrate') {
      list.sort((a, b) => {
        const rateA = a.games > 0 ? (a.wins / a.games) : 0;
        const rateB = b.games > 0 ? (b.wins / b.games) : 0;
        return (rateB - rateA) || (b.wins - a.wins);
      });
    }

    return list.map((item, idx) => ({
      rank: idx + 1,
      ...item,
      winRate: item.games > 0 ? Math.round((item.wins / item.games) * 100) : 0
    }));
  }

  getPlayerRanks(playerId) {
    if (!playerId) return { winsRank: null, matchesRank: null, cashRank: null, winrateRank: null };
    const winsList = this.getRankings('wins');
    const matchesList = this.getRankings('games');
    const cashList = this.getRankings('cash');
    const winrateList = this.getRankings('winrate');

    const findRank = (list) => {
      const found = list.find(p => String(p.id) === String(playerId));
      return found ? found.rank : null;
    };

    return {
      winsRank: findRank(winsList),
      matchesRank: findRank(matchesList),
      cashRank: findRank(cashList),
      winrateRank: findRank(winrateList),
      totalRanked: winsList.length
    };
  }
}

export const leaderboardManager = new LeaderboardManager();
