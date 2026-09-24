/**
 * UI Renderer and Event Handler for Monopoly
 */

import { BOARD_TILES, COLOR_GROUPS } from './board-data.js';
import { AVAILABLE_TOKENS, PLAYER_COLORS, profileManager, getTokenEmoji, renderTokenHTML, getProfileBg } from './profile.js?v=8.5.1';
import { GAME_PRESETS, getPresetById } from './presets.js';
import { sound } from './audio.js';
import { applyDiceSkinToElement, getDiceSkin, create2DDiceHTML, renderDicePipsHTML } from './dice-skins.js';
import { formatTitleBadge } from './titles.js';
import { getThemedTileData, getMapThemeById } from './map-themes.js';

export function showToast(message) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  while (container.children.length >= 2) {
    container.firstChild.remove();
  }
  const toast = document.createElement('div');
  toast.className = 'md-toast';
  toast.innerText = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-15px) scale(0.9)';
    toast.style.transition = 'all 0.2s ease';
    setTimeout(() => toast.remove(), 200);
  }, 2600);
}

export function showConfirm(title, desc, onOk) {
  const modal = document.getElementById('modal-confirm');
  if (!modal) {
    if (onOk) onOk();
    return;
  }
  document.getElementById('confirm-modal-title').innerText = title;
  document.getElementById('confirm-modal-desc').innerText = desc;
  modal.classList.add('active');

  const btnOk = document.getElementById('btn-confirm-ok');
  const btnCancel = document.getElementById('btn-confirm-cancel');

  const newOk = btnOk.cloneNode(true);
  const newCancel = btnCancel.cloneNode(true);
  btnOk.parentNode.replaceChild(newOk, btnOk);
  btnCancel.parentNode.replaceChild(newCancel, btnCancel);

  newOk.onclick = () => {
    modal.classList.remove('active');
    if (onOk) onOk();
  };

  newCancel.onclick = () => {
    modal.classList.remove('active');
  };
}

export class UIRenderer {
  constructor() {
    this.boardEl = null;
    this.tokensContainerEl = null;
    this.sidebarPlayersEl = null;
    this.actionLogEl = null;
    this.callbacks = {};
    this.isAnimating = false;
    this.lastState = null;
    this.myPlayerId = null;
    this.customTiles = {}; // per-lobby tile name/desc overrides
    this.mapTheme = 'classic'; // selected map theme
  }

  // Apply custom tile overrides and rebuild the board
  setCustomTiles(customTiles) {
    this.customTiles = customTiles || {};
    this.renderBoardGrid();
    if (this.lastState) {
      this.update(this.lastState, this.myPlayerId);
    }
  }

  // Apply map theme and rebuild the board
  setMapTheme(mapThemeId) {
    this.mapTheme = mapThemeId || 'classic';
    this.renderBoardGrid();
    if (this.lastState) {
      this.update(this.lastState, this.myPlayerId);
    }
  }

  // Get tile data with map theme and custom overrides applied
  getTile(tileId) {
    const base = BOARD_TILES[tileId];
    if (!base) return base;
    return getThemedTileData(base, this.mapTheme, this.customTiles);
  }

  init(callbacks) {
    this.callbacks = callbacks;
    this.boardEl = document.getElementById('board-grid');
    this.tokensContainerEl = document.getElementById('tokens-overlay');
    this.sidebarPlayersEl = document.getElementById('sidebar-players');
    this.actionLogEl = document.getElementById('action-log');

    this.renderBoardGrid();
    this.initEventListeners();
  }

