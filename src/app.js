/**
 * Main Application Orchestrator
 */

import { engine } from './engine.js?v=8.5.1';
import { ui, showToast, showConfirm } from './ui.js?v=8.5.1';
import { network } from './network.js?v=8.5.1';
import { sound } from './audio.js?v=8.5.1';
import { themeManager, THEMES } from './theme.js?v=8.5.1';
import { profileManager, AVAILABLE_TOKENS, PLAYER_COLORS, NICKNAME_COLORS, PROFILE_BACKGROUNDS, getProfileBg, getTokenEmoji, getTokenName, renderTokenHTML, isDevUser } from './profile.js?v=8.5.1';
import { GAME_PRESETS, getPresetById } from './presets.js?v=8.5.1';
import { BOARD_TILES, COLOR_GROUPS } from './board-data.js?v=8.5.1';
import { leaderboardManager, isPlayerRegistered } from './leaderboard.js?v=8.5.1';
import { DICE_SKINS, CASE_DROPPABLE_SKINS, CASE_PRICE, DUPLICATE_COINS_REFUND, getDiceSkin, rollDiceSkinFromCase, applyDiceSkinToElement, create2DDiceHTML, create3DDiceHTML, getDiceFaceRotations } from './dice-skins.js?v=8.5.1';
import { sendMatchFinishedWebhook } from './webhook.js?v=8.5.1';
import { TITLES, getTitleById, formatTitleBadge, getTitleProgressRatio } from './titles.js?v=8.5.1';
import { pawnEditor } from './pawn-editor.js?v=8.5.1';
import { matchHistoryManager } from './history.js?v=8.5.1';
import { MAP_THEMES, getMapThemeById, getThemedTileData } from './map-themes.js?v=8.5.1';
import { generateThematicTiles } from './city-generator.js?v=8.5.1';
import { cloudSync } from './cloud-sync.js?v=8.5.1';

class App {
  constructor() {
    this.currentScreen = 'menu';
    this.selectedPreset = 'classic';
    const savedBotDiff = localStorage.getItem('monopoly_bot_difficulty') || 'medium';
    this.customSettings = { ...getPresetById('classic').settings, mapTheme: 'classic', botDifficulty: savedBotDiff };
    this.maxPlayers = 4;
    this.lobbyPlayers = [];
    this.customTiles = {}; // { tileId: { name, desc, authorId, authorName } }
    this.isLocalMode = false;
    this.isTestMode = false;
    this.currentTitleFilter = 'all';
    this.autoEndTurn = true;
    this.autoEndInterval = null;
    this.isBotTurnRunning = false;
    this.gameWatchdogInterval = null;
    this.hasSentMatchWebhook = false;
  }

  isBotController() {
    return Boolean(
      this.isSoloMode || 
      this.isLocalMode || 
      this.isTestMode || 
      network.isHost || 
      (network.roomCode && (network.roomCode.startsWith('SOLO-') || network.roomCode.startsWith('TEST-')))
    );
  }

  init() {
    console.log('Initializing Monopoly...');

    // Initialize UI with action handlers
    ui.init({
      onRoll: () => this.handleRoll(),
      onEndTurn: () => this.handleEndTurn(),
      onBuy: () => this.handleBuy(),
      onPass: () => this.handlePass(),
      onCardOk: () => this.handleCardOk(),
      onManageProperties: () => this.openPropertyManager(),
      onTrade: () => this.openTradeModal(),
      onToggleAutoEnd: () => this.toggleAutoEndTurn(),
      checkAutoEnd: () => this.checkAutoEnd(),
      onGameFinished: (state) => this.handleGameFinished(state),
      onShowPlayerProfile: (p, state) => this.showPlayerProfileModal(p, state)
    });

    // Setup network callbacks
    network.onAction((action) => this.handleRemoteAction(action));
    network.onPlayerJoin((players) => this.handlePresenceUpdate(players));
    network.onPlayerLeave((playerId, playerName) => this.handlePlayerLeft(playerId, playerName));
    network.onSyncRequest((requesterId) => ({
      state: engine.getState(),
      isGamePlaying: engine.status === 'PLAYING',
      lobbyPlayers: this.lobbyPlayers,
      presetId: this.selectedPreset,
      settings: this.customSettings,
      maxPlayers: this.maxPlayers
    }));

    window.addEventListener('beforeunload', () => {
      // Save active game state immediately before reload
      if (this.currentScreen === 'game' && engine && engine.status === 'PLAYING') {
        this.saveActiveGameSession();
        return; // Don't broadcast PLAYER_LEFT during simple page refresh
      }
      if (!network.channel) return;
      if (this.currentScreen === 'lobby') {
        if (network.isHost) {
          network.stopAnnouncingLobby();
          this.broadcastAction('LOBBY_DISBANDED', {
            hostId: profileManager.profile.id,
            message: 'Лобби расформировано'
          });
        } else {
          this.broadcastAction('PLAYER_LEFT_LOBBY', {
            playerId: profileManager.profile.id,
            name: profileManager.profile.name
          });
        }
      }
    });

    // Listen for public lobbies on the main page
    network.listenForPublicLobbies((lobbies) => this.renderLobbiesList(lobbies));

    // Cloud Synchronization across origins (GitHub Pages, Vercel, localhost)
    cloudSync.init(network);
    window.addEventListener('cloud-sync-applied', () => {
      this.renderProfileCard();
      this.renderLeaderboard();
      this.renderNameColorPicker();
    });

    // Setup DOM Listeners & UI
    this.initDOMListeners();
    this.initDiscordAuth();
    this.renderProfileCard();
    this.renderLeaderboard();
    this.setupLeaderboardTabs();
    this.setupLobbySettings();
    this.initAudioAndThemeControls();

    // Re-render leaderboard whenever a new player record arrives via Realtime
    window.addEventListener('leaderboard-updated', () => {
      this.renderLeaderboard();
    });

    // 1. Check if user refreshed page during an active game
    const savedActiveGame = this.getSavedActiveGameSession();
    if (savedActiveGame) {
      console.log('Restoring active game session from refresh...', savedActiveGame);
      this.restoreActiveGameSession(savedActiveGame).then(restored => {
        if (!restored) {
          this.checkSavedSessionReconnect();
        }
      });
      return;
    }

    // 2. Check for room in URL (?room=XYZ) or saved session
    const urlParams = new URLSearchParams(window.location.search);
    const roomFromUrl = urlParams.get('room');
    if (roomFromUrl) {
      document.getElementById('input-join-code').value = roomFromUrl.trim().toUpperCase();
      this.joinRoom(roomFromUrl.trim().toUpperCase());
    } else {
      this.checkSavedSessionReconnect();
    }
  }

  saveActiveGameSession() {
    if (this.currentScreen !== 'game' || !engine || engine.status !== 'PLAYING') {
      return;
    }
    const session = {
      roomCode: network.roomCode || null,
      isHost: Boolean(network.isHost),
      isSoloMode: Boolean(this.isSoloMode),
      isLocalMode: Boolean(this.isLocalMode),
      isTestMode: Boolean(this.isTestMode),
      customSettings: this.customSettings || {},
      customTiles: this.customTiles || {},
      lobbyPlayers: this.lobbyPlayers || [],
      state: engine.getState(),
      matchStartTime: matchHistoryManager.matchStartTime || 0,
      matchElapsedSeconds: matchHistoryManager.elapsedSeconds || 0,
      timestamp: Date.now()
    };
    try {
      localStorage.setItem('monopoly_active_game_session', JSON.stringify(session));
    } catch (e) {
      console.warn('saveActiveGameSession error:', e);
    }
  }

  clearActiveGameSession() {
    try {
      localStorage.removeItem('monopoly_active_game_session');
    } catch (e) {}
  }

  getSavedActiveGameSession() {
    try {
      const saved = localStorage.getItem('monopoly_active_game_session');
      if (!saved) return null;
      const session = JSON.parse(saved);
      if (session && session.state && session.state.status === 'PLAYING') {
        const age = Date.now() - (session.timestamp || 0);
        // Only restore if within 3 hours
        if (age < 3 * 60 * 60 * 1000) {
          return session;
        }
      }
    } catch (e) {
      console.warn('getSavedActiveGameSession error:', e);
    }
    return null;
  }

  async restoreActiveGameSession(session) {
    if (!session || !session.state) return false;

    try {
      this.isSoloMode = Boolean(session.isSoloMode);
      this.isLocalMode = Boolean(session.isLocalMode);
      this.isTestMode = Boolean(session.isTestMode);
      this.customSettings = session.customSettings || {};
      this.customTiles = session.customTiles || {};
      this.lobbyPlayers = session.lobbyPlayers || [];
      this.hasSentMatchWebhook = false;

      // Ensure network.isHost is set so bot controller logic works immediately
      if (this.isSoloMode || this.isLocalMode || this.isTestMode || session.isHost) {
        network.isHost = true;
      }
      if (session.roomCode) {
        network.roomCode = session.roomCode;
      }

      // Load state directly into engine
      engine.loadState(session.state);

      // Apply map theme and custom tiles to UI
      const mTheme = session.customSettings?.mapTheme || session.state?.settings?.mapTheme || 'classic';
      ui.setMapTheme(mTheme);
      ui.setCustomTiles(this.customTiles);

      // Switch screen directly to active game
      this.showScreen('game');
      ui.update(engine.getState(), profileManager.profile.id);

      // Restore match duration timer
      if (typeof session.matchElapsedSeconds === 'number' && session.matchElapsedSeconds > 0) {
        matchHistoryManager.startMatchTimer(session.matchElapsedSeconds);
      } else {
        matchHistoryManager.startMatchTimer(0);
      }

      // If multiplayer room, rejoin network channel in background without going to lobby
      if (session.roomCode && !this.isSoloMode && !this.isLocalMode) {
        const roomCodeEl = document.getElementById('lobby-room-code');
        if (roomCodeEl) roomCodeEl.innerText = session.roomCode;
        
        network.joinRoom(session.roomCode, profileManager.profile, session.isHost).then(() => {
          if (session.isHost) {
            this.broadcastAction('SYNC_STATE', {
              state: engine.getState(),
              isGamePlaying: true,
              mapTheme: mTheme
            });
          } else {
            network.sendBroadcast('REQUEST_SYNC', { playerId: profileManager.profile.id });
          }
        }).catch(err => console.warn('Network rejoin after reload error:', err));
      }

      // If it's a bot's turn, continue bot execution after short delay
      const curPlayer = engine.getCurrentPlayer();
      if (curPlayer && curPlayer.isBot && this.isBotController()) {
        setTimeout(() => this.runBotTurnStep(), 1000);
      }

      ui.showToast('🎮 Игра восстановлена после перезагрузки');
      return true;
    } catch (err) {
      console.error('Failed to restore active game session:', err);
      this.clearActiveGameSession();
      return false;
    }
  }

  async checkSavedSessionReconnect() {
    const banner = document.getElementById('reconnect-banner');
    if (!banner) return;
    banner.style.display = 'none';

    const saved = network.getSavedSession();
    if (!saved || !saved.roomCode) return;

    // Filter out test rooms or mock codes
    if (/TEST|DEBUG|MOCK/i.test(saved.roomCode)) {
      network.clearSavedSession();
      return;
    }

    try {
      const isAlive = await network.isRoomActiveWithPlayers(saved.roomCode);
      if (isAlive) {
        const codeEl = document.getElementById('reconnect-room-code');
        if (codeEl) codeEl.innerText = saved.roomCode;
        banner.style.display = 'flex';
      } else {
        network.clearSavedSession();
        banner.style.display = 'none';
      }
    } catch (e) {
      console.warn('checkSavedSessionReconnect error:', e);
      network.clearSavedSession();
      banner.style.display = 'none';
    }
  }

  // --- SCREEN SWITCHING ---
  showScreen(screenId) {
    this.currentScreen = screenId;
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(`screen-${screenId}`);
    if (target) target.classList.add('active');

    if (screenId === 'game') {
      this.startGameWatchdog();
    } else {
      this.stopGameWatchdog();
      this.cancelAutoEndTimer();
    }
  }

  // --- PUBLIC LOBBIES (MAIN PAGE SEARCH) ---
  renderLobbiesList(lobbies) {
    const container = document.getElementById('lobbies-list');
    if (!container) return;

    const filtered = (lobbies || []).filter(lobby => {
      if (!lobby || !lobby.roomCode) return false;
      if (lobby.isTest || lobby.isLocal) return false;
      if (/TEST|DEBUG|MOCK/i.test(lobby.roomCode)) return false;
      if (/Test|Playwright|Automated/i.test(lobby.hostName || '')) return false;
      return true;
    });

    if (filtered.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; color: var(--md-on-surface-variant); padding: 24px 10px; font-size: 0.9rem;">
          Открытых лобби пока нет. Создайте своё или введите код выше.
        </div>
      `;
      return;
    }

    container.innerHTML = filtered.map(lobby => `
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: var(--md-surface-container-low); border-radius: 16px; border: 1px solid var(--md-outline-variant);">
        <div>
          <div style="font-weight: 600; font-size: 0.95rem;">
            Комната ${lobby.roomCode}
          </div>
          <div style="font-size: 0.8rem; color: var(--md-on-surface-variant); margin-top: 2px;">
            Хост: ${lobby.hostName || 'Игрок'} • Режим: ${lobby.presetName || 'Классика'} • ${lobby.currentPlayers || 1}/${lobby.maxPlayers || 4}
          </div>
        </div>
        <button class="md-btn md-btn-tonal btn-join-lobby-direct" data-code="${lobby.roomCode}" style="padding: 8px 16px;">
          Войти
        </button>
      </div>
    `).join('');

    container.querySelectorAll('.btn-join-lobby-direct').forEach(btn => {
      btn.addEventListener('click', () => {
        const code = btn.getAttribute('data-code');
        this.joinRoom(code);
      });
    });
  }

  // --- LOBBY SETTINGS MANAGEMENT ---
  setupLobbySettings() {
    // Bot difficulty chips in settings
    const botDiffChips = document.querySelectorAll('#setting-bot-diff-chips .md-chip');
    botDiffChips.forEach(chip => {
      chip.onclick = () => {
        if (!this.isBotController()) return;
        sound.playClick();
        const diff = chip.getAttribute('data-diff') || 'medium';
        this.setBotDifficulty(diff);
      };
    });

    // Bot difficulty chips in solo banner
    const bannerBotDiffChips = document.querySelectorAll('#banner-bot-diff-chips .banner-bot-diff-chip');
    bannerBotDiffChips.forEach(chip => {
      chip.onclick = () => {
        if (!this.isBotController()) return;
        sound.playClick();
        const diff = chip.getAttribute('data-diff') || 'medium';
        this.setBotDifficulty(diff);
      };
    });

    // Max players chips
    const maxChips = document.querySelectorAll('#max-players-chips .md-chip');
    maxChips.forEach(chip => {
      chip.onclick = () => {
        if (!this.isBotController()) return;
        sound.playClick();
        this.maxPlayers = parseInt(chip.getAttribute('data-max'));
        this.renderLobbySettingsControls();
        this.broadcastLobbySettings();
      };
    });

    // Starting cash chips
    const cashChips = document.querySelectorAll('#setting-starting-cash-chips .md-chip');
    cashChips.forEach(chip => {
      chip.onclick = () => {
        if (!this.isBotController()) return;
        sound.playClick();
        this.customSettings.startingCash = parseInt(chip.getAttribute('data-val'));
        this.renderLobbySettingsControls();
        this.broadcastLobbySettings();
      };
    });

    // Salary chips
    const salaryChips = document.querySelectorAll('#setting-salary-chips .md-chip');
    salaryChips.forEach(chip => {
      chip.onclick = () => {
        if (!this.isBotController()) return;
        sound.playClick();
        this.customSettings.salary = parseInt(chip.getAttribute('data-val'));
        this.renderLobbySettingsControls();
        this.broadcastLobbySettings();
      };
    });

    // Turn timer chips
    const timerChips = document.querySelectorAll('#setting-timer-chips .md-chip');
    timerChips.forEach(chip => {
      chip.onclick = () => {
        if (!this.isBotController()) return;
        sound.playClick();
        this.customSettings.turnTimerSeconds = parseInt(chip.getAttribute('data-val'));
        this.renderLobbySettingsControls();
        this.broadcastLobbySettings();
      };
    });

    // Initial random streets chips
    const streetChips = document.querySelectorAll('#setting-streets-chips .md-chip');
    streetChips.forEach(chip => {
      chip.onclick = () => {
        if (!this.isBotController()) return;
        sound.playClick();
        this.customSettings.initialRandomStreets = parseInt(chip.getAttribute('data-val'));
        this.renderLobbySettingsControls();
        this.broadcastLobbySettings();
      };
    });

    // Switches
    const tJackpot = document.getElementById('toggle-jackpot');
    if (tJackpot) {
      tJackpot.onchange = (e) => {
        if (!this.isBotController()) return;
        sound.playClick();
        this.customSettings.freeParkingJackpot = e.target.checked;
        this.broadcastLobbySettings();
      };
    }

    const tDoubleSalary = document.getElementById('toggle-double-salary');
    if (tDoubleSalary) {
      tDoubleSalary.onchange = (e) => {
        if (!this.isBotController()) return;
        sound.playClick();
        this.customSettings.doubleSalaryOnGoLanding = e.target.checked;
        this.broadcastLobbySettings();
      };
    }

    const tRentJail = document.getElementById('toggle-rent-jail');
    if (tRentJail) {
      tRentJail.onchange = (e) => {
        if (!this.isBotController()) return;
        sound.playClick();
        this.customSettings.rentInJail = e.target.checked;
        this.broadcastLobbySettings();
      };
    }

    const tBuildNoMonopoly = document.getElementById('toggle-build-no-monopoly');
    if (tBuildNoMonopoly) {
      tBuildNoMonopoly.onchange = (e) => {
        if (!this.isBotController()) return;
        sound.playClick();
        this.customSettings.allowBuildingWithoutMonopoly = e.target.checked;
        this.broadcastLobbySettings();
      };
    }

    this.renderLobbySettingsControls();
  }

  renderLobbySettingsControls() {
    const isHost = this.isBotController();
    const badge = document.getElementById('lobby-host-only-badge');
    if (badge) {
      badge.style.display = 'inline-block';
      badge.innerText = isHost ? '👑 Вы хост' : '👑 Настройки меняет хост';
    }

    // Bot difficulty row & chips
    const botDiff = this.customSettings.botDifficulty || 'medium';
    const isSoloOrBot = this.isSoloMode || (network.roomCode && network.roomCode.startsWith('SOLO-')) || (Array.isArray(this.lobbyPlayers) && this.lobbyPlayers.some(p => p.isBot));
    const botDiffRow = document.getElementById('setting-bot-difficulty-row');
    if (botDiffRow) {
      botDiffRow.style.display = isSoloOrBot ? 'flex' : 'none';
    }

    document.querySelectorAll('#setting-bot-diff-chips .md-chip').forEach(chip => {
      const active = chip.getAttribute('data-diff') === botDiff;
      chip.classList.toggle('active', active);
      chip.disabled = !isHost;
      chip.style.pointerEvents = isHost ? 'auto' : 'none';
      chip.style.opacity = !isHost && !active ? '0.45' : '1';
    });

    document.querySelectorAll('#banner-bot-diff-chips .banner-bot-diff-chip').forEach(chip => {
      const active = chip.getAttribute('data-diff') === botDiff;
      chip.classList.toggle('active', active);
      chip.disabled = !isHost;
      chip.style.pointerEvents = isHost ? 'auto' : 'none';
      chip.style.opacity = !isHost && !active ? '0.45' : '1';
    });

    const diffBadge = document.getElementById('lobby-bot-diff-badge');
    if (diffBadge) {
      if (botDiff === 'easy') {
        diffBadge.innerText = '🟢 Лёгкий';
        diffBadge.style.color = '#22c55e';
        diffBadge.style.borderColor = 'rgba(34, 197, 94, 0.35)';
        diffBadge.style.background = 'rgba(34, 197, 94, 0.15)';
      } else if (botDiff === 'hard') {
        diffBadge.innerText = '🔴 Сложный';
        diffBadge.style.color = '#ef4444';
        diffBadge.style.borderColor = 'rgba(239, 68, 68, 0.35)';
        diffBadge.style.background = 'rgba(239, 68, 68, 0.15)';
      } else {
        diffBadge.innerText = '🟡 Средний';
        diffBadge.style.color = '#eab308';
        diffBadge.style.borderColor = 'rgba(234, 179, 8, 0.35)';
        diffBadge.style.background = 'rgba(234, 179, 8, 0.15)';
      }
    }

    // Max players
    document.querySelectorAll('#max-players-chips .md-chip').forEach(chip => {
      const active = parseInt(chip.getAttribute('data-max')) === this.maxPlayers;
      chip.classList.toggle('active', active);
      chip.disabled = !isHost;
      chip.style.pointerEvents = isHost ? 'auto' : 'none';
      chip.style.opacity = !isHost && !active ? '0.45' : '1';
    });

    // Starting cash
    document.querySelectorAll('#setting-starting-cash-chips .md-chip').forEach(chip => {
      const active = parseInt(chip.getAttribute('data-val')) === (this.customSettings.startingCash || 1500);
      chip.classList.toggle('active', active);
      chip.disabled = !isHost;
      chip.style.pointerEvents = isHost ? 'auto' : 'none';
      chip.style.opacity = !isHost && !active ? '0.45' : '1';
    });

    // Salary
    document.querySelectorAll('#setting-salary-chips .md-chip').forEach(chip => {
      const active = parseInt(chip.getAttribute('data-val')) === (this.customSettings.salary || 200);
      chip.classList.toggle('active', active);
      chip.disabled = !isHost;
      chip.style.pointerEvents = isHost ? 'auto' : 'none';
      chip.style.opacity = !isHost && !active ? '0.45' : '1';
    });

    // Turn timer
    document.querySelectorAll('#setting-timer-chips .md-chip').forEach(chip => {
      const active = parseInt(chip.getAttribute('data-val')) === (this.customSettings.turnTimerSeconds || 60);
      chip.classList.toggle('active', active);
      chip.disabled = !isHost;
      chip.style.pointerEvents = isHost ? 'auto' : 'none';
      chip.style.opacity = !isHost && !active ? '0.45' : '1';
    });

    // Random streets
    document.querySelectorAll('#setting-streets-chips .md-chip').forEach(chip => {
      const active = parseInt(chip.getAttribute('data-val')) === (this.customSettings.initialRandomStreets || 0);
      chip.classList.toggle('active', active);
      chip.disabled = !isHost;
      chip.style.pointerEvents = isHost ? 'auto' : 'none';
      chip.style.opacity = !isHost && !active ? '0.45' : '1';
    });

    // Switches
    const tJackpot = document.getElementById('toggle-jackpot');
    if (tJackpot) {
      tJackpot.checked = !!this.customSettings.freeParkingJackpot;
      tJackpot.disabled = !isHost;
    }

    const tDoubleSalary = document.getElementById('toggle-double-salary');
    if (tDoubleSalary) {
      tDoubleSalary.checked = !!this.customSettings.doubleSalaryOnGoLanding;
      tDoubleSalary.disabled = !isHost;
    }

    const tRentJail = document.getElementById('toggle-rent-jail');
    if (tRentJail) {
      tRentJail.checked = this.customSettings.rentInJail !== false;
      tRentJail.disabled = !isHost;
    }

    const tBuildNoMonopoly = document.getElementById('toggle-build-no-monopoly');
    if (tBuildNoMonopoly) {
      tBuildNoMonopoly.checked = !!this.customSettings.allowBuildingWithoutMonopoly;
      tBuildNoMonopoly.disabled = !isHost;
    }

    this.renderCustomTilesPreview();
  }

  broadcastLobbySettings() {
    if (!this.isLocalMode && network.roomCode) {
      this.broadcastAction('LOBBY_UPDATE', {
        players: this.lobbyPlayers,
        settings: this.customSettings,
        maxPlayers: this.maxPlayers,
        customTiles: this.customTiles
      });

      if (network.isHost) {
        network.updateLobbyAnnounce({
          currentPlayers: this.lobbyPlayers.length,
          maxPlayers: this.maxPlayers,
          settings: this.customSettings
        });
      }
    }
  }

  // --- ROOM CREATION & JOINING ---
  async createOnlineRoom() {
    this.isLocalMode = false;
    this.isTestMode = false;
    this.hasSentMatchWebhook = false;
    const roomCode = network.generateRoomCode();
    const profile = profileManager.profile;

    const lBanner = document.getElementById('lobby-test-banner');
    if (lBanner) lBanner.style.display = 'none';
    const gBanner = document.getElementById('game-test-banner');
    if (gBanner) gBanner.style.display = 'none';

    sound.playClick();
    this.showScreen('lobby');
    document.getElementById('lobby-room-code').innerText = roomCode;

    // Show host controls
    const startBtn = document.getElementById('btn-start-game');
    if (startBtn) startBtn.style.display = 'inline-flex';

    await network.joinRoom(roomCode, profile, true);
    this.lobbyPlayers = [{ ...profile, isHost: true }];
    this.renderLobbyPlayers();
    this.renderLobbySettingsControls();

    ui.showToast('Лобби создано');

    network.startAnnouncingLobby({
      hostId: profile.id,
      hostName: profile.name,
      hostToken: profile.token,
      hostColor: profile.color,
      hostBg: profile.bg || 'default',
      profileBg: profile.bg || 'default',
      coins: profile.coins || 0,
      hostStats: profile.stats,
      isRegistered: profileManager.isRegisteredUser(),
      discordId: profile.discordId || null,
      avatarUrl: profile.avatarUrl || null,
      settings: this.customSettings,
      currentPlayers: 1,
      maxPlayers: this.maxPlayers
    });
  }

  async createSoloRoom() {
    this.isLocalMode = false;
    this.isTestMode = false;
    this.isSoloMode = true;
    this.hasSentMatchWebhook = false;
    const roomCode = 'SOLO-' + Math.floor(1000 + Math.random() * 9000);
    const profile = profileManager.profile;

    // Immediately claim host authority so bots and lobby actions are instant and reliable offline
    network.isHost = true;
    network.roomCode = roomCode;

    sound.playClick();
    this.showScreen('lobby');
    const roomCodeEl = document.getElementById('lobby-room-code');
    if (roomCodeEl) roomCodeEl.innerText = roomCode;

    const lBanner = document.getElementById('lobby-test-banner');
    if (lBanner) lBanner.style.display = 'none';
    const bBanner = document.getElementById('lobby-bot-banner');
    if (bBanner) bBanner.style.display = 'flex';
    const gBanner = document.getElementById('game-test-banner');
    if (gBanner) gBanner.style.display = 'none';

    // Show host controls
    const startBtn = document.getElementById('btn-start-game');
    if (startBtn) startBtn.style.display = 'inline-flex';

    const botArchetypes = [
      { name: 'Илон Бот', token: 'robot', color: '#06b6d4', botPersonality: 'aggressive' },
      { name: 'Билл Бот', token: 'tophat', color: '#10b981', botPersonality: 'balanced' },
      { name: 'Уоррен Бот', token: 'moneybag', color: '#f59e0b', botPersonality: 'cautious' }
    ];

    const currentBotDiff = this.customSettings.botDifficulty || 'medium';
    const bots = botArchetypes.map((b, idx) => ({
      id: `bot_${idx + 1}_${Date.now()}`,
      name: b.name,
      token: b.token,
      color: b.color,
      isBot: true,
      botPersonality: b.botPersonality,
      botDifficulty: currentBotDiff,
      title: 'bot',
      bg: 'default',
      profileBg: 'default',
      coins: 0,
      stats: {},
      isRegistered: false,
      isHost: false
    }));

    this.lobbyPlayers = [{ ...profile, isHost: true }, ...bots];
    this.maxPlayers = 4;
    this.renderLobbyPlayers();
    this.renderLobbySettingsControls();

    ui.showToast('🤖 Создано соло-лобби с ботами!');

    // Background join for multiplayer compatibility if online
    network.joinRoom(roomCode, profile, true).catch(err => {
      console.warn('Solo room offline fallback / network join notice:', err);
    });
  }

  setBotDifficulty(diff) {
    if (!diff) return;
    this.customSettings.botDifficulty = diff;
    localStorage.setItem('monopoly_bot_difficulty', diff);
    this.lobbyPlayers = this.lobbyPlayers.map(p => p.isBot ? { ...p, botDifficulty: diff } : p);
    this.renderLobbyPlayers();
    this.renderLobbySettingsControls();
    if (network.channel) {
      this.broadcastLobbySettings();
    }
    const diffNames = { easy: '🟢 Лёгкий', medium: '🟡 Средний', hard: '🔴 Сложный' };
    ui.showToast(`Установлена сложность ботов: ${diffNames[diff] || diff}`);
  }

  addBotToLobby() {
    if (!this.isBotController()) return;
    if (this.lobbyPlayers.length >= this.maxPlayers) {
      ui.showToast(`В лобби уже максимум игроков (${this.maxPlayers})`);
      return;
    }
    sound.playClick();
    const botArchetypes = [
      { name: 'Илон Бот', token: 'robot', color: '#06b6d4', botPersonality: 'aggressive' },
      { name: 'Билл Бот', token: 'tophat', color: '#10b981', botPersonality: 'balanced' },
      { name: 'Уоррен Бот', token: 'moneybag', color: '#f59e0b', botPersonality: 'cautious' },
      { name: 'Джефф Бот', token: 'car', color: '#8b5cf6', botPersonality: 'balanced' },
      { name: 'Сатоши Бот', token: 'crown', color: '#eab308', botPersonality: 'aggressive' },
      { name: 'Марк Бот', token: 'ship', color: '#38bdf8', botPersonality: 'cautious' }
    ];

    const existingNames = new Set(this.lobbyPlayers.map(p => p.name));
    const available = botArchetypes.filter(b => !existingNames.has(b.name));
    const archetype = available.length > 0 ? available[0] : botArchetypes[Math.floor(Math.random() * botArchetypes.length)];
    const currentBotDiff = this.customSettings.botDifficulty || 'medium';

    const botPlayer = {
      id: `bot_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      name: archetype.name,
      token: archetype.token,
      color: archetype.color,
      isBot: true,
      botPersonality: archetype.botPersonality,
      botDifficulty: currentBotDiff,
      title: 'bot',
      bg: 'default',
      profileBg: 'default',
      coins: 0,
      stats: {},
      isRegistered: false,
      isHost: false
    };

    this.lobbyPlayers.push(botPlayer);
    this.renderLobbyPlayers();
    if (network.channel) {
      this.broadcastLobbySettings();
    }
    ui.showToast(`🤖 Добавлен бот: ${botPlayer.name}`);
  }

