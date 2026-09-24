/**
 * Monopoly Game Engine
 * Pure state machine handling all rules, movement, transactions, improvements & AI logic
 */

import { BOARD_TILES, COLOR_GROUPS } from './board-data.js';
import { CHANCE_CARDS, CHEST_CARDS } from './cards-data.js';
import { getPresetById } from './presets.js';

export class MonopolyEngine {
  constructor() {
    this.reset();
  }

  reset() {
    this.status = 'IDLE'; // IDLE, LOBBY, PLAYING, FINISHED
    this.players = [];
    this.properties = {}; // tileId -> { ownerId, houses: 0..5, isMortgaged: false }
    this.currentTurn = 0;
    this.dice = [1, 1];
    this.lastRollDoubles = false;
    this.doublesStreak = 0;
    this.hasRolled = false;
    this.phase = 'ROLL'; // ROLL, ACTION, BUY_CHOICE, CARD_EVENT, TRADE, BANKRUPT
    this.jackpotPool = 0;
    this.settings = getPresetById('classic').settings;
    this.customTiles = {}; // { tileId: { name, desc } } — per-lobby overrides
    this.tradeHistory = [];
    this.logs = [];
    this.activeCard = null;
    this.activeTrade = null;
    this.winner = null;
    this.turnTimer = null;
    this.timeLeft = 60;
  }

  // --- INITIALIZATION ---
  initGame(playersList, presetOrSettings, customTiles = {}) {
    this.reset();
    this.status = 'PLAYING';
    this.customTiles = customTiles || {};
    
    if (typeof presetOrSettings === 'string') {
      this.settings = { ...getPresetById(presetOrSettings).settings };
    } else if (presetOrSettings) {
      this.settings = { ...presetOrSettings };
    }

    this.jackpotPool = this.settings.initialJackpot || 0;

    // Initialize players
    this.players = playersList.map((p, idx) => ({
      id: p.id || `p_${idx}`,
      name: p.name || `Игрок ${idx + 1}`,
      token: p.token || '🎩',
      title: p.title || 'novice',
      diceSkin: p.diceSkin || 'classic',
      color: p.color || '#2563eb',
      bg: p.bg || p.profileBg || 'default',
      profileBg: p.bg || p.profileBg || 'default',
      coins: p.coins || 0,
      stats: p.stats || {},
      avatarUrl: p.avatarUrl || null,
      discordId: p.discordId || null,
      discordUsername: p.discordUsername || null,
      isRegistered: !!p.isRegistered,
      cash: this.settings.startingCash || 1500,
      position: 0,
      inJail: false,
      jailTurns: 0,
      jailCards: 0,
      isBankrupt: false,
      isBot: !!p.isBot,
      botPersonality: p.botPersonality || 'balanced',
      botDifficulty: p.botDifficulty || this.settings.botDifficulty || 'medium'
    }));

    // Initialize all properties
    BOARD_TILES.forEach(tile => {
      if (['street', 'station', 'utility'].includes(tile.type)) {
        this.properties[tile.id] = {
          ownerId: null,
          houses: 0,
          isMortgaged: false
        };
      }
    });

    // Deal random streets if blitz preset active
    if (this.settings.initialRandomStreets > 0) {
      const purchasableTiles = BOARD_TILES.filter(t => ['street', 'station'].includes(t.type)).map(t => t.id);
      // Shuffle
      const shuffled = [...purchasableTiles].sort(() => Math.random() - 0.5);
      let tileIdx = 0;
      for (let r = 0; r < this.settings.initialRandomStreets; r++) {
        for (const player of this.players) {
          if (tileIdx < shuffled.length) {
            const tileId = shuffled[tileIdx++];
            this.properties[tileId].ownerId = player.id;
          }
        }
      }
    }

    this.currentTurn = 0;
    this.phase = 'ROLL';
    this.addLog(`🎲 Игра началась! Первый ходит: ${this.getCurrentPlayer().name}`);
    return this.getState();
  }

  getCurrentPlayer() {
    return this.players[this.currentTurn];
  }

  addLog(message, meta = null) {
    const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const logItem = { time, text: message, meta };
    this.logs.unshift(logItem);
    if (this.logs.length > 50) this.logs.pop();
    if (typeof this.onLogCallback === 'function') {
      this.onLogCallback(logItem);
    }
  }