  // --- RENDER 11x11 BOARD GRID ---
  renderBoardGrid() {
    if (!this.boardEl) return;
    this.boardEl.innerHTML = '';

    const gridMap = this.calculateGridPositions();

    BOARD_TILES.forEach((baseTile) => {
      const tile = this.getTile(baseTile.id); // apply custom overrides
      const pos = gridMap[baseTile.id];
      const tileDiv = document.createElement('div');
      tileDiv.className = `tile tile-${tile.type}`;
      tileDiv.id = `tile-${tile.id}`;
      tileDiv.style.gridColumn = pos.col;
      tileDiv.style.gridRow = pos.row;

      // Show custom badge if tile has been renamed
      const isCustom = !!(this.customTiles[tile.id] || this.customTiles[String(tile.id)]);

      let colorHeader = '';
      if (tile.type === 'street') {
        const groupInfo = COLOR_GROUPS[tile.group];
        colorHeader = `<div class="tile-header-color" style="background-color: ${groupInfo.color}">${isCustom ? '<span class="tile-custom-badge">✏️</span>' : ''}</div>`;
      }

      let inner = '';
      const tileIconHtml = tile.icon ? `<div class="tile-icon">${tile.icon}</div>` : '';

      if (tile.type === 'corner') {
        tileDiv.classList.add('tile-corner');
        inner = `
          ${tileIconHtml}
          <div class="tile-name">${tile.name}</div>
        `;
      } else if (tile.type === 'chance' || tile.type === 'chest') {
        inner = `
          ${tileIconHtml}
          <div class="tile-name">${tile.name}</div>
          <div class="tile-price sub-price">${tile.type === 'chance' ? 'Шанс' : 'Казна'}</div>
        `;
      } else if (tile.type === 'tax') {
        inner = `
          ${tileIconHtml}
          <div class="tile-name">${tile.name}</div>
          <div class="tile-price tax-price">-$${tile.taxAmount}</div>
        `;
      } else if (tile.type === 'station') {
        inner = `
          ${tileIconHtml}
          <div class="tile-name">${tile.name}${isCustom ? ' ✏️' : ''}</div>
          <div class="tile-price">$${tile.price}</div>
        `;
      } else if (tile.type === 'utility') {
        inner = `
          ${tileIconHtml}
          <div class="tile-name">${tile.name}${isCustom ? ' ✏️' : ''}</div>
          <div class="tile-price">$${tile.price}</div>
        `;
      } else {
        inner = `
          ${colorHeader}
          <div class="tile-improvements" id="improvements-${tile.id}"></div>
          <div class="tile-name">${tile.name}</div>
          ${tileIconHtml}
          <div class="tile-price">$${tile.price}</div>
        `;
      }

      tileDiv.innerHTML = `
        ${inner}
        <div class="tile-owner-indicator" id="owner-bar-${tile.id}"></div>
      `;

      tileDiv.addEventListener('mouseenter', (e) => {
        this.showTileHoverCard(tile.id, e);
      });
      tileDiv.addEventListener('mousemove', (e) => {
        this.updateTileHoverCardPos(e);
      });
      tileDiv.addEventListener('mouseleave', () => {
        this.hideTileHoverCard();
      });

      tileDiv.addEventListener('click', () => {
        sound.playClick();
        this.hideTileHoverCard();
        this.showTileDeedModal(tile.id);
      });

      this.boardEl.appendChild(tileDiv);
    });

    // Center area (Interactive Cockpit with 3D Dice and Action Cards)
    const centerDiv = document.createElement('div');
    centerDiv.className = 'board-center';
    centerDiv.innerHTML = `
      <div class="center-header" style="justify-content: center;">
        <div id="turn-badge" class="turn-status-badge">Ожидание...</div>
      </div>
      
      <div class="jackpot-pool-badge" id="jackpot-badge" style="display: none;">
        <span>Фонд стоянки:</span>
        <span id="jackpot-amount">$0</span>
      </div>

      <!-- 2D Wheel Dice Stage -->
      <div class="dice-stage" id="dice-stage">
        <div class="dice-2d-container" id="dice-2d-container">
          <div id="die-1-slot">${create2DDiceHTML('classic', 1, 'die-slot-1')}</div>
          <div id="die-2-slot">${create2DDiceHTML('classic', 1, 'die-slot-2')}</div>
        </div>
      </div>

      <!-- Center Action Cards -->
      <div class="center-action-cards">
        <button id="btn-roll-card" class="action-card card-primary ready-to-roll" title="Бросить кубики">
          <div class="card-icon"><i class="ph ph-dice-five"></i></div>
          <div class="card-text">
            <div class="card-title">Бросить кубики</div>
            <div class="card-subtitle" id="roll-card-hint">Ваш ход</div>
          </div>
        </button>

        <button id="btn-end-turn-card" class="action-card" disabled title="Завершить ход">
          <div class="card-icon"><i class="ph ph-arrow-circle-right"></i></div>
          <div class="card-text">
            <div class="card-title" id="end-turn-title">Завершить ход</div>
            <div class="card-subtitle" id="end-turn-subtitle">Передать ход</div>
          </div>
        </button>

        <button id="btn-manage-card" class="action-card" title="Управление недвижимостью">
          <div class="card-icon"><i class="ph ph-buildings"></i></div>
          <div class="card-text">
            <div class="card-title">Недвижимость</div>
            <div class="card-subtitle">Постройка и продажа</div>
          </div>
        </button>

        <button id="btn-trade-card" class="action-card" title="Обмен карточками">
          <div class="card-icon"><i class="ph ph-handshake"></i></div>
          <div class="card-text">
            <div class="card-title">Обмен</div>
            <div class="card-subtitle">Трейд карточками</div>
          </div>
        </button>
      </div>

      <!-- Auto Turn Option -->
      <div class="auto-turn-container">
        <button id="btn-toggle-auto-end" class="auto-end-chip active" type="button" title="Автоматически передавать ход через 3 сек">
          <i class="ph ph-lightning"></i>
          <span id="auto-end-label">Авто-ход: <b>ВКЛ</b></span>
        </button>
      </div>
    `;
    this.boardEl.appendChild(centerDiv);
    this.initBoardCenterEventListeners();
  }

  calculateGridPositions() {
    const map = {};
    map[0] = { col: 11, row: 11 };
    for (let i = 1; i <= 9; i++) map[i] = { col: 11 - i, row: 11 };
    map[10] = { col: 1, row: 11 };
    for (let i = 11; i <= 19; i++) map[i] = { col: 1, row: 11 - (i - 10) };
    map[20] = { col: 1, row: 1 };
    for (let i = 21; i <= 29; i++) map[i] = { col: (i - 20) + 1, row: 1 };
    map[30] = { col: 11, row: 1 };
    for (let i = 31; i <= 39; i++) map[i] = { col: 11, row: (i - 30) + 1 };
    return map;
  }

  // --- STANDARD CLASSIC DICE ROLL ANIMATION ---
  animateDiceRoll(finalDice, onComplete, skinId = null) {
    const activeSkin = skinId || profileManager.profile.diceSkin || 'classic';
    this.isAnimating = true;
    sound.playDiceRoll();

    const die1El = document.querySelector('#die-1-slot .dice-2d-item');
    const die2El = document.querySelector('#die-2-slot .dice-2d-item');
    const container = document.getElementById('dice-2d-container');

    if (!die1El || !die2El) {
      if (onComplete) onComplete();
      this.isAnimating = false;
      return;
    }

    applyDiceSkinToElement(die1El, activeSkin);
    applyDiceSkinToElement(die2El, activeSkin);

    die1El.classList.remove('rolling-1', 'landing-pop');
    die2El.classList.remove('rolling-2', 'landing-pop');
    if (container) container.classList.remove('doubles-glow');

    // Force DOM reflow to cleanly restart animations
    void die1El.offsetWidth;
    void die2El.offsetWidth;

    // Start classic shake/bounce animation
    die1El.classList.add('rolling-1');
    die2El.classList.add('rolling-2');

    // Fast cycling through random values
    const shuffleInterval = setInterval(() => {
      const rand1 = Math.floor(Math.random() * 6) + 1;
      const rand2 = Math.floor(Math.random() * 6) + 1;
      const img1 = die1El.querySelector('.dice-pixel-img');
      const img2 = die2El.querySelector('.dice-pixel-img');
      if (img1) img1.src = `assets/dice/dice_${rand1}_normal.png`;
      if (img2) img2.src = `assets/dice/dice_${rand2}_normal.png`;

      const face1 = die1El.querySelector('.dice-face');
      const face2 = die2El.querySelector('.dice-face');
      if (face1) {
        face1.className = `dice-face face-${rand1}`;
        face1.innerHTML = renderDicePipsHTML(rand1);
      }
      if (face2) {
        face2.className = `dice-face face-${rand2}`;
        face2.innerHTML = renderDicePipsHTML(rand2);
      }
    }, 45);

    // Stop shuffling and settle on final values
    setTimeout(() => {
      clearInterval(shuffleInterval);
      const img1 = die1El.querySelector('.dice-pixel-img');
      const img2 = die2El.querySelector('.dice-pixel-img');
      if (img1) img1.src = `assets/dice/dice_${finalDice[0]}_normal.png`;
      if (img2) img2.src = `assets/dice/dice_${finalDice[1]}_normal.png`;

      const face1 = die1El.querySelector('.dice-face');
      const face2 = die2El.querySelector('.dice-face');
      if (face1) {
        face1.className = `dice-face face-${finalDice[0]}`;
        face1.innerHTML = renderDicePipsHTML(finalDice[0]);
      }
      if (face2) {
        face2.className = `dice-face face-${finalDice[1]}`;
        face2.innerHTML = renderDicePipsHTML(finalDice[1]);
      }
      die1El.setAttribute('data-value', finalDice[0]);
      die2El.setAttribute('data-value', finalDice[1]);
    }, 520);

    // Finish roll with landing bounce pop
    setTimeout(() => {
      die1El.classList.remove('rolling-1');
      die2El.classList.remove('rolling-2');
      die1El.classList.add('landing-pop');
      die2El.classList.add('landing-pop');

      sound.playCash();

      if (finalDice[0] === finalDice[1] && container) {
        container.classList.add('doubles-glow');
      }

      this.isAnimating = false;
      if (onComplete) onComplete();
    }, 650);
  }