  removeBotFromLobby() {
    if (!this.isBotController()) return;
    const botIdx = this.lobbyPlayers.map(p => p.isBot).lastIndexOf(true);
    if (botIdx === -1) {
      ui.showToast('В лобби нет ботов');
      return;
    }
    sound.playClick();
    const removed = this.lobbyPlayers.splice(botIdx, 1)[0];
    this.renderLobbyPlayers();
    if (network.channel) {
      this.broadcastLobbySettings();
    }
    ui.showToast(`Удален бот: ${removed.name}`);
  }

  async createTestRoom() {
    this.isLocalMode = false;
    this.isTestMode = true;
    this.isSoloMode = false;
    this.hasSentMatchWebhook = false;
    const roomCode = 'TEST-' + Math.floor(1000 + Math.random() * 9000);
    const profile = profileManager.profile;

    sound.playClick();
    this.showScreen('lobby');
    document.getElementById('lobby-room-code').innerText = roomCode;

    const lBanner = document.getElementById('lobby-test-banner');
    if (lBanner) lBanner.style.display = 'flex';
    const bBanner = document.getElementById('lobby-bot-banner');
    if (bBanner) bBanner.style.display = 'none';
    const gBanner = document.getElementById('game-test-banner');
    if (gBanner) gBanner.style.display = 'block';

    // Show host controls
    const startBtn = document.getElementById('btn-start-game');
    if (startBtn) startBtn.style.display = 'inline-flex';

    await network.joinRoom(roomCode, profile, true);
    this.lobbyPlayers = [{ ...profile, isHost: true }];
    this.renderLobbyPlayers();
    this.renderLobbySettingsControls();

    ui.showToast('🧪 Тестовое лобби создано');
  }

  extractRoomCode(raw) {
    if (!raw) return '';
    let str = raw.trim();
    const urlMatch = str.match(/[?&]room=([A-Za-z0-9_-]+)/i) || str.match(/([A-Za-z0-9]{4}-\d{3})/i);
    if (urlMatch) return urlMatch[1].toUpperCase();
    return str.replace(/[^A-Za-z0-9_-]/g, '').toUpperCase();
  }

  async joinRoom(code) {
    if (!code) return;
    const formattedCode = this.extractRoomCode(code);
    if (!formattedCode) return;

    this.isLocalMode = false;
    this.isTestMode = formattedCode.startsWith('TEST-');
    this.hasSentMatchWebhook = false;
    this.stopGameWatchdog();
    this.cancelAutoEndTimer();

    // Reset previous engine state
    if (engine.status === 'PLAYING') {
      engine.status = 'WAITING';
    }

    const banner = document.getElementById('reconnect-banner');
    if (banner) banner.style.display = 'none';
    document.querySelectorAll('.md-modal.active').forEach(m => m.classList.remove('active'));

    const lBanner = document.getElementById('lobby-test-banner');
    if (lBanner) lBanner.style.display = this.isTestMode ? 'flex' : 'none';
    const gBanner = document.getElementById('game-test-banner');
    if (gBanner) gBanner.style.display = this.isTestMode ? 'block' : 'none';

    const profile = profileManager.profile;
    sound.playClick();
    this.showScreen('lobby');
    document.getElementById('lobby-room-code').innerText = formattedCode;

    // Guests do not have start button
    const startBtn = document.getElementById('btn-start-game');
    if (startBtn) startBtn.style.display = 'none';

    this.lobbyPlayers = [{ ...profile, isHost: false }];
    this.renderLobbyPlayers();
    this.renderLobbySettingsControls();

    const res = await network.joinRoom(formattedCode, profile, false);
    if (res && res.error) {
      ui.showToast(`Ошибка входа в комнату: ${res.error}`);
    }

    // Proactively broadcast player joined and request sync multiple times
    const sendJoinAnnounce = () => {
      if (this.currentScreen === 'lobby' && !network.isHost && network.roomCode === formattedCode) {
        network.sendBroadcast('REQUEST_SYNC', { playerId: profile.id });
        network.sendBroadcast('PLAYER_JOINED_LOBBY', {
          player: {
            id: profile.id,
            name: profile.name,
            title: profile.title || 'novice',
            diceSkin: profile.diceSkin || 'classic',
            token: profile.token,
            customToken: profile.customToken || null,
            color: profile.color,
            bg: profile.bg || 'default',
            profileBg: profile.bg || 'default',
            coins: profile.coins || 0,
            stats: profile.stats || {},
            isRegistered: profileManager.isRegisteredUser(),
            discordId: profile.discordId || null,
            avatarUrl: profile.avatarUrl || null,
            isHost: false
          }
        });
      }
    };

    setTimeout(sendJoinAnnounce, 200);
    setTimeout(sendJoinAnnounce, 700);
    setTimeout(sendJoinAnnounce, 1500);
  }

  handleLobbyPlayersUpdate(presenceList) {
    const isTestRoom = this.isTestMode || (network.roomCode && network.roomCode.startsWith('TEST-'));
    if (!isTestRoom && Array.isArray(presenceList)) {
      presenceList.forEach(p => {
        if (p) {
          leaderboardManager.registerPlayer(p);
        }
      });
      this.renderLeaderboard();
    }

    if (network.isHost) {
      const humanPlayers = presenceList.map(p => ({
        id: p.id,
        name: p.name,
        token: p.token,
        customToken: p.customToken || null,
        title: p.title || 'novice',
        diceSkin: p.diceSkin || 'classic',
        color: p.color,
        bg: p.bg || p.profileBg || 'default',
        profileBg: p.bg || p.profileBg || 'default',
        coins: p.coins || 0,
        stats: p.stats || {},
        isRegistered: Boolean(p.isRegistered || p.discordId),
        discordId: p.discordId || null,
        discordUsername: p.discordUsername || null,
        avatarUrl: p.avatarUrl || null,
        isHost: p.isHost
      }));
      const unique = [];
      const seen = new Set();
      for (const p of humanPlayers) {
        if (!seen.has(p.id)) {
          seen.add(p.id);
          unique.push(p);
        }
      }
      this.lobbyPlayers = unique.slice(0, this.maxPlayers);
      this.broadcastLobbySettings();
    }
    this.renderLobbyPlayers();
  }