  // --- DICE ROLLING & MOVEMENT ---
  rollDice(forcedValues = null) {
    if (this.phase !== 'ROLL' && !(this.phase === 'ACTION' && this.lastRollDoubles)) {
      return { success: false, reason: 'Не время бросать кубики' };
    }

    const d1 = forcedValues ? forcedValues[0] : Math.floor(Math.random() * 6) + 1;
    const d2 = forcedValues ? forcedValues[1] : Math.floor(Math.random() * 6) + 1;
    this.dice = [d1, d2];
    const isDoubles = d1 === d2;
    this.lastRollDoubles = isDoubles;
    this.hasRolled = true;

    const player = this.getCurrentPlayer();
    const oldPos = player.position;
    this.addLog(`${player.name} выбросил ${d1} и ${d2} (сумма ${d1 + d2})`);

    // Handle Jail status
    if (player.inJail) {
      if (isDoubles) {
        player.inJail = false;
        player.jailTurns = 0;
        this.doublesStreak = 0;
        this.addLog(`${player.name} выбросил дубль и выходит из тюрьмы.`);
        this.movePlayer(player.id, d1 + d2);
        return { success: true, doubles: true, inJail: false, dice: this.dice, oldPos, newPos: player.position };
      } else {
        player.jailTurns += 1;
        if (player.jailTurns >= 3) {
          this.deductCash(player, 50);
          player.inJail = false;
          player.jailTurns = 0;
          this.addLog(`🔓 ${player.name} оплатил штраф $50 после 3 неудачных попыток и вышел на свободу.`, { type: 'loss', amount: 50 });
          this.movePlayer(player.id, d1 + d2);
        } else {
          this.addLog(`${player.name} остаётся в тюрьме (попытка ${player.jailTurns}/3).`);
          this.phase = 'ACTION';
        }
        return { success: true, doubles: false, inJail: player.inJail, dice: this.dice, oldPos, newPos: player.position };
      }
    }

    // Handle 3 consecutive doubles rule
    if (isDoubles) {
      this.doublesStreak += 1;
      if (this.doublesStreak >= 3) {
        this.sendToJail(player);
        this.doublesStreak = 0;
        this.addLog(`👮 ${player.name} выбросил 3 дубля подряд и отправлен в тюрьму!`, { type: 'special' });
        return { success: true, doubles: true, inJail: true, dice: this.dice, oldPos, newPos: player.position };
      }
    } else {
      this.doublesStreak = 0;
    }

    // Move player
    this.movePlayer(player.id, d1 + d2);
    return { success: true, doubles: isDoubles, dice: this.dice, oldPos, newPos: player.position };
  }

  movePlayer(playerId, steps, allowSalary = true) {
    const player = this.players.find(p => p.id === playerId);
    if (!player || player.isBankrupt) return { oldPos: 0, newPos: 0 };

    const oldPos = player.position;
    let newPos = (oldPos + steps) % 40;
    if (newPos < 0) newPos += 40;

    // Passed GO
    if (allowSalary && (oldPos + steps >= 40)) {
      const salary = (newPos === 0 && this.settings.doubleSalaryOnGoLanding) 
        ? this.settings.salary * 2 
        : this.settings.salary;
      player.cash += salary;
      if (newPos === 0 && this.settings.doubleSalaryOnGoLanding) {
        this.addLog(`🎉 ${player.name} остановился на поле «Вперёд» и получил 2x зарплату: +$${salary}`, { type: 'gain', amount: salary });
      } else {
        this.addLog(`💵 ${player.name} прошёл поле «Вперёд» и получил зарплату: +$${salary}`, { type: 'gain', amount: salary });
      }
    }

    player.position = newPos;
    this.handleTileLanding(player, newPos);
    return { oldPos, newPos };
  }

  handleTileLanding(player, tileId) {
    const tile = BOARD_TILES[tileId];

    switch (tile.type) {
      case 'street':
      case 'station':
      case 'utility': {
        const prop = this.properties[tileId];
        if (!prop.ownerId) {
          // Unowned - offer to buy
          this.phase = 'BUY_CHOICE';
          this.addLog(`📍 ${player.name} попал на поле «${tile.name}» (свободно за $${tile.price})`);
        } else if (prop.ownerId === player.id) {
          this.phase = 'ACTION';
          this.addLog(`📍 ${player.name} отдыхает на своей собственности «${tile.name}»`);
        } else {
          // Owned by someone else
          const owner = this.players.find(p => p.id === prop.ownerId);
          if (prop.isMortgaged) {
            this.phase = 'ACTION';
            this.addLog(`📍 «${tile.name}» в залоге у ${owner.name}, аренда не взимается.`);
          } else if (owner.inJail && !this.settings.rentInJail) {
            this.phase = 'ACTION';
            this.addLog(`📍 Владелец «${tile.name}» в тюрьме, аренда не платится.`);
          } else {
            const rent = this.calculateRent(tileId);
            this.phase = 'ACTION';
            this.addLog(`💸 ${player.name} заплатил аренду $${rent} игроку ${owner.name} за «${tile.name}»`, { type: 'loss', amount: rent });
            this.transferCash(player, owner, rent);
          }
        }
        break;
      }

      case 'tax': {
        const tax = Math.round((tile.taxAmount || 100) * (this.settings.taxMultiplier || 1.0));
        this.phase = 'ACTION';
        this.addLog(`💸 ${player.name} платил налог: -$${tax}`, { type: 'loss', amount: tax });
        this.deductCash(player, tax);
        if (this.settings.freeParkingJackpot) {
          this.jackpotPool += tax;
        }
        break;
      }

      case 'chance': {
        this.drawCard(player, 'chance');
        break;
      }

      case 'chest': {
        this.drawCard(player, 'chest');
        break;
      }

      case 'corner': {
        this.phase = 'ACTION';
        if (tileId === 30) {
          // Go to jail
          this.sendToJail(player);
          this.addLog(`👮 ${player.name} отправлен в тюрьму!`, { type: 'special' });
        } else if (tileId === 20) {
          // Free parking
          if (this.settings.freeParkingJackpot && this.jackpotPool > 0) {
            const pool = this.jackpotPool;
            player.cash += pool;
            this.addLog(`🎉 ${player.name} сорвал ДЖЕКПОТ на стоянке: +$${pool}!`, { type: 'gain', amount: pool });
            this.jackpotPool = 0;
          } else {
            this.addLog(`🅿️ ${player.name} отдыхает на бесплатной стоянке.`);
          }
        }
        break;
      }
    }
  }

