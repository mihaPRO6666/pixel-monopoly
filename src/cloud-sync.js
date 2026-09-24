/**
 * Cloud Sync Manager for Pixel Monopoly
 * Synchronizes user state across origins (GitHub Pages, Vercel, localhost)
 * Handles:
 *  - Theme (midnight, cyberpunk, ocean, emerald, etc.)
 *  - Profile Theme / Background (space, matrix, default, etc.)
 *  - Pawn / Token & Custom drawn 16x16 pixel-art pawn
 *  - Dice skin & Unlocked dice skins
 *  - Player Title & Unlocked titles
 *  - Nickname & Nickname Color
 *  - Coins balance & Gameplay stats
 * 
 * Communication & Storage:
 * 1. Persistent cross-origin cloud caching via ntfy.sh (CORS-enabled, zero auth, polled on boot/focus)
 * 2. Instant cross-tab & cross-origin broadcast via Supabase Realtime discovery channel (<50ms latency)
 */

import { themeManager } from './theme.js?v=8.0.0';
import { profileManager, isDevUser } from './profile.js?v=8.0.0';

export class CloudSyncManager {
  constructor() {
    this.syncTopicPrefix = 'pixel_monopoly_sync_';
    this.pushDebounceTimer = null;
    this.isSyncing = false;
    this.lastSyncedTimestamp = 0;
    this.network = null;
    this.isInitialized = false;

    try {
      this.lastSyncedTimestamp = parseInt(localStorage.getItem('monopoly_sync_timestamp') || '0', 10);
    } catch (e) {}
  }

  getSyncTopic() {
    const p = (typeof window !== 'undefined' && window.profileManager?.profile) || profileManager?.profile;
    if (!p) return `${this.syncTopicPrefix}1472673126859935765`;
    if (p.discordId === '1472673126859935765' || p.id === 'discord_1472673126859935765' || isDevUser(p)) {
      return `${this.syncTopicPrefix}1472673126859935765`;
    }
    if (p.discordId) {
      return `${this.syncTopicPrefix}${p.discordId}`;
    }
    if (p.id && p.id !== 'Гость') {
      return `${this.syncTopicPrefix}${p.id}`;
    }
    return `${this.syncTopicPrefix}1472673126859935765`;
  }

  buildPayload(overrideData = {}) {
    const p = (typeof window !== 'undefined' && window.profileManager?.profile) || profileManager.profile || {};
    const theme = themeManager.getTheme() || 'cyberpunk';
    const timestamp = Date.now();

    return {
      version: 1,
      userId: p.id || 'discord_1472673126859935765',
      discordId: p.discordId || '1472673126859935765',
      theme,
      bg: p.bg || 'space',
      profileBg: p.profileBg || p.bg || 'space',
      token: p.token || 'custom',
      customToken: p.customToken || null,
      color: p.color || '#2563eb',
      nameColor: p.nameColor || p.color || '#2563eb',
      name: p.name || 'hizuhara.',
      title: p.title || 'creator',
      unlockedTitles: Array.isArray(p.unlockedTitles) ? p.unlockedTitles : [],
      diceSkin: p.diceSkin || 'cosmic_void',
      unlockedDice: Array.isArray(p.unlockedDice) ? p.unlockedDice : [],
      coins: typeof p.coins === 'number' ? p.coins : 0,
      stats: p.stats ? { ...p.stats } : {},
      timestamp,
      ...overrideData
    };
  }

  schedulePush(overrideData = {}) {
    if (this.pushDebounceTimer) {
      clearTimeout(this.pushDebounceTimer);
    }
    this.pushDebounceTimer = setTimeout(() => {
      this.push(overrideData);
    }, 350);
  }