  // --- STEP-BY-STEP TOKEN HOPPING ANIMATION ---
  animateTokenStepByStep(player, fromTile, toTile, onComplete) {
    if (fromTile === toTile) {
      if (onComplete) onComplete();
      return;
    }

    this.isAnimating = true;
    const totalSteps = (toTile - fromTile + 40) % 40;
    let step = 0;
    let currentPos = fromTile;

    const isFast = localStorage.getItem('monopoly_fast_anim') === '1';
    const stepDelay = isFast ? 55 : 110;
    const finishDelay = isFast ? 80 : 180;

    const interval = setInterval(() => {
      step++;
      currentPos = (currentPos + 1) % 40;
      this.positionSingleToken(player, currentPos);
      sound.playTokenStep();

      if (step >= totalSteps) {
        clearInterval(interval);
        this.isAnimating = false;
        setTimeout(() => {
          if (onComplete) onComplete();
        }, finishDelay);
      }
    }, stepDelay);
  }

  positionSingleToken(player, tilePos) {
    if (!this.tokensContainerEl || !this.boardEl) return;
    const boardRect = this.boardEl.getBoundingClientRect();
    const tileEl = document.getElementById(`tile-${tilePos}`);
    if (!tileEl) return;

    const tileRect = tileEl.getBoundingClientRect();
    let tokenEl = document.getElementById(`token-${player.id}`);
    if (!tokenEl) {
      tokenEl = document.createElement('div');
      tokenEl.className = 'board-token';
      tokenEl.id = `token-${player.id}`;
      this.tokensContainerEl.appendChild(tokenEl);
    }

    tokenEl.innerHTML = renderTokenHTML(player.token, player.customToken);
    tokenEl.style.borderColor = player.color;
    tokenEl.style.top = `${tileRect.top - boardRect.top + (tileRect.height / 2) - 15}px`;
    tokenEl.style.left = `${tileRect.left - boardRect.left + (tileRect.width / 2) - 15}px`;
  }

  // --- UPDATE BOARD STATE ---
  update(state, myPlayerId) {
    if (!state) return;
    this.lastState = state;
    this.myPlayerId = myPlayerId;

    // 1. Update Jackpot badge
    const jackpotBadge = document.getElementById('jackpot-badge');
    const jackpotAmount = document.getElementById('jackpot-amount');
    if (state.settings?.freeParkingJackpot && jackpotBadge) {
      jackpotBadge.style.display = 'inline-flex';
      jackpotAmount.innerText = `$${state.jackpotPool || 0}`;
    } else if (jackpotBadge) {
      jackpotBadge.style.display = 'none';
    }

    // 2. Update Properties on Board
    for (const [tileId, prop] of Object.entries(state.properties)) {
      const ownerBar = document.getElementById(`owner-bar-${tileId}`);
      const improvementsEl = document.getElementById(`improvements-${tileId}`);

      if (ownerBar) {
        if (prop.ownerId) {
          const owner = state.players.find(p => p.id === prop.ownerId);
          ownerBar.style.backgroundColor = owner ? owner.color : 'transparent';
          if (prop.isMortgaged) {
            ownerBar.style.backgroundImage = 'repeating-linear-gradient(45deg, #000 0, #000 3px, transparent 3px, transparent 6px)';
          } else {
            ownerBar.style.backgroundImage = 'none';
          }
        } else {
          ownerBar.style.backgroundColor = 'transparent';
        }
      }

      if (improvementsEl) {
        improvementsEl.innerHTML = '';
        if (prop.houses === 5) {
          improvementsEl.innerHTML = `<div class="hotel-pip" title="Отель"></div>`;
        } else if (prop.houses > 0) {
          for (let h = 0; h < prop.houses; h++) {
            improvementsEl.innerHTML += `<div class="house-pip" title="Дом"></div>`;
          }
        }
      }
    }

    // 3. Update Tokens (if not currently hopping)
    if (!this.isAnimating) {
      this.updateTokens(state.players);
    }

    // 4. Update Dice
    if (state.dice && !this.isAnimating) {
      const curPlayer = state.players ? state.players[state.currentTurn] : null;
      const skin = curPlayer?.diceSkin || profileManager.profile.diceSkin || 'classic';

      let d1 = document.querySelector('#die-1-slot .dice-2d-item');
      let d2 = document.querySelector('#die-2-slot .dice-2d-item');
      if (d1 && d2) {
        applyDiceSkinToElement(d1, skin);
        applyDiceSkinToElement(d2, skin);

        const img1 = d1.querySelector('.dice-pixel-img');
        const img2 = d2.querySelector('.dice-pixel-img');
        if (img1) img1.src = `assets/dice/dice_${state.dice[0]}_normal.png`;
        if (img2) img2.src = `assets/dice/dice_${state.dice[1]}_normal.png`;

        const face1 = d1.querySelector('.dice-face');
        const face2 = d2.querySelector('.dice-face');
        if (face1) {
          face1.className = `dice-face face-${state.dice[0]}`;
          face1.innerHTML = renderDicePipsHTML(state.dice[0]);
        }
        if (face2) {
          face2.className = `dice-face face-${state.dice[1]}`;
          face2.innerHTML = renderDicePipsHTML(state.dice[1]);
        }
        d1.setAttribute('data-value', state.dice[0]);
        d2.setAttribute('data-value', state.dice[1]);
      }
    }

    // 5. Update Sidebar Players
    this.renderSidebarPlayers(state, myPlayerId);

    // 6. Update Action Logs
    this.renderLogs(state.logs);

    // 7. Update Center Action Cards
    this.updateCenterActionCards(state, myPlayerId);

    // 8. Handle Modals
    if (!this.isAnimating) {
      this.handleModals(state, myPlayerId);
    }
  }