  // --- BUY & IMPROVE PROPERTIES ---
  buyProperty(playerId = null, tileId = null) {
    const player = playerId ? this.players.find(p => p.id === playerId) : this.getCurrentPlayer();
    const targetTileId = tileId !== null ? tileId : player.position;
    const tile = BOARD_TILES[targetTileId];
    const prop = this.properties[targetTileId];

    if (!tile || !prop || prop.ownerId) {
      return { success: false, reason: 'Недвижимость уже куплена или недоступна' };
    }

    if (player.cash < tile.price) {
      return { success: false, reason: 'Недостаточно денег' };
    }

    player.cash -= tile.price;
    prop.ownerId = player.id;
    this.phase = 'ACTION';
    this.addLog(`🏠 ${player.name} купил «${tile.name}» за $${tile.price}`);
    return { success: true, tileId: targetTileId };
  }

  passProperty() {
    this.phase = 'ACTION';
    this.addLog(`⏩ Игрок отказался от покупки.`);
  }

  calculateRent(tileId) {
    const tile = BOARD_TILES[tileId];
    const prop = this.properties[tileId];
    if (!tile || !prop || !prop.ownerId || prop.isMortgaged) return 0;

    let rent = 0;
    const mult = this.settings.rentMultiplier || 1.0;

    if (tile.type === 'street') {
      const houses = prop.houses || 0;
      if (houses > 0) {
        rent = tile.rent[houses];
      } else {
        const hasMonopoly = this.hasFullColorGroup(prop.ownerId, tile.group);
        rent = hasMonopoly ? (tile.rent[0] * 2) : tile.rent[0];
      }
    } else if (tile.type === 'station') {
      const stationsOwned = BOARD_TILES
        .filter(t => t.type === 'station')
        .filter(t => this.properties[t.id].ownerId === prop.ownerId).length;
      rent = tile.rent[Math.min(stationsOwned - 1, 3)] || 25;
    } else if (tile.type === 'utility') {
      const utilsOwned = BOARD_TILES
        .filter(t => t.type === 'utility')
        .filter(t => this.properties[t.id].ownerId === prop.ownerId).length;
      const diceSum = this.dice[0] + this.dice[1];
      rent = utilsOwned >= 2 ? diceSum * 10 : diceSum * 4;
    }

    return Math.round(rent * mult);
  }

  hasFullColorGroup(playerId, group) {
    if (!group || ['station', 'utility'].includes(group)) return false;
    const groupTiles = BOARD_TILES.filter(t => t.group === group);
    return groupTiles.every(t => this.properties[t.id]?.ownerId === playerId);
  }

  canBuildHouse(playerId, tileId) {
    const tile = BOARD_TILES[tileId];
    const prop = this.properties[tileId];
    if (!tile || tile.type !== 'street' || prop.ownerId !== playerId) return false;
    if (prop.isMortgaged || prop.houses >= 5) return false;

    // Check monopoly rule - player must own the entire color group
    if (!this.hasFullColorGroup(playerId, tile.group)) {
      return false;
    }

    const cost = Math.round(tile.houseCost * (this.settings.buildingCostMultiplier || 1.0));
    const player = this.players.find(p => p.id === playerId);
    return !!player && player.cash >= cost;
  }

  buildHouse(playerId, tileId) {
    const tile = BOARD_TILES[tileId];
    const prop = this.properties[tileId];
    if (!tile || !prop || prop.ownerId !== playerId) {
      return { success: false, reason: 'Вы не владеете этой недвижимостью' };
    }
    if (!this.hasFullColorGroup(playerId, tile.group)) {
      return { success: false, reason: 'Для постройки необходимо владеть всеми улицами этой группы!' };
    }
    if (prop.houses >= 5) {
      return { success: false, reason: 'Максимальный уровень (Отель) уже построен' };
    }
    const cost = Math.round(tile.houseCost * (this.settings.buildingCostMultiplier || 1.0));
    const player = this.players.find(p => p.id === playerId);
    if (!player || player.cash < cost) {
      return { success: false, reason: `Недостаточно средств для постройки (нужно $${cost})` };
    }

    player.cash -= cost;
    prop.houses += 1;
    const label = prop.houses === 5 ? 'Отель' : `Дом №${prop.houses}`;
    this.addLog(`🔨 ${player.name} построил ${label} на «${tile.name}» за $${cost}`);
    return { success: true, houses: prop.houses, cost };
  }

  mortgageProperty(playerId, tileId) {
    const tile = BOARD_TILES[tileId];
    const prop = this.properties[tileId];
    if (!tile || !prop || prop.ownerId !== playerId || prop.isMortgaged || prop.houses > 0) {
      return { success: false, reason: 'Нельзя заложить недвижимость' };
    }

    const player = this.players.find(p => p.id === playerId);
    prop.isMortgaged = true;
    player.cash += tile.mortgage;
    this.addLog(`🏦 ${player.name} заложил «${tile.name}» и получил $${tile.mortgage}`);
    return { success: true };
  }

