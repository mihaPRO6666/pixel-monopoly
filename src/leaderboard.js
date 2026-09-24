/**
 * Leaderboard & Ranking Manager for Pixel Monopoly
 * Tracks strictly real players (local profile, peers from multiplayer, games played)
 */
import { profileManager, getTokenEmoji } from './profile.js?v=8.0.0';

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

const customPawnData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAABmUlEQVR4AUySS3LjMAxEG9rFc724rJzQcsVzvImXmPcgyRUWIHwaaIKklrgq2T5frVYqih88TUoHRfK4UofGAF1Kr5P170dVde7XH6LM6sIYHXpi6/dHhZzw0uPVTNCS0eMkG0TgAAAABJRU5ErkJggg==';

// List of official registered players to seed global leaderboard across domains
const DEFAULT_REGISTERED_PLAYERS = [
  {
    id: 'discord_1472673126859935765',
    name: 'hizuhara.',
    token: 'custom',
    customToken: customPawnData,
    color: '#2563eb',
    bg: 'space',
    profileBg: 'space',
    title: 'creator',
    diceSkin: 'cosmic_void',
    coins: 0,
    wins: 2,
    games: 2,
    netWorth: 2500,
    isRegistered: true,
    discordId: '1472673126859935765',
    avatarUrl: 'https://cdn.discordapp.com/avatars/1472673126859935765/8819b4f951abe3f4f76a1646dee1ba9d.png'
  },
  {
    id: 'discord_player_cat',
    name: 'СЫН ШЛЮХИ',
    token: '🐱',
    color: '#3b82f6',
    bg: 'default',
    profileBg: 'default',
    title: 'novice',
    diceSkin: 'classic',
    coins: 0,
    wins: 0,
    games: 2,
    netWorth: 500,
    isRegistered: true,
    discordId: 'player_cat',
    avatarUrl: null
  }
];

// Version stamp — bump to wipe stale duplicated localStorage
const LEADERBOARD_VERSION = 'v11';

// Helper to verify if a player is registered (via Discord)
export function isPlayerRegistered(p) {
  if (!p) return false;
  if (p.name === 'Гость' || p.name === 'Игрок') return false;
  return Boolean(p.isRegistered === true || p.discordId || p.authProvider === 'discord' || String(p.id).startsWith('discord_'));
}

export function isHizuRecord(r) {
  if (!r) return false;
  const id = String(r.id || '');
  const dId = String(r.discordId || '');
  const dUser = String(r.discordUsername || '').toLowerCase();
  const name = String(r.name || '').toLowerCase().replace(/\.+$/, '');
  return id === 'discord_1472673126859935765' || 
         id === 'discord_hizuhara' || 
         dId === '1472673126859935765' || 
         dId === 'hizuhara' || 
         dUser === 'hizuhara' ||
         name === 'hizuhara';
}

export function getRecordDedupeKey(r) {
  if (!r) return '';
  if (isHizuRecord(r)) {
    return 'creator_hizuhara';
  }
  const cleanName = (r.name || '').trim().toLowerCase().replace(/\.+$/, '');
  const discord = (r.discordId || r.discordUsername || '').trim().toLowerCase();
  return discord || cleanName;
}

class LeaderboardManager {
  constructor() {
    this._migrateVersion();
    this.records = this.loadRecords();
    this.currentSort = 'wins';
    this.syncMyRecord();
  }