  updateTokens(players) {
    if (!this.tokensContainerEl || !this.boardEl) return;
    const boardRect = this.boardEl.getBoundingClientRect();
    if (boardRect.width === 0) return;

    const posGroups = {};
    players.forEach((p) => {
      if (p.isBankrupt) return;
      if (!posGroups[p.position]) posGroups[p.position] = [];
      posGroups[p.position].push(p);
    });

    const currentTokenIds = new Set(players.filter(p => !p.isBankrupt).map(p => `token-${p.id}`));
    Array.from(this.tokensContainerEl.children).forEach(el => {
      if (!currentTokenIds.has(el.id)) el.remove();
    });

    for (const [pos, list] of Object.entries(posGroups)) {
      const tileEl = document.getElementById(`tile-${pos}`);
      if (!tileEl) continue;

      const tileRect = tileEl.getBoundingClientRect();
      const relativeTop = tileRect.top - boardRect.top;
      const relativeLeft = tileRect.left - boardRect.left;

      list.forEach((player, offsetIdx) => {
        let tokenEl = document.getElementById(`token-${player.id}`);
        if (!tokenEl) {
          tokenEl = document.createElement('div');
          tokenEl.className = 'board-token';
          tokenEl.id = `token-${player.id}`;
          this.tokensContainerEl.appendChild(tokenEl);
        }

        tokenEl.innerHTML = renderTokenHTML(player.token, player.customToken);
        tokenEl.style.borderColor = player.color;
        const offsetX = (offsetIdx % 2) * 14;
        const offsetY = Math.floor(offsetIdx / 2) * 14;

        tokenEl.style.top = `${relativeTop + (tileRect.height / 2) - 15 + offsetY}px`;
        tokenEl.style.left = `${relativeLeft + (tileRect.width / 2) - 15 + offsetX}px`;
      });
    }
  }

  renderSidebarPlayers(state, myPlayerId) {
    if (!this.sidebarPlayersEl) return;
    this.sidebarPlayersEl.innerHTML = '';

    state.players.forEach((player, idx) => {
      const isCurrentTurn = state.currentTurn === idx;
      const isMe = player.id === myPlayerId;
      const card = document.createElement('div');
      card.className = `player-card-sidebar ${isCurrentTurn ? 'current-turn' : ''} ${player.isBankrupt ? 'bankrupt' : ''} ${player.hasLeft ? 'player-left' : ''}`;

      const bgDef = getProfileBg(player.bg || player.profileBg);
      const hasCustomBg = bgDef && bgDef.id !== 'default';
      if (hasCustomBg && !player.hasLeft && !player.isBankrupt) {
        card.style.background = bgDef.bgStyle;
        card.style.border = bgDef.borderStyle;
        if (bgDef.glow) card.style.boxShadow = bgDef.glow;
      }

      let propertyDots = '';
      Object.entries(state.properties).forEach(([tileId, prop]) => {
        if (prop.ownerId === player.id) {
          const tile = BOARD_TILES[tileId];
          const color = COLOR_GROUPS[tile.group]?.color || '#888888';
          propertyDots += `<div class="color-dot" style="background-color: ${color}" title="${tile.name}"></div>`;
        }
      });

      let statusHtml = '';
      if (player.hasLeft) {
        statusHtml = `<span class="player-status-tag tag-left"><i class="ph ph-sign-out"></i> Покинул матч</span>`;
      } else if (player.isBankrupt) {
        statusHtml = `<span class="player-status-tag tag-bankrupt">Банкрот</span>`;
      } else if (player.inJail) {
        statusHtml = `<span class="player-status-tag tag-jail">В тюрьме</span>`;
      } else {
        const curTile = BOARD_TILES[player.position];
        statusHtml = `Клетка: ${curTile?.icon ? curTile.icon + ' ' : ''}${curTile?.name || 'Вперёд'}`;
      }

      const displayName = player.hasLeft ? `<s>${player.name}</s>` : player.name;
      const meTag = isMe ? '<span style="font-size: 0.75rem; color: var(--md-primary); font-weight: 500;">(Вы)</span>' : '';
      const titleBadgeHtml = formatTitleBadge(player.title || 'novice');

      card.innerHTML = `
        <div class="player-card-head">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="sidebar-player-token-slot" style="display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; font-size: 1.3rem;">
              ${renderTokenHTML(player.token, player.customToken)}
            </span>
            <div>
              <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                <span style="font-weight: 700; font-size: 0.95rem; color: ${player.hasLeft ? 'var(--md-outline)' : (hasCustomBg ? bgDef.textColor : player.color)};">
                  ${displayName} ${meTag}
                </span>
                ${titleBadgeHtml}
              </div>
              <div style="font-size: 0.75rem; color: ${hasCustomBg ? bgDef.tagColor : 'var(--md-on-surface-variant)'}; margin-top: 2px;">
                ${statusHtml}
              </div>
            </div>
          </div>
          <div class="player-cash" style="${player.hasLeft ? 'opacity: 0.45;' : (hasCustomBg ? `color: ${bgDef.textColor};` : '')}">$${player.cash}</div>
        </div>
        ${propertyDots ? `<div class="player-property-pills">${propertyDots}</div>` : ''}
      `;

      card.style.cursor = 'pointer';
      card.title = 'Нажмите, чтобы открыть профиль игрока';
      card.addEventListener('click', () => {
        if (this.callbacks.onShowPlayerProfile) {
          this.callbacks.onShowPlayerProfile(player, state);
        }
      });

      this.sidebarPlayersEl.appendChild(card);
    });
  }