  unmortgageProperty(playerId, tileId) {
    const tile = BOARD_TILES[tileId];
    const prop = this.properties[tileId];
    if (!tile || !prop || prop.ownerId !== playerId || !prop.isMortgaged) {
      return { success: false, reason: 'Недвижимость не в залоге' };
    }

    const cost = Math.round(tile.mortgage * 1.1);
    const player = this.players.find(p => p.id === playerId);
    if (player.cash < cost) {
      return { success: false, reason: 'Недостаточно денег для выкупа' };
    }

    player.cash -= cost;
    prop.isMortgaged = false;
    this.addLog(`🔓 ${player.name} выкупил из залога «${tile.name}» за $${cost}`);
    return { success: true };
  }

  // --- SELL PROPERTY (WITH 10% COMMISSION) ---
  sellProperty(playerId, tileId) {
    const tile = BOARD_TILES[tileId];
    const prop = this.properties[tileId];
    if (!tile || !prop || prop.ownerId !== playerId || prop.houses > 0) {
      return { success: false, reason: 'Нельзя продать недвижимость с постройками или чужую' };
    }

    const player = this.players.find(p => p.id === playerId);
    if (!player) return { success: false, reason: 'Игрок не найден' };

    const commissionRate = 0.10; // 10% комиссия на продажу
    const basePrice = prop.isMortgaged ? tile.mortgage : tile.price;
    const commission = Math.round(basePrice * commissionRate);
    const payout = basePrice - commission;

    player.cash += payout;
    if (this.settings.freeParkingJackpot) {
      this.jackpotPool += commission;
    }

    prop.ownerId = null;
    prop.houses = 0;
    prop.isMortgaged = false;

    this.addLog(`🏷️ ${player.name} продал карточку «${tile.name}» за $${payout} (комиссия 10%: $${commission})`);
    return { success: true, payout, commission };
  }

  // --- CARD & ASSET TRADING (WITH 10% COMMISSION) ---
  evaluateBotTrade({ fromId, toId, fromCardIds = [], toCardIds = [], fromCash = 0, toCash = 0 }) {
    this.lastBotTradeReason = null;
    const bot = this.players.find(p => p.id === toId);
    if (!bot || !bot.isBot) {
      this.lastBotTradeReason = 'Получатель не является ботом';
      return false;
    }

    const difficulty = bot.botDifficulty || this.settings?.botDifficulty || 'medium';
    const giveCash = Math.max(0, parseInt(toCash) || 0);
    const receiveCash = Math.max(0, parseInt(fromCash) || 0);

    // 1. Bot liquidity check
    if (bot.cash < giveCash) {
      this.lastBotTradeReason = `У ${bot.name} недостаточно денег (есть $${bot.cash}, запрошено $${giveCash})`;
      return false;
    }
    if (giveCash > 0 && bot.cash - giveCash < 40) {
      this.lastBotTradeReason = `${bot.name} не хочет отдавать последние деньги (нужен резерв)`;
      return false;
    }

    // 2. Base nominal valuation (actual street prices & money)
    let botGiveStreetsBase = 0;
    for (const id of toCardIds) {
      const tile = BOARD_TILES[id];
      const prop = this.properties[id];
      if (!tile || !prop || prop.ownerId !== toId) {
        this.lastBotTradeReason = 'Карточка не принадлежит боту';
        return false;
      }
      if (prop.houses > 0) {
        this.lastBotTradeReason = `На улице «${tile.name}» построены дома, сначала продайте их`;
        return false;
      }
      botGiveStreetsBase += (tile.price || 100);
    }

    let botReceiveStreetsBase = 0;
    for (const id of fromCardIds) {
      const tile = BOARD_TILES[id];
      const prop = this.properties[id];
      if (!tile || !prop || prop.ownerId !== fromId) {
        this.lastBotTradeReason = 'Предложенная карточка не принадлежит отправителю';
        return false;
      }
      if (prop.houses > 0) {
        this.lastBotTradeReason = `На улице «${tile.name}» есть дома`;
        return false;
      }
      botReceiveStreetsBase += (tile.price || 100);
    }

    const totalGiveNominal = botGiveStreetsBase + giveCash;
    const totalReceiveNominal = botReceiveStreetsBase + receiveCash;

    // Nothing requested from bot -> pure gift
    if (totalGiveNominal === 0) {
      return totalReceiveNominal > 0;
    }

    // 3. STRICT RULE:
    // "боты не принимали сделки ниже чем их улица или кол-во денег чтоб минимум одинаково было"
    // The total value received by the bot MUST be at least equal to the total value given by the bot.
    if (totalReceiveNominal < totalGiveNominal) {
      this.lastBotTradeReason = `${bot.name} отклонил: предложение ($${totalReceiveNominal}) ниже стоимости его улицы/денег ($${totalGiveNominal})`;
      return false;
    }

    // If bot is asked to give cash, player's total offer must be at least that cash
    if (giveCash > 0 && totalReceiveNominal < giveCash) {
      this.lastBotTradeReason = `${bot.name} отклонил: запрошено $${giveCash} наличными, а предложено всего $${totalReceiveNominal}`;
      return false;
    }

    // If bot is asked to give street(s), player's total offer must be at least the base price of those streets
    if (botGiveStreetsBase > 0 && totalReceiveNominal < botGiveStreetsBase) {
      this.lastBotTradeReason = `${bot.name} отклонил: стоимость предложенного ($${totalReceiveNominal}) ниже цены улицы ($${botGiveStreetsBase})`;
      return false;
    }

    // 4. Strategic valuation (monopolies, difficulty)
    let strategicGive = giveCash;
    for (const id of toCardIds) {
      const tile = BOARD_TILES[id];
      const basePrice = tile?.price || 100;
      let multiplier = 1.0;

      if (tile?.group) {
        const groupTiles = BOARD_TILES.filter(t => t.group === tile.group);
        const botCount = groupTiles.filter(t => this.properties[t.id]?.ownerId === bot.id).length;
        if (botCount === groupTiles.length) {
          // Breaks an active full monopoly!
          multiplier = difficulty === 'hard' ? 3.0 : (difficulty === 'medium' ? 2.4 : 1.8);
        } else if (botCount >= 2) {
          // Breaks a near monopoly
          multiplier = difficulty === 'hard' ? 2.0 : (difficulty === 'medium' ? 1.6 : 1.3);
        }
      }
      strategicGive += basePrice * multiplier;
    }

    let strategicReceive = receiveCash;
    for (const id of fromCardIds) {
      const tile = BOARD_TILES[id];
      const basePrice = tile?.price || 100;
      let multiplier = 1.0;

      if (tile?.group) {
        const groupTiles = BOARD_TILES.filter(t => t.group === tile.group);
        const botCount = groupTiles.filter(t => this.properties[t.id]?.ownerId === bot.id).length;
        if (botCount === groupTiles.length - 1) {
          // Completes a monopoly for the bot!
          multiplier = difficulty === 'hard' ? 2.2 : (difficulty === 'medium' ? 1.8 : 1.5);
        } else if (botCount >= 1) {
          multiplier = 1.2;
        }
      }
      strategicReceive += basePrice * multiplier;
    }

    // Multipliers based on difficulty
    let requiredRatio = 1.0; // minimum identical
    if (difficulty === 'medium') requiredRatio = 1.05;
    if (difficulty === 'hard') requiredRatio = 1.20;

    if (strategicReceive < strategicGive * requiredRatio) {
      this.lastBotTradeReason = `${bot.name} отклонил: сделка стратегически невыгодна (сложность: ${difficulty})`;
      return false;
    }

    return true;
  }