  async push(overrideData = {}) {
    const payload = this.buildPayload(overrideData);
    this.lastSyncedTimestamp = payload.timestamp;
    try {
      localStorage.setItem('monopoly_sync_timestamp', String(payload.timestamp));
    } catch (e) {}

    // 1. Broadcast via Supabase Realtime across open tabs on all domains
    if (this.network && this.network.discoveryChannel) {
      try {
        this.network.discoveryChannel.send({
          type: 'broadcast',
          event: 'USER_CLOUD_SYNC',
          payload
        });
      } catch (e) {
        console.warn('Realtime broadcast sync error:', e);
      }
    }

    // 2. Persist to ntfy cloud topic for offline/future visits
    const topic = this.getSyncTopic();
    try {
      const res = await fetch(`https://ntfy.sh/${topic}`, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: {
          'Title': 'Monopoly Profile Sync',
          'Tags': 'sync'
        }
      });
      if (res.ok) {
        console.log('✓ Cloud sync pushed successfully to:', topic);
      }
    } catch (e) {
      console.warn('Cloud sync push error (network offline?):', e);
    }
  }

  async pull() {
    if (this.isSyncing) return;
    this.isSyncing = true;
    const topic = this.getSyncTopic();

    try {
      const res = await fetch(`https://ntfy.sh/${topic}/json?poll=1&since=all`);
      if (!res.ok) {
        this.isSyncing = false;
        return;
      }
      const text = await res.text();
      if (!text || !text.trim()) {
        this.isSyncing = false;
        return;
      }

      const lines = text.trim().split('\n');
      const messages = lines
        .map(l => { try { return JSON.parse(l); } catch(e) { return null; } })
        .filter(l => l && l.event === 'message' && l.message)
        .map(l => { try { return JSON.parse(l.message); } catch(e) { return null; } })
        .filter(Boolean)
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

      if (messages.length > 0) {
        const latest = messages[0];
        if (latest.timestamp && latest.timestamp > this.lastSyncedTimestamp) {
          console.log('✓ Applying newer cloud sync state:', latest);
          this.applySyncData(latest);
        } else if (this.lastSyncedTimestamp > (latest.timestamp || 0)) {
          // Local is newer, push to cloud
          this.schedulePush();
        }
      }
    } catch (e) {
      console.warn('Cloud sync pull error:', e);
    } finally {
      this.isSyncing = false;
    }
  }

  applySyncData(data) {
    if (!data) return;
    this.lastSyncedTimestamp = data.timestamp || Date.now();
    try {
      localStorage.setItem('monopoly_sync_timestamp', String(this.lastSyncedTimestamp));
    } catch (e) {}

    // Apply App Theme
    if (data.theme && data.theme !== themeManager.getTheme()) {
      themeManager.applyTheme(data.theme, false);
    }

    // Apply Profile data
    const pm = (typeof window !== 'undefined' && window.profileManager) || profileManager;
    const p = pm?.profile;
    if (p) {
      if (data.name) p.name = data.name;
      if (data.color) p.color = data.color;
      if (data.nameColor) p.nameColor = data.nameColor;
      else if (data.color) p.nameColor = data.color;
      if (data.bg) p.bg = data.bg;
      if (data.profileBg) p.profileBg = data.profileBg;
      if (data.token) p.token = data.token;
      if (data.customToken) p.customToken = data.customToken;
      if (data.diceSkin) p.diceSkin = data.diceSkin;
      if (Array.isArray(data.unlockedDice)) {
        p.unlockedDice = Array.from(new Set([...(p.unlockedDice || []), ...data.unlockedDice]));
      }
      if (data.title) p.title = data.title;
      if (Array.isArray(data.unlockedTitles)) {
        p.unlockedTitles = Array.from(new Set([...(p.unlockedTitles || []), ...data.unlockedTitles]));
      }
      if (typeof data.coins === 'number') {
        p.coins = data.coins;
      }
      if (data.stats) {
        p.stats = { ...(p.stats || {}), ...data.stats };
      }

      pm.saveProfile(p, false); // don't re-trigger sync push
    }

    // Sync leaderboard with my updated record
    try {
      import('./leaderboard.js?v=8.0.0').then(({ leaderboardManager }) => {
        leaderboardManager.syncMyRecord();
      }).catch(() => {});
    } catch (e) {}

    // Update UI
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('cloud-sync-applied', { detail: data }));
      if (window.app) {
        try {
          window.app.renderProfileCard?.();
          window.app.renderLeaderboard?.();
          window.app.renderBgPicker?.();
          window.app.renderTitlePicker?.();
          window.app.renderTokenPicker?.();
          window.app.renderNameColorPicker?.();
        } catch (e) {}
      }
    }
  }

  syncTheme(themeId) {
    this.schedulePush({ theme: themeId });
  }

  syncProfile() {
    this.schedulePush();
  }

  syncPawn(customTokenDataUrl) {
    const pm = (typeof window !== 'undefined' && window.profileManager) || profileManager;
    this.schedulePush({
      token: customTokenDataUrl ? 'custom' : (pm?.profile?.token || '💎'),
      customToken: customTokenDataUrl
    });
  }

  syncNameColor(color) {
    const pm = (typeof window !== 'undefined' && window.profileManager) || profileManager;
    if (pm && pm.profile) {
      pm.profile.color = color;
      pm.profile.nameColor = color;
      pm.saveProfile(pm.profile, false);
    }
    this.schedulePush({ color, nameColor: color });
  }

  init(networkInstance) {
    this.network = networkInstance;
    if (this.isInitialized) return;
    this.isInitialized = true;

    // Listen to Realtime discovery channel for instant cross-tab sync
    if (this.network && this.network.discoveryChannel) {
      this.setupRealtimeListener();
    }

    // Pull from cloud immediately on load
    this.pull();

    // Pull on window focus / tab visibility change
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', () => this.pull());
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            this.pull();
          }
        });
      }
    }
  }

  setupRealtimeListener() {
    if (!this.network || !this.network.discoveryChannel) return;
    this.network.discoveryChannel.on('broadcast', { event: 'USER_CLOUD_SYNC' }, ({ payload }) => {
      if (!payload || !payload.userId) return;
      const myTopic = this.getSyncTopic();
      const payloadTopic = `${this.syncTopicPrefix}${payload.discordId || payload.userId}`;
      const pm = (typeof window !== 'undefined' && window.profileManager) || profileManager;
      if (myTopic === payloadTopic || payload.userId === pm?.profile?.id || (isDevUser(pm?.profile) && (payload.discordId === '1472673126859935765' || String(payload.userId).includes('1472673126859935765')))) {
        if (payload.timestamp && payload.timestamp > this.lastSyncedTimestamp) {
          console.log('⚡ Realtime cross-tab sync received:', payload);
          this.applySyncData(payload);
        }
      }
    });
  }
}

export const cloudSync = (typeof window !== 'undefined' && window.__monopoly_cloud_sync_instance)
  ? window.__monopoly_cloud_sync_instance
  : new CloudSyncManager();

if (typeof window !== 'undefined') {
  window.__monopoly_cloud_sync_instance = cloudSync;
  window.cloudSync = cloudSync;
}