  renderLogs(logs) {
    if (!this.actionLogEl || !logs) return;
    this.actionLogEl.innerHTML = logs.map(l => `
      <div class="log-entry">
        <span style="opacity: 0.6; font-size: 0.7rem;">[${l.time}]</span> ${l.text}
      </div>
    `).join('');
  }

  // --- UPDATE CENTER ACTION CARDS ---
  updateCenterActionCards(state, myPlayerId) {
    const curPlayer = state.players[state.currentTurn];
    const isMyTurn = curPlayer && (curPlayer.id === myPlayerId || state.isLocalMode);

    const btnRollCard = document.getElementById('btn-roll-card');
    const btnEndTurnCard = document.getElementById('btn-end-turn-card');
    const btnManageCard = document.getElementById('btn-manage-card');
    const btnTradeCard = document.getElementById('btn-trade-card');
    const turnBadge = document.getElementById('turn-badge');
    const rollHint = document.getElementById('roll-card-hint');

    if (!btnRollCard || !btnEndTurnCard) return;

    if (btnTradeCard) {
      const activeMeId = (state.isLocalMode && curPlayer) ? curPlayer.id : myPlayerId;
      const me = state.players.find(p => p.id === activeMeId);
      const otherActivePlayers = state.players.filter(p => p.id !== activeMeId && !p.isBankrupt && !p.hasLeft);
      const canTrade = Boolean(me && !me.isBankrupt && !me.hasLeft && state.status === 'PLAYING' && otherActivePlayers.length > 0);
      btnTradeCard.disabled = !canTrade;
      if (!canTrade) {
        btnTradeCard.title = (otherActivePlayers.length === 0) ? 'Нет доступных игроков для обмена' : 'Обмен недоступен';
      } else {
        btnTradeCard.title = 'Обмен карточками';
      }
    }

    if (!isMyTurn || state.status !== 'PLAYING') {
      btnRollCard.disabled = true;
      btnEndTurnCard.disabled = true;
      btnRollCard.classList.remove('ready-to-roll');
      if (turnBadge) {
        turnBadge.innerText = curPlayer ? `Ходит: ${curPlayer.name}` : '';
        turnBadge.classList.remove('my-turn');
      }
      if (rollHint) rollHint.innerText = 'Ожидание соперника';
    } else {
      if (turnBadge) {
        turnBadge.innerText = 'Ваш ход!';
        turnBadge.classList.add('my-turn');
      }

      if (state.phase === 'ROLL') {
        btnRollCard.disabled = false;
        btnEndTurnCard.disabled = true;
        btnRollCard.classList.add('ready-to-roll');
        if (rollHint) rollHint.innerText = 'Нажмите для броска';
      } else if (state.phase === 'ACTION') {
        if (state.lastRollDoubles) {
          // Doubles: must roll again — block End Turn, enable Roll
          btnRollCard.disabled = false;
          btnEndTurnCard.disabled = true;
          btnRollCard.classList.add('ready-to-roll');
          if (rollHint) rollHint.innerText = '🎲 Дубль! Броска ещё раз обязателен';
          if (btnEndTurnCard) {
            btnEndTurnCard.title = 'Нельзя завершить ход при дабле — бросьте кубики ещё раз';
          }
        } else {
          btnRollCard.disabled = true;
          btnEndTurnCard.disabled = false;
          btnEndTurnCard.title = '';
          btnRollCard.classList.remove('ready-to-roll');
          if (rollHint) rollHint.innerText = 'Кубики брошены';
          if (this.callbacks.checkAutoEnd) this.callbacks.checkAutoEnd();
        }
      } else {
        btnRollCard.disabled = true;
        btnEndTurnCard.disabled = true;
        btnRollCard.classList.remove('ready-to-roll');
      }
    }
  }

  handleModals(state, myPlayerId) {
    const curPlayer = state.players[state.currentTurn];
    const isMyTurn = curPlayer && (curPlayer.id === myPlayerId || (!curPlayer.isBot && state.isLocalMode));

    const buyModal = document.getElementById('modal-buy-property');
    if (buyModal) {
      if (state.phase === 'BUY_CHOICE' && isMyTurn) {
        const tile = this.getTile(curPlayer.position);
        const canAfford = curPlayer.cash >= tile.price;
        const buyName = document.getElementById('buy-prop-name');
        const buyPrice = document.getElementById('buy-prop-price');
        const btnBuy = document.getElementById('btn-confirm-buy');
        if (buyName) buyName.innerText = `${tile.icon ? tile.icon + ' ' : ''}${tile.name}`;
        if (buyPrice) {
          buyPrice.innerText = `$${tile.price}${!canAfford ? ` (У вас: $${curPlayer.cash})` : ''}`;
          buyPrice.style.color = canAfford ? 'var(--md-primary)' : 'var(--md-error)';
        }
        if (btnBuy) {
          btnBuy.disabled = !canAfford;
          btnBuy.innerText = canAfford ? 'Купить' : 'Недостаточно денег';
        }
        buyModal.classList.add('active');
      } else {
        buyModal.classList.remove('active');
      }
    }

    const cardModal = document.getElementById('modal-card');
    if (cardModal) {
      if (state.phase === 'CARD_EVENT' && state.activeCard && isMyTurn) {
        document.getElementById('card-title').innerText = state.activeCard.title;
        document.getElementById('card-desc').innerText = state.activeCard.desc;
        cardModal.classList.add('active');
      } else {
        cardModal.classList.remove('active');
      }
    }

    const winModal = document.getElementById('modal-winner');
    if (winModal) {
      if (state.status === 'FINISHED' && state.winner) {
        const winNameEl = document.getElementById('winner-name');
        if (winNameEl) winNameEl.innerText = `${state.winner.name} победил!`;
        if (!winModal.classList.contains('active')) {
          winModal.classList.add('active');
          sound.playWin();
          if (this.callbacks.onGameFinished) {
            this.callbacks.onGameFinished(state);
          }
        }
      } else {
        winModal.classList.remove('active');
      }
    }
  }

