/**
 * Supabase Realtime Multiplayer & Room Session Management
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

export function isTestOrLocalEnvironment(roomCode = '', hostName = '') {
  if (typeof window === 'undefined') return true;
  const host = window.location?.hostname || '';
  const isLocal = host === 'localhost' || host === '127.0.0.1' || window.location?.protocol === 'file:';
  const isAutomated = !!(window.navigator?.webdriver || window.__IS_TEST_ENV__);
  const isTestCode = /TEST|DEBUG|MOCK/i.test(roomCode);
  const isTestHost = /Test|Playwright|Automated/i.test(hostName || '');
  return isLocal || isAutomated || isTestCode || isTestHost;
}

export class NetworkManager {
  constructor() {
    this.supabase = null;
    this.channel = null;
    this.discoveryChannel = null;
    this.roomCode = null;
    this.isHost = false;
    this.playerId = null;
    this.onActionCallback = null;
    this.onPlayerJoinCallback = null;
    this.onPlayerLeaveCallback = null;
    this.onSyncCallback = null;

    this.defaultUrl = 'https://eibpzgsajhgyoitqtmkt.supabase.co';
    this.defaultKey = 'sb_publishable_IJF4VWu5Sk2zNA7lnmAwtw_mtq25x8x';

    this.discoveredLobbies = new Map();
    this.onLobbiesUpdateCallback = null;
    this.announceInterval = null;

    // Active connection heartbeats
    this.lastHeartbeats = new Map();
    this.heartbeatInterval = null;

    this.initClient();
  }

  initClient(customUrl = null, customKey = null) {
    const url = customUrl || localStorage.getItem('monopoly_supabase_url') || this.defaultUrl;
    const key = customKey || localStorage.getItem('monopoly_supabase_key') || this.defaultKey;

    try {
      this.supabase = createClient(url, key, {
        realtime: {
          params: {
            eventsPerSecond: 10
          }
        }
      });
      console.log('Supabase client initialized');
    } catch (e) {
      console.error('Failed to initialize Supabase client:', e);
    }
  }

  generateRoomCode() {
    return Math.random().toString(36).substring(2, 6).toUpperCase() + '-' + Math.floor(100 + Math.random() * 900);
  }

  // --- LOBBY DISCOVERY (PUBLIC ROOMS LIST) ---
  listenForPublicLobbies(onUpdate) {
    this.onLobbiesUpdateCallback = onUpdate;
    if (!this.supabase) this.initClient();

    if (this.discoveryChannel) {
      this.discoveryChannel.unsubscribe();
    }

    this.discoveryChannel = this.supabase.channel('monopoly_public_lobbies', {
      config: { broadcast: { self: false } }
    });

    this.discoveryChannel.on('broadcast', { event: 'LOBBY_ANNOUNCE' }, ({ payload }) => {
      if (payload && payload.roomCode) {
        // Filter out any test, local, or automated entries
        if (
          payload.isTest || 
          payload.isLocal || 
          /TEST|DEBUG|MOCK/i.test(payload.roomCode) || 
          /Test|Playwright|Automated/i.test(payload.hostName || '')
        ) {
          return;
        }

        if (payload.status === 'CLOSED') {
          this.discoveredLobbies.delete(payload.roomCode);
        } else {
          payload.lastSeen = Date.now();
          this.discoveredLobbies.set(payload.roomCode, payload);
          if (payload.hostId && payload.hostName && (payload.isRegistered || payload.discordId) && payload.hostName !== 'Гость' && payload.hostName !== 'Игрок') {
            import('./leaderboard.js?v=8.0.0').then(({ leaderboardManager }) => {
              leaderboardManager.registerPlayer({
                id: payload.hostId,
                name: payload.hostName,
                token: payload.hostToken,
                customToken: payload.hostCustomToken || null,
                color: payload.hostColor,
                bg: payload.hostBg || payload.profileBg || 'default',
                profileBg: payload.hostBg || payload.profileBg || 'default',
                coins: payload.coins || 0,
                stats: payload.hostStats || {},
                isRegistered: true,
                discordId: payload.discordId || null,
                avatarUrl: payload.avatarUrl || null
              });
            }).catch(() => {});
          }
        }
        this.notifyLobbiesUpdate();
      }
    });

    this.discoveryChannel.on('broadcast', { event: 'LEADERBOARD_ANNOUNCE' }, ({ payload }) => {
      if (payload && payload.id) {
        if (/TEST|DEBUG|MOCK/i.test(String(payload.id)) || /Test|Playwright|Automated/i.test(payload.name || '')) {
          return;
        }
        if (!payload.isRegistered && !payload.discordId) {
          return;
        }
        if (payload.name === 'Гость' || payload.name === 'Игрок') {
          return;
        }
        import('./leaderboard.js?v=8.0.0').then(({ leaderboardManager }) => {
          leaderboardManager.registerPlayer(payload);
          // Notify the app to re-render the leaderboard UI
          window.dispatchEvent(new CustomEvent('leaderboard-updated'));
        }).catch(() => {});
      }
    });

    this.discoveryChannel.on('broadcast', { event: 'REQUEST_LOBBIES' }, () => {
      if (this.isHost && this.roomCode) {
        this.broadcastLobbyAnnounce();
      }
    });

    // When a new user connects and requests leaderboard, users respond with their record
    this.discoveryChannel.on('broadcast', { event: 'REQUEST_LEADERBOARD' }, () => {
      if (isTestOrLocalEnvironment(this.roomCode)) return;
      import('./profile.js?v=8.0.0').then(({ profileManager }) => {
        const p = profileManager.profile;
        if (p && p.id && (p.isRegistered || p.discordId) && p.name !== 'Гость' && p.name !== 'Игрок') {
          this.broadcastLeaderboardRecord({
            id: p.id,
            name: p.name,
            token: p.token,
            customToken: p.token === 'custom' ? p.customToken : null,
            color: p.color,
            bg: p.bg || 'default',
            profileBg: p.bg || 'default',
            coins: p.coins || 0,
            stats: p.stats,
            isRegistered: true,
            discordId: p.discordId || null,
            avatarUrl: p.avatarUrl || null
          });
        }
      }).catch(() => {});
    });

    this.discoveryChannel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        // Request existing lobbies
        this.discoveryChannel.send({
          type: 'broadcast',
          event: 'REQUEST_LOBBIES',
          payload: {}
        });
        // Request existing leaderboard records from all connected users across domains
        setTimeout(() => {
          this.discoveryChannel.send({
            type: 'broadcast',
            event: 'REQUEST_LEADERBOARD',
            payload: {}
          });
        }, 500);

        // Also announce own profile to ensure other peers get it (ONLY if registered)
        setTimeout(() => {
          import('./profile.js?v=8.0.0').then(({ profileManager }) => {
            const p = profileManager.profile;
            if (p && p.id && (p.isRegistered || p.discordId) && p.name !== 'Гость' && p.name !== 'Игрок') {
              this.broadcastLeaderboardRecord({
                id: p.id,
                name: p.name,
                token: p.token,
                customToken: p.token === 'custom' ? p.customToken : null,
                color: p.color,
                bg: p.bg || 'default',
                profileBg: p.bg || 'default',
                coins: p.coins || 0,
                stats: p.stats,
                isRegistered: true,
                discordId: p.discordId || null,
                avatarUrl: p.avatarUrl || null
              });
            }
          }).catch(() => {});
        }, 1200);
      }
    });

    // Periodic leaderboard sync across all open browser tabs and domains
    setInterval(() => {
      if (typeof profileManager !== 'undefined' && profileManager && profileManager.profile) {
        const p = profileManager.profile;
        if (p && p.id && (p.isRegistered || p.discordId) && p.name !== 'Гость' && p.name !== 'Игрок') {
          this.broadcastLeaderboardRecord({
            id: p.id,
            name: p.name,
            token: p.token,
            customToken: p.token === 'custom' ? p.customToken : null,
            color: p.color,
            bg: p.bg || 'default',
            profileBg: p.bg || 'default',
            coins: p.coins || 0,
            stats: p.stats,
            isRegistered: true,
            discordId: p.discordId || null,
            avatarUrl: p.avatarUrl || null
          });
        }
      }
    }, 15000);

    setInterval(() => {
      const now = Date.now();
      let changed = false;
      for (const [code, info] of this.discoveredLobbies.entries()) {
        if (now - info.lastSeen > 8000) {
          this.discoveredLobbies.delete(code);
          changed = true;
        }
      }
      if (changed) this.notifyLobbiesUpdate();
    }, 3000);
  }

  notifyLobbiesUpdate() {
    if (this.onLobbiesUpdateCallback) {
      this.onLobbiesUpdateCallback(Array.from(this.discoveredLobbies.values()));
    }
  }

  startAnnouncingLobby(lobbyData) {
    this.currentLobbyData = lobbyData;
    this.broadcastLobbyAnnounce();

    if (this.announceInterval) clearInterval(this.announceInterval);
    this.announceInterval = setInterval(() => {
      this.broadcastLobbyAnnounce();
    }, 6000);
  }

  updateLobbyAnnounce(lobbyData) {
    this.currentLobbyData = { ...this.currentLobbyData, ...lobbyData };
    this.broadcastLobbyAnnounce();
  }

  broadcastLobbyAnnounce() {
    if (!this.discoveryChannel || !this.currentLobbyData) return;
    if (isTestOrLocalEnvironment(this.roomCode, this.currentLobbyData?.hostName)) {
      return;
    }
    this.discoveryChannel.send({
      type: 'broadcast',
      event: 'LOBBY_ANNOUNCE',
      payload: {
        ...this.currentLobbyData,
        roomCode: this.roomCode,
        status: 'OPEN'
      }
    });
  }

  stopAnnouncingLobby() {
    if (this.announceInterval) {
      clearInterval(this.announceInterval);
      this.announceInterval = null;
    }
    if (this.discoveryChannel && this.roomCode && !isTestOrLocalEnvironment(this.roomCode)) {
      this.discoveryChannel.send({
        type: 'broadcast',
        event: 'LOBBY_ANNOUNCE',
        payload: { roomCode: this.roomCode, status: 'CLOSED' }
      });
    }
    this.currentLobbyData = null;
  }

  broadcastLeaderboardRecord(record) {
    if (!this.discoveryChannel || !record || !record.id) return;
    if (isTestOrLocalEnvironment('', record.name)) return;
    if (!record.isRegistered && !record.discordId) return;
    if (record.name === 'Гость' || record.name === 'Игрок') return;
    this.discoveryChannel.send({
      type: 'broadcast',
      event: 'LEADERBOARD_ANNOUNCE',
      payload: record
    });
  }

  // --- JOIN / CREATE ROOM ---
  async joinRoom(roomCode, playerProfile, isCreating = false) {
    this.roomCode = roomCode.trim().toUpperCase();
    this.isHost = isCreating;
    this.playerId = playerProfile.id;

    // Save session for reconnect
    localStorage.setItem('monopoly_active_room', this.roomCode);
    localStorage.setItem('monopoly_is_host', this.isHost ? '1' : '0');

    if (!this.supabase) {
      this.initClient();
    }

    // Clean up any existing channel before creating new one
    this.stopHeartbeat();
    if (this.channel) {
      try {
        await this.channel.untrack();
        if (this.supabase) await this.supabase.removeChannel(this.channel);
        else await this.channel.unsubscribe();
      } catch (e) {}
      this.channel = null;
    }

    if (this.supabase && typeof this.supabase.getChannels === 'function') {
      try {
        const allChannels = this.supabase.getChannels();
        for (const ch of allChannels) {
          if (ch.topic && (ch.topic.startsWith('realtime:monopoly_room_') || ch.topic.startsWith('monopoly_room_'))) {
            await this.supabase.removeChannel(ch);
          }
        }
      } catch (e) {}
    }

    const channelName = `monopoly_room_${this.roomCode}`;
    this.channel = this.supabase.channel(channelName, {
      config: {
        presence: {
          key: this.playerId
        },
        broadcast: {
          self: false
        }
      }
    });

    // Listen for broadcast events
    this.channel.on('broadcast', { event: 'GAME_ACTION' }, ({ payload }) => {
      if (this.onActionCallback) {
        this.onActionCallback(payload);
      }
    });

    // Heartbeat tracking
    this.channel.on('broadcast', { event: 'HEARTBEAT' }, ({ payload }) => {
      if (payload && payload.playerId) {
        this.lastHeartbeats.set(String(payload.playerId), Date.now());
      }
    });

    this.channel.on('broadcast', { event: 'REQUEST_SYNC' }, ({ payload }) => {
      if (this.isHost && this.onSyncCallback) {
        const syncData = this.onSyncCallback(payload.playerId);
        this.sendBroadcast('SYNC_STATE', {
          targetPlayerId: payload.playerId,
          ...syncData
        });
      }
    });

    this.channel.on('broadcast', { event: 'SYNC_STATE' }, ({ payload }) => {
      if (payload.targetPlayerId && payload.targetPlayerId !== this.playerId) {
        return; // Targeted to someone else during initial join
      }
      if (this.onActionCallback) {
        this.onActionCallback({ type: 'SYNC_STATE', ...payload });
      }
    });

    this.channel.on('broadcast', { event: 'PING_ROOM' }, () => {
      this.sendBroadcast('PONG_ROOM', {
        playerId: this.playerId,
        isHost: this.isHost,
        roomCode: this.roomCode
      });
    });

    // Listen for presence
    this.channel.on('presence', { event: 'sync' }, () => {
      const state = this.channel.presenceState();
      if (this.onPlayerJoinCallback) {
        const playersInRoom = Object.values(state).flat();
        this.onPlayerJoinCallback(playersInRoom);
      }
    });

    this.channel.on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
      if (this.onPlayerLeaveCallback) {
        if (leftPresences && leftPresences.length > 0) {
          leftPresences.forEach(p => {
            this.onPlayerLeaveCallback(p.id || key, p.name);
          });
        } else if (key) {
          this.onPlayerLeaveCallback(key);
        }
      }
    });

    return new Promise((resolve) => {
      let isSettled = false;
      const timeoutId = setTimeout(() => {
        if (!isSettled) {
          isSettled = true;
          console.warn(`Channel subscribe timed out for room ${this.roomCode}, proceeding with fallback.`);
          resolve({ success: true, roomCode: this.roomCode, warning: 'timeout' });
        }
      }, 3500);

      this.channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED' && !isSettled) {
          isSettled = true;
          clearTimeout(timeoutId);

          try {
            await this.channel.track({
              id: playerProfile.id,
              name: playerProfile.name,
              title: playerProfile.title || 'novice',
              diceSkin: playerProfile.diceSkin || 'classic',
              token: playerProfile.token,
              customToken: playerProfile.customToken || null,
              color: playerProfile.color,
              bg: playerProfile.bg || 'default',
              profileBg: playerProfile.bg || 'default',
              coins: playerProfile.coins || 0,
              stats: playerProfile.stats || {},
              isRegistered: Boolean(playerProfile.isRegistered || playerProfile.discordId),
              discordId: playerProfile.discordId || null,
              avatarUrl: playerProfile.avatarUrl || null,
              isHost: this.isHost,
              joinedAt: new Date().toISOString()
            });

            if (!this.isHost) {
              // Direct broadcast to host: "I joined the lobby"
              this.sendBroadcast('PLAYER_JOINED_LOBBY', {
                player: {
                  id: playerProfile.id,
                  name: playerProfile.name,
                  title: playerProfile.title || 'novice',
                  diceSkin: playerProfile.diceSkin || 'classic',
                  token: playerProfile.token,
                  customToken: playerProfile.customToken || null,
                  color: playerProfile.color,
                  bg: playerProfile.bg || 'default',
                  profileBg: playerProfile.bg || 'default',
                  coins: playerProfile.coins || 0,
                  stats: playerProfile.stats || {},
                  isRegistered: Boolean(playerProfile.isRegistered || playerProfile.discordId),
                  discordId: playerProfile.discordId || null,
                  avatarUrl: playerProfile.avatarUrl || null,
                  isHost: false
                }
              });
              // Request room state
              this.sendBroadcast('REQUEST_SYNC', { playerId: this.playerId });
            }
          } catch (e) {
            console.warn('Track/sync error:', e);
          }

          this.startHeartbeat();
          resolve({ success: true, roomCode: this.roomCode });
        } else if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') && !isSettled) {
          console.warn(`Channel subscribe status: ${status}`);
          isSettled = true;
          clearTimeout(timeoutId);
          resolve({ success: false, error: status, roomCode: this.roomCode });
        }
      });
    });
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (this.channel && this.playerId) {
        this.channel.send({
          type: 'broadcast',
          event: 'HEARTBEAT',
          payload: { playerId: this.playerId, timestamp: Date.now() }
        });
      }
    }, 2000);
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    this.lastHeartbeats.clear();
  }

  isPlayerAlive(playerId, thresholdMs = 6000) {
    if (!playerId) return false;
    const last = this.lastHeartbeats.get(String(playerId));
    if (!last) return false;
    return (Date.now() - last) < thresholdMs;
  }

  // --- BROADCAST GAME ACTION ---
  sendBroadcast(actionType, data = {}) {
    if (!this.channel) return;
    this.channel.send({
      type: 'broadcast',
      event: actionType === 'REQUEST_SYNC' || actionType === 'SYNC_STATE' ? actionType : 'GAME_ACTION',
      payload: {
        type: actionType,
        senderId: this.playerId,
        timestamp: Date.now(),
        ...data
      }
    });
  }

  onAction(callback) {
    this.onActionCallback = callback;
  }

  onPlayerJoin(callback) {
    this.onPlayerJoinCallback = callback;
  }

  onPlayerLeave(callback) {
    this.onPlayerLeaveCallback = callback;
  }

  onSyncRequest(callback) {
    this.onSyncCallback = callback;
  }

  getSavedSession() {
    const room = localStorage.getItem('monopoly_active_room');
    const isHost = localStorage.getItem('monopoly_is_host') === '1';
    return room ? { roomCode: room, isHost } : null;
  }

  clearSavedSession() {
    localStorage.removeItem('monopoly_active_room');
    localStorage.removeItem('monopoly_is_host');
  }

  async isRoomActiveWithPlayers(roomCode) {
    if (!roomCode) return false;
    const code = roomCode.trim().toUpperCase();

    // 1. Check if found in actively announced lobbies
    const lobby = this.discoveredLobbies.get(code);
    if (lobby && lobby.status === 'OPEN' && (Date.now() - (lobby.lastSeen || 0) < 10000)) {
      return true;
    }

    if (!this.supabase) this.initClient();
    if (!this.supabase) return false;

    // 2. Probe room channel to check if players are present or responding
    return new Promise((resolve) => {
      let settled = false;
      const channelName = `monopoly_room_${code}`;

      // Create a temporary probe channel
      const probeKey = `probe_${Math.random().toString(36).substring(2, 7)}`;
      const probeChannel = this.supabase.channel(`probe_${code}_${Date.now()}`, {
        config: {
          broadcast: { self: false }
        }
      });

      const finish = async (result) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeoutId);
          try {
            if (this.supabase) await this.supabase.removeChannel(probeChannel);
            else await probeChannel.unsubscribe();
          } catch (e) {}
          resolve(result);
        }
      };

      const timeoutId = setTimeout(() => {
        finish(false);
      }, 2200);

      // Listen for PONG responses on the room
      probeChannel.on('broadcast', { event: 'PONG_ROOM' }, ({ payload }) => {
        if (payload && payload.playerId) {
          finish(true);
        }
      });

      probeChannel.on('broadcast', { event: 'GAME_ACTION' }, () => {
        finish(true);
      });

      probeChannel.on('broadcast', { event: 'LOBBY_UPDATE' }, () => {
        finish(true);
      });

      probeChannel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // Send a broadcast ping to the room
          probeChannel.send({
            type: 'broadcast',
            event: 'PING_ROOM',
            payload: { probeKey }
          });
        }
      });
    });
  }

  async leaveRoom() {
    this.stopHeartbeat();
    this.stopAnnouncingLobby();
    this.clearSavedSession();
    if (this.channel) {
      const ch = this.channel;
      this.channel = null;
      try {
        await ch.untrack();
      } catch (e) {
        console.warn('untrack error:', e);
      }
      try {
        if (this.supabase) {
          await this.supabase.removeChannel(ch);
        } else {
          await ch.unsubscribe();
        }
      } catch (e) {
        try {
          await ch.unsubscribe();
        } catch (e2) {}
      }
    }
    this.roomCode = null;
    this.isHost = false;
  }
}

export const network = new NetworkManager();