  renderLobbyPlayers() {
    const container = document.getElementById('lobby-players-list');
    const countLabel = document.getElementById('lobby-player-count');
    if (countLabel) {
      countLabel.innerText = `${this.lobbyPlayers.length} / ${this.maxPlayers} участников`;
    }

    const botControls = document.getElementById('lobby-bots-control-row');
    if (botControls) {
      botControls.style.display = network.isHost ? 'flex' : 'none';
    }

    const isTestRoom = this.isTestMode || (network.roomCode && network.roomCode.startsWith('TEST-'));
    const isSoloOrBot = this.isSoloMode || (network.roomCode && network.roomCode.startsWith('SOLO-')) || this.lobbyPlayers.some(p => p.isBot);

    const lBanner = document.getElementById('lobby-test-banner');
    if (lBanner) lBanner.style.display = isTestRoom ? 'flex' : 'none';

    const bBanner = document.getElementById('lobby-bot-banner');
    if (bBanner) bBanner.style.display = (!isTestRoom && isSoloOrBot) ? 'flex' : 'none';

    if (!container) return;
    container.innerHTML = this.lobbyPlayers.map(p => {
      const bgDef = getProfileBg(p.bg || p.profileBg);
      const isMe = String(p.id) === String(profileManager.profile.id);
      const hasCustomBg = bgDef && bgDef.id !== 'default';
      const slotStyle = hasCustomBg 
        ? `background: ${bgDef.bgStyle}; border: ${bgDef.borderStyle}; color: ${bgDef.textColor}; box-shadow: ${bgDef.glow || 'none'};`
        : '';

      return `
        <div class="player-slot ${isMe ? 'me' : ''}" data-player-id="${p.id}" style="cursor: pointer; ${slotStyle}" title="${p.isBot ? 'Бот' : 'Нажмите, чтобы просмотреть профиль игрока'}">
          <div class="player-info-left">
            <span class="player-token">${renderTokenHTML(p.token, p.customToken)}</span>
            <div>
              <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                <span class="player-name-tag" style="color: ${hasCustomBg ? bgDef.textColor : 'var(--md-on-surface, #ffffff)'};">
                  ${p.name} ${p.isHost ? '(Хост)' : ''}
                </span>
                ${p.isBot ? `
                  <span class="title-badge" style="background: rgba(56,189,248,0.18); color: #38bdf8; border: 1px solid rgba(56,189,248,0.35);">🤖 Бот</span>
                  ${(p.botDifficulty === 'easy') 
                    ? '<span class="title-badge" style="background: rgba(34,197,94,0.15); color: #22c55e; border: 1px solid rgba(34,197,94,0.35);">🟢 Новичок</span>'
                    : (p.botDifficulty === 'hard')
                      ? '<span class="title-badge" style="background: rgba(239,68,68,0.15); color: #ef4444; border: 1px solid rgba(239,68,68,0.35);">🔴 Магнат</span>'
                      : '<span class="title-badge" style="background: rgba(234,179,8,0.15); color: #eab308; border: 1px solid rgba(234,179,8,0.35);">🟡 Средний</span>'}
                ` : formatTitleBadge(p.title || 'novice')}
              </div>
              ${hasCustomBg ? `<div style="font-size: 0.72rem; color: ${bgDef.tagColor}; font-weight: 500;">Фон: ${bgDef.name}</div>` : ''}
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="md-chip active" style="${p.isBot ? 'background: rgba(56,189,248,0.15); color: #38bdf8;' : (hasCustomBg ? `background: rgba(255,255,255,0.16); color: ${bgDef.textColor}; border: 1px solid rgba(255,255,255,0.25);` : '')}">${p.isBot ? 'ИИ Бот' : (p.isHost ? 'Хост' : 'Готов')}</span>
            ${network.isHost && !p.isHost ? `
              <button class="md-btn-icon btn-kick-player" data-player-id="${p.id}" title="Удалить из лобби" style="color: var(--md-error); width: 28px; height: 28px; min-width: 28px; font-size: 0.85rem;">
                ✕
              </button>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.player-slot').forEach(slot => {
      slot.addEventListener('click', (e) => {
        if (e.target.closest('.btn-kick-player')) return;
        const pid = slot.getAttribute('data-player-id');
        const target = this.lobbyPlayers.find(p => String(p.id) === String(pid));
        if (target && !target.isBot) {
          this.showPlayerProfileModal(target);
        }
      });
    });

    if (network.isHost) {
      container.querySelectorAll('.btn-kick-player').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const pid = btn.getAttribute('data-player-id');
          const target = this.lobbyPlayers.find(p => String(p.id) === String(pid));
          if (!target) return;
          sound.playClick();
          this.lobbyPlayers = this.lobbyPlayers.filter(p => String(p.id) !== String(pid));
          this.renderLobbyPlayers();
          ui.showToast(`Удален из лобби: ${target.name}`);
          this.broadcastAction('KICKED_FROM_LOBBY', { playerId: pid, name: target.name });
          this.broadcastLobbySettings();
        });
      });
    }
  }

  startGameFromLobby() {
    const isTestRoom = this.isTestMode || (network.roomCode && network.roomCode.startsWith('TEST-'));
    const isSoloOrBot = this.isSoloMode || (network.roomCode && network.roomCode.startsWith('SOLO-')) || this.lobbyPlayers.some(p => p.isBot);
    if (!isTestRoom && !isSoloOrBot && this.lobbyPlayers.length < 2) {
      showToast('Для начала игры нужно минимум 2 игрока.');
      return;
    }
    if (this.lobbyPlayers.length < 2) {
      showToast('Нужно минимум 2 игрока (добавьте бота кнопкой «+ Добавить бота»).');
      return;
    }

    sound.playWin();
    this.hasSentMatchWebhook = false;
    network.stopAnnouncingLobby();

    if (this.isSoloMode || this.isLocalMode || this.isTestMode) {
      network.isHost = true;
    }

    const state = engine.initGame(this.lobbyPlayers, this.customSettings, this.customTiles);
    matchHistoryManager.startMatchTimer(0);
    this.showScreen('game');
    ui.setMapTheme(this.customSettings.mapTheme || 'classic');
    ui.setCustomTiles(this.customTiles);
    ui.update(state, profileManager.profile.id);
    this.saveActiveGameSession();

    if (network.isHost && network.channel) {
      network.sendBroadcast('GAME_STARTED', { 
        state, 
        customTiles: this.customTiles,
        mapTheme: this.customSettings.mapTheme || 'classic'
      });
    }

    const firstPlayer = engine.getCurrentPlayer();
    if (firstPlayer && firstPlayer.isBot && this.isBotController()) {
      setTimeout(() => this.runBotTurnStep(), 1000);
    }
  }

  // --- AUTO-END TURN TIMER & CHIP ---
  toggleAutoEndTurn() {
    this.autoEndTurn = !this.autoEndTurn;
    const btn = document.getElementById('btn-toggle-auto-end');
    const label = document.getElementById('auto-end-label');
    if (btn) {
      if (this.autoEndTurn) {
        btn.classList.add('active');
        if (label) label.innerHTML = 'Авто-ход: <b>ВКЛ</b>';
        ui.showToast('⚡ Авто-ход включен (3 сек)');
        this.checkAutoEnd();
      } else {
        btn.classList.remove('active');
        if (label) label.innerHTML = 'Авто-ход: <b>ВЫКЛ</b>';
        ui.showToast('Авто-ход выключен');
        this.cancelAutoEndTimer();
      }
    }
  }

  checkAutoEnd() {
    if (!this.autoEndTurn) return;
    const curPlayer = engine.getCurrentPlayer();
    const myId = profileManager.profile.id;
    const isMyTurn = curPlayer && (curPlayer.id === myId || (!curPlayer.isBot && this.isLocalMode));
    if (isMyTurn && engine.phase === 'ACTION' && !engine.lastRollDoubles) {
      if (!this.autoEndInterval) {
        this.startAutoEndTimer();
      }
    }
  }

  startAutoEndTimer() {
    this.cancelAutoEndTimer();
    if (!this.autoEndTurn) return;

    const curPlayer = engine.getCurrentPlayer();
    const myId = profileManager.profile.id;
    const isMyTurn = curPlayer && (curPlayer.id === myId || (!curPlayer.isBot && this.isLocalMode));
    if (!isMyTurn || engine.phase !== 'ACTION' || engine.lastRollDoubles) return;

    let seconds = 3;
    const endTurnSub = document.getElementById('end-turn-subtitle');
    const endTurnCard = document.getElementById('btn-end-turn-card');
    if (endTurnSub) endTurnSub.innerText = `Авто-ход (${seconds}с)`;
    if (endTurnCard) endTurnCard.classList.add('auto-ending');

    this.autoEndInterval = setInterval(() => {
      seconds--;
      if (seconds > 0) {
        if (endTurnSub) endTurnSub.innerText = `Авто-ход (${seconds}с)`;
      } else {
        this.cancelAutoEndTimer();
        if (endTurnSub) endTurnSub.innerText = 'Передать ход';
        this.handleEndTurn();
      }
    }, 1000);
  }

  cancelAutoEndTimer() {
    if (this.autoEndInterval) {
      clearInterval(this.autoEndInterval);
      this.autoEndInterval = null;
    }
    const endTurnSub = document.getElementById('end-turn-subtitle');
    const endTurnCard = document.getElementById('btn-end-turn-card');
    if (endTurnSub) endTurnSub.innerText = 'Передать ход';
    if (endTurnCard) endTurnCard.classList.remove('auto-ending');
  }

  // --- PRESENCE HANDLER ---
  handlePresenceUpdate(playersInRoom) {
    if (!playersInRoom || !Array.isArray(playersInRoom)) return;

    if (this.currentScreen === 'lobby') {
      if (network.isHost) {
        const onlineIds = new Set(playersInRoom.map(p => String(p.id)));
        const beforeCount = this.lobbyPlayers.length;
        this.lobbyPlayers = this.lobbyPlayers.filter(p => p.isBot || onlineIds.has(String(p.id)));
        if (this.lobbyPlayers.length !== beforeCount) {
          this.renderLobbyPlayers();
          this.broadcastLobbySettings();
        }
      } else {
        const hadHost = this.lobbyPlayers.some(p => p.isHost);
        const hostOnline = playersInRoom.some(p => p.isHost);
        if (hadHost && !hostOnline && playersInRoom.length > 0) {
          ui.showToast('Создатель покинул лобби. Возврат в меню...');
          this.lobbyPlayers = [];
          this.showScreen('menu');
          this.renderLeaderboard();
          network.leaveRoom().catch(e => console.warn(e));
          return;
        }
      }
    } else if (this.currentScreen === 'game') {
      const onlineIds = new Set(playersInRoom.map(p => String(p.id)));
      engine.players.forEach(p => {
        if (!p.isBot && !p.hasLeft && !onlineIds.has(String(p.id))) {
          this.handlePlayerLeft(p.id, p.name);
        }
      });
    }
  }

  // --- GAMEPLAY WATCHDOG (BOT TURN & HEARTBEAT MONITOR) ---
  startGameWatchdog() {
    this.stopGameWatchdog();
    let botWaitTicks = 0;
    let botRunningTicks = 0;

    this.gameWatchdogInterval = setInterval(() => {
      if (this.currentScreen !== 'game' || engine.status !== 'PLAYING') {
        botWaitTicks = 0;
        botRunningTicks = 0;
        return;
      }

      // 1. Bot Turn Watchdog & Auto-unfreeze
      const curPlayer = engine.getCurrentPlayer();
      if (curPlayer && curPlayer.isBot && this.isBotController()) {
        if (!this.isBotTurnRunning) {
          botRunningTicks = 0;
          botWaitTicks++;
          // If a bot is the active player and hasn't started its turn within ~1.2s, trigger it
          if (botWaitTicks >= 1) {
            console.log(`🤖 Watchdog: bot ${curPlayer.name} turn auto-trigger (tick: ${botWaitTicks})`);
            this.runBotTurnStep();
          }
        } else {
          botWaitTicks = 0;
          botRunningTicks++;
          // If bot turn has been running for > 6s (e.g. animation hang or stalled promise), force-release lock and retrigger
          if (botRunningTicks >= 5) {
            console.warn(`⚠️ Watchdog: bot ${curPlayer.name} turn was locked for ${botRunningTicks * 1.2}s, unfreezing lock`);
            this.isBotTurnRunning = false;
            botRunningTicks = 0;
            this.runBotTurnStep();
          }
        }
      } else {
        botWaitTicks = 0;
        botRunningTicks = 0;
      }

      // 2. Check for disconnected remote players via heartbeats
      if (!this.isLocalMode && !this.isSoloMode && network.roomCode && network.channel) {
        engine.players.forEach(p => {
          if (!p.isBot && !p.hasLeft && !p.isBankrupt && String(p.id) !== String(profileManager.profile.id)) {
            const isAlive = network.isPlayerAlive(p.id, 6500);
            if (!isAlive) {
              this.handlePlayerLeft(p.id, p.name);
            }
          }
        });
      }
    }, 1200);
  }

  stopGameWatchdog() {
    if (this.gameWatchdogInterval) {
      clearInterval(this.gameWatchdogInterval);
      this.gameWatchdogInterval = null;
    }
  }

  // --- PLAYER LEFT HANDLER ---
  handlePlayerLeft(playerId, playerName = null) {
    if (this.currentScreen === 'lobby') {
      const idx = this.lobbyPlayers.findIndex(p => String(p.id) === String(playerId));
      if (idx !== -1) {
        const p = this.lobbyPlayers[idx];
        if (p.isHost) {
          ui.showToast('Создатель покинул лобби. Возврат в меню...');
          this.lobbyPlayers = [];
          this.showScreen('menu');
          this.renderLeaderboard();
          network.leaveRoom().catch(e => console.warn(e));
          return;
        }
        this.lobbyPlayers.splice(idx, 1);
        this.renderLobbyPlayers();
        ui.showToast(`Игрок ${p.name || playerName || ''} покинул лобби`);
        if (network.isHost) {
          this.broadcastLobbySettings();
        }
      }
      return;
    }

    const player = engine.players.find(p => String(p.id) === String(playerId));
    if (!player || player.hasLeft) return;

    // If the host leaves during a game — end the game for everyone
    if (player.isHost && !network.isHost) {
      ui.showToast('🚪 Хост покинул игру. Возврат в меню...');
      const st = engine.getState();
      st.reason = 'Хост покинул игру (все вышли)';
      this.handleGameFinished(st);
      setTimeout(() => {
        this.showScreen('menu');
        this.renderLeaderboard();
        network.leaveRoom().catch(e => console.warn(e));
      }, 2000);
      return;
    }

    player.hasLeft = true;
    player.isBankrupt = true;
    const name = playerName || player.name;
    ui.showToast(`🚪 ${name} покинул матч`);
    engine.addLog(`🚪 ${name} покинул матч.`);

    // If only 1 real player remains active in game -> victory!
    const winner = engine.checkGameWinner();
    if (winner) {
      network.clearSavedSession();
      const st = engine.getState();
      st.reason = 'Все соперники покинули игру (техническая победа)';
      this.handleGameFinished(st);
      ui.showWinnerModal(winner);
      this.broadcastAction('SYNC_STATE', { state: engine.getState() });
      ui.update(engine.getState(), profileManager.profile.id);
      return;
    }

    const curPlayer = engine.getCurrentPlayer();
    if (curPlayer && (curPlayer.id === playerId || curPlayer.hasLeft || curPlayer.isBankrupt)) {
      if (this.isBotController()) {
        engine.endTurn();
        this.broadcastAction('SYNC_STATE', { state: engine.getState() });
      }
    }

    ui.update(engine.getState(), profileManager.profile.id);
  }

  // --- GAMEPLAY ACTIONS WITH SMOOTH ANIMATIONS ---
  handleRoll() {
    this.cancelAutoEndTimer();
    const curPlayer = engine.getCurrentPlayer();
    const diceSkin = curPlayer?.diceSkin || profileManager.profile.diceSkin || 'classic';
    const res = engine.rollDice();
    if (res.success) {
      // 1. Tumbling 3D Dice Animation
      ui.animateDiceRoll(res.dice, () => {
        // 2. Step-by-step Token Hopping Animation
        ui.animateTokenStepByStep(curPlayer, res.oldPos, res.newPos, () => {
          // 3. Update full UI state and trigger tile modals
          const state = engine.getState();
          ui.update(state, profileManager.profile.id);
          this.saveActiveGameSession();
          if (state.phase === 'ACTION' && !res.lastRollDoubles) {
            this.startAutoEndTimer();
          }
        });
      }, diceSkin);

      this.broadcastAction('ROLL', {
        forcedValues: res.dice,
        oldPos: res.oldPos,
        newPos: res.newPos,
        diceSkin: diceSkin,
        state: engine.getState()
      });
    }
  }

  handleEndTurn() {
    this.cancelAutoEndTimer();
    const res = engine.endTurn();
    if (res.success) {
      const state = engine.getState();
      ui.update(state, profileManager.profile.id);
      this.saveActiveGameSession();
      this.broadcastAction('END_TURN', { state });

      const nextPlayer = engine.getCurrentPlayer();
      if (nextPlayer && nextPlayer.isBot && this.isBotController()) {
        setTimeout(() => this.runBotTurnStep(), 800);
      }
    }
  }

  handleBuy() {
    this.cancelAutoEndTimer();
    const res = engine.buyProperty();
    if (res.success) {
      const state = engine.getState();
      ui.update(state, profileManager.profile.id);
      this.saveActiveGameSession();
      this.broadcastAction('BUY', { tileId: res.tileId, state });
      this.startAutoEndTimer();
    } else {
      ui.showToast(`⚠️ ${res.reason || 'Недостаточно денег для покупки'}`);
      engine.passProperty();
      const state = engine.getState();
      ui.update(state, profileManager.profile.id);
      this.saveActiveGameSession();
      this.broadcastAction('PASS', { state });
      this.startAutoEndTimer();
    }
  }

  handlePass() {
    this.cancelAutoEndTimer();
    engine.passProperty();
    const state = engine.getState();
    ui.update(state, profileManager.profile.id);
    this.saveActiveGameSession();
    this.broadcastAction('PASS', { state });
    this.startAutoEndTimer();
  }

  handleCardOk() {
    this.cancelAutoEndTimer();
    engine.applyActiveCard();
    const state = engine.getState();
    ui.update(state, profileManager.profile.id);
    this.saveActiveGameSession();
    this.broadcastAction('APPLY_CARD', { state });
    this.startAutoEndTimer();
  }

  broadcastAction(type, data) {
    if (!this.isLocalMode && network.roomCode) {
      network.sendBroadcast(type, data);
    }
  }

  async handleRemoteAction(payload) {
    switch (payload.type) {
      case 'PLAYER_JOINED_LOBBY': {
        const newPlayer = payload.player;
        if (newPlayer) {
          leaderboardManager.registerPlayer(newPlayer);
          this.renderLeaderboard();
        }

        // If game is already FINISHED, inform the joining guest
        if (engine.status === 'FINISHED') {
          if (network.isHost) {
            this.broadcastAction('SYNC_STATE', {
              targetPlayerId: newPlayer?.id,
              isGameFinished: true,
              state: engine.getState()
            });
          }
          break;
        }

        // If game is in progress, restore returning player
        if (engine.status === 'PLAYING') {
          const existing = engine.players.find(p => String(p.id) === String(newPlayer?.id));
          if (existing) {
            existing.hasLeft = false;
            existing.isBankrupt = false;
            ui.showToast(`👋 Игрок ${existing.name} вернулся в игру!`);
            engine.addLog(`👋 ${existing.name} вернулся в игру.`);
            ui.update(engine.getState(), profileManager.profile.id);
            if (network.isHost) {
              this.broadcastAction('SYNC_STATE', {
                isGamePlaying: true,
                state: engine.getState()
              });
            }
          }
          break;
        }

        if (newPlayer && network.isHost) {
          newPlayer.token = getTokenEmoji(newPlayer.token);
          if (!this.lobbyPlayers.some(p => String(p.id) === String(newPlayer.id))) {
            if (this.lobbyPlayers.length < this.maxPlayers) {
              this.lobbyPlayers.push(newPlayer);
              this.renderLobbyPlayers();
              this.broadcastLobbySettings();
            }
          }
        }
        break;
      }

      case 'PLAYER_LEFT_LOBBY': {
        const leavingId = payload.playerId;
        const idx = this.lobbyPlayers.findIndex(p => String(p.id) === String(leavingId));
        if (idx !== -1) {
          const removed = this.lobbyPlayers.splice(idx, 1)[0];
          this.renderLobbyPlayers();
          ui.showToast(`Игрок ${removed.name || payload.name || ''} покинул лобби`);
          if (network.isHost) {
            this.broadcastLobbySettings();
          }
        }
        break;
      }

      case 'LOBBY_DISBANDED': {
        ui.showToast('Создатель расформировал лобби');
        this.lobbyPlayers = [];
        this.showScreen('menu');
        this.renderLeaderboard();
        network.leaveRoom().catch(e => console.warn(e));
        break;
      }

      case 'KICKED_FROM_LOBBY': {
        if (String(payload.playerId) === String(profileManager.profile.id)) {
          ui.showToast('Вы были исключены из лобби');
          this.lobbyPlayers = [];
          this.showScreen('menu');
          this.renderLeaderboard();
          network.leaveRoom().catch(e => console.warn(e));
        } else {
          this.lobbyPlayers = this.lobbyPlayers.filter(p => String(p.id) !== String(payload.playerId));
          this.renderLobbyPlayers();
        }
        break;
      }

      case 'PLAYER_PROFILE_UPDATED': {
        const update = payload;
        if (!update || !update.playerId) break;

        const isTestRoom = this.isTestMode || (network.roomCode && network.roomCode.startsWith('TEST-'));
        if (!isTestRoom) {
          leaderboardManager.registerPlayer(update);
          this.renderLeaderboard();
        }

        if (this.currentScreen === 'lobby') {
          const target = this.lobbyPlayers.find(p => String(p.id) === String(update.playerId));
          if (target) {
            if (update.bg) target.bg = update.bg;
            if (update.profileBg) target.profileBg = update.profileBg;
            if (update.token) target.token = update.token;
            if (update.customToken !== undefined) target.customToken = update.customToken;
            if (update.name) target.name = update.name;
            if (update.color) target.color = update.color;
            if (typeof update.coins === 'number') target.coins = update.coins;
            this.renderLobbyPlayers();
            if (network.isHost) {
              this.broadcastLobbySettings();
            }
          }
        }

        if (this.currentScreen === 'game' && engine.players) {
          const p = engine.players.find(x => String(x.id) === String(update.playerId));
          if (p) {
            if (update.bg) p.bg = update.bg;
            if (update.profileBg) p.profileBg = update.profileBg;
            if (update.token) p.token = update.token;
            if (update.customToken !== undefined) p.customToken = update.customToken;
            if (update.name) p.name = update.name;
            if (update.color) p.color = update.color;
            if (typeof update.coins === 'number') p.coins = update.coins;
            ui.update(engine.getState(), profileManager.profile.id);
          }
        }
        break;
      }

      case 'CHAT_MESSAGE': {
        this.receiveChatMessage(payload);
        break;
      }

      case 'LOBBY_TILE_UPDATE': {
        // Real-time tile rename from another player
        const { tileId, name, desc, authorId, authorName, authorColor } = payload;
        if (tileId !== undefined) {
          if (name || desc) {
            this.customTiles[tileId] = { name: name || '', desc: desc || '', authorId, authorName, authorColor };
          } else {
            delete this.customTiles[tileId];
          }
          this.renderCustomTilesPreview();
          // If custom tiles modal is open, refresh it
          const ctModal = document.getElementById('modal-custom-tiles');
          if (ctModal && ctModal.classList.contains('active')) {
            this.renderCustomTilesEditor();
          }
        }
        break;
      }

      case 'GLOBAL_FORCE_REFRESH':
        ui.showToast('🔄 Перезапуск сайта по команде администратора...');
        setTimeout(() => {
          this.forceSiteRefresh();
        }, 400);
        break;

      case 'GAME_STARTED':
        engine.loadState(payload.state);
        matchHistoryManager.startMatchTimer(0);
        if (payload.mapTheme || payload.state?.settings?.mapTheme) {
          const mTheme = payload.mapTheme || payload.state?.settings?.mapTheme || 'classic';
          this.customSettings.mapTheme = mTheme;
          ui.setMapTheme(mTheme);
        }
        if (payload.customTiles) {
          this.customTiles = { ...payload.customTiles };
          ui.setCustomTiles(this.customTiles);
        }
        this.showScreen('game');
        ui.update(engine.getState(), profileManager.profile.id);
        this.saveActiveGameSession();
        break;

      case 'SYNC_STATE':
        // If the game in this room is already finished -> reject and return to menu
        if (payload.isGameFinished || (payload.state && payload.state.status === 'FINISHED')) {
          ui.showToast('⚠️ Игра уже завершена');
          this.clearActiveGameSession();
          this.lobbyPlayers = [];
          this.showScreen('menu');
          this.renderLeaderboard();
          network.leaveRoom().catch(e => console.warn(e));
          return;
        }

        if (payload.isGamePlaying || (payload.state && payload.state.status === 'PLAYING')) {
          if (payload.state) {
            engine.loadState(payload.state);
            const myId = profileManager.profile.id;
            const me = engine.players.find(p => String(p.id) === String(myId));
            if (me) {
              me.hasLeft = false;
              me.isBankrupt = false;
            }
            if (payload.state.settings?.mapTheme) {
              ui.setMapTheme(payload.state.settings.mapTheme);
            }
            this.showScreen('game');
            ui.update(engine.getState(), myId);
            this.saveActiveGameSession();
          }
        } else {
          this.showScreen('lobby');
          if (payload.lobbyPlayers) {
            this.lobbyPlayers = payload.lobbyPlayers.map(p => ({
              ...p,
              token: getTokenEmoji(p.token),
              coins: typeof p.coins === 'number' ? p.coins : 0
            }));
            payload.lobbyPlayers.forEach(p => leaderboardManager.registerPlayer(p));
            this.renderLobbyPlayers();
            this.renderLeaderboard();
          }
          if (payload.settings) {
            this.customSettings = { ...this.customSettings, ...payload.settings };
            if (payload.settings.mapTheme) {
              ui.setMapTheme(payload.settings.mapTheme);
            }
          }
          if (payload.maxPlayers) {
            this.maxPlayers = payload.maxPlayers;
          }
          if (payload.customTiles) {
            this.customTiles = { ...payload.customTiles };
            this.renderCustomTilesPreview();
          }
          this.renderLobbySettingsControls();
        }
        break;

      case 'LOBBY_UPDATE':
        if (payload.players) {
          this.lobbyPlayers = payload.players.map(p => ({
            ...p,
            token: getTokenEmoji(p.token),
            coins: typeof p.coins === 'number' ? p.coins : 0
          }));
          payload.players.forEach(p => leaderboardManager.registerPlayer(p));
          this.renderLobbyPlayers();
          this.renderLeaderboard();
        }
        if (payload.settings) {
          this.customSettings = { ...this.customSettings, ...payload.settings };
          if (payload.settings.mapTheme) {
            ui.setMapTheme(payload.settings.mapTheme);
          }
        }
        if (payload.maxPlayers) {
          this.maxPlayers = payload.maxPlayers;
        }
        if (payload.customTiles) {
          this.customTiles = { ...payload.customTiles };
          this.renderCustomTilesPreview();
        }
        this.renderLobbySettingsControls();
        break;

      case 'ROLL': {
        const curPlayer = engine.getCurrentPlayer();
        const oldPos = payload.oldPos !== undefined ? payload.oldPos : curPlayer.position;
        const res = engine.rollDice(payload.forcedValues);
        ui.animateDiceRoll(payload.forcedValues, () => {
          ui.animateTokenStepByStep(curPlayer, oldPos, res.newPos, () => {
            if (payload.state) engine.loadState(payload.state);
            ui.update(engine.getState(), profileManager.profile.id);
            this.saveActiveGameSession();
          });
        }, payload.diceSkin);
        break;
      }

      case 'BUY':
        if (payload.state) {
          engine.loadState(payload.state);
        } else {
          engine.buyProperty(payload.senderId, payload.tileId);
        }
        ui.update(engine.getState(), profileManager.profile.id);
        this.saveActiveGameSession();
        break;

      case 'PASS':
        if (payload.state) {
          engine.loadState(payload.state);
        } else {
          engine.passProperty();
        }
        ui.update(engine.getState(), profileManager.profile.id);
        this.saveActiveGameSession();
        break;

      case 'APPLY_CARD':
        if (payload.state) {
          engine.loadState(payload.state);
        } else {
          engine.applyActiveCard();
        }
        ui.update(engine.getState(), profileManager.profile.id);
        this.saveActiveGameSession();
        break;

      case 'END_TURN':
        if (payload.state) {
          engine.loadState(payload.state);
        } else {
          engine.endTurn();
        }
        ui.update(engine.getState(), profileManager.profile.id);
        this.saveActiveGameSession();
        const nextCur = engine.getCurrentPlayer();
        if (nextCur && nextCur.isBot && this.isBotController()) {
          setTimeout(() => this.runBotTurnStep(), 800);
        }
        break;

      case 'PLAYER_LEFT':
        if (payload.state) engine.loadState(payload.state);
        this.handlePlayerLeft(payload.playerId, payload.name);
        break;

      case 'TRADE_PROPOSAL':
        this.handleIncomingTradeProposal(payload.offer);
        break;

      case 'TRADE_ACCEPTED':
        if (payload.state) {
          engine.loadState(payload.state);
        } else if (payload.offer) {
          engine.executeTrade(payload.offer);
        }
        sound.playCash();
        ui.showToast(`🎉 ${payload.offer ? payload.offer.toName : 'Партнер'} принял(а) предложение обмена!`);
        ui.update(engine.getState(), profileManager.profile.id);
        this.saveActiveGameSession();
        break;

      case 'TRADE_REJECTED':
        engine.rejectTrade();
        sound.playClick();
        ui.showToast(`❌ ${payload.offer ? payload.offer.toName : 'Партнер'} отклонил(а) предложение обмена`);
        ui.update(engine.getState(), profileManager.profile.id);
        break;

      case 'ADMIN_COIN_GRANT': {
        if (payload.targetPlayerId && String(payload.targetPlayerId) === String(profileManager.profile.id)) {
          if (payload.actionType === 'set') {
            profileManager.setCoins(payload.amount);
          } else if (payload.actionType === 'give') {
            profileManager.addCoins(payload.amount);
          } else if (payload.actionType === 'take') {
            profileManager.removeCoins(payload.amount);
          }
          this.renderProfileCard();
          this.renderLeaderboard();
          sound.playCash();
          ui.showToast(`👑 Администратор ${payload.actionType === 'take' ? 'списал' : 'выдал'} вам ${payload.amount} монет`);
        }
        break;
      }
    }
  }

  // --- PROFILE & DOM EVENTS ---
  renderProfileCard() {
    const p = profileManager.profile;
    const tokenEmoji = getTokenEmoji(p.token);
    const isRegistered = profileManager.isRegisteredUser();

    const cardBadge = document.getElementById('profile-card-badge');
    if (cardBadge) cardBadge.innerHTML = renderTokenHTML(p.token, p.customToken);

    const cardName = document.getElementById('profile-card-name');
    if (cardName) {
      // Always prefer the explicitly saved custom nickname over whatever is in profile.name
      const savedNick = (() => { try { return localStorage.getItem('monopoly_custom_nickname'); } catch(e) { return null; } })();
      if (savedNick && savedNick.trim()) {
        p.name = savedNick.trim();
        p.customName = savedNick.trim();
      }
      const displayName = (p.name && p.name !== 'Гость') ? p.name : (isRegistered ? p.name : 'Гость');
      cardName.innerText = displayName;
      if (p.nameColor || p.color) {
        cardName.style.color = p.nameColor || p.color;
      }
    }

    const cardTitle = document.getElementById('profile-card-title-badge');
    if (cardTitle) {
      cardTitle.innerHTML = formatTitleBadge(p.title || 'novice');
    }

    // Toggle test lobby & admin panel button for developer
    const isDev = isDevUser(p);
    const btnTestRoom = document.getElementById('btn-create-test-room');
    if (btnTestRoom) {
      btnTestRoom.style.display = isDev ? 'inline-flex' : 'none';
    }

    const btnAdmin = document.getElementById('btn-open-admin');
    if (btnAdmin) {
      btnAdmin.style.display = isDev ? 'inline-flex' : 'none';
    }

    const btnGlobalRefresh = document.getElementById('btn-global-refresh-all');
    if (btnGlobalRefresh) {
      btnGlobalRefresh.style.display = isDev ? 'inline-flex' : 'none';
    }

    const statusBadge = document.getElementById('profile-status-badge');
    if (statusBadge) statusBadge.style.display = 'none';

    const statusSub = document.getElementById('profile-status-sub');
    if (statusSub) statusSub.style.display = 'none';

    const btnProfileDiscordText = document.getElementById('btn-profile-discord-text');
    if (btnProfileDiscordText) {
      btnProfileDiscordText.innerText = isRegistered ? 'Управление Discord' : 'Войти через Discord';
    }

    // Apply Profile Card Background & Theme
    const profileCard = document.querySelector('.profile-card');
    const profileBg = getProfileBg(p.bg || p.profileBg);
    if (profileCard && profileBg) {
      if (profileBg.id !== 'default') {
        const accent = profileBg.tagColor || '#38bdf8';
        const borderCol = profileBg.borderStyle ? profileBg.borderStyle.replace('1px solid ', '') : accent;

        profileCard.style.background = profileBg.bgStyle;
        profileCard.style.borderColor = borderCol;
        profileCard.style.boxShadow = profileBg.glow || '';
        profileCard.style.setProperty('--profile-accent', accent);
        profileCard.style.setProperty('--profile-tag', profileBg.tagColor || accent);
        profileCard.style.setProperty('--profile-text', profileBg.textColor || '#ffffff');
        profileCard.style.setProperty('--profile-border', borderCol);
        profileCard.style.setProperty('--profile-glow', profileBg.glow || 'none');
      } else {
        profileCard.style.background = '';
        profileCard.style.borderColor = '';
        profileCard.style.boxShadow = '';
        profileCard.style.removeProperty('--profile-accent');
        profileCard.style.removeProperty('--profile-tag');
        profileCard.style.removeProperty('--profile-text');
        profileCard.style.removeProperty('--profile-border');
        profileCard.style.removeProperty('--profile-glow');
      }
    }

    // Header buttons & card logout logic:
    const btnHeaderDiscord = document.getElementById('btn-header-discord');
    const btnOpenProfile = document.getElementById('btn-open-profile');
    const headerName = document.getElementById('profile-name-display');
    const btnCardLogout = document.getElementById('btn-card-logout-trigger');

    if (isRegistered) {
      if (btnHeaderDiscord) btnHeaderDiscord.style.display = 'none';
      if (btnOpenProfile) {
        btnOpenProfile.style.display = 'inline-flex';
        btnOpenProfile.setAttribute('title', `Профиль: ${p.name} (Discord)`);
      }
      if (btnCardLogout) btnCardLogout.style.display = 'inline-flex';
      const nameCol = p.nameColor || p.color || '#38bdf8';
      if (headerName) headerName.innerHTML = `${renderTokenHTML(p.token, p.customToken, 'token-custom-img')} <span style="color: ${nameCol}; font-weight: 600;">${p.name}</span>`;
    } else {
      if (btnHeaderDiscord) {
        btnHeaderDiscord.style.display = 'inline-flex';
        btnHeaderDiscord.setAttribute('title', 'Войти через Discord, чтобы указать никнейм');
      }
      if (btnOpenProfile) {
        btnOpenProfile.style.display = 'none';
      }
      if (btnCardLogout) btnCardLogout.style.display = 'none';
      const displayName = (p.name && p.name !== 'Гость') ? p.name : 'Гость';
      const nameCol = p.nameColor || p.color || '#38bdf8';
      if (headerName) headerName.innerHTML = `${renderTokenHTML(p.token, p.customToken, 'token-custom-img')} <span style="color: ${nameCol}; font-weight: 600;">${displayName}</span>`;
    }

    // Header Coins Display
    const headerCoins = document.getElementById('header-coins-display');
    if (headerCoins) headerCoins.innerText = (p.coins || 0).toLocaleString('ru-RU');

    // Stats Grid
    const statCoins = document.getElementById('stat-coins');
    if (statCoins) statCoins.innerText = (p.coins || 0).toLocaleString('ru-RU');

    const statGames = document.getElementById('stat-games');
    if (statGames) statGames.innerText = p.stats.gamesPlayed;

    const statWins = document.getElementById('stat-wins');
    if (statWins) statWins.innerText = p.stats.wins;

    const statWinrate = document.getElementById('stat-winrate');
    if (statWinrate) statWinrate.innerText = `${profileManager.getWinRate()}%`;

    // Ranks summary for profile card
    const ranks = leaderboardManager.getPlayerRanks(p.id);
    const formatRankBadge = (rank) => {
      if (!rank) return '—';
      if (rank === 1) return '🥇 #1';
      if (rank === 2) return '🥈 #2';
      if (rank === 3) return '🥉 #3';
      return `#${rank}`;
    };

    const pcardWins = document.getElementById('pcard-val-wins');
    if (pcardWins) pcardWins.innerText = formatRankBadge(ranks.winsRank);

    const pcardMatches = document.getElementById('pcard-val-matches');
    if (pcardMatches) pcardMatches.innerText = formatRankBadge(ranks.matchesRank);

    const pcardCash = document.getElementById('pcard-val-cash');
    if (pcardCash) pcardCash.innerText = formatRankBadge(ranks.cashRank);
  }

  showPlayerProfileModal(playerData, gameState = null) {
    if (!playerData) return;
    sound.playClick();

    const modal = document.getElementById('modal-view-player-profile');
    if (!modal) return;

    // Resolve stats & profile info
    const isMe = String(playerData.id) === String(profileManager.profile.id);
    const myProfile = profileManager.profile;
    const regProfile = leaderboardManager.records.find(r => String(r.id) === String(playerData.id)) || {};
    const enginePlayer = (typeof engine !== 'undefined' && engine.players) ? engine.players.find(p => String(p.id) === String(playerData.id)) : null;
    const lobbyPlayer = (this.lobbyPlayers) ? this.lobbyPlayers.find(p => String(p.id) === String(playerData.id)) : null;
    const profile = isMe ? myProfile : { ...regProfile, ...(lobbyPlayer || {}), ...(enginePlayer || {}), ...playerData };

    const name = profile.name || playerData.name || 'Игрок';
    const isCustomPawn = profile.token === 'custom' || (typeof profile.token === 'string' && profile.token.startsWith('data:image')) || (playerData.token === 'custom');
    const token = getTokenEmoji(profile.token || playerData.token);
    const customTokenSrc = isCustomPawn ? (profile.customToken || playerData.customToken || (profile.token === 'custom' ? myProfile.customToken : null)) : null;
    const color = profile.color || playerData.color || '#2563eb';
    const isRegistered = isPlayerRegistered(profile) || isPlayerRegistered(playerData) || isPlayerRegistered(regProfile);
    const discordUsername = profile.discordUsername || playerData.discordUsername || regProfile.discordUsername || profile.discordId || null;
    const avatarUrl = profile.avatarUrl || playerData.avatarUrl || regProfile.avatarUrl || null;
    const bgKey = profile.bg || profile.profileBg || playerData.bg || playerData.profileBg || regProfile.bg || regProfile.profileBg;
    const playerBg = getProfileBg(bgKey);

    // Apply header background & text theme styling
    const vpHeader = document.querySelector('.view-profile-header');
    if (vpHeader && playerBg) {
      if (playerBg.id !== 'default') {
        vpHeader.style.background = playerBg.bgStyle;
        vpHeader.style.borderColor = playerBg.borderStyle ? playerBg.borderStyle.replace('1px solid ', '') : 'var(--md-outline-variant)';
        vpHeader.style.boxShadow = playerBg.glow || '';
        vpHeader.style.color = playerBg.textColor || '#ffffff';
      } else {
        vpHeader.style.background = '';
        vpHeader.style.borderColor = '';
        vpHeader.style.boxShadow = '';
        vpHeader.style.color = '';
      }
    }

    // Stats
    const stats = profile.stats || playerData.stats || regProfile.stats || {};
    const wins = isMe 
      ? (myProfile.stats?.wins || 0) 
      : Math.max(stats.wins || 0, playerData.wins || 0, regProfile.wins || 0);
    const games = isMe 
      ? (myProfile.stats?.gamesPlayed || 0) 
      : Math.max(stats.gamesPlayed || 0, playerData.games || 0, regProfile.games || 0);
    const winrate = games > 0 ? Math.round((wins / games) * 100) : 0;
    const netWorth = isMe
      ? (myProfile.stats?.maxNetWorth || 0)
      : Math.max(stats.maxNetWorth || 0, playerData.netWorth || 0, regProfile.netWorth || 0);
    const coins = isMe
      ? (myProfile.coins || 0)
      : Math.max(
          typeof profile.coins === 'number' ? profile.coins : 0,
          typeof playerData.coins === 'number' ? playerData.coins : 0,
          typeof regProfile.coins === 'number' ? regProfile.coins : 0,
          typeof enginePlayer?.coins === 'number' ? enginePlayer.coins : 0,
          typeof lobbyPlayer?.coins === 'number' ? lobbyPlayer.coins : 0
        );

    // Update Avatar
    const avatarEmoji = document.getElementById('vp-avatar-emoji');
    const avatarImg = document.getElementById('vp-avatar-img');
    const avatarBadge = document.getElementById('vp-avatar-badge');

    if (avatarBadge) avatarBadge.style.borderColor = color;

    if (customTokenSrc && avatarImg && avatarEmoji) {
      avatarImg.src = customTokenSrc;
      avatarImg.className = 'board-token-img';
      avatarImg.style.display = 'block';
      avatarEmoji.style.display = 'none';
    } else if (avatarUrl && avatarImg && avatarEmoji) {
      avatarImg.src = avatarUrl;
      avatarImg.className = '';
      avatarImg.style.display = 'block';
      avatarEmoji.style.display = 'none';
    } else if (avatarEmoji && avatarImg) {
      avatarEmoji.innerText = token;
      avatarEmoji.style.display = 'block';
      avatarImg.style.display = 'none';
    }

    // Update Name and Badges
    const vpName = document.getElementById('vp-name');
    if (vpName) {
      vpName.innerText = name;
      const customNameColor = profile.nameColor || playerData.nameColor || profile.color || playerData.color;
      if (customNameColor) {
        vpName.style.color = customNameColor;
      } else if (playerBg && playerBg.id !== 'default') {
        vpName.style.color = playerBg.textColor;
      } else {
        vpName.style.color = '';
      }
    }

    const vpTitle = document.getElementById('vp-title-badge');
    if (vpTitle) {
      vpTitle.innerHTML = formatTitleBadge(profile.title || playerData.title || 'novice');
    }

    const vpVerified = document.getElementById('vp-badge-verified');
    const vpGuest = document.getElementById('vp-badge-guest');
    if (vpVerified) vpVerified.style.display = 'none';
    if (vpGuest) vpGuest.style.display = 'none';

    const vpTag = document.getElementById('vp-discord-tag');
    if (vpTag) {
      vpTag.style.display = 'none';
    }

    const vpRole = document.getElementById('vp-role-tag');
    if (vpRole) {
      vpRole.style.display = 'none';
    }

    // Update Statistics
    const elCoins = document.getElementById('vp-stat-coins');
    const elWins = document.getElementById('vp-stat-wins');
    const elMatches = document.getElementById('vp-stat-matches');
    const elWinrate = document.getElementById('vp-stat-winrate');
    const elNetworth = document.getElementById('vp-stat-networth');

    if (elCoins) elCoins.innerText = (coins || 0).toLocaleString('ru-RU');
    if (elWins) elWins.innerText = wins;
    if (elMatches) elMatches.innerText = games;
    if (elWinrate) elWinrate.innerText = `${winrate}%`;
    if (elNetworth) elNetworth.innerText = `$${(netWorth || 0).toLocaleString('ru-RU')}`;

    // Update Leaderboard Standings
    const targetId = profile.id || playerData.id;
    const pRanks = leaderboardManager.getPlayerRanks(targetId);
    const formatVpRank = (rank) => {
      if (!rank) return '—';
      if (rank === 1) return '🥇 #1';
      if (rank === 2) return '🥈 #2';
      if (rank === 3) return '🥉 #3';
      return `#${rank}`;
    };

    const vpRankWins = document.getElementById('vp-rank-wins');
    const vpRankMatches = document.getElementById('vp-rank-matches');
    const vpRankCash = document.getElementById('vp-rank-cash');
    const vpRankWinrate = document.getElementById('vp-rank-winrate');

    if (vpRankWins) vpRankWins.innerText = formatVpRank(pRanks.winsRank);
    if (vpRankMatches) vpRankMatches.innerText = formatVpRank(pRanks.matchesRank);
    if (vpRankCash) vpRankCash.innerText = formatVpRank(pRanks.cashRank);
    if (vpRankWinrate) vpRankWinrate.innerText = formatVpRank(pRanks.winrateRank);

    // Active Game details (if in a game)
    const gameSection = document.getElementById('vp-game-details');
    if (gameState && gameState.players) {
      const activeP = gameState.players.find(p => String(p.id) === String(playerData.id));
      if (activeP && gameSection) {
        gameSection.style.display = 'block';
        document.getElementById('vp-game-cash').innerText = `$${activeP.cash}`;
        const curTile = BOARD_TILES[activeP.position];
        document.getElementById('vp-game-pos').innerText = `${curTile?.icon ? curTile.icon + ' ' : ''}${curTile?.name || 'Вперёд'}`;

        const statusTag = document.getElementById('vp-game-status-tag');
        if (statusTag) {
          if (activeP.hasLeft) {
            statusTag.innerText = 'Покинул матч';
            statusTag.className = 'player-status-tag tag-left';
          } else if (activeP.isBankrupt) {
            statusTag.innerText = 'Банкрот';
            statusTag.className = 'player-status-tag tag-bankrupt';
          } else if (activeP.inJail) {
            statusTag.innerText = 'В тюрьме';
            statusTag.className = 'player-status-tag tag-jail';
          } else {
            statusTag.innerText = 'В игре';
            statusTag.className = 'player-status-tag';
          }
        }

        const propsContainer = document.getElementById('vp-game-props');
        if (propsContainer) {
          propsContainer.innerHTML = '';
          const owned = Object.entries(gameState.properties || {})
            .filter(([tId, prop]) => prop.ownerId === activeP.id)
            .map(([tId]) => BOARD_TILES[tId])
            .filter(Boolean);

          if (owned.length === 0) {
            propsContainer.innerHTML = '<span style="color: var(--md-on-surface-variant); font-size: 0.8rem;">Нет собственности</span>';
          } else {
            propsContainer.innerHTML = owned.map(t => {
              const col = COLOR_GROUPS[t.group]?.color || '#666';
              return `<span style="font-size: 0.75rem; padding: 2px 8px; border-radius: 6px; background-color: ${col}; color: #ffffff; font-weight: 500;">${t.icon ? t.icon + ' ' : ''}${t.name}</span>`;
            }).join('');
          }
        }
      } else if (gameSection) {
        gameSection.style.display = 'none';
      }
    } else if (gameSection) {
      gameSection.style.display = 'none';
    }

    // Edit & Logout buttons for self
    const btnEditSelf = document.getElementById('vp-btn-edit-self');
    if (btnEditSelf) {
      btnEditSelf.style.display = isMe ? 'inline-flex' : 'none';
      btnEditSelf.onclick = () => {
        modal.classList.remove('active');
        this.openProfileModal();
      };
    }

    const btnLogoutSelf = document.getElementById('vp-btn-logout-self');
    if (btnLogoutSelf) {
      btnLogoutSelf.style.display = (isMe && profileManager.isRegisteredUser()) ? 'inline-flex' : 'none';
      btnLogoutSelf.onclick = () => {
        modal.classList.remove('active');
        this.confirmAndLogout();
      };
    }

    modal.classList.add('active');
  }

  // --- DISCORD AUTHENTICATION & OAUTH FLOW ---
  async initDiscordAuth() {
    // 1. Check for Discord OAuth Implicit Grant callback (#access_token=...)
    if (window.location.hash && window.location.hash.includes('access_token=')) {
      const hash = window.location.hash.substring(1);
      const params = new URLSearchParams(hash);
      const accessToken = params.get('access_token');
      const tokenType = params.get('token_type') || 'Bearer';
      const isDirectDiscord = !params.get('refresh_token');

      if (isDirectDiscord && accessToken) {
        try {
          ui.showToast('Авторизация в Discord...');
          const res = await fetch('https://discord.com/api/users/@me', {
            headers: { Authorization: `${tokenType} ${accessToken}` }
          });
          if (res.ok) {
            const dUser = await res.json();
            const avatarUrl = dUser.avatar
              ? `https://cdn.discordapp.com/avatars/${dUser.id}/${dUser.avatar}.png`
              : `https://cdn.discordapp.com/embed/avatars/${(parseInt(dUser.discriminator || '0', 10) || 0) % 5}.png`;
            const displayName = dUser.global_name || dUser.username;

            profileManager.setDiscordUser({
              id: `discord_${dUser.id}`,
              discordId: dUser.id,
              name: displayName,
              username: dUser.username,
              avatarUrl: avatarUrl,
              isRegistered: true,
              authProvider: 'discord'
            });

            leaderboardManager.syncMyRegisteredRecord();
            if (network) {
              network.broadcastLeaderboardRecord({
                id: profileManager.profile.id,
                name: profileManager.profile.name,
                token: profileManager.profile.token,
                color: profileManager.profile.color,
                stats: profileManager.profile.stats,
                isRegistered: true,
                discordId: dUser.id,
                avatarUrl: avatarUrl
              });
            }

            ui.showToast(`🎉 Добро пожаловать, ${displayName}! Вход через Discord выполнен.`);
          } else {
            console.warn('Discord profile fetch failed:', res.status);
          }
        } catch (e) {
          console.error('Failed to process Discord OAuth callback:', e);
        } finally {
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
        }
      }
    }

    // 2. Check for Supabase Auth session if configured
    if (network && network.supabase && network.supabase.auth) {
      try {
        const { data: { session } } = await network.supabase.auth.getSession();
        if (session && session.user) {
          const u = session.user;
          const meta = u.user_metadata || {};
          const isDiscordProvider = u.app_metadata?.provider === 'discord' || u.identities?.some(i => i.provider === 'discord');
          if (isDiscordProvider || meta.provider_id) {
            profileManager.setDiscordUser({
              id: `discord_${meta.provider_id || u.id}`,
              discordId: meta.provider_id || u.id,
              name: meta.full_name || meta.custom_claims?.global_name || meta.name || 'Discord Player',
              username: meta.user_name || meta.preferred_username || null,
              avatarUrl: meta.avatar_url || null,
              isRegistered: true,
              authProvider: 'discord'
            });
            leaderboardManager.syncMyRegisteredRecord();
          }
        }

        network.supabase.auth.onAuthStateChange((event, session) => {
          if (session && session.user) {
            const u = session.user;
            const meta = u.user_metadata || {};
            const isDiscordProvider = u.app_metadata?.provider === 'discord' || u.identities?.some(i => i.provider === 'discord');
            if (isDiscordProvider || meta.provider_id) {
              profileManager.setDiscordUser({
                id: `discord_${meta.provider_id || u.id}`,
                discordId: meta.provider_id || u.id,
                name: meta.full_name || meta.custom_claims?.global_name || meta.name || 'Discord Player',
                username: meta.user_name || meta.preferred_username || null,
                avatarUrl: meta.avatar_url || null,
                isRegistered: true,
                authProvider: 'discord'
              });
              leaderboardManager.syncMyRegisteredRecord();
              this.renderProfileCard();
              this.renderLeaderboard();
            }
          }
        });
      } catch (e) {
        console.warn('Supabase auth check:', e);
      }
    }

    this.renderProfileCard();
    this.renderLeaderboard();
  }

  openDiscordAuthModal() {
    sound.playClick();
    const modal = document.getElementById('modal-discord-auth');
    if (!modal) return;

    const isRegistered = profileManager.isRegisteredUser();
    const loggedInView = document.getElementById('discord-logged-in-view');
    const loggedOutView = document.getElementById('discord-logged-out-view');

    if (isRegistered) {
      if (loggedInView) loggedInView.style.display = 'flex';
      if (loggedOutView) loggedOutView.style.display = 'none';

      const dName = document.getElementById('discord-display-name');
      if (dName) dName.innerText = profileManager.profile.name;

      const dTag = document.getElementById('discord-tag-display');
      if (dTag) dTag.innerText = `@${profileManager.profile.discordUsername || profileManager.profile.name}`;

      const avatarEmoji = document.getElementById('discord-avatar-emoji');
      const avatarImg = document.getElementById('discord-avatar-img');
      if (profileManager.profile.avatarUrl) {
        if (avatarImg) {
          avatarImg.src = profileManager.profile.avatarUrl;
          avatarImg.style.display = 'block';
        }
        if (avatarEmoji) avatarEmoji.style.display = 'none';
      } else {
        if (avatarImg) avatarImg.style.display = 'none';
        if (avatarEmoji) {
          avatarEmoji.innerText = getTokenEmoji(profileManager.profile.token);
          avatarEmoji.style.display = 'block';
        }
      }
    } else {
      if (loggedInView) loggedInView.style.display = 'none';
      if (loggedOutView) loggedOutView.style.display = 'flex';

      const inputClientId = document.getElementById('input-discord-client-id');
      if (inputClientId) {
        inputClientId.value = localStorage.getItem('monopoly_discord_client_id') || '';
      }
    }

    modal.classList.add('active');
  }

  async startDiscordOAuth() {
    sound.playClick();
    const redirectUri = window.location.origin + window.location.pathname;

    // 1. Try Supabase Discord Auth if enabled
    if (network && network.supabase && network.supabase.auth) {
      try {
        const { data, error } = await network.supabase.auth.signInWithOAuth({
          provider: 'discord',
          options: { redirectTo: redirectUri }
        });
        if (!error && data && data.url) {
          window.location.href = data.url;
          return;
        }
      } catch (e) {
        console.log('Supabase OAuth skipped, checking Direct Discord OAuth');
      }
    }

    // 2. Direct Discord OAuth
    const clientId = localStorage.getItem('monopoly_discord_client_id') || '1342930217032749117';
    if (!clientId || clientId.trim().length < 5) {
      const settingsBox = document.getElementById('discord-oauth-settings');
      if (settingsBox) settingsBox.style.display = 'block';
      ui.showToast('Укажите Discord Client ID приложения в настройках');
      return;
    }

    const authUrl = `https://discord.com/oauth2/authorize?client_id=${clientId.trim()}&response_type=token&scope=identify&redirect_uri=${encodeURIComponent(redirectUri)}`;
    window.location.href = authUrl;
  }

  async performLogout() {
    sound.playClick();
    profileManager.logout();

    if (network && network.supabase && network.supabase.auth) {
      try {
        await network.supabase.auth.signOut();
      } catch (e) {
        console.warn('Supabase signOut error:', e);
      }
    }

    try {
      localStorage.removeItem('monopoly_discord_token');
      sessionStorage.removeItem('monopoly_discord_token');
    } catch (e) {}

    document.getElementById('modal-profile')?.classList.remove('active');
    document.getElementById('modal-view-player-profile')?.classList.remove('active');
    document.getElementById('modal-discord-auth')?.classList.remove('active');

    this.renderProfileCard();
    this.renderLeaderboard();

    if (network && network.channel) {
      this.broadcastAction('PLAYER_PROFILE_UPDATED', {
        playerId: profileManager.profile.id,
        name: profileManager.profile.name,
        title: profileManager.profile.title || 'novice',
        token: profileManager.profile.token,
        customToken: profileManager.profile.customToken,
        bg: profileManager.profile.bg || 'default',
        profileBg: profileManager.profile.bg || 'default',
        color: profileManager.profile.color,
        coins: profileManager.profile.coins || 0
      });
    }

    ui.showToast('Вы вышли из аккаунта. Теперь вы играете как Гость.');
  }

  loginAsDiscordUser(discordUsername) {
    sound.playClick();
    if (!discordUsername || !discordUsername.trim()) {
      ui.showToast('Введите Discord логин');
      return;
    }
    const cleanName = discordUsername.trim().replace(/^@/, '');
    const isHizu = cleanName.toLowerCase().includes('hizuhara');

    profileManager.setDiscordUser({
      id: isHizu ? 'discord_1472673126859935765' : `discord_${cleanName.toLowerCase()}`,
      discordId: isHizu ? '1472673126859935765' : cleanName.toLowerCase(),
      name: isHizu ? (profileManager.profile.name || 'hizuhara.') : cleanName,
      username: cleanName,
      avatarUrl: isHizu ? (profileManager.profile.avatarUrl || 'https://cdn.discordapp.com/avatars/1472673126859935765/8819b4f951abe3f4f76a1646dee1ba9d.png') : null,
      isRegistered: true,
      authProvider: 'discord'
    });

    if (isHizu) {
      profileManager.profile.coins = typeof profileManager.profile.coins === 'number' ? profileManager.profile.coins : 0;
      profileManager.profile.token = profileManager.profile.token || 'custom';
      profileManager.profile.color = '#2563eb';
      profileManager.profile.bg = 'space';
      profileManager.profile.profileBg = 'space';
      profileManager.profile.title = 'creator';
      profileManager.profile.diceSkin = 'cosmic_void';
      if (!profileManager.profile.stats) profileManager.profile.stats = {};
      profileManager.profile.stats.wins = Math.max(profileManager.profile.stats.wins || 0, 2);
      profileManager.profile.stats.gamesPlayed = Math.max(profileManager.profile.stats.gamesPlayed || 0, 2);
      profileManager.profile.stats.maxNetWorth = Math.max(profileManager.profile.stats.maxNetWorth || 0, 2500);
    }

    profileManager.saveProfile();
    leaderboardManager.syncMyRecord();
    if (network) {
      network.broadcastLeaderboardRecord({
        id: profileManager.profile.id,
        name: profileManager.profile.name,
        token: profileManager.profile.token,
        color: profileManager.profile.color,
        bg: profileManager.profile.bg,
        coins: profileManager.profile.coins,
        stats: profileManager.profile.stats,
        isRegistered: true,
        discordId: profileManager.profile.discordId
      });
    }

    this.renderProfileCard();
    this.renderLeaderboard();
    window.closeModalById('modal-discord-auth');
    ui.showToast(`🎉 Вы успешно вошли как ${profileManager.profile.name}!`);
  }

  confirmAndLogout() {
    sound.playClick();
    showConfirm('Выйти из аккаунта?', 'Вы вернетесь в режим Гостя. Ваши достижения останутся привязаны к вашему Discord.', () => {
      this.performLogout();
    });
  }

  initAudioAndThemeControls() {
    // Delegated click handler for settings button
    document.addEventListener('click', (e) => {
      if (e.target.closest('#btn-open-settings')) {
        e.preventDefault();
        this.openSettingsModal();
      }
    });

    const btnTheme = document.getElementById('btn-theme-toggle');
    if (btnTheme) {
      btnTheme.addEventListener('click', () => {
        this.openSettingsModal();
      });
    }

    // ── Audio settings: per-category sliders ─────────────────────────────
    const btnTestSound = document.getElementById('btn-test-sound');

    // Helper: update slider fill gradient to show progress
    const updateSliderFill = (slider) => {
      const pct = ((slider.value - slider.min) / (slider.max - slider.min)) * 100;
      const color = getComputedStyle(slider).getPropertyValue('--track-color').trim() || '#a78bfa';
      slider.style.background = `linear-gradient(to right, ${color} ${pct}%, rgba(255,255,255,0.12) ${pct}%)`;
    };

    // Master volume
    const volSlider  = document.getElementById('settings-volume-slider');
    const volPercent = document.getElementById('settings-volume-percent');
    const muteBtnEl  = document.getElementById('settings-master-mute-btn');

    if (volSlider) {
      volSlider.value = Math.round(sound.volume * 100);
      updateSliderFill(volSlider);
      volSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value) / 100;
        sound.setVolume(val);
        if (volPercent) volPercent.textContent = `${Math.round(val * 100)}%`;
        if (muteBtnEl)  muteBtnEl.textContent = val === 0 ? '🔇' : '🔊';
        updateSliderFill(volSlider);
      });
    }
    if (volPercent) volPercent.textContent = `${Math.round(sound.volume * 100)}%`;

    if (muteBtnEl) {
      muteBtnEl.textContent = sound.isMuted ? '🔇' : '🔊';
      muteBtnEl.addEventListener('click', () => {
        const muted = sound.toggleMuted();
        muteBtnEl.textContent = muted ? '🔇' : '🔊';
        sound.playClick();
      });
    }

    // Category sliders
    const catSliders = [
      { id: 'settings-dice-vol', pctId: 'settings-dice-vol-pct', cat: 'dice' },
      { id: 'settings-buy-vol',  pctId: 'settings-buy-vol-pct',  cat: 'buy'  },
      { id: 'settings-win-vol',  pctId: 'settings-win-vol-pct',  cat: 'win'  },
      { id: 'settings-ui-vol',   pctId: 'settings-ui-vol-pct',   cat: 'ui'   },
      { id: 'settings-card-vol', pctId: 'settings-card-vol-pct', cat: 'card' },
    ];
    catSliders.forEach(({ id, pctId, cat }) => {
      const sl  = document.getElementById(id);
      const pct = document.getElementById(pctId);
      if (!sl) return;
      sl.value = Math.round((sound.catVol[cat] ?? 0.7) * 100);
      updateSliderFill(sl);
      if (pct) pct.textContent = `${sl.value}%`;
      sl.addEventListener('input', (e) => {
        const val = parseInt(e.target.value) / 100;
        sound.setCatVolume(cat, val);
        if (pct) pct.textContent = `${e.target.value}%`;
        updateSliderFill(sl);
      });
      sl.addEventListener('change', () => {
        if (cat === 'dice') sound.playDiceRoll();
        else if (cat === 'buy') sound.playCash();
        else if (cat === 'win') sound.playWin();
        else if (cat === 'ui') sound.playClick();
        else if (cat === 'card') sound.playCard();
      });
    });

    // General & UI settings
    const autoEndToggle   = document.getElementById('settings-auto-end-toggle');
    const tooltipsToggle  = document.getElementById('settings-tooltips-toggle');
    const fastAnimToggle  = document.getElementById('settings-fast-anim-toggle');
    const chatSoundToggle = document.getElementById('settings-chat-sound-toggle');

    if (autoEndToggle) {
      const savedAutoEnd = localStorage.getItem('monopoly_auto_end');
      if (savedAutoEnd !== null) this.autoEndTurn = savedAutoEnd === '1';
      autoEndToggle.checked = this.autoEndTurn;
      autoEndToggle.addEventListener('change', (e) => {
        this.autoEndTurn = e.target.checked;
        localStorage.setItem('monopoly_auto_end', this.autoEndTurn ? '1' : '0');
        sound.playClick();
      });
    }

    if (tooltipsToggle) {
      tooltipsToggle.checked = localStorage.getItem('monopoly_tooltips') !== '0';
      tooltipsToggle.addEventListener('change', (e) => {
        localStorage.setItem('monopoly_tooltips', e.target.checked ? '1' : '0');
        sound.playClick();
      });
    }

    if (fastAnimToggle) {
      fastAnimToggle.checked = localStorage.getItem('monopoly_fast_anim') === '1';
      fastAnimToggle.addEventListener('change', (e) => {
        localStorage.setItem('monopoly_fast_anim', e.target.checked ? '1' : '0');
        sound.playClick();
      });
    }

    if (chatSoundToggle) {
      chatSoundToggle.checked = localStorage.getItem('monopoly_chat_sound') !== '0';
      chatSoundToggle.addEventListener('change', (e) => {
        localStorage.setItem('monopoly_chat_sound', e.target.checked ? '1' : '0');
        sound.playClick();
      });
    }
  }

  openThemeSelectorModal() {
    this.openSettingsModal();
  }

  openSettingsModal() {
    sound.playClick();
    const modal = document.getElementById('modal-settings');
    if (!modal) return;

    // Sync sliders helper
    const syncSliderFill = (slider) => {
      if (!slider) return;
      const pct = ((slider.value - slider.min) / (slider.max - slider.min)) * 100;
      const color = getComputedStyle(slider).getPropertyValue('--track-color').trim() || '#a78bfa';
      slider.style.background = `linear-gradient(to right, ${color} ${pct}%, rgba(255,255,255,0.12) ${pct}%)`;
    };

    // Master volume
    const volSlider  = document.getElementById('settings-volume-slider');
    const volPercent = document.getElementById('settings-volume-percent');
    const muteBtnEl  = document.getElementById('settings-master-mute-btn');
    if (volSlider) { volSlider.value = Math.round(sound.volume * 100); syncSliderFill(volSlider); }
    if (volPercent) volPercent.textContent = `${Math.round(sound.volume * 100)}%`;
    if (muteBtnEl)  muteBtnEl.textContent  = sound.isMuted ? '🔇' : '🔊';

    // Category sliders
    const catMap = [
      { id: 'settings-dice-vol', pctId: 'settings-dice-vol-pct', cat: 'dice' },
      { id: 'settings-buy-vol',  pctId: 'settings-buy-vol-pct',  cat: 'buy'  },
      { id: 'settings-win-vol',  pctId: 'settings-win-vol-pct',  cat: 'win'  },
      { id: 'settings-ui-vol',   pctId: 'settings-ui-vol-pct',   cat: 'ui'   },
      { id: 'settings-card-vol', pctId: 'settings-card-vol-pct', cat: 'card' },
    ];
    catMap.forEach(({ id, pctId, cat }) => {
      const sl  = document.getElementById(id);
      const pct = document.getElementById(pctId);
      if (!sl) return;
      sl.value = Math.round((sound.catVol[cat] ?? 0.7) * 100);
      syncSliderFill(sl);
      if (pct) pct.textContent = `${sl.value}%`;
    });

    // Other toggles
    const autoEndToggle   = document.getElementById('settings-auto-end-toggle');
    const tooltipsToggle  = document.getElementById('settings-tooltips-toggle');
    const fastAnimToggle  = document.getElementById('settings-fast-anim-toggle');
    const chatSoundToggle = document.getElementById('settings-chat-sound-toggle');
    if (autoEndToggle)   autoEndToggle.checked   = this.autoEndTurn;
    if (tooltipsToggle)  tooltipsToggle.checked   = localStorage.getItem('monopoly_tooltips') !== '0';
    if (fastAnimToggle)  fastAnimToggle.checked   = localStorage.getItem('monopoly_fast_anim') === '1';
    if (chatSoundToggle) chatSoundToggle.checked  = localStorage.getItem('monopoly_chat_sound') !== '0';

    // Render theme grid inside settings
    const grid = document.getElementById('settings-theme-grid');
    if (grid) {
      grid.innerHTML = THEMES.map(theme => {
        const isCurrent = themeManager.getTheme() === theme.id;
        return `
          <button type="button" class="theme-card-option ${isCurrent ? 'active' : ''}" data-theme-id="${theme.id}">
            <span class="theme-color-circle" style="background: ${theme.dotColor || theme.color};"></span>
            <span class="theme-card-icon">${theme.icon || '🎨'}</span>
            <span class="theme-card-title">${theme.label}</span>
            ${isCurrent ? '<span class="theme-check-icon">✓</span>' : ''}
          </button>
        `;
      }).join('');

      grid.querySelectorAll('.theme-card-option').forEach(btn => {
        btn.addEventListener('click', () => {
          const themeId = btn.getAttribute('data-theme-id');
          if (themeId) {
            sound.playClick();
            themeManager.applyTheme(themeId);
            grid.querySelectorAll('.theme-card-option').forEach(b => {
              const active = b.getAttribute('data-theme-id') === themeId;
              b.classList.toggle('active', active);
              const check = b.querySelector('.theme-check-icon');
              if (active && !check) {
                b.insertAdjacentHTML('beforeend', '<span class="theme-check-icon">✓</span>');
              } else if (!active && check) {
                check.remove();
              }
            });
            ui.showToast(`Выбрана тема: ${THEMES.find(t => t.id === themeId)?.label || themeId}`);
          }
        });
      });
    }

    modal.classList.add('active');
  }

  initDOMListeners() {
    // Main Menu & Lobby Buttons
    document.getElementById('btn-create-room')?.addEventListener('click', () => this.createOnlineRoom());
    document.getElementById('btn-create-solo-room')?.addEventListener('click', () => this.createSoloRoom());
    document.getElementById('btn-create-test-room')?.addEventListener('click', () => this.createTestRoom());
    document.getElementById('btn-lobby-add-bot')?.addEventListener('click', () => this.addBotToLobby());
    document.getElementById('btn-lobby-remove-bot')?.addEventListener('click', () => this.removeBotFromLobby());
    document.getElementById('btn-start-game')?.addEventListener('click', () => this.startGameFromLobby());

    // Join room form
    document.getElementById('form-join-room')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const raw = document.getElementById('input-join-code')?.value || '';
      const code = this.extractRoomCode(raw);
      if (code) this.joinRoom(code);
    });

    // Refresh Lobbies
    document.getElementById('btn-refresh-lobbies')?.addEventListener('click', () => {
      sound.playClick();
      if (network.discoveryChannel) {
        network.discoveryChannel.send({
          type: 'broadcast',
          event: 'REQUEST_LOBBIES',
          payload: {}
        });
      }
    });

    // Copy room code
    const copyRoomCode = () => {
      if (!network.roomCode) return;
      sound.playClick();
      const code = network.roomCode;
      this.copyToClipboard(code, `📋 Код комнаты ${code} скопирован`);
    };

    // Copy room link
    const copyRoomLink = () => {
      if (!network.roomCode) return;
      sound.playClick();
      const url = `${window.location.origin}${window.location.pathname}?room=${network.roomCode}`;
      this.copyToClipboard(url, `🔗 Ссылка на комнату скопирована`);
    };

    document.getElementById('btn-copy-code')?.addEventListener('click', (e) => {
      e.stopPropagation();
      copyRoomCode();
    });
    document.getElementById('btn-copy-link')?.addEventListener('click', (e) => {
      e.stopPropagation();
      copyRoomLink();
    });
    document.getElementById('badge-room-code')?.addEventListener('click', copyRoomCode);
    document.getElementById('lobby-room-code')?.addEventListener('click', copyRoomCode);

    // Reconnect Banner
    document.getElementById('btn-reconnect-yes')?.addEventListener('click', () => {
      const saved = network.getSavedSession();
      if (saved) {
        document.getElementById('reconnect-banner').style.display = 'none';
        this.joinRoom(saved.roomCode);
      }
    });

    document.getElementById('btn-reconnect-dismiss')?.addEventListener('click', () => {
      network.leaveRoom();
      document.getElementById('reconnect-banner').style.display = 'none';
    });

    // Profile Modal
    const openProfile = () => {
      sound.playClick();
      const modal = document.getElementById('modal-profile');
      const nameInput = document.getElementById('input-profile-name');

      if (nameInput) {
        const savedNick = (() => { try { return localStorage.getItem('monopoly_custom_nickname'); } catch(e) { return null; } })();
        nameInput.value = savedNick || profileManager.profile.name || 'Игрок';
        nameInput.disabled = false;
        nameInput.placeholder = 'Ваш никнейм';
      }

      const btnProfileLogout = document.getElementById('btn-profile-logout');
      if (btnProfileLogout) {
        btnProfileLogout.style.display = profileManager.isRegisteredUser() ? 'inline-flex' : 'none';
      }

      this.renderTokenPicker();
      this.renderBgPicker();
      this.renderTitlePicker();
      this.renderNameColorPicker();
      modal.classList.add('active');
    };
    this.openProfileModal = openProfile;

    // Shop Button in Header
    document.getElementById('btn-open-shop')?.addEventListener('click', () => {
      this.openShopModal();
    });

    document.getElementById('btn-open-profile')?.addEventListener('click', openProfile);
    document.getElementById('btn-edit-profile-trigger')?.addEventListener('click', openProfile);
    document.getElementById('btn-card-logout-trigger')?.addEventListener('click', () => {
      this.confirmAndLogout();
    });
    document.getElementById('btn-profile-logout')?.addEventListener('click', () => {
      this.confirmAndLogout();
    });
    document.querySelector('.profile-card .profile-header-row')?.addEventListener('click', () => {
      this.showPlayerProfileModal(profileManager.profile);
    });
    document.querySelector('.profile-card .stats-grid')?.addEventListener('click', () => {
      this.showPlayerProfileModal(profileManager.profile);
    });

    // Pawn Editor Modal Open Button
    document.getElementById('btn-open-pawn-editor')?.addEventListener('click', () => {
      sound.playClick();
      const modal = document.getElementById('modal-pawn-editor');
      if (modal) {
        modal.classList.add('active');
        pawnEditor.init((customTokenDataUrl) => {
          if (customTokenDataUrl) {
            profileManager.setCustomToken(customTokenDataUrl);
          } else {
            profileManager.profile.customToken = null;
            profileManager.profile.token = '💎';
            profileManager.saveProfile();
          }
          leaderboardManager.syncMyRecord();
          this.renderTokenPicker();
          this.renderProfileCard();
          this.renderLeaderboard('wins', 'inline-leaderboard-list');
          this.renderLeaderboard('wins', 'modal-leaderboard-list');

          if (this.currentScreen === 'lobby' && network && network.isHost) {
            this.lobbyPlayers = this.lobbyPlayers.map(p => String(p.id) === String(profileManager.profile.id) ? { 
              ...p, 
              token: profileManager.profile.token, 
              customToken: profileManager.profile.customToken 
            } : p);
            this.renderLobbyPlayers();
            this.broadcastAction('LOBBY_UPDATE', { players: this.lobbyPlayers });
          }

          if (network && network.channel) {
            this.broadcastAction('PLAYER_PROFILE_UPDATED', {
              playerId: profileManager.profile.id,
              name: profileManager.profile.name,
              title: profileManager.profile.title || 'novice',
              token: profileManager.profile.token,
              customToken: profileManager.profile.customToken,
              bg: profileManager.profile.bg || 'default',
              profileBg: profileManager.profile.bg || 'default',
              color: profileManager.profile.color,
              coins: profileManager.profile.coins || 0
            });
          }
        });
      }
    });

    document.getElementById('form-profile')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const newName = document.getElementById('input-profile-name')?.value;
      if (newName && newName.trim()) {
        const clean = profileManager.updateName(newName.trim());
        if (window.cloudSync) {
          window.cloudSync.push({ name: clean, customName: clean, timestamp: Date.now() });
        }
      }
      const customTokenVal = profileManager.profile.token === 'custom' ? profileManager.profile.customToken : null;
      leaderboardManager.syncMyRecord();
      this.renderProfileCard();
      this.renderLeaderboard('wins', 'inline-leaderboard-list');
      this.renderLeaderboard('wins', 'modal-leaderboard-list');

      if (this.currentScreen === 'lobby' && this.lobbyPlayers) {
        this.lobbyPlayers = this.lobbyPlayers.map(p => String(p.id) === String(profileManager.profile.id) ? {
          ...p,
          name: profileManager.profile.name
        } : p);
        this.renderLobbyPlayers();
        if (network && network.isHost) {
          this.broadcastAction('LOBBY_UPDATE', { players: this.lobbyPlayers });
        }
      }

      if (network && network.channel) {
        this.broadcastAction('PLAYER_PROFILE_UPDATED', {
          playerId: profileManager.profile.id,
          name: profileManager.profile.name,
          title: profileManager.profile.title || 'novice',
          token: profileManager.profile.token,
          customToken: customTokenVal,
          bg: profileManager.profile.bg || 'default',
          profileBg: profileManager.profile.bg || 'default',
          color: profileManager.profile.color,
          coins: profileManager.profile.coins || 0,
          stats: profileManager.profile.stats || {},
          discordId: profileManager.profile.discordId || null,
          avatarUrl: profileManager.profile.avatarUrl || null
        });
      }

      const profModal = document.getElementById('modal-profile');
      if (profModal) {
        profModal.classList.remove('active');
        profModal.style.display = '';
      }
      sound.playClick();
      showToast('Профиль сохранен');
    });

    // Discord Authentication Listeners
    document.getElementById('btn-header-discord')?.addEventListener('click', () => {
      this.openDiscordAuthModal();
    });

    document.getElementById('btn-profile-discord-action')?.addEventListener('click', () => {
      this.openDiscordAuthModal();
    });

    document.getElementById('btn-start-discord-oauth')?.addEventListener('click', () => {
      this.startDiscordOAuth();
    });

    document.getElementById('btn-toggle-oauth-settings')?.addEventListener('click', () => {
      const box = document.getElementById('discord-oauth-settings');
      if (box) {
        box.style.display = box.style.display === 'none' ? 'block' : 'none';
      }
    });

    document.getElementById('btn-save-client-id')?.addEventListener('click', () => {
      sound.playClick();
      const input = document.getElementById('input-discord-client-id');
      if (input && input.value.trim()) {
        localStorage.setItem('monopoly_discord_client_id', input.value.trim());
        ui.showToast('Discord Client ID сохранён');
      }
    });

    document.getElementById('btn-copy-redirect-uri')?.addEventListener('click', () => {
      const uri = window.location.origin + window.location.pathname;
      this.copyToClipboard(uri, 'Redirect URI скопирован для Discord Developer Portal');
    });

    // Discord Logout
    document.getElementById('btn-discord-logout')?.addEventListener('click', () => {
      this.confirmAndLogout();
    });

    // Leave Lobby
    document.getElementById('btn-leave-lobby')?.addEventListener('click', () => {
      sound.playClick();
      const myId = profileManager.profile.id;
      const myName = profileManager.profile.name;

      if (network.isHost) {
        network.stopAnnouncingLobby();
        this.broadcastAction('LOBBY_DISBANDED', {
          hostId: myId,
          message: 'Лобби расформировано'
        });
        ui.showToast('Лобби расформировано');
      } else {
        this.broadcastAction('PLAYER_LEFT_LOBBY', {
          playerId: myId,
          name: myName
        });
        ui.showToast('Вы покинули лобби');
      }

      this.lobbyPlayers = [];
      this.showScreen('menu');
      this.renderLeaderboard();

      network.leaveRoom().catch(e => console.warn('leaveRoom error:', e));
    });

    // Leave Game Button (uses in-app confirm modal)
    document.getElementById('btn-leave-game')?.addEventListener('click', () => {
      showConfirm('Выйти из игры?', 'Текущая партия для вас будет завершена.', async () => {
        this.clearActiveGameSession();
        this.cancelAutoEndTimer();
        const myId = profileManager.profile.id;
        const myName = profileManager.profile.name;
        const me = engine.players.find(p => p.id === myId);
        if (me) {
          me.hasLeft = true;
          me.isBankrupt = true;
        }

        // If host leaves or game terminates, trigger match result notification
        if (!this.isSoloMode && !this.isLocalMode && !this.isTestMode && network.roomCode) {
          const realPlayers = (engine.players || []).filter(p => !p.isBot);
          if (realPlayers.length >= 2 && !this.hasSentMatchWebhook) {
            const st = engine.getState();
            st.reason = network.isHost ? 'Хост покинул игру (все вышли)' : 'Игрок покинул игру';
            this.handleGameFinished(st);
          }
        }

        this.broadcastAction('PLAYER_LEFT', {
          playerId: myId,
          name: myName,
          state: engine.getState()
        });

        // Ensure WebSocket frame has time to leave before disconnecting
        await new Promise(r => setTimeout(r, 250));
        network.leaveRoom();
        this.showScreen('menu');
      });
    });

    // Trade History Buttons
    document.getElementById('btn-open-trade-history')?.addEventListener('click', () => {
      sound.playClick();
      this.openTradeHistoryModal();
    });

    document.getElementById('btn-trade-modal-history')?.addEventListener('click', () => {
      sound.playClick();
      this.openTradeHistoryModal();
    });

    // Brand Logo ("M") in Header -> Return to Menu
    const brandBtn = document.getElementById('brand-logo') || document.querySelector('.brand');
    brandBtn?.addEventListener('click', () => {
      sound.playClick();
      // If currently playing in a game, ask to confirm exit
      if (this.currentScreen === 'game') {
        document.getElementById('btn-leave-game')?.click();
        return;
      }
      // If currently in a lobby, leave lobby
      if (this.currentScreen === 'lobby') {
        document.getElementById('btn-leave-lobby')?.click();
        return;
      }
      // Close any open modals and show main menu
      document.querySelectorAll('.md-modal.active').forEach(m => m.classList.remove('active'));
      this.showScreen('menu');
      this.renderLeaderboard();
    });

    // Settings Button in Header
    document.getElementById('btn-open-settings')?.addEventListener('click', () => {
      this.openSettingsModal();
    });

    // Leaderboard Button in Header
    document.getElementById('btn-open-leaderboard')?.addEventListener('click', () => {
      sound.playClick();
      this.openLeaderboardModal();
    });

    // Match History Button in Header
    document.getElementById('btn-open-history')?.addEventListener('click', () => {
      sound.playClick();
      this.openMatchHistoryModal('all');
    });

    // Changelog Button in Header
    document.getElementById('btn-open-changelog')?.addEventListener('click', () => {
      this.openChangelogModal();
    });

    // Admin Panel Listeners
    this.initAdminListeners();
    this.initShopTabs();

    // Winner Modal To Menu
    document.getElementById('btn-winner-to-menu')?.addEventListener('click', () => {
      sound.playClick();
      this.clearActiveGameSession();
      document.getElementById('modal-winner')?.classList.remove('active');
      network.leaveRoom();
      this.lobbyPlayers = [];
      this.showScreen('menu');
      this.renderProfileCard();
      this.renderLeaderboard();
    });

    // Profile Accordion Toggle (collapsible Token, Background, Title sections)
    document.querySelectorAll('.profile-accordion-header').forEach(header => {
      header.addEventListener('click', () => {
        sound.playClick();
        const item = header.closest('.profile-accordion-item');
        const wasActive = item.classList.contains('active');
        document.querySelectorAll('.profile-accordion-item').forEach(i => i.classList.remove('active'));
        if (!wasActive) {
          item.classList.add('active');
        }
      });
    });

    // Custom Lobby Tiles — open modal buttons
    const openCustomTiles = () => {
      sound.playClick();
      this.openCustomTilesModal();
    };
    document.getElementById('btn-open-custom-tiles')?.addEventListener('click', openCustomTiles);
    document.getElementById('btn-open-custom-tiles-settings')?.addEventListener('click', openCustomTiles);

    // Custom Tiles — City / Theme Generator Button & Inputs
    document.getElementById('btn-generate-city-tiles')?.addEventListener('click', () => {
      const input = document.getElementById('input-city-generator');
      const val = input?.value.trim();
      if (!val) {
        ui.showToast('Введите название города или темы');
        return;
      }
      this.applyCityMapTheme(val);
    });

    document.getElementById('input-city-generator')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const val = e.target.value.trim();
        if (val) this.applyCityMapTheme(val);
      }
    });

    document.querySelectorAll('.ct-city-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        sound.playClick();
        const city = chip.getAttribute('data-city');
        if (city) {
          const input = document.getElementById('input-city-generator');
          if (input) input.value = city;
          this.applyCityMapTheme(city);
        }
      });
    });

    // Custom Tiles — clear all
    document.getElementById('btn-clear-custom-tiles')?.addEventListener('click', () => {
      if (confirm('Сбросить все переименованные клетки?')) {
        this.customTiles = {};
        this.broadcastLobbySettings();
        this.renderCustomTilesPreview();
        ui.setCustomTiles(this.customTiles);
        ui.showToast('Клетки сброшены до стандартных');
        const ctModal = document.getElementById('modal-custom-tiles');
        if (ctModal && ctModal.classList.contains('active')) {
          this.renderCustomTilesEditor();
        }
      }
    });

    // Custom Tiles — close banner button in lobby settings
    const closeTilesBanner = (e) => {
      e?.stopPropagation();
      sound.playClick();
      const card = document.getElementById('lobby-custom-tiles-card');
      if (card) {
        card.style.display = 'none';
      }
    };
    document.getElementById('btn-close-custom-tiles-card')?.addEventListener('click', closeTilesBanner);
    document.getElementById('btn-reset-custom-tiles-quick')?.addEventListener('click', closeTilesBanner);

    // In-Game Chat Listeners
    this.initChatListeners();
  }

  initChatListeners() {
    const tabLogs = document.getElementById('tab-btn-logs');
    const tabChat = document.getElementById('tab-btn-chat');
    const paneLogs = document.getElementById('tab-content-logs');
    const paneChat = document.getElementById('tab-content-chat');
    const badge = document.getElementById('chat-unread-badge');

    tabLogs?.addEventListener('click', () => {
      sound.playClick();
      tabLogs.classList.add('active');
      tabChat?.classList.remove('active');
      paneLogs?.classList.add('active');
      paneChat?.classList.remove('active');
    });

    tabChat?.addEventListener('click', () => {
      sound.playClick();
      tabChat.classList.add('active');
      tabLogs?.classList.remove('active');
      paneChat?.classList.add('active');
      paneLogs?.classList.remove('active');
      if (badge) badge.style.display = 'none';
      const container = document.getElementById('game-chat-messages');
      if (container) container.scrollTop = container.scrollHeight;
    });

    // Emoji Picker Popover
    const btnEmojiToggle = document.getElementById('btn-chat-emoji-toggle');
    const popover = document.getElementById('chat-emoji-popover');
    const btnClosePopover = document.getElementById('btn-close-emoji-popover');
    const input = document.getElementById('input-game-chat');

    btnEmojiToggle?.addEventListener('click', (e) => {
      e.stopPropagation();
      sound.playClick();
      popover?.classList.toggle('active');
    });

    btnClosePopover?.addEventListener('click', (e) => {
      e.stopPropagation();
      popover?.classList.remove('active');
    });

    document.addEventListener('click', (e) => {
      if (popover && popover.classList.contains('active') && !popover.contains(e.target) && e.target !== btnEmojiToggle) {
        popover.classList.remove('active');
      }
    });

    popover?.querySelectorAll('.chat-emoji-item-btn, .chat-emoji-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        sound.playClick();
        const emoji = btn.getAttribute('data-emoji') || btn.innerText;
        if (input) {
          input.value += emoji;
          input.focus();
        }
      });
    });

    // Quick reactions
    document.querySelectorAll('.chat-quick-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const text = btn.getAttribute('data-text');
        if (text) this.sendChatMessage(text);
      });
    });

    // Chat form submit
    document.getElementById('form-game-chat')?.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!input) return;
      const text = input.value.trim();
      if (text) {
        this.sendChatMessage(text);
        input.value = '';
        popover?.classList.remove('active');
      }
    });

    engine.onLogCallback = null;
  }

  sendChatMessage(text) {
    if (!text || !text.trim()) return;
    const cleanText = text.trim().substring(0, 120);
    const myProfile = profileManager.profile;
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const msg = {
      senderId: myProfile.id,
      senderName: myProfile.name,
      title: myProfile.title || 'novice',
      token: getTokenEmoji(myProfile.token),
      color: myProfile.color,
      nameColor: myProfile.nameColor || myProfile.color,
      bg: myProfile.bg || 'default',
      text: cleanText,
      time: timeStr
    };

    sound.playClick();
    this.renderChatMessage(msg, true);
    this.broadcastAction('CHAT_MESSAGE', msg);

    // Bot playful responses
    if (engine.status === 'PLAYING') {
      const bots = engine.players.filter(p => p.isBot && !p.isBankrupt && !p.hasLeft);
      if (bots.length > 0 && Math.random() < 0.65) {
        setTimeout(() => {
          if (engine.status !== 'PLAYING') return;
          const randomBot = bots[Math.floor(Math.random() * bots.length)];
          const replies = [
            '🎲 Отличный бросок!',
            '💰 Мой капитал только растёт!',
            '🤝 Кто готов к сделке?',
            '🔥 Игра накаляется!',
            '😎 Скоро куплю этот город!',
            '🎩 Приятной игры!'
          ];
          const botText = replies[Math.floor(Math.random() * replies.length)];
          const bNow = new Date();
          const bTime = `${String(bNow.getHours()).padStart(2, '0')}:${String(bNow.getMinutes()).padStart(2, '0')}`;
          const botMsg = {
            senderId: randomBot.id,
            senderName: randomBot.name,
            title: randomBot.title || 'shark',
            token: getTokenEmoji(randomBot.token),
            color: randomBot.color,
            bg: 'default',
            text: botText,
            time: bTime
          };
          this.receiveChatMessage(botMsg);
        }, 1200 + Math.random() * 1000);
      }
    }
  }

  receiveChatMessage(msg) {
    if (!msg || !msg.text) return;
    const isMe = String(msg.senderId) === String(profileManager.profile.id);
    this.renderChatMessage(msg, isMe);

    if (!isMe) {
      sound.playCard();
      const chatPane = document.getElementById('tab-content-chat');
      const isChatOpen = chatPane && chatPane.classList.contains('active');
      if (!isChatOpen) {
        const badge = document.getElementById('chat-unread-badge');
        if (badge) badge.style.display = 'block';
        ui.showToast(`💬 ${msg.senderName}: ${msg.text}`);
      }
    }
  }

  renderChatMessage(msg, isMe) {
    const container = document.getElementById('game-chat-messages');
    if (!container) return;

    const wrap = document.createElement('div');
    wrap.className = `chat-bubble-wrap ${isMe ? 'me' : 'other'}`;

    wrap.innerHTML = `
      <div class="chat-sender-row" style="${isMe ? 'justify-content: flex-end;' : ''}">
        <span style="font-size: 0.9rem;">${getTokenEmoji(msg.token)}</span>
        <span class="chat-sender-name" style="color: ${msg.nameColor || msg.color || 'var(--md-primary)'};">${isMe ? 'Вы' : (msg.senderName || 'Игрок')}</span>
        ${msg.title ? formatTitleBadge(msg.title) : ''}
        <span class="chat-time">${msg.time || ''}</span>
      </div>
      <div class="chat-bubble">
        ${this.escapeHtml(msg.text)}
      </div>
    `;

    container.appendChild(wrap);
    container.scrollTop = container.scrollHeight;
  }

  escapeHtml(str) {
    return (str || '').replace(/[&<>"']/g, (m) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[m]));
  }

  openTradeHistoryModal() {
    ui.renderTradeHistoryModal(engine.tradeHistory || []);
    const modal = document.getElementById('modal-trade-history');
    if (modal) modal.classList.add('active');
  }

  setupLeaderboardTabs() {
    const setup = (tabsContainerId, listId) => {
      const container = document.getElementById(tabsContainerId);
      if (!container) return;
      container.querySelectorAll('.lb-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          sound.playClick();
          container.querySelectorAll('.lb-tab').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          const sortBy = tab.getAttribute('data-sort');
          this.renderLeaderboard(sortBy, listId);
        });
      });
    };
    setup('inline-leaderboard-tabs', 'inline-leaderboard-list');
    setup('modal-leaderboard-tabs', 'modal-leaderboard-list');
  }

  renderLeaderboard(sortBy = 'wins', containerId = 'inline-leaderboard-list') {
    const container = document.getElementById(containerId);
    if (!container) return;

    const list = leaderboardManager.getRankings(sortBy);

    let html = list.map(p => {
      let scoreText = '';
      if (sortBy === 'cash') {
        scoreText = `$${(p.netWorth || 0).toLocaleString('ru-RU')}`;
      } else if (sortBy === 'winrate') {
        scoreText = `${p.winRate}%`;
      } else if (sortBy === 'games' || sortBy === 'matches') {
        scoreText = `${p.games} ${this.getPlural(p.games, ['матч', 'матча', 'матчей'])}`;
      } else {
        scoreText = `${p.wins} ${this.getPlural(p.wins, ['победа', 'победы', 'побед'])}`;
      }

      const rankBadge = p.rank === 1 ? '🥇' : (p.rank === 2 ? '🥈' : (p.rank === 3 ? '🥉' : p.rank));
      const rankClass = p.rank <= 3 ? `rank-${p.rank}` : '';

      // Always show game pawn/token (not Discord avatar — Discord badge shows next to name)
      const tokenHtml = p.avatarUrl
        ? `<img src="${p.avatarUrl}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" />`
        : renderTokenHTML(p.token, p.customToken);

      return `
        <div class="leaderboard-item ${p.isMe ? 'is-me' : ''}" data-player-id="${p.id}" style="cursor: pointer;" title="Нажмите, чтобы просмотреть профиль игрока">
          <div class="lb-left">
            <span class="lb-rank ${rankClass}">${rankBadge}</span>
            <span class="lb-token" style="display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 50%; overflow: hidden; background: rgba(255,255,255,0.06); flex-shrink: 0;">
              ${tokenHtml}
            </span>
            <div class="lb-info">
              <div class="lb-name">
                <span style="color: ${p.nameColor || p.color || 'var(--md-on-surface, #ffffff)'}; font-weight: 600;">${p.name}</span>
                ${p.isRegistered ? `
                  <span class="lb-discord-badge" title="Подтверждённый аккаунт Discord">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="#5865F2"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.078.078 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>
                  </span>
                ` : ''}
                ${p.isMe ? '<span class="lb-me-tag">Вы</span>' : ''}
              </div>
              <div class="lb-sub">${p.games} ${this.getPlural(p.games, ['матч', 'матча', 'матчей'])} • ${p.winRate}% побед</div>
            </div>
          </div>
          <div class="lb-score">${scoreText}</div>
        </div>
      `;
    }).join('');

    if (list.length === 0) {
      html += `
        <div class="lb-empty-notice">
          <i class="ph ph-trophy"></i>
          <span>Сыграйте партию, чтобы занять первое место в топе!</span>
        </div>
      `;
    }

    container.innerHTML = html;

    container.querySelectorAll('.btn-trigger-discord-auth').forEach(btn => {
      btn.addEventListener('click', () => this.openDiscordAuthModal());
    });

    container.querySelectorAll('.leaderboard-item').forEach(item => {
      item.addEventListener('click', () => {
        const pid = item.getAttribute('data-player-id');
        const target = list.find(x => String(x.id) === String(pid));
        if (target) {
          this.showPlayerProfileModal(target);
        }
      });
    });
  }

  openLeaderboardModal(sortBy = 'wins') {
    this.renderLeaderboard(sortBy, 'modal-leaderboard-list');
    const modal = document.getElementById('modal-leaderboard');
    if (modal) modal.classList.add('active');
  }

  openShopModal() {
    sound.playClick();
    this.renderShopModal();
    const modal = document.getElementById('modal-shop');
    if (modal) modal.classList.add('active');
  }

  initShopTabs() {
    const tabDice = document.getElementById('btn-shop-tab-dice');
    const tabTitles = document.getElementById('btn-shop-tab-titles');
    const paneDice = document.getElementById('shop-tab-pane-dice');
    const paneTitles = document.getElementById('shop-tab-pane-titles');

    tabDice?.addEventListener('click', () => {
      sound.playClick();
      tabDice.classList.add('active');
      tabTitles?.classList.remove('active');
      if (paneDice) paneDice.style.display = 'block';
      if (paneTitles) paneTitles.style.display = 'none';
    });

    tabTitles?.addEventListener('click', () => {
      sound.playClick();
      tabTitles.classList.add('active');
      tabDice?.classList.remove('active');
      if (paneDice) paneDice.style.display = 'none';
      if (paneTitles) paneTitles.style.display = 'block';
      this.renderShopTitles();
    });

    // Titles Filter Buttons Bar
    const filterBtns = document.querySelectorAll('#shop-titles-filter-bar .shop-filter-btn');
    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        sound.playClick();
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentTitleFilter = btn.getAttribute('data-filter') || 'all';
        this.renderShopTitles();
      });
    });
  }

  renderShopModal() {
    const coins = profileManager.profile.coins || 0;
    const balanceVal = document.getElementById('shop-balance-val');
    if (balanceVal) {
      balanceVal.innerText = coins.toLocaleString('ru-RU');
    }

    const openBtn = document.getElementById('btn-open-dice-case');
    if (openBtn) {
      openBtn.disabled = coins < CASE_PRICE;
      openBtn.onclick = () => this.openDiceCase();
    }

    const unlocked = profileManager.profile.unlockedDice || ['classic'];
    const currentSkin = profileManager.profile.diceSkin || 'classic';

    const countLabel = document.getElementById('shop-dice-count-label');
    if (countLabel) {
      countLabel.innerText = `${unlocked.length} / ${DICE_SKINS.length} открыто`;
    }

    const grid = document.getElementById('shop-dice-grid');
    if (grid) {
      grid.innerHTML = DICE_SKINS.map(skin => {
        const isUnlocked = unlocked.includes(skin.id);
        const isEquipped = currentSkin === skin.id;

        return `
          <div class="shop-dice-card ${isEquipped ? 'equipped' : ''} ${!isUnlocked ? 'locked' : ''}">
            <div class="shop-dice-preview" style="display: flex; justify-content: center; align-items: center; min-height: 70px;">
              ${create2DDiceHTML(skin.id, 6, 'preview')}
            </div>
            <div class="shop-dice-name" title="${skin.name}">${skin.name}</div>
            <div class="shop-dice-rarity" style="color: ${skin.rarityColor};">
              ${skin.rarityName}
            </div>
            ${isEquipped ? `
              <button class="shop-dice-btn" style="background: rgba(34, 197, 94, 0.2); color: #22c55e; border: 1px solid #22c55e; cursor: default;">
                 ✓ Надет
              </button>
            ` : isUnlocked ? `
              <button class="shop-dice-btn btn-equip-dice" data-skin-id="${skin.id}" style="background: var(--md-primary); color: var(--md-on-primary);">
                Надеть
              </button>
            ` : `
              <button class="shop-dice-btn" style="background: rgba(255,255,255,0.06); color: var(--md-on-surface-variant); cursor: not-allowed;" disabled>
                🔒 В кейсе
              </button>
            `}
          </div>
        `;
      }).join('');

      grid.querySelectorAll('.btn-equip-dice').forEach(btn => {
        btn.addEventListener('click', () => {
          sound.playClick();
          const skinId = btn.getAttribute('data-skin-id');
          profileManager.equipDiceSkin(skinId);
          this.renderShopModal();
          ui.showToast(`Вы надели скин кубиков: ${getDiceSkin(skinId).name}`);

          if (network && network.channel) {
            this.broadcastAction('PLAYER_PROFILE_UPDATED', {
              playerId: profileManager.profile.id,
              diceSkin: skinId,
              coins: profileManager.profile.coins || 0
            });
          }
        });
      });
    }

    this.renderShopTitles();
  }

  renderShopTitles() {
    const coins = profileManager.profile.coins || 0;
    const stats = profileManager.profile.stats || {};
    const unlocked = profileManager.profile.unlockedTitles || ['novice'];
    const currentTitle = profileManager.profile.title || 'novice';
    const activeFilter = this.currentTitleFilter || 'all';

    const countLabel = document.getElementById('shop-titles-count-label');
    if (countLabel) {
      countLabel.innerText = `${unlocked.length} / ${TITLES.length} открыто`;
    }

    const grid = document.getElementById('shop-titles-grid');
    if (!grid) return;

    // Synchronize filter buttons active state
    const filterBtns = document.querySelectorAll('#shop-titles-filter-bar .shop-filter-btn');
    filterBtns.forEach(btn => {
      if (btn.getAttribute('data-filter') === activeFilter) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    let displayList = [...TITLES];

    if (activeFilter === 'unlocked') {
      displayList = displayList.filter(t => unlocked.includes(t.id));
    } else if (activeFilter === 'locked') {
      displayList = displayList.filter(t => !unlocked.includes(t.id));
    } else if (activeFilter === 'nearest') {
      // Locked items sorted by highest progress ratio descending
      displayList = displayList.filter(t => !unlocked.includes(t.id));
      displayList.sort((a, b) => {
        const ratioA = getTitleProgressRatio(a, stats, coins);
        const ratioB = getTitleProgressRatio(b, stats, coins);
        if (ratioB !== ratioA) return ratioB - ratioA;
        if (a.hasCondition && !b.hasCondition) return -1;
        if (!a.hasCondition && b.hasCondition) return 1;
        return (a.price || 0) - (b.price || 0);
      });
    }

    if (displayList.length === 0) {
      let emptyMsg = 'В этой категории пока нет титулов';
      if (activeFilter === 'unlocked') {
        emptyMsg = 'Вы пока не открыли дополнительные титулы. Выполняйте достижения или приобретайте титулы в магазине!';
      } else if (activeFilter === 'locked' || activeFilter === 'nearest') {
        emptyMsg = '🎉 Поздравляем! Вы разблокировали все доступные титулы в этой категории!';
      }
      grid.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 32px 16px; text-align: center; color: var(--md-on-surface-variant); background: var(--md-surface-container-low); border-radius: 16px; border: 1px dashed var(--md-outline-variant);">
          <div style="font-size: 2rem; margin-bottom: 8px;">👑</div>
          <div style="font-size: 0.9rem; font-weight: 500;">${emptyMsg}</div>
        </div>
      `;
      return;
    }

    grid.innerHTML = displayList.map(title => {
      const isUnlocked = unlocked.includes(title.id);
      const isEquipped = currentTitle === title.id;
      const canBuy = !isUnlocked && !title.hasCondition && !title.isDevOnly && title.price > 0;
      const hasEnoughCoins = coins >= (title.price || 0);
      const progressRatio = getTitleProgressRatio(title, stats, coins);
      const progressPct = Math.round(progressRatio * 100);

      // Category badge
      let categoryBadge = '';
      if (activeFilter === 'nearest' && !isUnlocked && progressPct > 0) {
        categoryBadge = `<span style="font-size: 0.68rem; padding: 2px 7px; border-radius: 6px; background: rgba(34, 197, 94, 0.18); color: #22c55e; border: 1px solid rgba(34, 197, 94, 0.4); font-weight: 700;">🎯 ${progressPct}%</span>`;
      } else if (title.id === 'creator' || title.isDevOnly) {
        categoryBadge = '<span style="font-size: 0.68rem; padding: 2px 7px; border-radius: 6px; background: rgba(244, 63, 94, 0.18); color: #f43f5e; border: 1px solid rgba(244, 63, 94, 0.4); font-weight: 700;">🛠️ Создатель</span>';
      } else if (title.hasCondition) {
        categoryBadge = '<span style="font-size: 0.68rem; padding: 2px 7px; border-radius: 6px; background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.35); font-weight: 600;">🏆 Достижение</span>';
      } else if (title.price > 0) {
        categoryBadge = '<span style="font-size: 0.68rem; padding: 2px 7px; border-radius: 6px; background: rgba(234, 179, 8, 0.15); color: #eab308; border: 1px solid rgba(234, 179, 8, 0.35); font-weight: 600;">🛒 Магазин</span>';
      } else {
        categoryBadge = '<span style="font-size: 0.68rem; padding: 2px 7px; border-radius: 6px; background: rgba(148, 163, 184, 0.15); color: #94a3b8; border: 1px solid rgba(148, 163, 184, 0.3); font-weight: 600;">🌱 Стартовый</span>';
      }

      let progressBlockHtml = '';
      if (!isUnlocked && title.hasCondition) {
        const progressText = title.getProgress ? title.getProgress(stats) : (title.conditionText || 'За достижение');
        progressBlockHtml = `
          <div class="shop-title-progress-container">
            <div class="shop-title-progress-header">
              <span class="shop-title-progress-label">
                <span>🎯 Прогресс:</span>
                <span>${progressText}</span>
              </span>
              <span class="shop-title-progress-val ${progressPct >= 100 ? 'complete' : ''}">${progressPct}%</span>
            </div>
            <div class="shop-title-progress-bar-bg">
              <div class="shop-title-progress-bar-fill" style="width: ${progressPct}%;"></div>
            </div>
          </div>
        `;
      } else if (!isUnlocked && canBuy) {
        progressBlockHtml = `
          <div class="shop-title-progress-container" style="background: rgba(234, 179, 8, 0.05); border-color: rgba(234, 179, 8, 0.15);">
            <div class="shop-title-progress-header">
              <span class="shop-title-progress-label" style="color: #eab308;">
                <span>💰 Монеты:</span>
                <span>${coins} / ${title.price}</span>
              </span>
              <span class="shop-title-progress-val" style="color: #eab308;">${progressPct}%</span>
            </div>
            <div class="shop-title-progress-bar-bg">
              <div class="shop-title-progress-bar-fill" style="width: ${progressPct}%; background: linear-gradient(90deg, #eab308, #f59e0b); box-shadow: 0 0 8px rgba(234, 179, 8, 0.4);"></div>
            </div>
          </div>
        `;
      }

      // Action button
      let actionBtnHtml = '';
      if (isEquipped) {
        actionBtnHtml = `
          <button class="shop-dice-btn" style="background: rgba(34, 197, 94, 0.2); color: #22c55e; border: 1px solid #22c55e; cursor: default;">
            ✓ Надет
          </button>
        `;
      } else if (isUnlocked) {
        actionBtnHtml = `
          <button class="shop-dice-btn btn-equip-title" data-title-id="${title.id}" style="background: var(--md-primary); color: var(--md-on-primary);">
            Надеть
          </button>
        `;
      } else if (title.id === 'creator' || title.isDevOnly) {
        actionBtnHtml = `
          <button class="shop-dice-btn btn-activate-creator" style="background: linear-gradient(135deg, rgba(244, 63, 94, 0.25), rgba(126, 34, 206, 0.25)); color: #f43f5e; border: 1px solid #f43f5e; font-weight: 700; cursor: pointer;">
            🛠️ Активировать
          </button>
        `;
      } else if (title.hasCondition) {
        actionBtnHtml = `
          <button class="shop-dice-btn" style="background: rgba(255,255,255,0.04); color: var(--md-on-surface-variant); border: 1px dashed rgba(255,255,255,0.18); cursor: not-allowed; font-size: 0.78rem;" disabled title="${title.description}">
            🔒 Требуется условие
          </button>
        `;
      } else if (canBuy) {
        actionBtnHtml = `
          <button class="shop-dice-btn btn-buy-title" data-title-id="${title.id}" data-price="${title.price}" style="background: ${hasEnoughCoins ? '#eab308' : 'rgba(255,255,255,0.06)'}; color: ${hasEnoughCoins ? '#000000' : 'var(--md-on-surface-variant)'}; font-weight: 700;" ${hasEnoughCoins ? '' : 'disabled'}>
            Купить за ${title.price} монет
          </button>
        `;
      } else {
        actionBtnHtml = `
          <button class="shop-dice-btn" style="background: rgba(255,255,255,0.06); color: var(--md-on-surface-variant); cursor: not-allowed;" disabled>
            🔒 Недоступно
          </button>
        `;
      }

      return `
        <div class="shop-title-card ${isEquipped ? 'equipped' : ''} ${!isUnlocked ? 'locked' : ''}">
          <div class="shop-title-header">
            <div class="shop-title-top-row">
              <div class="shop-title-name" style="color: ${title.color};" title="${title.name}">
                <span>${title.icon} ${title.name}</span>
              </div>
              ${categoryBadge}
            </div>
            <div class="shop-title-badge-row">
              <div class="shop-title-desc">${title.description}</div>
              <div class="shop-title-badge-preview">${formatTitleBadge(title.id)}</div>
            </div>
          </div>
          ${progressBlockHtml}
          <div class="shop-title-actions">
            ${actionBtnHtml}
          </div>
        </div>
      `;
    }).join('');

    grid.querySelectorAll('.btn-equip-title').forEach(btn => {
      btn.addEventListener('click', () => {
        sound.playClick();
        const titleId = btn.getAttribute('data-title-id');
        profileManager.equipTitle(titleId);
        this.renderShopTitles();
        this.renderProfileCard();
        ui.showToast(`Вы надели титул: ${getTitleById(titleId).tag}`);

        if (network && network.channel) {
          this.broadcastAction('PLAYER_PROFILE_UPDATED', {
            playerId: profileManager.profile.id,
            title: titleId,
            coins: profileManager.profile.coins || 0
          });
        }
      });
    });

    grid.querySelectorAll('.btn-activate-creator').forEach(btn => {
      btn.addEventListener('click', () => {
        profileManager.grantCreatorTitle();
        sound.playCash();
        this.renderShopTitles();
        this.renderProfileCard();
        this.renderLeaderboard();
        ui.showToast('🎉 Титул Создателя успешно активирован и надет!');

        if (network && network.channel) {
          this.broadcastAction('PLAYER_PROFILE_UPDATED', {
            playerId: profileManager.profile.id,
            title: 'creator',
            coins: profileManager.profile.coins || 0
          });
        }
      });
    });

    grid.querySelectorAll('.btn-buy-title').forEach(btn => {
      btn.addEventListener('click', () => {
        const titleId = btn.getAttribute('data-title-id');
        const price = parseInt(btn.getAttribute('data-price')) || 0;
        if (profileManager.buyTitle(titleId)) {
          sound.playCash();
          profileManager.equipTitle(titleId);
          this.renderShopModal();
          this.renderShopTitles();
          this.renderProfileCard();
          this.renderLeaderboard();
          ui.showToast(`🎉 Вы приобрели и надели титул: ${getTitleById(titleId).tag}!`);

          if (network && network.channel) {
            this.broadcastAction('PLAYER_PROFILE_UPDATED', {
              playerId: profileManager.profile.id,
              title: titleId,
              coins: profileManager.profile.coins || 0
            });
          }
        } else {
          ui.showToast('Недостаточно монет для покупки титула');
        }
      });
    });
  }

  openDiceCase() {
    const coins = profileManager.profile.coins || 0;
    if (coins < CASE_PRICE) {
      ui.showToast(`Недостаточно монет! Требуется ${CASE_PRICE} монет, у вас ${coins} монет`);
      return;
    }

    sound.playClick();
    profileManager.spendCoins(CASE_PRICE);
    this.renderProfileCard();
    this.renderLeaderboard();

    // Roll winning skin
    const wonSkin = rollDiceSkinFromCase();
    const unlocked = profileManager.profile.unlockedDice || ['classic'];
    const isDuplicate = unlocked.includes(wonSkin.id);

    if (isDuplicate) {
      profileManager.addCoins(DUPLICATE_COINS_REFUND);
    } else {
      profileManager.unlockDiceSkin(wonSkin.id);
    }

    // Prepare roulette modal
    const rouletteModal = document.getElementById('modal-case-roulette');
    const spinContainer = document.getElementById('roulette-spin-container');
    const winContainer = document.getElementById('roulette-win-container');
    const track = document.getElementById('roulette-track');

    if (!rouletteModal || !spinContainer || !winContainer || !track) return;

    spinContainer.style.display = 'block';
    winContainer.style.display = 'none';
    rouletteModal.classList.add('active');

    // Build roulette items (32 items, item index 26 is the winner)
    const WIN_INDEX = 26;
    const rouletteItems = [];
    for (let i = 0; i < 32; i++) {
      if (i === WIN_INDEX) {
        rouletteItems.push(wonSkin);
      } else {
        const randSkin = CASE_DROPPABLE_SKINS[Math.floor(Math.random() * CASE_DROPPABLE_SKINS.length)];
        rouletteItems.push(randSkin);
      }
    }

    track.innerHTML = rouletteItems.map(item => `
      <div class="roulette-item" style="border-color: ${item.rarityColor};">
        <div style="display: flex; justify-content: center; margin-bottom: 6px;">
          ${create2DDiceHTML(item.id, 6, 'mini')}
        </div>
        <div style="font-size: 0.65rem; font-weight: 700; color: ${item.rarityColor}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 78px;">
          ${item.name}
        </div>
      </div>
    `).join('');

    track.style.transition = 'none';
    track.style.transform = 'translateX(0px)';

    const itemWidth = 100;
    const viewportWidth = track.parentElement?.offsetWidth || 440;
    const targetOffset = -(WIN_INDEX * itemWidth) + (viewportWidth / 2) - 50;
    const jitter = Math.floor(Math.random() * 30) - 15;
    const finalTransform = targetOffset + jitter;

    // Trigger roulette spin with smooth deceleration
    setTimeout(() => {
      track.style.transition = 'transform 4.5s cubic-bezier(0.12, 0.8, 0.33, 1)';
      track.style.transform = `translateX(${finalTransform}px)`;

      // Play tick sounds during spin
      let tickCount = 0;
      const tickTimer = setInterval(() => {
        sound.playClick();
        tickCount++;
        if (tickCount >= 22) clearInterval(tickTimer);
      }, 180);

      // On animation complete
      setTimeout(() => {
        sound.playWin();
        spinContainer.style.display = 'none';
        winContainer.style.display = 'block';

        const winDie = document.getElementById('roulette-win-die');
        const winName = document.getElementById('roulette-win-name');
        const winRarity = document.getElementById('roulette-win-rarity');
        const winDesc = document.getElementById('roulette-win-desc');
        const dupNotice = document.getElementById('roulette-duplicate-notice');

        if (winDie) {
          winDie.innerHTML = create2DDiceHTML(wonSkin.id, 6, 'preview');
        }

        if (winName) {
          winName.innerText = wonSkin.name;
          winName.style.color = wonSkin.rarityColor;
        }

        if (winRarity) {
          winRarity.innerText = `${wonSkin.rarityName} скин кубиков`;
          winRarity.style.color = wonSkin.rarityColor;
        }

        if (winDesc) {
          winDesc.innerText = wonSkin.desc;
        }

        if (dupNotice) {
          dupNotice.style.display = isDuplicate ? 'block' : 'none';
        }

        const equipBtn = document.getElementById('btn-equip-won-dice');
        if (equipBtn) {
          equipBtn.onclick = () => {
            sound.playClick();
            profileManager.equipDiceSkin(wonSkin.id);
            rouletteModal.classList.remove('active');
            this.renderShopModal();
            ui.showToast(`Скин кубиков «${wonSkin.name}» надет!`);
          };
        }

        const closeBtn = document.getElementById('btn-close-roulette');
        if (closeBtn) {
          closeBtn.onclick = () => {
            sound.playClick();
            rouletteModal.classList.remove('active');
            this.renderShopModal();
          };
        }

        this.renderShopModal();
        this.renderProfileCard();
      }, 4800);
    }, 100);
  }

  openChangelogModal() {
    sound.playClick();
    const modal = document.getElementById('modal-changelog');
    if (modal) modal.classList.add('active');
  }

  // --- ADMIN PANEL & COIN MANAGEMENT (DEVELOPER ONLY) ---
  initAdminListeners() {
    document.getElementById('btn-open-admin')?.addEventListener('click', () => {
      this.openAdminModal();
    });

    document.getElementById('btn-admin-create-test-room')?.addEventListener('click', () => {
      if (!profileManager.isDev()) return;
      document.getElementById('modal-admin-panel')?.classList.remove('active');
      this.createTestRoom();
    });

    // Quick Add chips
    document.querySelectorAll('.btn-admin-quick-add').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!profileManager.isDev()) return;
        const amount = parseInt(btn.getAttribute('data-amount')) || 0;
        if (amount > 0) {
          profileManager.addCoins(amount);
          sound.playCash();
          this.renderProfileCard();
          this.renderAdminModal();
          this.renderLeaderboard();
          ui.showToast(`Выдано +${amount} монет`);
        }
      });
    });

    // Quick Sub chips
    document.querySelectorAll('.btn-admin-quick-sub').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!profileManager.isDev()) return;
        const amount = parseInt(btn.getAttribute('data-amount')) || 0;
        if (amount > 0) {
          profileManager.removeCoins(amount);
          sound.playClick();
          this.renderProfileCard();
          this.renderAdminModal();
          this.renderLeaderboard();
          ui.showToast(`Списано -${amount} монет`);
        }
      });
    });

    // Quick Reset
    document.querySelector('.btn-admin-quick-reset')?.addEventListener('click', () => {
      if (!profileManager.isDev()) return;
      profileManager.setCoins(0);
      sound.playClick();
      this.renderProfileCard();
      this.renderAdminModal();
      this.renderLeaderboard();
      ui.showToast('Баланс обнулён');
    });

    // Manual Set Form
    document.getElementById('form-admin-set-my-coins')?.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!profileManager.isDev()) return;
      const input = document.getElementById('input-admin-my-coins');
      if (input) {
        const val = parseInt(input.value) || 0;
        profileManager.setCoins(val);
        sound.playCash();
        input.value = '';
        this.renderProfileCard();
        this.renderAdminModal();
        this.renderLeaderboard();
        ui.showToast(`Баланс установлен: ${val} монет`);
      }
    });

    // Give to Target Player
    document.getElementById('btn-admin-give-player')?.addEventListener('click', () => {
      this.handleAdminPlayerCoinAdjustment(true);
    });

    // Take from Target Player
    document.getElementById('btn-admin-take-player')?.addEventListener('click', () => {
      this.handleAdminPlayerCoinAdjustment(false);
    });

    // Grant Creator Title
    document.getElementById('btn-admin-grant-creator-title')?.addEventListener('click', () => {
      profileManager.grantCreatorTitle();
      sound.playWin();
      this.renderProfileCard();
      this.renderShopTitles();
      this.renderLeaderboard();
      ui.showToast('🛠️ Титул Создателя успешно выдан и надет!');
    });

    // Unlock all titles
    document.getElementById('btn-admin-unlock-all-titles')?.addEventListener('click', () => {
      if (!profileManager.isDev()) return;
      sound.playWin();
      TITLES.forEach(t => profileManager.unlockTitle(t.id));
      this.renderProfileCard();
      this.renderShopTitles();
      this.renderLeaderboard();
      ui.showToast('👑 Все титулы успешно разблокированы!');
    });

    // Unlock all dice skins
    document.getElementById('btn-admin-unlock-all-dice')?.addEventListener('click', () => {
      if (!profileManager.isDev()) return;
      sound.playWin();
      DICE_SKINS.forEach(s => profileManager.unlockDiceSkin(s.id));
      this.renderShopModal();
      ui.showToast('🎉 Все 8 скинов кубиков успешно разблокированы!');
    });

    // Hard Refresh & Clear Cache button in Admin Modal (for all players)
    document.getElementById('btn-admin-hard-refresh')?.addEventListener('click', () => {
      this.forceSiteRefreshForAll();
    });
  }

  async forceSiteRefresh() {
    sound.playClick();
    ui.showToast('🔄 Очистка кэша и обновление сайта...');

    const btn = document.getElementById('btn-refresh-site');
    if (btn) btn.classList.add('refresh-spinning');

    try {
      if (typeof window !== 'undefined') {
        if ('caches' in window) {
          const cacheKeys = await caches.keys();
          await Promise.all(cacheKeys.map(k => caches.delete(k)));
        }
        if ('serviceWorker' in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          for (let reg of registrations) {
            await reg.unregister();
          }
        }
      }
    } catch (e) {
      console.warn('Cache clear error:', e);
    }

    setTimeout(() => {
      try {
        const url = new URL(window.location.href);
        url.searchParams.set('_v', Date.now().toString());
        window.location.href = url.toString();
      } catch (err) {
        window.location.reload();
      }
    }, 450);
  }

  async forceSiteRefreshForAll() {
    sound.playClick();
    ui.showToast('🚀 Отправка команды перезапуска всем игрокам...');

    const btn = document.getElementById('btn-global-refresh-all');
    if (btn) btn.classList.add('refresh-spinning');

    try {
      if (network) {
        network.sendBroadcast('GLOBAL_FORCE_REFRESH', {
          senderName: profileManager.profile.name,
          timestamp: Date.now()
        });
      }
    } catch (err) {
      console.warn('Refresh broadcast error:', err);
    }

    setTimeout(() => {
      this.forceSiteRefresh();
    }, 450);
  }

  openAdminModal() {
    if (!profileManager.isDev()) {
      ui.showToast('Доступ запрещен');
      return;
    }
    sound.playClick();
    this.renderAdminModal();
    const modal = document.getElementById('modal-admin-panel');
    if (modal) modal.classList.add('active');
  }

  renderAdminModal() {
    const p = profileManager.profile;
    const coinsDisplay = document.getElementById('admin-my-coins-display');
    if (coinsDisplay) {
      coinsDisplay.innerText = `${(p.coins || 0).toLocaleString('ru-RU')} монет`;
    }

    const select = document.getElementById('select-admin-target-player');
    if (!select) return;

    // Collect distinct players: self, lobby players, game players, leaderboard records
    const playerMap = new Map();
    // 1. Self
    playerMap.set(String(p.id), { id: p.id, name: p.name, coins: p.coins || 0, isMe: true });

    // 2. Lobby players
    if (Array.isArray(this.lobbyPlayers)) {
      this.lobbyPlayers.forEach(lp => {
        if (lp && lp.id) {
          playerMap.set(String(lp.id), { id: lp.id, name: lp.name, coins: lp.coins || 0, isMe: String(lp.id) === String(p.id) });
        }
      });
    }

    // 3. Engine game players
    if (engine && Array.isArray(engine.players)) {
      engine.players.forEach(gp => {
        if (gp && gp.id) {
          const prev = playerMap.get(String(gp.id));
          playerMap.set(String(gp.id), { id: gp.id, name: gp.name, coins: typeof gp.coins === 'number' ? gp.coins : (prev?.coins || 0), isMe: String(gp.id) === String(p.id) });
        }
      });
    }

    // 4. Leaderboard records
    if (leaderboardManager && Array.isArray(leaderboardManager.records)) {
      leaderboardManager.records.forEach(lr => {
        if (lr && lr.id && !playerMap.has(String(lr.id))) {
          playerMap.set(String(lr.id), { id: lr.id, name: lr.name, coins: lr.coins || 0, isMe: String(lr.id) === String(p.id) });
        }
      });
    }

    const currentSelected = select.value;
    select.innerHTML = Array.from(playerMap.values()).map(pl => {
      const label = pl.isMe ? `[Вы] ${pl.name} (${(pl.coins || 0)} монет)` : `${pl.name} (${(pl.coins || 0)} монет) — ID: ${String(pl.id).substring(0, 10)}`;
      return `<option value="${pl.id}">${label}</option>`;
    }).join('');

    if (currentSelected && playerMap.has(String(currentSelected))) {
      select.value = currentSelected;
    }
  }

  handleAdminPlayerCoinAdjustment(isGive) {
    if (!profileManager.isDev()) return;
    const select = document.getElementById('select-admin-target-player');
    const input = document.getElementById('input-admin-target-amount');
    if (!select || !input) return;

    const targetId = select.value;
    const amount = parseInt(input.value) || 0;
    if (amount <= 0) {
      ui.showToast('Укажите корректную сумму монет');
      return;
    }

    const myId = profileManager.profile.id;
    const isMe = String(targetId) === String(myId);

    if (isMe) {
      if (isGive) {
        profileManager.addCoins(amount);
        sound.playCash();
        ui.showToast(`Выдано себе: +${amount} монет`);
      } else {
        profileManager.removeCoins(amount);
        sound.playClick();
        ui.showToast(`Списано у себя: -${amount} монет`);
      }
      this.renderProfileCard();
      this.renderAdminModal();
      this.renderLeaderboard();
      return;
    }

    // Remote / other player target
    // Update local lobby if player is there
    const lobbyTarget = this.lobbyPlayers.find(lp => String(lp.id) === String(targetId));
    if (lobbyTarget) {
      lobbyTarget.coins = isGive ? (lobbyTarget.coins || 0) + amount : Math.max(0, (lobbyTarget.coins || 0) - amount);
      this.renderLobbyPlayers();
    }

    // Update in engine players if in active game
    if (engine && Array.isArray(engine.players)) {
      const gp = engine.players.find(x => String(x.id) === String(targetId));
      if (gp) {
        gp.coins = isGive ? (gp.coins || 0) + amount : Math.max(0, (gp.coins || 0) - amount);
      }
    }

    // Update leaderboard record if registered
    if (leaderboardManager) {
      const rec = leaderboardManager.records.find(r => String(r.id) === String(targetId));
      if (rec) {
        rec.coins = isGive ? (rec.coins || 0) + amount : Math.max(0, (rec.coins || 0) - amount);
        leaderboardManager.saveRecords();
        this.renderLeaderboard();
      }
    }

    // Broadcast Realtime packet to recipient
    this.broadcastAction('ADMIN_COIN_GRANT', {
      targetPlayerId: targetId,
      actionType: isGive ? 'give' : 'take',
      amount: amount
    });

    sound.playCash();
    ui.showToast(`👑 ${isGive ? 'Выдано' : 'Списано'} ${amount} монет игроку (ID: ${targetId})`);
    this.renderAdminModal();
  }

  // --- CUSTOM LOBBY TILES ---
  openCustomTilesModal() {
    const modal = document.getElementById('modal-custom-tiles');
    if (!modal) return;
    this.renderCustomTilesEditor();
    modal.classList.add('active');
  }

  renderCustomTilesEditor() {
    const container = document.getElementById('custom-tiles-editor-list');
    if (!container) return;

    const myId = profileManager.profile.id;
    const myName = profileManager.profile.name;
    const myColor = profileManager.profile.color || '#38bdf8';

    // Editable tile types (streets, stations, utilities)
    const editableTiles = BOARD_TILES.filter(t => ['street', 'station', 'utility'].includes(t.type));
    const mapThemeId = this.customSettings.mapTheme || 'classic';

    container.innerHTML = editableTiles.map(tile => {
      const themed = getThemedTileData(tile, mapThemeId, {});
      const override = this.customTiles[tile.id] || {};
      const authorName = override.authorName || '';
      const authorColor = override.authorColor || '#94a3b8';
      const currentIcon = override.icon !== undefined ? override.icon : (themed.icon || '');
      const currentName = override.name || '';
      const currentDesc = override.desc || '';
      const hasEdit = !!(override.name || override.desc || override.icon);
      const groupColor = COLOR_GROUPS[tile.group]?.color || '#94a3b8';

      return `
        <div class="ct-tile-row" data-tile-id="${tile.id}">
          <div class="ct-tile-info">
            <div class="color-dot" style="background-color: ${groupColor}; width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;"></div>
            <div style="min-width: 0;">
              <div class="ct-tile-orig-name">${themed.name}</div>
              ${hasEdit && authorName ? `<div class="ct-tile-author" style="color: ${authorColor};">✏️ ${authorName}</div>` : ''}
            </div>
          </div>
          <input
            class="ct-input ct-icon-input"
            type="text"
            placeholder="🏠"
            maxlength="4"
            value="${currentIcon.replace(/"/g, '&quot;')}"
            data-tile-id="${tile.id}"
            title="Иконка или эмодзи"
          />
          <input
            class="ct-input ct-name-input"
            type="text"
            placeholder="Своё название..."
            maxlength="32"
            value="${currentName.replace(/"/g, '&quot;')}"
            data-tile-id="${tile.id}"
          />
          <input
            class="ct-input ct-desc-input"
            type="text"
            placeholder="Описание..."
            maxlength="60"
            value="${currentDesc.replace(/"/g, '&quot;')}"
            data-tile-id="${tile.id}"
          />
          ${hasEdit ? `<button class="ct-clear-btn" data-tile-id="${tile.id}" title="Сбросить">✕</button>` : '<div></div>'}
        </div>
      `;
    }).join('');

    // Live save on input change
    container.querySelectorAll('.ct-icon-input, .ct-name-input, .ct-desc-input').forEach(input => {
      input.addEventListener('input', () => {
        const tileId = parseInt(input.getAttribute('data-tile-id'));
        const row = container.querySelector(`.ct-tile-row[data-tile-id="${tileId}"]`);
        const iconVal = row.querySelector('.ct-icon-input')?.value.trim() || '';
        const nameVal = row.querySelector('.ct-name-input')?.value.trim() || '';
        const descVal = row.querySelector('.ct-desc-input')?.value.trim() || '';

        if (nameVal || descVal || iconVal) {
          this.customTiles[tileId] = {
            name: nameVal,
            icon: iconVal,
            desc: descVal,
            authorId: myId,
            authorName: myName,
            authorColor: myColor
          };
        } else {
          delete this.customTiles[tileId];
        }

        // Broadcast to party members
        this.broadcastAction('LOBBY_TILE_UPDATE', {
          tileId,
          name: nameVal,
          icon: iconVal,
          desc: descVal,
          authorId: myId,
          authorName: myName,
          authorColor: myColor
        });

        this.broadcastLobbySettings();
        this.renderCustomTilesPreview();
        ui.setCustomTiles(this.customTiles);
      });
    });

    // Clear button
    container.querySelectorAll('.ct-clear-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tileId = parseInt(btn.getAttribute('data-tile-id'));
        delete this.customTiles[tileId];
        this.broadcastLobbySettings();
        this.renderCustomTilesEditor();
        this.renderCustomTilesPreview();
        ui.setCustomTiles(this.customTiles);
      });
    });
  }

  renderCustomTilesPreview() {
    const count = Object.keys(this.customTiles || {}).length;
    const badge = document.getElementById('custom-tiles-badge-count');
    const statusText = document.getElementById('custom-tiles-status-text');
    const preview = document.getElementById('custom-tiles-lobby-preview');

    if (badge) {
      badge.innerText = count;
      badge.style.display = count > 0 ? 'inline-block' : 'none';
    }
    if (statusText) {
      if (count > 0) {
        statusText.innerHTML = `<span style="color: #38bdf8; font-weight: 700;">Настроено клеток для партии: ${count}</span>`;
      } else {
        statusText.innerText = 'Стандартные клетки (нажмите чтобы настроить)';
      }
    }
    if (preview) {
      if (count === 0) {
        preview.style.display = 'none';
      } else {
        preview.style.display = 'flex';
        preview.innerHTML = `<span style="color:var(--md-on-surface-variant);font-size:0.78rem;">✏️ Своих клеток для этой партии: <b style="color:var(--md-primary);">${count}</b></span>`;
      }
    }
  }

  applyCityMapTheme(query) {
    if (!query) return;
    sound.playClick();
    const generated = generateThematicTiles(query);
    const count = Object.keys(generated).length;
    if (count === 0) {
      ui.showToast('Не удалось сгенерировать улицы для этой темы');
      return;
    }

    const myId = profileManager.profile.id;
    const myName = profileManager.profile.name;
    const myColor = profileManager.profile.color || '#38bdf8';

    Object.entries(generated).forEach(([tileIdStr, data]) => {
      const tileId = parseInt(tileIdStr);
      this.customTiles[tileId] = {
        name: data.name,
        icon: data.icon || '',
        desc: data.desc || '',
        authorId: myId,
        authorName: myName,
        authorColor: myColor
      };
    });

    this.broadcastLobbySettings();
    this.renderCustomTilesEditor();
    this.renderCustomTilesPreview();
    ui.setCustomTiles(this.customTiles);

    if (this.currentScreen === 'game') {
      ui.update(engine.getState(), profileManager.profile.id);
    }

    ui.showToast(`✨ Карта «${query}» успешно создана (${count} клеток)!`);
  }

  // --- MATCH HISTORY ---
  openMatchHistoryModal(filter = 'all') {
    const modal = document.getElementById('modal-match-history');
    if (!modal) return;

    // Tab clicks
    modal.querySelectorAll('.mh-tab').forEach(t => {
      t.onclick = () => {
        sound.playClick();
        const f = t.getAttribute('data-filter') || 'all';
        modal.querySelectorAll('.mh-tab').forEach(tab => tab.classList.toggle('active', tab === t));
        this.renderMatchHistoryList(f);
      };
    });

    // Clear history button
    const btnClear = document.getElementById('btn-clear-match-history');
    if (btnClear) {
      btnClear.onclick = () => {
        if (confirm('Очистить всю историю матчей?')) {
          matchHistoryManager.clearHistory();
          this.renderMatchHistoryList('all');
          ui.showToast('История матчей очищена');
        }
      };
    }

    // Reset tab active state
    modal.querySelectorAll('.mh-tab').forEach(t => {
      t.classList.toggle('active', t.getAttribute('data-filter') === filter);
    });

    this.renderMatchHistoryList(filter);
    modal.classList.add('active');
  }

  renderMatchHistoryList(filter = 'all') {
    const container = document.getElementById('match-history-list');
    if (!container) return;

    const matches = matchHistoryManager.getMatches(filter);

    if (!matches.length) {
      container.innerHTML = `
        <div class="mh-empty-state">
          <div class="mh-empty-icon">📋</div>
          <div style="font-weight: 600; margin-bottom: 4px;">Нет записей</div>
          <div style="font-size: 0.78rem;">Сыграйте партию, и она появится здесь</div>
        </div>
      `;
      return;
    }

    container.innerHTML = matches.map(m => {
      const resultBadge = m.isMeWinner
        ? `<span class="mh-badge win">🏆 Победа</span>`
        : m.myResult === 'BANKRUPT'
          ? `<span class="mh-badge bankrupt">💀 Банкрот</span>`
          : `<span class="mh-badge defeat">❌ Поражение</span>`;

      const winnerToken = m.winner.customToken
        ? `<img src="${m.winner.customToken}" style="width:18px;height:18px;border-radius:50%;object-fit:cover;" />`
        : (m.winner.token || '🎩');

      const playersDetails = (m.players || []).map(p => {
        const tok = p.customToken
          ? `<img src="${p.customToken}" style="width:14px;height:14px;border-radius:50%;object-fit:cover;" />`
          : (p.token || '🎩');
        return `
          <div class="mh-details-row ${p.isMe ? 'is-me' : ''} ${p.isWinner ? 'is-winner' : ''}">
            <span>${tok} ${p.name}${p.isWinner ? ' 🏆' : ''}${p.isBankrupt ? ' 💀' : ''}</span>
            <span style="display:flex;gap:10px;font-size:0.72rem;">
              <span>💵 $${(p.cash || 0).toLocaleString('ru-RU')}</span>
              <span>🏠 ${p.propCount || 0}</span>
              <span>🏡 ${p.housesCount || 0}</span>
            </span>
          </div>
        `;
      }).join('');

      const opponents = (m.players || []).filter(p => !p.isMe).map(p => {
        const tok = p.customToken
          ? `<img src="${p.customToken}" style="width:12px;height:12px;border-radius:50%;object-fit:cover;" />`
          : (p.token || '🎩');
        return `<span class="mh-opp-chip ${p.isWinner ? 'winner' : ''}">${tok} ${p.name}</span>`;
      }).join('');

      const cardId = `mh-card-${m.id}`;
      return `
        <div class="match-history-card ${m.isMeWinner ? 'is-win' : 'is-defeat'}">
          <div class="mh-card-header">
            ${resultBadge}
            <div class="mh-meta-info">
              <span>📅 ${m.dateStr}</span>
              <span>⏱ ${m.durationStr}</span>
              <span>👥 ${m.playersCount} игр.</span>
            </div>
          </div>

          <div class="mh-grid-stats">
            <div class="mh-stat-box">
              <div class="mh-stat-val">💵 $${(m.myCash || 0).toLocaleString('ru-RU')}</div>
              <div class="mh-stat-label">Баланс</div>
            </div>
            <div class="mh-stat-box">
              <div class="mh-stat-val">📈 $${(m.myNetWorth || 0).toLocaleString('ru-RU')}</div>
              <div class="mh-stat-label">Капитал</div>
            </div>
            <div class="mh-stat-box">
              <div class="mh-stat-val">🏠 ${m.myPropCount || 0}</div>
              <div class="mh-stat-label">Владений</div>
            </div>
            <div class="mh-stat-box">
              <div class="mh-stat-val">🏡 ${m.myHousesCount || 0}</div>
              <div class="mh-stat-label">Домов</div>
            </div>
          </div>

          <div class="mh-opponents-row">
            <div>
              <span style="color:#94a3b8;margin-right:4px;">Победитель:</span>
              ${winnerToken} <b style="color:var(--md-on-surface, #ffffff);">${m.winner.name}</b>
            </div>
            <div class="mh-opponents-list">${opponents}</div>
            <button class="mh-btn-toggle-details" data-target="${cardId}">Подробнее ▾</button>
          </div>

          <div class="mh-details-table" id="${cardId}">
            ${playersDetails}
          </div>
        </div>
      `;
    }).join('');

    // Toggle details
    container.querySelectorAll('.mh-btn-toggle-details').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-target');
        const table = document.getElementById(targetId);
        if (!table) return;
        const expanded = table.classList.toggle('expanded');
        btn.textContent = expanded ? 'Скрыть ▴' : 'Подробнее ▾';
      });
    });
  }

  handleGameFinished(state) {
    this.clearActiveGameSession();
    if (!state) return;
    if (!state.winner && state.players) {
      state.winner = state.players.find(p => !p.hasLeft && !p.isBankrupt) || state.players[0];
    }
    const isWinner = state.winner && String(state.winner.id) === String(profileManager.profile.id);
    const hasBots = state.players && state.players.some(p => p.isBot);
    const isSoloOrBot = this.isSoloMode || hasBots || (network.roomCode && (network.roomCode.startsWith('SOLO-') || network.roomCode.startsWith('BOT-')));
    const isTestRoom = this.isTestMode || (network.roomCode && network.roomCode.startsWith('TEST-'));

    if (isTestRoom || isSoloOrBot) {
      const winnerRewardBox = document.getElementById('winner-reward-box');
      const winnerCoinsText = document.getElementById('winner-coins-text');
      if (winnerRewardBox && winnerCoinsText) {
        winnerRewardBox.style.display = 'inline-flex';
        winnerCoinsText.innerText = isTestRoom 
          ? '🧪 Тестовый матч завершён (награды и рейтинг отключены)'
          : '🤖 Тренировочный матч с ботами (без наград и рейтинга)';
      }
      ui.showToast(isTestRoom 
        ? '🧪 Тестовый матч завершён (без наград и изменения рейтинга)'
        : '🤖 Матч с ботами завершён (без наград и изменения рейтинга)');
      return;
    }

    // Send Discord bot notification for real online multiplayer matches
    // Conditions: online room, not local/solo/test, at least 2 real players, host or remaining active player sends once
    const isRealOnline = !this.isLocalMode && !this.isSoloMode && !this.isTestMode && Boolean(network.roomCode);
    const realPlayers = (state.players || []).filter(p => !p.isBot);
    const hasEnoughRealPlayers = realPlayers.length >= 2;
    const shouldSendWebhook = isRealOnline && hasEnoughRealPlayers && (network.isHost || isWinner || Boolean(state.reason)) && !this.hasSentMatchWebhook;

    if (shouldSendWebhook) {
      this.hasSentMatchWebhook = true;
      sendMatchFinishedWebhook(state, {
        roomCode: network.roomCode,
        isTestMode: false
      });
    }

    if (state.winner && state.players) {
      leaderboardManager.recordGameFinished(state.players, state.winner.id);
    }

    // Record to local match history
    matchHistoryManager.recordMatch({
      state,
      myPlayerId: profileManager.profile.id,
      isLocalMode: this.isLocalMode,
      roomCode: network.roomCode || null
    });

    const winnerRewardBox = document.getElementById('winner-reward-box');
    const winnerCoinsText = document.getElementById('winner-coins-text');
    if (winnerRewardBox && winnerCoinsText) {
      const myPlayer = (state.players || []).find(p => String(p.id) === String(profileManager.profile.id));
      const myNet = myPlayer ? ((myPlayer.cash || 0) + (myPlayer.totalPropValue || 0)) : 1500;
      const earnedXp = isWinner
        ? (400 + 150 + Math.floor(myNet / 20))
        : (150 + Math.floor(myNet / 20));

      winnerRewardBox.style.display = 'inline-flex';
      if (isWinner) {
        winnerCoinsText.innerText = `+50 монет • ✨ +${earnedXp} XP за победу!`;
      } else {
        winnerCoinsText.innerText = `✨ +${earnedXp} XP за участие!`;
      }
    }

    this.renderProfileCard();
    this.renderLeaderboard();

    if (network && network.channel) {
      this.broadcastAction('PLAYER_PROFILE_UPDATED', {
        playerId: profileManager.profile.id,
        name: profileManager.profile.name,
        token: profileManager.profile.token,
        color: profileManager.profile.color,
        bg: profileManager.profile.bg || 'default',
        profileBg: profileManager.profile.bg || 'default',
        coins: profileManager.profile.coins || 0,
        stats: profileManager.profile.stats || {},
        isRegistered: profileManager.isRegisteredUser(),
        discordId: profileManager.profile.discordId || null,
        avatarUrl: profileManager.profile.avatarUrl || null
      });
    }

    if (network) {
      network.broadcastLeaderboardRecord({
        id: profileManager.profile.id,
        name: profileManager.profile.name,
        token: profileManager.profile.token,
        customToken: profileManager.profile.token === 'custom' ? profileManager.profile.customToken : null,
        color: profileManager.profile.color,
        bg: profileManager.profile.bg || 'default',
        profileBg: profileManager.profile.bg || 'default',
        coins: profileManager.profile.coins || 0,
        stats: profileManager.profile.stats,
        isRegistered: profileManager.isRegisteredUser(),
        discordId: profileManager.profile.discordId || null,
        avatarUrl: profileManager.profile.avatarUrl || null
      });
    }
  }

  getPlural(number, titles) {
    const cases = [2, 0, 1, 1, 1, 2];
    return titles[(number % 100 > 4 && number % 100 < 20) ? 2 : cases[(number % 10 < 5) ? number % 10 : 5]];
  }

  copyToClipboard(text, successToast = 'Скопировано') {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        ui.showToast(successToast);
      }).catch(() => {
        this.fallbackCopyText(text, successToast);
      });
    } else {
      this.fallbackCopyText(text, successToast);
    }
  }

  fallbackCopyText(text, toastMsg = null) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      ui.showToast(toastMsg || `Скопировано: ${text}`);
    } catch (e) {
      ui.showToast(`Скопировано: ${text}`);
    }
    document.body.removeChild(ta);
  }

  renderTokenPicker() {
    const container = document.getElementById('token-picker-grid');
    if (!container) return;

    const currentToken = profileManager.profile.token;
    const customTokenData = profileManager.profile.customToken;
    const hasCustom = Boolean(customTokenData && typeof customTokenData === 'string' && customTokenData.startsWith('data:image'));
    const isCustomActive = currentToken === 'custom' || (typeof currentToken === 'string' && currentToken.startsWith('data:image'));

    let html = AVAILABLE_TOKENS.map(t => {
      const isSelected = !isCustomActive && (currentToken === t.emoji || currentToken === t.id);
      return `
        <div class="md-chip ${isSelected ? 'active' : ''}" data-token="${t.emoji}" style="cursor: pointer;">
          <span style="font-size: 1.2rem;">${t.emoji}</span>
          <span>${t.name}</span>
        </div>
      `;
    }).join('');

    if (hasCustom) {
      html = `
        <div class="md-chip ${isCustomActive ? 'active' : ''}" data-token="custom" style="cursor: pointer; ${isCustomActive ? 'border-color: #38bdf8; box-shadow: 0 0 10px rgba(56, 189, 248, 0.4);' : 'border-color: rgba(56, 189, 248, 0.5);'}">
          <span style="display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px;">
            ${renderTokenHTML('custom', customTokenData, 'token-custom-img')}
          </span>
          <span>Моя пешка</span>
        </div>
      ` + html;
    }

    container.innerHTML = html;

    // Update accordion summary pill
    const summaryToken = document.getElementById('profile-summary-token');
    if (summaryToken) {
      if (isCustomActive && customTokenData) {
        summaryToken.innerHTML = `<span style="display:inline-flex;align-items:center;gap:4px;">${renderTokenHTML('custom', customTokenData, 'token-pill-img')} Моя пешка</span>`;
      } else {
        const emoji = getTokenEmoji(currentToken);
        const name = getTokenName(currentToken);
        summaryToken.innerHTML = `${emoji} ${name}`;
      }
    }

    container.querySelectorAll('.md-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        sound.playClick();
        const selectedToken = chip.getAttribute('data-token');
        const nameInput = document.getElementById('input-profile-name');
        if (nameInput && nameInput.value && nameInput.value.trim()) {
          profileManager.profile.name = nameInput.value.trim();
          profileManager.profile.customName = nameInput.value.trim();
          try { localStorage.setItem('monopoly_custom_nickname', nameInput.value.trim()); } catch (e) {}
        }
        profileManager.updateToken(selectedToken);
        leaderboardManager.syncMyRecord();
        this.renderTokenPicker();
        this.renderProfileCard();
        this.renderLeaderboard('wins', 'inline-leaderboard-list');
        this.renderLeaderboard('wins', 'modal-leaderboard-list');

        const customSrc = selectedToken === 'custom' ? profileManager.profile.customToken : null;

        if (network && network.channel) {
          this.broadcastAction('PLAYER_PROFILE_UPDATED', {
            playerId: profileManager.profile.id,
            token: selectedToken,
            customToken: customSrc,
            bg: profileManager.profile.bg || 'default',
            profileBg: profileManager.profile.bg || 'default',
            name: profileManager.profile.name,
            color: profileManager.profile.color
          });
        }

        if (this.currentScreen === 'lobby' && network && network.isHost) {
          this.lobbyPlayers = this.lobbyPlayers.map(p => String(p.id) === String(profileManager.profile.id) ? { 
            ...p, 
            token: selectedToken,
            customToken: customSrc
          } : p);
          this.renderLobbyPlayers();
          this.broadcastAction('LOBBY_UPDATE', { players: this.lobbyPlayers });
        }
      });
    });
  }

  renderBgPicker() {
    const container = document.getElementById('bg-picker-grid');
    if (!container) return;

    const currentBgId = profileManager.profile.bg || 'default';
    const currentBg = getProfileBg(currentBgId);

    // Update accordion summary pill
    const summaryBg = document.getElementById('profile-summary-bg');
    if (summaryBg && currentBg) {
      summaryBg.innerHTML = `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${currentBg.preview};margin-right:2px;"></span>${currentBg.name}`;
    }

    container.innerHTML = PROFILE_BACKGROUNDS.map(bg => `
      <div class="bg-picker-item ${currentBgId === bg.id ? 'active' : ''}" data-bg-id="${bg.id}">
        <div class="bg-picker-preview" style="background: ${bg.preview};"></div>
        <span class="bg-picker-name">${bg.name}</span>
      </div>
    `).join('');

    container.querySelectorAll('.bg-picker-item').forEach(item => {
      item.addEventListener('click', () => {
        sound.playClick();
        const bgId = item.getAttribute('data-bg-id');
        const nameInput = document.getElementById('input-profile-name');
        if (nameInput && nameInput.value && nameInput.value.trim()) {
          profileManager.profile.name = nameInput.value.trim();
          profileManager.profile.customName = nameInput.value.trim();
          try { localStorage.setItem('monopoly_custom_nickname', nameInput.value.trim()); } catch (e) {}
        }
        profileManager.updateBg(bgId);
        this.renderBgPicker();
        this.renderProfileCard();

        if (network && network.channel) {
          this.broadcastAction('PLAYER_PROFILE_UPDATED', {
            playerId: profileManager.profile.id,
            bg: bgId,
            profileBg: bgId,
            token: profileManager.profile.token,
            name: profileManager.profile.name,
            color: profileManager.profile.color,
            coins: profileManager.profile.coins || 0,
            stats: profileManager.profile.stats || {},
            discordId: profileManager.profile.discordId || null,
            avatarUrl: profileManager.profile.avatarUrl || null
          });
        }

        if (this.currentScreen === 'lobby' && network && network.isHost) {
          this.lobbyPlayers = this.lobbyPlayers.map(p => String(p.id) === String(profileManager.profile.id) ? { ...p, bg: bgId, profileBg: bgId, coins: profileManager.profile.coins || 0 } : p);
          this.renderLobbyPlayers();
          this.broadcastAction('LOBBY_UPDATE', { players: this.lobbyPlayers });
        }
      });
    });
  }

  renderTitlePicker() {
    const container = document.getElementById('title-picker-grid');
    if (!container) return;

    const unlocked = profileManager.profile.unlockedTitles || ['novice'];
    const currentTitle = profileManager.profile.title || 'novice';
    const currentTitleObj = getTitleById(currentTitle);

    // Update accordion summary pill
    const summaryTitle = document.getElementById('profile-summary-title');
    if (summaryTitle && currentTitleObj) {
      summaryTitle.innerHTML = `${currentTitleObj.icon} ${currentTitleObj.name}`;
    }

    container.innerHTML = unlocked.map(titleId => {
      const t = getTitleById(titleId);
      const isEquipped = currentTitle === t.id;
      return `
        <div class="title-picker-item ${isEquipped ? 'active' : ''}" data-title-id="${t.id}">
          <span style="font-size: 1rem;">${t.icon}</span>
          <span>${t.name}</span>
          ${isEquipped ? '<span style="font-size: 0.72rem; opacity: 0.8;">(Надет)</span>' : ''}
        </div>
      `;
    }).join('');

    container.querySelectorAll('.title-picker-item').forEach(item => {
      item.addEventListener('click', () => {
        sound.playClick();
        const titleId = item.getAttribute('data-title-id');
        const nameInput = document.getElementById('input-profile-name');
        if (nameInput && nameInput.value && nameInput.value.trim()) {
          profileManager.profile.name = nameInput.value.trim();
          profileManager.profile.customName = nameInput.value.trim();
          try { localStorage.setItem('monopoly_custom_nickname', nameInput.value.trim()); } catch (e) {}
        }
        profileManager.equipTitle(titleId);
        this.renderTitlePicker();
        this.renderProfileCard();

        if (network && network.channel) {
          this.broadcastAction('PLAYER_PROFILE_UPDATED', {
            playerId: profileManager.profile.id,
            title: titleId,
            token: profileManager.profile.token,
            bg: profileManager.profile.bg || 'default',
            profileBg: profileManager.profile.bg || 'default',
            name: profileManager.profile.name,
            color: profileManager.profile.color,
            coins: profileManager.profile.coins || 0
          });
        }

        if (this.currentScreen === 'lobby' && network && network.isHost) {
          this.lobbyPlayers = this.lobbyPlayers.map(p => String(p.id) === String(profileManager.profile.id) ? { ...p, title: titleId } : p);
          this.renderLobbyPlayers();
          this.broadcastAction('LOBBY_UPDATE', { players: this.lobbyPlayers });
        }
      });
    });
  }

  renderNameColorPicker() {
    const container = document.getElementById('name-color-preset-grid');
    const colorInput = document.getElementById('input-profile-color-picker');
    const colorInputCustom = document.getElementById('input-profile-color-picker-custom');
    const triggerBtn = document.getElementById('btn-name-color-trigger');
    const previewText = document.getElementById('preview-nickname-text');
    const nameInput = document.getElementById('input-profile-name');
    const summaryColor = document.getElementById('profile-summary-color');

    const currentColor = profileManager.profile.nameColor || profileManager.profile.color || '#2563eb';

    const updateDisplay = (color) => {
      if (colorInput) colorInput.value = color;
      if (colorInputCustom) colorInputCustom.value = color;
      if (triggerBtn) triggerBtn.style.background = color;
      if (previewText) {
        previewText.style.color = color;
        previewText.innerText = (nameInput && nameInput.value.trim()) ? nameInput.value.trim() : (profileManager.profile.name || 'Игрок');
      }
      if (summaryColor) {
        const found = NICKNAME_COLORS.find(c => c.color.toLowerCase() === color.toLowerCase());
        const label = found ? found.name : 'Свой цвет';
        summaryColor.innerHTML = `<span class="color-dot" style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${color};margin-right:4px;"></span>${label}`;
      }
      if (container) {
        container.querySelectorAll('.name-color-option-btn').forEach(btn => {
          btn.classList.toggle('active', btn.getAttribute('data-color').toLowerCase() === color.toLowerCase());
        });
      }
    };

    updateDisplay(currentColor);

    if (nameInput) {
      nameInput.oninput = () => {
        const val = nameInput.value.trim();
        if (previewText) {
          previewText.innerText = val || profileManager.profile.name || 'Игрок';
        }
        if (val) {
          profileManager.profile.name = val;
          profileManager.profile.customName = val;
          try {
            localStorage.setItem('monopoly_custom_nickname', val);
          } catch (e) {}
        }
      };
    }

    if (container) {
      container.innerHTML = NICKNAME_COLORS.map(c => `
        <button type="button" class="name-color-option-btn ${currentColor.toLowerCase() === c.color.toLowerCase() ? 'active' : ''}" data-color="${c.color}">
          <span class="name-color-swatch" style="background: ${c.color};"></span>
          <span>${c.name}</span>
        </button>
      `).join('');

      container.querySelectorAll('.name-color-option-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          sound.playClick();
          const chosen = btn.getAttribute('data-color');
          if (nameInput && nameInput.value && nameInput.value.trim()) {
            profileManager.profile.name = nameInput.value.trim();
            profileManager.profile.customName = nameInput.value.trim();
            try { localStorage.setItem('monopoly_custom_nickname', nameInput.value.trim()); } catch (e) {}
          }
          profileManager.updateNameColor(chosen);
          updateDisplay(chosen);
          leaderboardManager.syncMyRecord();
          this.renderProfileCard();
          this.renderLeaderboard('wins', 'inline-leaderboard-list');
          this.renderLeaderboard('wins', 'modal-leaderboard-list');

          if (network && network.channel) {
            this.broadcastAction('PLAYER_PROFILE_UPDATED', {
              playerId: profileManager.profile.id,
              name: profileManager.profile.name,
              color: chosen,
              nameColor: chosen,
              token: profileManager.profile.token,
              customToken: profileManager.profile.customToken,
              bg: profileManager.profile.bg || 'default',
              profileBg: profileManager.profile.bg || 'default'
            });
          }

          if (this.currentScreen === 'lobby' && this.lobbyPlayers) {
            this.lobbyPlayers = this.lobbyPlayers.map(p => String(p.id) === String(profileManager.profile.id) ? {
              ...p,
              color: chosen,
              nameColor: chosen
            } : p);
            this.renderLobbyPlayers();
            if (network && network.isHost) {
              this.broadcastAction('LOBBY_UPDATE', { players: this.lobbyPlayers });
            }
          }
        });
      });
    }

    const handleCustomColorChange = (newVal) => {
      if (!newVal) return;
      if (nameInput && nameInput.value && nameInput.value.trim()) {
        profileManager.profile.name = nameInput.value.trim();
        profileManager.profile.customName = nameInput.value.trim();
        try { localStorage.setItem('monopoly_custom_nickname', nameInput.value.trim()); } catch (e) {}
      }
      profileManager.updateNameColor(newVal);
      updateDisplay(newVal);
      leaderboardManager.syncMyRecord();
      this.renderProfileCard();
      this.renderLeaderboard('wins', 'inline-leaderboard-list');
      this.renderLeaderboard('wins', 'modal-leaderboard-list');

      if (network && network.channel) {
        this.broadcastAction('PLAYER_PROFILE_UPDATED', {
          playerId: profileManager.profile.id,
          name: profileManager.profile.name,
          color: newVal,
          nameColor: newVal,
          token: profileManager.profile.token,
          customToken: profileManager.profile.customToken,
          bg: profileManager.profile.bg || 'default',
          profileBg: profileManager.profile.bg || 'default'
        });
      }

      if (this.currentScreen === 'lobby' && this.lobbyPlayers) {
        this.lobbyPlayers = this.lobbyPlayers.map(p => String(p.id) === String(profileManager.profile.id) ? {
          ...p,
          color: newVal,
          nameColor: newVal
        } : p);
        this.renderLobbyPlayers();
        if (network && network.isHost) {
          this.broadcastAction('LOBBY_UPDATE', { players: this.lobbyPlayers });
        }
      }
    };

    if (colorInput) {
      colorInput.oninput = (e) => handleCustomColorChange(e.target.value);
    }
    if (colorInputCustom) {
      colorInputCustom.oninput = (e) => handleCustomColorChange(e.target.value);
    }
  }

  openPropertyManager() {
    this.cancelAutoEndTimer();
    const modal = document.getElementById('modal-manage-properties');
    const list = document.getElementById('manage-properties-list');
    if (!modal || !list) return;

    const myId = profileManager.profile.id;
    const myProps = [];
    Object.entries(engine.properties).forEach(([tileId, prop]) => {
      if (prop.ownerId === myId) {
        myProps.push({ tileId: parseInt(tileId), tile: BOARD_TILES[tileId], prop });
      }
    });

    if (myProps.length === 0) {
      list.innerHTML = '<p style="text-align: center; color: var(--md-on-surface-variant); padding: 20px;">У вас пока нет купленной недвижимости.</p>';
    } else {
      const myPlayer = engine.players.find(p => p.id === myId);
      const playerCash = myPlayer ? myPlayer.cash : 0;

      list.innerHTML = myProps.map(({ tileId, tile, prop }) => {
        const groupColor = COLOR_GROUPS[tile.group]?.color || '#888888';
        const groupTiles = BOARD_TILES.filter(t => t.group === tile.group);
        const ownedInGroup = groupTiles.filter(t => engine.properties[t.id]?.ownerId === myId).length;
        const totalInGroup = groupTiles.length;
        const isFullGroup = ownedInGroup === totalInGroup && totalInGroup > 0;
        const houseCost = Math.round(tile.houseCost * (engine.settings?.buildingCostMultiplier || 1.0));
        const canAfford = playerCash >= houseCost;
        const isMax = prop.houses >= 5;

        const basePrice = tile.price;
        const commission = Math.round(basePrice * 0.10);
        const sellPayout = basePrice - commission;

        let statusBadge = '';
        if (prop.houses === 5) {
          statusBadge = '<span class="prop-badge-pill prop-badge-hotel">🏨 Отель</span>';
        } else if (prop.houses > 0) {
          statusBadge = `<span class="prop-badge-pill prop-badge-house">🏠 ${prop.houses} ${prop.houses === 1 ? 'дом' : (prop.houses < 5 ? 'дома' : 'домов')}</span>`;
        } else {
          statusBadge = '<span class="prop-badge-pill prop-badge-free">Без улучшений</span>';
        }

        let buildButtonHtml = '';
        if (tile.type === 'street') {
          if (!isFullGroup) {
            buildButtonHtml = `
              <button class="md-btn md-btn-outlined btn-build-action" disabled style="opacity: 0.55; cursor: not-allowed; border-color: rgba(255,255,255,0.15);" title="Соберите все ${totalInGroup} улицы этого цвета (${ownedInGroup}/${totalInGroup})">
                <i class="ph ph-lock"></i> Построить ($${houseCost}) · Нужна вся улица (${ownedInGroup}/${totalInGroup})
              </button>
            `;
          } else if (isMax) {
            buildButtonHtml = `
              <button class="md-btn md-btn-tonal btn-build-action" disabled style="opacity: 0.8; cursor: default;">
                <i class="ph ph-buildings"></i> Отель (Максимум)
              </button>
            `;
          } else if (!canAfford) {
            buildButtonHtml = `
              <button class="md-btn md-btn-tonal btn-build-action" disabled style="opacity: 0.65; cursor: not-allowed;" title="Недостаточно денег ($${playerCash} / $${houseCost})">
                <i class="ph ph-house-line"></i> Построить ($${houseCost}) · Не хватает $${houseCost - playerCash}
              </button>
            `;
          } else {
            buildButtonHtml = `
              <button class="md-btn md-btn-filled btn-build-action" data-tile-id="${tileId}" style="background: linear-gradient(135deg, #10b981, #059669); color: #ffffff; font-weight: 700; box-shadow: 0 2px 10px rgba(16,185,129,0.35);">
                <i class="ph ph-house-line"></i> Построить ($${houseCost})
              </button>
            `;
          }
        }

        return `
          <div class="manage-property-card-dark">
            <div class="manage-prop-head-dark">
              <div style="display: flex; align-items: center; gap: 8px;">
                <div class="color-dot" style="background-color: ${groupColor}; box-shadow: 0 0 6px ${groupColor};"></div>
                <b style="font-size: 0.95rem; color: #f8fafc;">${tile.icon ? tile.icon + ' ' : ''}${tile.name}</b>
              </div>
              <div style="display: flex; align-items: center; gap: 6px;">
                ${isFullGroup ? '<span class="prop-badge-pill" style="background: rgba(16,185,129,0.15); color: #34d399; border: 1px solid rgba(16,185,129,0.3); font-size: 0.72rem; padding: 2px 6px; border-radius: 6px;"><i class="ph ph-check-circle"></i> Монополия</span>' : ''}
                ${statusBadge}
              </div>
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px;">
              ${buildButtonHtml}
              ${prop.houses === 0 ? `
                <button class="md-btn md-btn-outlined btn-sell-action" data-tile-id="${tileId}" style="color: #f87171; border-color: rgba(248,113,113,0.35);">
                  <i class="ph ph-currency-dollar"></i> Продать (+$${sellPayout} | ком. $${commission})
                </button>
              ` : ''}
            </div>
          </div>
        `;
      }).join('');

      list.querySelectorAll('.btn-build-action[data-tile-id]').forEach(btn => {
        btn.addEventListener('click', () => {
          const tileId = parseInt(btn.getAttribute('data-tile-id'));
          const res = engine.buildHouse(myId, tileId);
          if (res && res.success) {
            sound.playBuild();
            ui.showToast(`Улучшение построено на «${BOARD_TILES[tileId]?.name}»!`);
            ui.update(engine.getState(), myId);
            this.broadcastAction('SYNC_STATE', { state: engine.getState() });
            this.openPropertyManager();
          } else {
            ui.showToast(res?.reason || 'Не удалось построить');
          }
        });
      });

      list.querySelectorAll('.btn-sell-action').forEach(btn => {
        btn.addEventListener('click', () => {
          sound.playCash();
          const tileId = parseInt(btn.getAttribute('data-tile-id'));
          const res = engine.sellProperty(myId, tileId);
          if (res.success) {
            ui.showToast(`Карточка продана за $${res.payout} (комиссия 10%: $${res.commission})`);
            ui.update(engine.getState(), myId);
            this.broadcastAction('SYNC_STATE', { state: engine.getState() });
            this.openPropertyManager();
          } else {
            ui.showToast(res.reason || 'Не удалось продать');
          }
        });
      });
    }

    modal.classList.add('active');
  }

  // --- TRADING SYSTEM WITH CARDS & COMMISSION ---
  openTradeModal() {
    this.cancelAutoEndTimer();
    const modal = document.getElementById('modal-trade');
    const partnerSelect = document.getElementById('trade-partner-select');
    const myGrid = document.getElementById('trade-my-cards-grid');
    const theirGrid = document.getElementById('trade-their-cards-grid');
    const myCashInput = document.getElementById('trade-my-cash');
    const theirCashInput = document.getElementById('trade-their-cash');
    const myCount = document.getElementById('trade-my-count');
    const theirCount = document.getElementById('trade-their-count');
    const commissionBox = document.getElementById('trade-commission-amount');

    if (!modal || !partnerSelect) return;

    const myId = (engine.isLocalMode && engine.players[engine.currentTurn])
      ? engine.players[engine.currentTurn].id
      : profileManager.profile.id;
    const activePlayers = engine.players.filter(p => p.id !== myId && !p.isBankrupt && !p.hasLeft);

    if (activePlayers.length === 0) {
      ui.showToast('Нет доступных соперников для сделки');
      return;
    }

    partnerSelect.innerHTML = activePlayers.map(p => `
      <option value="${p.id}">${p.name} ${p.isBot ? '(Бот)' : ''} ($${p.cash})</option>
    `).join('');

    const selectedMyCards = new Set();
    const selectedTheirCards = new Set();

    const updateCommissionAndCounts = () => {
      myCount.innerText = `${selectedMyCards.size} карт`;
      theirCount.innerText = `${selectedTheirCards.size} карт`;
      if (commissionBox) commissionBox.innerText = '$0';
    };

    const renderTradeGrids = () => {
      const partnerId = partnerSelect.value;
      const myProps = [];
      const theirProps = [];

      Object.entries(engine.properties).forEach(([tileId, prop]) => {
        const id = parseInt(tileId);
        const tile = BOARD_TILES[id];
        if (!tile || prop.houses > 0) return;

        if (prop.ownerId === myId) {
          myProps.push({ id, tile });
        } else if (prop.ownerId === partnerId) {
          theirProps.push({ id, tile });
        }
      });

      myGrid.innerHTML = myProps.length ? myProps.map(({ id, tile }) => {
        const groupColor = COLOR_GROUPS[tile.group]?.color || '#666';
        const isSel = selectedMyCards.has(id);
        return `
          <div class="trade-mini-card ${isSel ? 'selected' : ''}" data-card-id="${id}">
            <div class="trade-mini-card-color" style="background: ${groupColor};"></div>
            <div class="trade-mini-card-body">
              <div class="trade-mini-card-name">${tile.name}</div>
              <div class="trade-mini-card-price">$${tile.price}</div>
            </div>
          </div>
        `;
      }).join('') : '<span style="font-size: 0.75rem; opacity: 0.6; padding: 10px;">Нет карт для обмена</span>';

      theirGrid.innerHTML = theirProps.length ? theirProps.map(({ id, tile }) => {
        const groupColor = COLOR_GROUPS[tile.group]?.color || '#666';
        const isSel = selectedTheirCards.has(id);
        return `
          <div class="trade-mini-card ${isSel ? 'selected' : ''}" data-card-id="${id}">
            <div class="trade-mini-card-color" style="background: ${groupColor};"></div>
            <div class="trade-mini-card-body">
              <div class="trade-mini-card-name">${tile.name}</div>
              <div class="trade-mini-card-price">$${tile.price}</div>
            </div>
          </div>
        `;
      }).join('') : '<span style="font-size: 0.75rem; opacity: 0.6; padding: 10px;">Нет карт для обмена</span>';

      myGrid.querySelectorAll('.trade-mini-card').forEach(el => {
        el.addEventListener('click', () => {
          const id = parseInt(el.getAttribute('data-card-id'));
          if (selectedMyCards.has(id)) selectedMyCards.delete(id);
          else selectedMyCards.add(id);
          el.classList.toggle('selected');
          updateCommissionAndCounts();
        });
      });

      theirGrid.querySelectorAll('.trade-mini-card').forEach(el => {
        el.addEventListener('click', () => {
          const id = parseInt(el.getAttribute('data-card-id'));
          if (selectedTheirCards.has(id)) selectedTheirCards.delete(id);
          else selectedTheirCards.add(id);
          el.classList.toggle('selected');
          updateCommissionAndCounts();
        });
      });

      updateCommissionAndCounts();
    };

    partnerSelect.onchange = () => {
      selectedTheirCards.clear();
      renderTradeGrids();
    };

    myCashInput.oninput = updateCommissionAndCounts;
    theirCashInput.oninput = updateCommissionAndCounts;

    renderTradeGrids();
    modal.classList.add('active');

    const btnSend = document.getElementById('btn-send-trade-offer');
    btnSend.onclick = () => {
      const partnerId = partnerSelect.value;
      const partner = engine.players.find(p => p.id === partnerId);
      if (!partner) return;

      const offer = {
        id: 'trade_' + Date.now(),
        fromId: myId,
        fromName: profileManager.profile.name,
        toId: partnerId,
        toName: partner.name,
        fromCardIds: Array.from(selectedMyCards),
        toCardIds: Array.from(selectedTheirCards),
        fromCash: parseInt(myCashInput.value) || 0,
        toCash: parseInt(theirCashInput.value) || 0
      };

      if (offer.fromCardIds.length === 0 && offer.toCardIds.length === 0 && offer.fromCash === 0 && offer.toCash === 0) {
        ui.showToast('Выберите карточки или деньги для сделки');
        return;
      }

      modal.classList.remove('active');

      if (partner.isBot) {
        const accepts = engine.evaluateBotTrade(offer);
        if (accepts) {
          const res = engine.executeTrade(offer);
          if (res.success) {
            sound.playCash();
            ui.showToast(`🤝 Бот ${partner.name} принял сделку!`);
            ui.update(engine.getState(), myId);
            this.saveActiveGameSession();
            this.broadcastAction('SYNC_STATE', { state: engine.getState() });
          } else {
            ui.showToast(res.reason || 'Сделка не удалась');
          }
        } else {
          const reason = engine.lastBotTradeReason || `Бот ${partner.name} посчитал сделку невыгодной и отклонил её`;
          ui.showToast(`⚠️ ${reason}`);
        }
      } else if (this.isLocalMode) {
        engine.proposeTrade(myId, partnerId, offer);
        this.handleIncomingTradeProposal(offer);
      } else {
        engine.proposeTrade(myId, partnerId, offer);
        this.broadcastAction('TRADE_PROPOSAL', { offer });
        ui.showToast(`Предложение обмена отправлено ${partner.name}`);
      }
    };
  }

  handleIncomingTradeProposal(offer) {
    const myId = profileManager.profile.id;
    if (!this.isLocalMode && String(offer.toId) !== String(myId)) return;

    sound.playCard();
    engine.proposeTrade(offer.fromId, offer.toId, offer);
    ui.showToast(`📩 ${offer.fromName} предлагает вам сделку!`);
    const modal = document.getElementById('modal-trade-incoming');
    const desc = document.getElementById('trade-incoming-desc');
    const giveItems = document.getElementById('trade-incoming-give-items');
    const receiveItems = document.getElementById('trade-incoming-receive-items');
    const commVal = document.getElementById('trade-incoming-commission-val');

    if (!modal) return;

    desc.innerText = `${offer.fromName} предлагает вам сделку:`;

    let giveHtml = offer.toCardIds.map(id => `• <b>${BOARD_TILES[id]?.name}</b> ($${BOARD_TILES[id]?.price})`).join('<br>');
    if (offer.toCash > 0) {
      giveHtml += (giveHtml ? '<br>' : '') + `• Деньги: <b>$${offer.toCash}</b>`;
    }
    giveItems.innerHTML = giveHtml || '<span style="opacity: 0.6;">Ничего</span>';

    let recHtml = offer.fromCardIds.map(id => `• <b>${BOARD_TILES[id]?.name}</b> ($${BOARD_TILES[id]?.price})`).join('<br>');
    if (offer.fromCash > 0) {
      recHtml += (recHtml ? '<br>' : '') + `• Деньги: <b>$${offer.fromCash}</b>`;
    }
    receiveItems.innerHTML = recHtml || '<span style="opacity: 0.6;">Ничего</span>';

    if (commVal) commVal.innerText = `$0`;

    modal.classList.add('active');

    document.getElementById('btn-trade-accept').onclick = () => {
      modal.classList.remove('active');
      const res = engine.executeTrade(offer);
      if (res.success) {
        sound.playCash();
        ui.showToast('Сделка принята!');
        ui.update(engine.getState(), myId);
        this.broadcastAction('TRADE_ACCEPTED', { offer, state: engine.getState() });
        this.broadcastAction('SYNC_STATE', { state: engine.getState() });
      } else {
        ui.showToast(res.reason || 'Ошибка сделки');
      }
    };

    document.getElementById('btn-trade-reject').onclick = () => {
      modal.classList.remove('active');
      engine.rejectTrade();
      this.broadcastAction('TRADE_REJECTED', { offer });
      ui.showToast('Вы отклонили предложение обмена');
    };
  }

  async runBotTurnStep() {
    if (this.isBotTurnRunning) return;
    if (this.currentScreen !== 'game' || engine.status !== 'PLAYING') return;

    const curPlayer = engine.getCurrentPlayer();
    if (!curPlayer || !curPlayer.isBot) return;

    this.isBotTurnRunning = true;
    try {
      const botDiff = curPlayer.botDifficulty || this.customSettings.botDifficulty || 'medium';

      // 1. Jail handling
      if (curPlayer.inJail) {
        await new Promise(r => setTimeout(r, 600));
        if (curPlayer.jailCards > 0) {
          engine.useJailCard(curPlayer.id);
          ui.showToast(`🤖 ${curPlayer.name} использовал карту выхода из тюрьмы`);
        } else if (botDiff === 'hard' || (botDiff === 'medium' && curPlayer.cash > 250) || (botDiff === 'easy' && curPlayer.jailTurns >= 2 && curPlayer.cash > 300)) {
          engine.payJailFine(curPlayer.id);
          ui.showToast(`🤖 ${curPlayer.name} заплатил штраф $50 и вышел из тюрьмы`);
        }
        ui.update(engine.getState(), profileManager.profile.id);
        this.broadcastAction('SYNC_STATE', { state: engine.getState() });
      }

      // 2. Roll dice if in ROLL phase
      if (engine.phase === 'ROLL' && engine.status === 'PLAYING') {
        await new Promise(r => setTimeout(r, 600));
        const curDiceSkin = curPlayer.diceSkin || 'classic';
        const res = engine.rollDice();
        if (res && res.success) {
          sound.playDice();
          await new Promise(resolve => {
            let done = false;
            const timer = setTimeout(() => {
              if (!done) {
                done = true;
                const state = engine.getState();
                ui.update(state, profileManager.profile.id);
                resolve();
              }
            }, 3500);

            ui.animateDiceRoll(res.dice, () => {
              ui.animateTokenStepByStep(curPlayer, res.oldPos, res.newPos, () => {
                if (!done) {
                  done = true;
                  clearTimeout(timer);
                  const state = engine.getState();
                  ui.update(state, profileManager.profile.id);
                  resolve();
                }
              });
            }, curDiceSkin);
          });

          this.saveActiveGameSession();
          this.broadcastAction('ROLL', {
            forcedValues: res.dice,
            oldPos: res.oldPos,
            newPos: res.newPos,
            diceSkin: curDiceSkin,
            state: engine.getState()
          });
        }
      }

      // 3. Handle Buy Choice
      if (engine.phase === 'BUY_CHOICE' && engine.status === 'PLAYING') {
        await new Promise(r => setTimeout(r, 700));
        const tile = BOARD_TILES[curPlayer.position];
        let willBuy = false;
        if (tile && tile.price) {
          if (botDiff === 'hard') {
            willBuy = curPlayer.cash >= tile.price + 20;
          } else if (botDiff === 'easy') {
            willBuy = curPlayer.cash >= tile.price + 350 && Math.random() < 0.65;
          } else {
            willBuy = curPlayer.cash >= tile.price + 100;
          }
        }

        if (willBuy) {
          const buyRes = engine.buyProperty(curPlayer.id);
          if (buyRes && buyRes.success) {
            sound.playCash();
            ui.showToast(`🤖 ${curPlayer.name} приобрёл «${tile.name}» за $${tile.price}`);
            const state = engine.getState();
            ui.update(state, profileManager.profile.id);
            this.saveActiveGameSession();
            this.broadcastAction('BUY', { tileId: buyRes.tileId, state });
          } else {
            engine.passProperty();
            const state = engine.getState();
            ui.update(state, profileManager.profile.id);
            this.saveActiveGameSession();
            this.broadcastAction('PASS', { state });
          }
        } else {
          engine.passProperty();
          const state = engine.getState();
          ui.update(state, profileManager.profile.id);
          this.saveActiveGameSession();
          this.broadcastAction('PASS', { state });
        }
      }

      // 4. Handle Card Event
      if (engine.phase === 'CARD_EVENT' && engine.status === 'PLAYING') {
        await new Promise(r => setTimeout(r, 700));
        engine.applyActiveCard();
        const state = engine.getState();
        ui.update(state, profileManager.profile.id);
        this.saveActiveGameSession();
        this.broadcastAction('APPLY_CARD', { state });
      }

      // 5. House / Hotel Building
      if (engine.phase === 'ACTION' && engine.status === 'PLAYING') {
        const minReserve = botDiff === 'hard' ? 40 : (botDiff === 'easy' ? 500 : 250);
        if (curPlayer.cash > minReserve) {
          const ownedMonopolyTiles = Object.entries(engine.properties)
            .filter(([tileId, prop]) => prop.ownerId === curPlayer.id && engine.canBuildHouse(curPlayer.id, parseInt(tileId)))
            .map(([tileId]) => parseInt(tileId));

          const maxBuildAttempts = botDiff === 'hard' ? 3 : (botDiff === 'easy' ? 1 : 2);
          let buildsDone = 0;
          for (const tId of ownedMonopolyTiles) {
            if (buildsDone >= maxBuildAttempts) break;
            const tile = BOARD_TILES[tId];
            const cost = Math.round((tile.houseCost || 100) * (engine.settings.buildingCostMultiplier || 1.0));
            if (curPlayer.cash >= cost + minReserve) {
              const res = engine.buildHouse(curPlayer.id, tId);
              if (res && res.success) {
                buildsDone++;
                sound.playCash();
                ui.showToast(`🏗️ ${curPlayer.name} построил дом на «${tile.name}»`);
              }
            }
          }
          ui.update(engine.getState(), profileManager.profile.id);
          this.saveActiveGameSession();
        }
      }

      // 6. End turn
      if ((engine.phase === 'ACTION' || engine.phase === 'BUY_CHOICE' || engine.phase === 'CARD_EVENT') && engine.status === 'PLAYING') {
        await new Promise(r => setTimeout(r, 600));
        const endRes = engine.endTurn();
        if (endRes.success) {
          const state = engine.getState();
          ui.update(state, profileManager.profile.id);
          this.saveActiveGameSession();
          this.broadcastAction('END_TURN', { state });

          const nextP = engine.getCurrentPlayer();
          if (nextP && nextP.isBot && engine.status === 'PLAYING' && this.isBotController()) {
            setTimeout(() => this.runBotTurnStep(), 700);
          }
        }
      }
    } catch (err) {
      console.error('Error during bot turn step:', err);
    } finally {
      this.isBotTurnRunning = false;
    }
  }
}