  showTileHoverCard(tileId, e) {
    if (localStorage.getItem('monopoly_tooltips') === '0') return;
    const popover = document.getElementById('tile-hover-popover');
    if (!popover) return;
    popover.innerHTML = this.renderTileDeedHTML(tileId, true);
    popover.style.display = 'block';
    this.updateTileHoverCardPos(e);
    requestAnimationFrame(() => {
      popover.classList.add('visible');
    });
  }

  hideTileHoverCard() {
    const popover = document.getElementById('tile-hover-popover');
    if (!popover) return;
    popover.classList.remove('visible');
    setTimeout(() => {
      if (!popover.classList.contains('visible')) {
        popover.style.display = 'none';
      }
    }, 150);
  }

  updateTileHoverCardPos(e) {
    const popover = document.getElementById('tile-hover-popover');
    if (!popover || popover.style.display === 'none') return;
    const cardWidth = 290;
    const cardHeight = popover.offsetHeight || 320;
    const padding = 16;

    let x = e.clientX + 16;
    let y = e.clientY + 16;

    if (x + cardWidth > window.innerWidth - padding) {
      x = e.clientX - cardWidth - 16;
    }
    if (y + cardHeight > window.innerHeight - padding) {
      y = window.innerHeight - cardHeight - padding;
    }
    if (x < padding) x = padding;
    if (y < padding) y = padding;

    popover.style.left = `${x}px`;
    popover.style.top = `${y}px`;
  }