  executeTrade({ fromId, toId, fromCardIds = [], toCardIds = [], fromCash = 0, toCash = 0 }) {
    const fromPlayer = this.players.find(p => p.id === fromId);
    const toPlayer = this.players.find(p => p.id === toId);

    if (!fromPlayer || !toPlayer) {
      return { success: false, reason: 'Игрок не найден' };
    }

    fromCash = Math.max(0, parseInt(fromCash) || 0);
    toCash = Math.max(0, parseInt(toCash) || 0);

    if (fromPlayer.cash < fromCash) {
      return { success: false, reason: `У ${fromPlayer.name} недостаточно средств` };
    }
    if (toPlayer.cash < toCash) {
      return { success: false, reason: `У ${toPlayer.name} недостаточно средств` };
    }

    for (const tId of fromCardIds) {
      const prop = this.properties[tId];
      if (!prop || prop.ownerId !== fromId || prop.houses > 0) {
        return { success: false, reason: 'Некоторые карточки нельзя обменять' };
      }
    }
    for (const tId of toCardIds) {
      const prop = this.properties[tId];
      if (!prop || prop.ownerId !== toId || prop.houses > 0) {
        return { success: false, reason: 'Некоторые карточки нельзя обменять' };
      }
    }

    let totalValue = fromCash + toCash;
    fromCardIds.forEach(id => {
      totalValue += BOARD_TILES[id]?.price || 0;
    });
    toCardIds.forEach(id => {
      totalValue += BOARD_TILES[id]?.price || 0;
    });

    fromCardIds.forEach(id => {
      this.properties[id].ownerId = toId;
    });
    toCardIds.forEach(id => {
      this.properties[id].ownerId = fromId;
    });

    fromPlayer.cash = fromPlayer.cash - fromCash + toCash;
    toPlayer.cash = toPlayer.cash - toCash + fromCash;

    const tradeRecord = {
      id: 'trade_' + Date.now(),
      time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
      fromName: fromPlayer.name,
      toName: toPlayer.name,
      fromCards: fromCardIds.map(id => BOARD_TILES[id]?.name || `Карта #${id}`),
      toCards: toCardIds.map(id => BOARD_TILES[id]?.name || `Карта #${id}`),
      fromCash,
      toCash,
      commission: 0
    };
    if (!this.tradeHistory) this.tradeHistory = [];
    this.tradeHistory.unshift(tradeRecord);
    if (this.tradeHistory.length > 30) this.tradeHistory.pop();

    this.addLog(`🤝 Сделка между ${fromPlayer.name} и ${toPlayer.name} успешно завершена.`);
    return { success: true, commission: 0 };
  }