  _migrateVersion() {
    const stored = localStorage.getItem('monopoly_leaderboard_version');
    if (stored !== LEADERBOARD_VERSION) {
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
          // Purge any fictional/bot players, empty guests, and non-registered players
          validRecords = parsed.filter(r => 
            r && 
            r.id && 
            !String(r.id).startsWith('champ_') && 
            !FICTIONAL_NAMES.has(r.name) && 
            !r.isBot &&
            isPlayerRegistered(r) &&
            r.name !== 'Гость' &&
            r.name !== 'Игрок'
          );
        }
      } catch (e) {
        console.warn('Failed to parse leaderboard:', e);
      }
    }

    // Ensure all known registered players from the official leaderboard are included
    for (const def of DEFAULT_REGISTERED_PLAYERS) {
      const exists = validRecords.some(r => 
        String(r.id) === String(def.id) || 
        (isHizuRecord(def) && isHizuRecord(r)) ||
        (r.name && r.name.toLowerCase() === def.name.toLowerCase()) ||
        (r.discordId && def.discordId && r.discordId.toLowerCase() === def.discordId.toLowerCase())
      );
      if (!exists) {
        validRecords.push({ ...def });
      }
    }

    // Strictly deduplicate by dedupe key
    const seen = new Set();
    const deduped = [];
    for (const r of validRecords) {
      const key = getRecordDedupeKey(r);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      deduped.push(r);
    }

    this.saveRecords(deduped);
    return deduped;
  }

  saveRecords(records = this.records) {
    this.records = records;
    try {
      localStorage.setItem('monopoly_leaderboard', JSON.stringify(this.records));
    } catch (e) {
      console.warn('Failed to save leaderboard:', e);
    }
  }

  syncMyRecord() {
    const myProfile = (typeof window !== 'undefined' && window.profileManager?.profile) || (typeof profileManager !== 'undefined' && profileManager ? profileManager.profile : null);
    if (!myProfile || !myProfile.id) return;
    if (!isPlayerRegistered(myProfile)) return; // Only registered players get saved into leaderboard

    const myStats = myProfile.stats || {};
    const isMeHizu = isHizuRecord(myProfile);

    // Find all records that match me (by id, discordId, or hizu identity)
    const myMatches = this.records.filter(r => {
      if (String(r.id) === String(myProfile.id)) return true;
      if (myProfile.discordId && r.discordId && String(r.discordId) === String(myProfile.discordId)) return true;
      if (isMeHizu && isHizuRecord(r)) return true;
      return false;
    });

    let existing = myMatches[0];
    if (myMatches.length > 1) {
      const idsToRemove = new Set(myMatches.slice(1).map(r => r.id));
      this.records = this.records.filter(r => !idsToRemove.has(r.id));
    }

    if (existing) {
      existing.id = myProfile.id;
      existing.name = myProfile.name;
      existing.discordId = myProfile.discordId || existing.discordId;
      existing.token = myProfile.token;
      existing.customToken = myProfile.token === 'custom' ? myProfile.customToken : null;
      existing.color = myProfile.color;
      existing.bg = myProfile.bg || 'default';
      existing.profileBg = myProfile.bg || 'default';
      existing.title = myProfile.title || existing.title || 'creator';
      existing.diceSkin = myProfile.diceSkin || existing.diceSkin || 'cosmic_void';
      existing.coins = typeof myProfile.coins === 'number' ? myProfile.coins : (existing.coins || 0);
      const bestWins = Math.max(existing.wins || 0, myStats.wins || 0);
      existing.wins = bestWins;
      if ((myStats.wins || 0) < bestWins) {
        myStats.wins = bestWins;
        profileManager.saveProfile(myProfile);
      }
      existing.games = Math.max(existing.games || 0, myStats.gamesPlayed || 0);
      existing.netWorth = Math.max(existing.netWorth || 0, myStats.maxNetWorth || 0);
      existing.isRegistered = true;
      if (myProfile.discordId) existing.discordId = myProfile.discordId;
      if (myProfile.avatarUrl) existing.avatarUrl = myProfile.avatarUrl;
    } else {
      this.records.push({
        id: myProfile.id,
        name: myProfile.name,
        token: myProfile.token,
        customToken: myProfile.token === 'custom' ? myProfile.customToken : null,
        color: myProfile.color,
        bg: myProfile.bg || 'default',
        profileBg: myProfile.bg || 'default',
        title: myProfile.title || 'creator',
        diceSkin: myProfile.diceSkin || 'cosmic_void',
        coins: myProfile.coins || 0,
        wins: myStats.wins || 0,
        games: myStats.gamesPlayed || 0,
        netWorth: myStats.maxNetWorth || 0,
        isRegistered: true,
        discordId: myProfile.discordId || null,
        avatarUrl: myProfile.avatarUrl || null
      });
    }

    // Deduplicate entire records list
    const seen = new Set();
    this.records = this.records.filter(r => {
      const k = getRecordDedupeKey(r);
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    this.saveRecords();
  }

  // Alias for backward compatibility
  syncMyRegisteredRecord() {
    this.syncMyRecord();
  }

  registerPlayer(player) {
    if (!player || player.isBot) return;
    if (FICTIONAL_NAMES.has(player.name) || String(player.id).startsWith('champ_')) return;
    if (!isPlayerRegistered(player)) return; // Only registered players

    const myProfile = profileManager?.profile;
    if (myProfile && (String(player.id) === String(myProfile.id) || (isHizuRecord(myProfile) && isHizuRecord(player)))) {
      this.syncMyRecord();
      return;
    }

    const stats = player.stats || {};
    const wins = typeof stats.wins === 'number' ? stats.wins : (player.wins || 0);
    const games = typeof stats.gamesPlayed === 'number' ? stats.gamesPlayed : (player.games || 0);
    const netWorth = typeof stats.maxNetWorth === 'number' ? stats.maxNetWorth : (player.netWorth || 0);

    const pName = (player.name || '').trim().toLowerCase();
    const pDiscord = (player.discordId || player.discordUsername || '').trim().toLowerCase();
    const isPlayerHizu = isHizuRecord(player);

    // Match by ID, by Name, or by Discord ID
    const existing = this.records.find(r => {
      if (String(r.id) === String(player.id)) return true;
      if (isPlayerHizu && isHizuRecord(r)) return true;
      const rName = (r.name || '').trim().toLowerCase();
      const rDiscord = (r.discordId || '').trim().toLowerCase();
      if (pName && rName === pName) return true;
      if (pDiscord && rDiscord && (rDiscord === pDiscord || rDiscord === pName)) return true;
      return false;
    });

    if (existing) {
      existing.name = player.name || existing.name;
      if (player.token && player.token !== 'custom') existing.token = getTokenEmoji(player.token);
      if (player.customToken) existing.customToken = player.customToken;
      if (player.color) existing.color = player.color;
      if (player.bg || player.profileBg) {
        existing.bg = player.bg || player.profileBg;
        existing.profileBg = player.bg || player.profileBg;
      }
      if (typeof player.coins === 'number') {
        existing.coins = Math.max(existing.coins || 0, player.coins);
      }
      if (player.title) existing.title = player.title;
      if (player.diceSkin) existing.diceSkin = player.diceSkin;
      if (player.discordId) existing.discordId = player.discordId;
      if (player.avatarUrl) existing.avatarUrl = player.avatarUrl;
      existing.isRegistered = true;
      if (wins > (existing.wins || 0)) existing.wins = wins;
      if (games > (existing.games || 0)) existing.games = games;
      if (netWorth > (existing.netWorth || 0)) existing.netWorth = netWorth;
    } else {
      this.records.push({
        id: player.id,
        name: player.name || 'Игрок',
        token: getTokenEmoji(player.token || '🎩'),
        customToken: player.customToken || null,
        color: player.color || '#2563eb',
        bg: player.bg || player.profileBg || 'default',
        profileBg: player.bg || player.profileBg || 'default',
        title: player.title || 'novice',
        diceSkin: player.diceSkin || 'classic',
        coins: typeof player.coins === 'number' ? player.coins : 0,
        isRegistered: true,
        discordId: player.discordId || null,
        avatarUrl: player.avatarUrl || null,
        wins: wins,
        games: games || (wins ? wins : 0),
        netWorth: netWorth
      });
    }

    this.saveRecords();
  }

  recordGameFinished(players, winnerId) {
    if (!players || !Array.isArray(players)) return;

    players.forEach(p => {
      if (p.isBot || FICTIONAL_NAMES.has(p.name) || String(p.id).startsWith('champ_')) return;

      const isWinner = String(p.id) === String(winnerId);
      const isMe = String(p.id) === String(profileManager?.profile?.id);

      if (isMe) {
        profileManager.recordGameResult(isWinner, p.cash || 0, p.netWorth || p.cash || 0);
        this.syncMyRecord();
        return;
      }

      if (!isPlayerRegistered(p)) return;

      const pName = (p.name || '').trim().toLowerCase();
      const pDiscord = (p.discordId || p.discordUsername || '').trim().toLowerCase();

      const existing = this.records.find(r => {
        if (String(r.id) === String(p.id)) return true;
        const rName = (r.name || '').trim().toLowerCase();
        const rDiscord = (r.discordId || '').trim().toLowerCase();
        if (pName && rName === pName) return true;
        if (pDiscord && rDiscord && (rDiscord === pDiscord || rDiscord === pName)) return true;
        return false;
      });

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
        if (p.customToken) existing.customToken = p.customToken;
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
          customToken: p.customToken || null,
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
    this.syncMyRecord();
    const myProfile = (typeof window !== 'undefined' && window.profileManager?.profile) || (typeof profileManager !== 'undefined' && profileManager ? profileManager.profile : null);
    const isMeRegistered = myProfile ? isPlayerRegistered(myProfile) : false;
    const isMeHizu = isHizuRecord(myProfile);
    const myName = (myProfile && myProfile.name) ? String(myProfile.name).trim().toLowerCase() : '';
    const myDiscord = (myProfile && (myProfile.discordUsername || myProfile.discordId)) ? String(myProfile.discordUsername || myProfile.discordId).trim().toLowerCase() : '';

    // Filter and strictly deduplicate list by name / discord
    const seenKeys = new Set();
    const list = [];

    for (const r of this.records) {
      if (!r || !r.id || String(r.id).startsWith('champ_') || FICTIONAL_NAMES.has(r.name) || r.isBot) {
        continue;
      }
      if (!isPlayerRegistered(r)) {
        continue;
      }
      if (r.name === 'Гость' || r.name === 'Игрок') {
        continue;
      }

      const key = getRecordDedupeKey(r);

      if (!key || seenKeys.has(key)) continue;
      seenKeys.add(key);

      const rName = (r.name || '').trim().toLowerCase();
      const rDiscord = (r.discordId || '').trim().toLowerCase();

      const isMe = isMeRegistered && (
        String(r.id) === String(myProfile?.id) ||
        (isMeHizu && isHizuRecord(r)) ||
        (myName && rName === myName) ||
        (myDiscord && rDiscord && (rDiscord === myDiscord || rDiscord === myName))
      );

      list.push({
        ...r,
        name: isMe ? (myProfile.name || r.name) : r.name,
        isMe
      });
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
        return (rateB - rateA) || (b.wins - a.wins) || (b.games - a.games);
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