  renderTileDeedHTML(tileId, isPopover = false) {
    const tile = this.getTile(tileId);
    if (!tile) return '';

    const state = this.lastState;
    const prop = state?.properties ? state.properties[tileId] : null;
    const owner = prop?.ownerId ? state.players?.find(p => p.id === prop.ownerId) : null;
    const isMe = Boolean(owner && owner.id === this.myPlayerId);

    let groupColor = '#334155';
    let groupName = '';
    if (tile.group && COLOR_GROUPS[tile.group]) {
      groupColor = COLOR_GROUPS[tile.group].color;
      groupName = COLOR_GROUPS[tile.group].name;
    } else if (tile.type === 'station') {
      groupColor = '#475569';
      groupName = 'Вокзал';
    } else if (tile.type === 'utility') {
      groupColor = '#334155';
      groupName = 'Служба';
    } else if (tile.type === 'tax') {
      groupColor = '#dc2626';
      groupName = 'Налог';
    } else if (tile.type === 'chance') {
      groupColor = '#f59e0b';
      groupName = 'Шанс';
    } else if (tile.type === 'chest') {
      groupColor = '#3b82f6';
      groupName = 'Казна';
    } else {
      groupColor = '#1e293b';
      groupName = 'Поле';
    }

    // Owner Status HTML
    let ownerStatusHtml = '';
    if (tile.type === 'street' || tile.type === 'station' || tile.type === 'utility') {
      if (owner) {
        const ownerName = isMe ? `${owner.name} (Вы)` : owner.name;
        const mortgagedTag = prop?.isMortgaged ? ' <span style="color:#f87171; font-weight:700;">[Заложено]</span>' : '';
        ownerStatusHtml = `
          <div class="deed-owner-status-bar">
            <span class="deed-owner-tag" style="color: ${owner.color || '#38bdf8'}">
              <span class="deed-owner-dot" style="background-color: ${owner.color || '#38bdf8'};"></span>
              ${ownerName}${mortgagedTag}
            </span>
            <span style="color: var(--md-on-surface-variant); font-size: 0.72rem;">Куплено</span>
          </div>
        `;
      } else {
        ownerStatusHtml = `
          <div class="deed-owner-status-bar">
            <span style="color: #94a3b8;"><i class="ph ph-shopping-bag"></i> Свободно</span>
            <span style="color: #4ade80; font-weight: 700;">$${tile.price}</span>
          </div>
        `;
      }
    }

    // Determine current active level & active rent
    let currentRentText = '';
    let activeLevelKey = '';

    if (tile.type === 'street') {
      if (prop?.isMortgaged) {
        currentRentText = '$0 (В залоге)';
        activeLevelKey = 'mortgaged';
      } else if (prop && prop.houses === 5) {
        currentRentText = `$${tile.rent[5]}`;
        activeLevelKey = 'hotel';
      } else if (prop && prop.houses > 0) {
        currentRentText = `$${tile.rent[prop.houses]}`;
        activeLevelKey = `house_${prop.houses}`;
      } else if (prop && prop.ownerId) {
        const groupProps = COLOR_GROUPS[tile.group]?.tiles || [];
        const hasMonopoly = groupProps.length > 0 && groupProps.every(id => state?.properties?.[id]?.ownerId === prop.ownerId && !state?.properties?.[id]?.isMortgaged);
        if (hasMonopoly) {
          currentRentText = `$${tile.rent[0] * 2} (Монополия)`;
          activeLevelKey = 'monopoly';
        } else {
          currentRentText = `$${tile.rent[0]}`;
          activeLevelKey = 'base';
        }
      } else {
        currentRentText = `$${tile.rent[0]}`;
        activeLevelKey = 'base';
      }
    } else if (tile.type === 'station') {
      if (prop?.isMortgaged) {
        currentRentText = '$0 (В залоге)';
        activeLevelKey = 'mortgaged';
      } else if (prop && prop.ownerId) {
        const stationIds = [5, 15, 25, 35];
        const ownedStations = stationIds.filter(id => state?.properties?.[id]?.ownerId === prop.ownerId && !state?.properties?.[id]?.isMortgaged).length;
        const rentTiers = [25, 50, 100, 200];
        const rentVal = rentTiers[Math.max(0, Math.min(3, (ownedStations || 1) - 1))];
        currentRentText = `$${rentVal}`;
        activeLevelKey = `station_${ownedStations || 1}`;
      } else {
        currentRentText = '$25';
        activeLevelKey = 'station_1';
      }
    } else if (tile.type === 'utility') {
      if (prop?.isMortgaged) {
        currentRentText = '$0 (В залоге)';
        activeLevelKey = 'mortgaged';
      } else if (prop && prop.ownerId) {
        const utilIds = [12, 28];
        const ownedUtils = utilIds.filter(id => state?.properties?.[id]?.ownerId === prop.ownerId && !state?.properties?.[id]?.isMortgaged).length;
        currentRentText = ownedUtils >= 2 ? '10x бросок' : '4x бросок';
        activeLevelKey = ownedUtils >= 2 ? 'util_2' : 'util_1';
      } else {
        currentRentText = '4x бросок';
        activeLevelKey = 'util_1';
      }
    }

    let currentRentBanner = '';
    if (tile.type === 'street' || tile.type === 'station' || tile.type === 'utility') {
      currentRentBanner = `
        <div class="deed-current-rent-banner">
          <span class="deed-current-rent-label">Текущая аренда</span>
          <span class="deed-current-rent-value">${currentRentText}</span>
        </div>
      `;
    }

    let bodyHtml = '';
    if (tile.type === 'street') {
      bodyHtml = `
        <div class="rent-row-dark ${activeLevelKey === 'base' ? 'active-level' : ''}">
          <span class="rent-label-dark">Базовая аренда:</span>
          <span class="rent-val-dark">$${tile.rent[0]}</span>
        </div>
        <div class="rent-row-dark ${activeLevelKey === 'monopoly' ? 'active-level' : ''}">
          <span class="rent-label-dark">С монополией (x2):</span>
          <span class="rent-val-dark">$${tile.rent[0] * 2}</span>
        </div>
        <div class="rent-row-dark ${activeLevelKey === 'house_1' ? 'active-level' : ''}">
          <span class="rent-label-dark">С 1 домом 🏠:</span>
          <span class="rent-val-dark">$${tile.rent[1]}</span>
        </div>
        <div class="rent-row-dark ${activeLevelKey === 'house_2' ? 'active-level' : ''}">
          <span class="rent-label-dark">С 2 домами 🏠🏠:</span>
          <span class="rent-val-dark">$${tile.rent[2]}</span>
        </div>
        <div class="rent-row-dark ${activeLevelKey === 'house_3' ? 'active-level' : ''}">
          <span class="rent-label-dark">С 3 домами 🏠🏠🏠:</span>
          <span class="rent-val-dark">$${tile.rent[3]}</span>
        </div>
        <div class="rent-row-dark ${activeLevelKey === 'house_4' ? 'active-level' : ''}">
          <span class="rent-label-dark">С 4 домами 🏠🏠🏠🏠:</span>
          <span class="rent-val-dark">$${tile.rent[4]}</span>
        </div>
        <div class="rent-row-dark ${activeLevelKey === 'hotel' ? 'active-level' : ''}">
          <span class="rent-label-dark">С отелем 🏨:</span>
          <span class="rent-val-dark">$${tile.rent[5]}</span>
        </div>
      `;
    } else if (tile.type === 'station') {
      bodyHtml = `
        <div class="rent-row-dark ${activeLevelKey === 'station_1' ? 'active-level' : ''}">
          <span class="rent-label-dark">1 вокзал 🚂:</span>
          <span class="rent-val-dark">$25</span>
        </div>
        <div class="rent-row-dark ${activeLevelKey === 'station_2' ? 'active-level' : ''}">
          <span class="rent-label-dark">2 вокзала 🚂🚂:</span>
          <span class="rent-val-dark">$50</span>
        </div>
        <div class="rent-row-dark ${activeLevelKey === 'station_3' ? 'active-level' : ''}">
          <span class="rent-label-dark">3 вокзала 🚂🚂🚂:</span>
          <span class="rent-val-dark">$100</span>
        </div>
        <div class="rent-row-dark ${activeLevelKey === 'station_4' ? 'active-level' : ''}">
          <span class="rent-label-dark">4 вокзала 🚂🚂🚂🚂:</span>
          <span class="rent-val-dark">$200</span>
        </div>
      `;
    } else if (tile.type === 'utility') {
      bodyHtml = `
        <div class="rent-row-dark ${activeLevelKey === 'util_1' ? 'active-level' : ''}">
          <span class="rent-label-dark">1 предприятие 💡:</span>
          <span class="rent-val-dark">4x броска</span>
        </div>
        <div class="rent-row-dark ${activeLevelKey === 'util_2' ? 'active-level' : ''}">
          <span class="rent-label-dark">2 предприятия 💡🚰:</span>
          <span class="rent-val-dark">10x броска</span>
        </div>
      `;
    } else {
      bodyHtml = `
        <div style="padding: 10px 8px; font-size: 0.85rem; color: #cbd5e1; line-height: 1.45;">
          ${tile.desc || 'Особая клетка игрового поля.'}
          ${tile.taxAmount ? `<div style="margin-top: 6px; color: #f87171; font-weight: 700;">Налог: $${tile.taxAmount}</div>` : ''}
        </div>
      `;
    }

    let footerHtml = '';
    if (tile.type === 'street') {
      footerHtml = `
        <div class="deed-footer-dark">
          <div>Постройка: <b>$${tile.houseCost}</b></div>
          <div>Цена покупки: <b>$${tile.price}</b></div>
        </div>
      `;
    } else if (tile.type === 'station' || tile.type === 'utility') {
      footerHtml = `
        <div class="deed-footer-dark">
          <div>Цена покупки: <b>$${tile.price}</b></div>
        </div>
      `;
    }

    return `
      <div class="property-deed-dark">
        <div class="deed-header-dark" style="background: linear-gradient(135deg, ${groupColor}, rgba(15,23,42,0.85));">
          <div class="deed-title-row">
            <span class="deed-title">${tile.icon ? tile.icon + ' ' : ''}${tile.name}</span>
            <span class="deed-group-pill">${groupName}</span>
          </div>
        </div>
        ${ownerStatusHtml}
        ${currentRentBanner}
        <div class="deed-body-dark">
          ${bodyHtml}
        </div>
        ${footerHtml}
      </div>
    `;
  }

  showTileDeedModal(tileId) {
    const tile = BOARD_TILES[tileId];
    if (!tile) return;

    const modal = document.getElementById('modal-deed');
    const content = document.getElementById('deed-modal-content');
    if (!modal || !content) return;

    content.innerHTML = this.renderTileDeedHTML(tileId, false);
    modal.classList.add('active');
  }