  // --- CARDS ---
  drawCard(player, cardType) {
    const deck = cardType === 'chance' ? CHANCE_CARDS : CHEST_CARDS;
    const card = deck[Math.floor(Math.random() * deck.length)];
    this.activeCard = { ...card, deckType: cardType };
    this.phase = 'CARD_EVENT';
    this.addLog(`📜 ${player.name} вытянул карточку: "${card.title}"`);
    return this.activeCard;
  }

  applyActiveCard() {
    if (!this.activeCard) return;
    const card = this.activeCard;
    const player = this.getCurrentPlayer();
    const isChance = card.deckType === 'chance';
    const deckLabel = isChance ? 'Шанс' : 'Казна';

    switch (card.action.type) {
      case 'gain_money': {
        const gain = card.action.amount || 0;
        player.cash += gain;
        this.addLog(`💰 [${deckLabel}] ${player.name} получил +$${gain} («${card.title}»)`, { type: 'gain', amount: gain });
        break;
      }

      case 'pay_money': {
        const loss = card.action.amount || 0;
        this.deductCash(player, loss);
        if (this.settings.freeParkingJackpot) {
          this.jackpotPool += loss;
        }
        this.addLog(`💸 [${deckLabel}] ${player.name} выплатил -$${loss} («${card.title}»)`, { type: 'loss', amount: loss });
        break;
      }

      case 'move_to': {
        const oldPos = player.position;
        player.position = card.action.tileId;
        if (card.action.collectSalary && card.action.tileId < oldPos) {
          player.cash += this.settings.salary;
          this.addLog(`💵 [${deckLabel}] ${player.name} прошёл «Вперёд» и получил +$${this.settings.salary}`, { type: 'gain', amount: this.settings.salary });
        }
        this.handleTileLanding(player, card.action.tileId);
        break;
      }

      case 'move_to_nearest': {
        const currentPos = player.position;
        const targets = BOARD_TILES.filter(t => t.type === card.action.targetGroup || t.group === card.action.targetGroup);
        if (targets.length > 0) {
          let nextTile = targets.find(t => t.id > currentPos);
          if (!nextTile) nextTile = targets[0];
          if (nextTile.id < currentPos) {
            player.cash += this.settings.salary;
            this.addLog(`💵 [${deckLabel}] ${player.name} прошёл «Вперёд» и получил +$${this.settings.salary}`, { type: 'gain', amount: this.settings.salary });
          }
          player.position = nextTile.id;
          this.handleTileLanding(player, nextTile.id);
        }
        break;
      }

      case 'property_repair': {
        let houseCount = 0;
        let hotelCount = 0;
        Object.values(this.properties).forEach(prop => {
          if (prop.ownerId === player.id) {
            if (prop.houses === 5) {
              hotelCount += 1;
            } else if (prop.houses > 0) {
              houseCount += prop.houses;
            }
          }
        });
        const houseCost = card.action.houseCost || 25;
        const hotelCost = card.action.hotelCost || 100;
        const totalRepair = (houseCount * houseCost) + (hotelCount * hotelCost);
        if (totalRepair > 0) {
          this.deductCash(player, totalRepair);
          if (this.settings.freeParkingJackpot) {
            this.jackpotPool += totalRepair;
          }
          this.addLog(`🔨 [${deckLabel}] ${player.name} оплатил ремонт -$${totalRepair} (${houseCount} домов по $${houseCost}, ${hotelCount} отелей по $${hotelCost}) («${card.title}»)`, { type: 'loss', amount: totalRepair });
        } else {
          this.addLog(`🔨 [${deckLabel}] ${player.name} не имеет построек для ремонта (расход $0).`, { type: 'neutral' });
        }
        break;
      }

      case 'go_to_jail': {
        this.sendToJail(player);
        this.addLog(`👮 [${deckLabel}] ${player.name} отправлен в тюрьму! («${card.title}»)`, { type: 'special' });
        break;
      }

      case 'jail_free_card': {
        player.jailCards += 1;
        this.addLog(`🎫 [${deckLabel}] ${player.name} получил карту бесплатного выхода из тюрьмы («${card.title}»)`, { type: 'special' });
        break;
      }

      case 'collect_from_all': {
        const eachAmount = card.action.amount || 20;
        let totalCollected = 0;
        for (const other of this.players) {
          if (other.id !== player.id && !other.isBankrupt) {
            this.transferCash(other, player, eachAmount);
            totalCollected += eachAmount;
          }
        }
        this.addLog(`🎁 [${deckLabel}] ${player.name} получил по $${eachAmount} от каждого игрока (всего +$${totalCollected}) («${card.title}»)`, { type: 'gain', amount: totalCollected });
        break;
      }
    }

    this.activeCard = null;
    if (this.phase === 'CARD_EVENT') {
      this.phase = 'ACTION';
    }
  }

  // --- JAIL & TRANSFERS ---
  sendToJail(player) {
    player.position = 10;
    player.inJail = true;
    player.jailTurns = 0;
    this.doublesStreak = 0;
    this.phase = 'ACTION';
  }