// Instantiate and start
const app = new App();
window.app = app;
window.engine = engine;
window.profileManager = profileManager;
window.leaderboardManager = leaderboardManager;

// Global window functions for immediate and reliable header button handlers
window.goToMainMenu = () => {
  sound.playClick();
  if (app.currentScreen === 'game') {
    document.getElementById('btn-leave-game')?.click();
    return;
  }
  if (app.currentScreen === 'lobby') {
    document.getElementById('btn-leave-lobby')?.click();
    return;
  }
  document.querySelectorAll('.md-modal-backdrop.active').forEach(m => m.classList.remove('active'));
  app.showScreen('menu');
  app.renderLeaderboard();
};
window.openChangelogModal = () => app.openChangelogModal();
window.openSettingsModal = () => app.openSettingsModal();
window.openLeaderboardModal = () => {
  sound.playClick();
  app.openLeaderboardModal();
};
window.openMatchHistoryModal = (filter = 'all') => {
  sound.playClick();
  app.openMatchHistoryModal(filter);
};
window.openAdminModal = () => {
  sound.playClick();
  app.openAdminModal();
};
window.openShopModal = () => {
  sound.playClick();
  app.openShopModal();
};
window.openDiscordAuthModal = () => {
  sound.playClick();
  app.openDiscordAuthModal();
};
window.openProfileModal = () => {
  sound.playClick();
  app.openProfileModal();
};

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', () => app.init());
} else {
  app.init();
}