  initBoardCenterEventListeners() {
    // Primary Action Card: Roll Dice
    const btnRollCard = document.getElementById('btn-roll-card');
    if (btnRollCard) {
      btnRollCard.onclick = () => {
        if (this.isAnimating) return;
        if (this.callbacks.onRoll) this.callbacks.onRoll();
      };
    }

    // Dice Stage click to roll
    const diceStage = document.getElementById('dice-stage');
    if (diceStage) {
      diceStage.onclick = () => {
        const btnRoll = document.getElementById('btn-roll-card');
        if (btnRoll && !btnRoll.disabled && !this.isAnimating) {
          btnRoll.click();
        }
      };
    }

    // Secondary Action Card: End Turn
    const btnEndTurnCard = document.getElementById('btn-end-turn-card');
    if (btnEndTurnCard) {
      btnEndTurnCard.onclick = () => {
        if (this.isAnimating) return;
        sound.playClick();
        if (this.callbacks.onEndTurn) this.callbacks.onEndTurn();
      };
    }

    // Tertiary Action Card: Manage Properties
    const btnManageCard = document.getElementById('btn-manage-card');
    if (btnManageCard) {
      btnManageCard.onclick = () => {
        sound.playClick();
        if (this.callbacks.onManageProperties) this.callbacks.onManageProperties();
      };
    }

    // Quaternary Action Card: Trade Cards
    const btnTradeCard = document.getElementById('btn-trade-card');
    if (btnTradeCard) {
      btnTradeCard.onclick = () => {
        if (btnTradeCard.disabled) return;
        sound.playClick();
        if (this.callbacks.onTrade) this.callbacks.onTrade();
      };
    }

    // Auto-End Turn Toggle Chip
    const btnToggleAutoEnd = document.getElementById('btn-toggle-auto-end');
    if (btnToggleAutoEnd) {
      btnToggleAutoEnd.onclick = () => {
        sound.playClick();
        if (this.callbacks.onToggleAutoEnd) this.callbacks.onToggleAutoEnd();
      };
    }
  }

  initEventListeners() {
    this.initBoardCenterEventListeners();

    document.getElementById('btn-confirm-buy')?.addEventListener('click', () => {
      sound.playCash();
      document.getElementById('modal-buy-property')?.classList.remove('active');
      if (this.callbacks.onBuy) this.callbacks.onBuy();
    });

    document.getElementById('btn-decline-buy')?.addEventListener('click', () => {
      sound.playClick();
      document.getElementById('modal-buy-property')?.classList.remove('active');
      if (this.callbacks.onPass) this.callbacks.onPass();
    });

    document.getElementById('btn-card-ok')?.addEventListener('click', () => {
      sound.playClick();
      document.getElementById('modal-card')?.classList.remove('active');
      if (this.callbacks.onCardOk) this.callbacks.onCardOk();
    });

    document.querySelectorAll('[data-close-modal]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const modal = e.target.closest('.md-modal-backdrop');
        if (modal) modal.classList.remove('active');
      });
    });

    document.querySelectorAll('.md-modal-backdrop').forEach(backdrop => {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) {
          backdrop.classList.remove('active');
        }
      });
    });
  }

  renderTradeHistoryModal(tradeHistory = []) {
    const listEl = document.getElementById('trade-history-list');
    if (!listEl) return;

    if (!tradeHistory || tradeHistory.length === 0) {
      listEl.innerHTML = `
        <div style="text-align: center; color: var(--md-on-surface-variant); padding: 36px 16px;">
          <i class="ph ph-handshake" style="font-size: 2.2rem; opacity: 0.4; display: block; margin-bottom: 8px;"></i>
          В этой игре пока не было заключено ни одной сделки
        </div>
      `;
      return;
    }

    listEl.innerHTML = tradeHistory.map(r => {
      const fromCardsHtml = (r.fromCardNames && r.fromCardNames.length > 0)
        ? r.fromCardNames.map(n => `• ${n}`).join('<br>')
        : '';
      const fromCashHtml = r.fromCash > 0 ? `• $${r.fromCash}` : '';
      const fromEmpty = !fromCardsHtml && !fromCashHtml ? '<span style="opacity:0.6;">Ничего</span>' : '';

      const toCardsHtml = (r.toCardNames && r.toCardNames.length > 0)
        ? r.toCardNames.map(n => `• ${n}`).join('<br>')
        : '';
      const toCashHtml = r.toCash > 0 ? `• $${r.toCash}` : '';
      const toEmpty = !toCardsHtml && !toCashHtml ? '<span style="opacity:0.6;">Ничего</span>' : '';

      return `
        <div class="trade-history-card">
          <div class="trade-history-head">
            <span>🤝 ${r.fromName} ⇄ ${r.toName}</span>
            <span style="font-size: 0.75rem; opacity: 0.7; font-weight: normal;">${r.time || ''}</span>
          </div>
          <div class="trade-history-details">
            <div>
              <b style="color: var(--md-primary);">${r.fromName} отдал:</b><br>
              ${fromCardsHtml}${fromCardsHtml && fromCashHtml ? '<br>' : ''}${fromCashHtml}${fromEmpty}
            </div>
            <div>
              <b style="color: var(--md-primary);">${r.toName} отдал:</b><br>
              ${toCardsHtml}${toCardsHtml && toCashHtml ? '<br>' : ''}${toCashHtml}${toEmpty}
            </div>
          </div>
          ${r.commission > 0 ? `<div style="font-size: 0.75rem; color: var(--md-error); margin-top: 6px;">Уплачена комиссия 10%: $${r.commission}</div>` : ''}
        </div>
      `;
    }).join('');
  }

  showToast(message) {
    showToast(message);
  }

  showConfirm(title, desc, onOk) {
    showConfirm(title, desc, onOk);
  }

  showWinnerModal(winner) {
    sound.playWin();
    const modal = document.getElementById('modal-winner');
    if (modal) {
      modal.classList.add('active');
    }
  }
}

export const ui = new UIRenderer();
ui.showToast = showToast;
ui.showConfirm = showConfirm;