  payJailFine(playerId = null) {
    const player = playerId ? this.players.find(p => p.id === playerId) : this.getCurrentPlayer();
    if (!player.inJail || player.cash < 50) return false;

    player.cash -= 50;
    player.inJail = false;
    player.jailTurns = 0;
    this.addLog(`🔓 ${player.name} оплатил штраф $50 и освободился из тюрьмы.`, { type: 'loss', amount: 50 });
    if (this.settings.freeParkingJackpot) {
      this.jackpotPool += 50;
    }
    return true;
  }

  useJailCard(playerId = null) {
    const player = playerId ? this.players.find(p => p.id === playerId) : this.getCurrentPlayer();
    if (!player.inJail || player.jailCards <= 0) return false;

    player.jailCards -= 1;
    player.inJail = false;
    player.jailTurns = 0;
    this.addLog(`🎟️ ${player.name} использовал карточку освобождения из тюрьмы.`);
    return true;
  }

  transferCash(fromPlayer, toPlayer, amount) {
    if (fromPlayer.cash < amount) {
      toPlayer.cash += fromPlayer.cash;
      fromPlayer.cash = 0;
      this.checkBankruptcy(fromPlayer, toPlayer);
    } else {
      fromPlayer.cash -= amount;
      toPlayer.cash += amount;
    }
  }

  deductCash(player, amount) {
    if (player.cash < amount) {
      player.cash = 0;
      this.checkBankruptcy(player, null);
    } else {
      player.cash -= amount;
    }
  }

  checkBankruptcy(player, creditor) {
    // Calculate total net worth
    let assetValue = player.cash;
    for (const [tileId, prop] of Object.entries(this.properties)) {
      if (prop.ownerId === player.id) {
        const tile = BOARD_TILES[tileId];
        assetValue += prop.isMortgaged ? 0 : tile.mortgage;
        assetValue += (prop.houses || 0) * Math.round(tile.houseCost * 0.5);
      }
    }

    if (assetValue <= 0) {
      this.declareBankruptcy(player, creditor);
    }
  }

  declareBankruptcy(player, creditor) {
    player.isBankrupt = true;
    this.addLog(`💥 ${player.name} ОБЪЯВИЛ СЕБЯ БАНКРОТОМ!`);

    // Transfer all assets
    for (const [tileId, prop] of Object.entries(this.properties)) {
      if (prop.ownerId === player.id) {
        prop.ownerId = creditor ? creditor.id : null;
        prop.houses = 0;
      }
    }

    this.checkGameWinner();
  }

  checkGameWinner() {
    const active = this.players.filter(p => !p.isBankrupt && !p.hasLeft);
    if (active.length === 1 && this.players.length > 1) {
      this.winner = active[0];
      this.status = 'FINISHED';
      this.addLog(`🏆 ${this.winner.name} ПОБЕДИЛ В МОНОПОЛИИ!`);
      return this.winner;
    }
    return null;
  }

  // --- TRADING SYSTEM ---
  proposeTrade(fromPlayerId, toPlayerId, offer) {
    // offer: { giveMoney: 100, receiveMoney: 50, giveTiles: [1, 3], receiveTiles: [6], giveJailCards: 0, receiveJailCards: 0 }
    this.activeTrade = {
      fromPlayerId,
      toPlayerId,
      offer
    };
    this.addLog(`🤝 Предложена сделка между игроками.`);
    return this.activeTrade;
  }

  acceptTrade() {
    if (!this.activeTrade) return false;
    const { fromPlayerId, toPlayerId, offer } = this.activeTrade;
    const p1 = this.players.find(p => p.id === fromPlayerId);
    const p2 = this.players.find(p => p.id === toPlayerId);

    // Validate cash
    if (p1.cash < offer.giveMoney || p2.cash < offer.receiveMoney) {
      return { success: false, reason: 'Недостаточно денег у одной из сторон' };
    }

    // Exchange cash
    p1.cash = p1.cash - offer.giveMoney + offer.receiveMoney;
    p2.cash = p2.cash - offer.receiveMoney + offer.giveMoney;

    // Exchange tiles
    offer.giveTiles.forEach(tileId => {
      if (this.properties[tileId]) this.properties[tileId].ownerId = p2.id;
    });
    offer.receiveTiles.forEach(tileId => {
      if (this.properties[tileId]) this.properties[tileId].ownerId = p1.id;
    });

    this.activeTrade = null;
    this.addLog(`✅ Сделка успешно заключена!`);
    return { success: true };
  }

  rejectTrade() {
    this.activeTrade = null;
    this.addLog(`❌ Сделка отклонена.`);
  }

  // --- TURN MANAGEMENT ---
  endTurn() {
    if (this.phase === 'ROLL' && !this.getCurrentPlayer().isBankrupt) {
      return { success: false, reason: 'Сначала бросьте кубики' };
    }

    // If rolled doubles and not in jail, player can roll again!
    if (this.lastRollDoubles && !this.getCurrentPlayer().inJail && !this.getCurrentPlayer().isBankrupt) {
      this.phase = 'ROLL';
      this.hasRolled = false;
      this.addLog(`🎲 Выпал дубль! ${this.getCurrentPlayer().name} бросает ещё раз.`);
      return { success: true, rollAgain: true };
    }

    // Next active player
    let nextIdx = (this.currentTurn + 1) % this.players.length;
    let attempts = 0;
    while (this.players[nextIdx].isBankrupt && attempts < this.players.length) {
      nextIdx = (nextIdx + 1) % this.players.length;
      attempts++;
    }

    this.currentTurn = nextIdx;
    this.phase = 'ROLL';
    this.hasRolled = false;
    this.lastRollDoubles = false;
    this.doublesStreak = 0;

    const nextPlayer = this.getCurrentPlayer();
    this.addLog(`👉 Ход переходит к: ${nextPlayer.name}`);

    return { success: true, currentPlayer: nextPlayer };
  }

  // --- BOT LOGIC ---
  processBotTurn() {
    const bot = this.getCurrentPlayer();
    if (!bot || !bot.isBot || this.status !== 'PLAYING') return;
    const diff = bot.botDifficulty || this.settings.botDifficulty || 'medium';

    // 1. Jail handling based on difficulty
    if (bot.inJail) {
      if (bot.jailCards > 0) {
        this.useJailCard(bot.id);
      } else if (diff === 'easy') {
        if (bot.jailTurns >= 2 && bot.cash > 300) {
          this.payJailFine(bot.id);
        }
      } else if (diff === 'hard') {
        const hasUnownedStreets = Object.entries(this.properties).some(([tId, p]) => !p.ownerId && BOARD_TILES[tId]?.type === 'street');
        if (hasUnownedStreets && bot.cash >= 50) {
          this.payJailFine(bot.id);
        } else if (bot.cash > 400 && bot.jailTurns >= 2) {
          this.payJailFine(bot.id);
        }
      } else {
        if (bot.cash > 250) {
          this.payJailFine(bot.id);
        }
      }
    }

    // 2. Roll
    if (this.phase === 'ROLL') {
      this.rollDice();
    }

    // 3. Buy choice based on difficulty
    if (this.phase === 'BUY_CHOICE') {
      const tile = BOARD_TILES[bot.position];
      if (!tile) {
        this.passProperty();
      } else if (diff === 'easy') {
        if (bot.cash >= tile.price + 350 && Math.random() < 0.65) {
          this.buyProperty(bot.id);
        } else {
          this.passProperty();
        }
      } else if (diff === 'hard') {
        if (bot.cash >= tile.price + 20) {
          this.buyProperty(bot.id);
        } else {
          this.passProperty();
        }
      } else {
        if (bot.cash >= tile.price + 100) {
          this.buyProperty(bot.id);
        } else {
          this.passProperty();
        }
      }
    }

    // 4. Card event
    if (this.phase === 'CARD_EVENT') {
      this.applyActiveCard();
    }

    // 5. Try building houses based on difficulty
    const minReserve = diff === 'hard' ? 40 : (diff === 'easy' ? 500 : 250);
    if (bot.cash > minReserve) {
      const ownedMonopolyTiles = Object.entries(this.properties)
        .filter(([tileId, prop]) => prop.ownerId === bot.id && this.canBuildHouse(bot.id, parseInt(tileId)))
        .map(([tileId]) => parseInt(tileId));

      const maxBuildAttempts = diff === 'hard' ? 4 : (diff === 'easy' ? 1 : 2);
      let buildsDone = 0;
      for (const tileId of ownedMonopolyTiles) {
        if (buildsDone >= maxBuildAttempts) break;
        const tile = BOARD_TILES[tileId];
        const cost = Math.round((tile.houseCost || 100) * (this.settings.buildingCostMultiplier || 1.0));
        if (bot.cash >= cost + minReserve) {
          const res = this.buildHouse(bot.id, tileId);
          if (res && res.success) {
            buildsDone++;
          }
        }
      }
    }

    // 6. End turn
    if (this.phase === 'ACTION') {
      setTimeout(() => this.endTurn(), 700);
    }
  }

  // --- STATE SNAPSHOT ---
  getState() {
    return {
      status: this.status,
      players: this.players,
      properties: this.properties,
      currentTurn: this.currentTurn,
      dice: this.dice,
      lastRollDoubles: this.lastRollDoubles,
      hasRolled: this.hasRolled,
      phase: this.phase,
      jackpotPool: this.jackpotPool,
      settings: this.settings,
      customTiles: this.customTiles || {},
      logs: this.logs,
      tradeHistory: this.tradeHistory || [],
      activeCard: this.activeCard,
      activeTrade: this.activeTrade,
      winner: this.winner
    };
  }

  loadState(state) {
    if (!state) return;
    this.status = state.status;
    this.players = state.players;
    this.properties = state.properties;
    this.currentTurn = state.currentTurn;
    this.dice = state.dice;
    this.lastRollDoubles = state.lastRollDoubles;
    this.hasRolled = state.hasRolled;
    this.phase = state.phase;
    this.jackpotPool = state.jackpotPool;
    this.settings = state.settings;
    this.customTiles = state.customTiles || {};
    this.logs = state.logs;
    this.tradeHistory = state.tradeHistory || [];
    this.activeCard = state.activeCard;
    this.activeTrade = state.activeTrade;
    this.winner = state.winner;
  }
}

export const engine = new MonopolyEngine();
