/**
 * In-Game Player Titles System
 */

export const TITLES = [
  // --- 1. Common / Starting ---
  {
    id: 'novice',
    name: 'Новичок',
    icon: '🌱',
    tag: '🌱 Новичок',
    rarity: 'common',
    rarityName: 'Обычный',
    category: 'starter',
    color: '#94a3b8',
    bgStyle: 'rgba(148, 163, 184, 0.16)',
    borderStyle: '1px solid rgba(148, 163, 184, 0.3)',
    description: 'Стартовый титул для всех игроков',
    conditionText: 'Выдаётся на старте',
    price: 0,
    getProgressRatio: () => 1.0
  },

  // --- 2. Condition-based Achievement Titles (CANNOT BE BOUGHT) ---
  {
    id: 'shark',
    name: 'Акула бизнеса',
    icon: '🦈',
    tag: '🦈 Акула бизнеса',
    rarity: 'rare',
    rarityName: 'Редкий',
    category: 'achievement',
    color: '#38bdf8',
    bgStyle: 'rgba(56, 189, 248, 0.16)',
    borderStyle: '1px solid #38bdf8',
    description: 'Одержите 3 победы в матчах',
    conditionText: '3 победы',
    price: 0,
    hasCondition: true,
    checkUnlock: (stats) => (stats?.wins || 0) >= 3,
    getProgress: (stats) => `${Math.min(stats?.wins || 0, 3)} / 3 побед`,
    getProgressRatio: (stats) => Math.min((stats?.wins || 0) / 3, 1.0)
  },
  {
    id: 'monopolist',
    name: 'Монополист',
    icon: '🎩',
    tag: '🎩 Монополист',
    rarity: 'rare',
    rarityName: 'Редкий',
    category: 'achievement',
    color: '#a855f7',
    bgStyle: 'rgba(168, 85, 247, 0.16)',
    borderStyle: '1px solid #a855f7',
    description: 'Одержите 5 побед в матчах',
    conditionText: '5 побед',
    price: 0,
    hasCondition: true,
    checkUnlock: (stats) => (stats?.wins || 0) >= 5,
    getProgress: (stats) => `${Math.min(stats?.wins || 0, 5)} / 5 побед`,
    getProgressRatio: (stats) => Math.min((stats?.wins || 0) / 5, 1.0)
  },
  {
    id: 'magnate',
    name: 'Магнат',
    icon: '🏙️',
    tag: '🏙️ Магнат',
    rarity: 'epic',
    rarityName: 'Эпический',
    category: 'achievement',
    color: '#10b981',
    bgStyle: 'rgba(16, 185, 129, 0.16)',
    borderStyle: '1px solid #10b981',
    description: 'Сыграйте 10 матчей в игре',
    conditionText: '10 матчей',
    price: 0,
    hasCondition: true,
    checkUnlock: (stats) => (stats?.gamesPlayed || 0) >= 10,
    getProgress: (stats) => `${Math.min(stats?.gamesPlayed || 0, 10)} / 10 игр`,
    getProgressRatio: (stats) => Math.min((stats?.gamesPlayed || 0) / 10, 1.0)
  },
  {
    id: 'lucky',
    name: 'Счастливчик',
    icon: '🍀',
    tag: '🍀 Счастливчик',
    rarity: 'epic',
    rarityName: 'Эпический',
    category: 'achievement',
    color: '#22c55e',
    bgStyle: 'rgba(34, 197, 94, 0.16)',
    borderStyle: '1px solid #22c55e',
    description: 'Винрейт 50%+ (минимум 5 сыгранных матчей)',
    conditionText: 'Винрейт 50%+ (от 5 игр)',
    price: 0,
    hasCondition: true,
    checkUnlock: (stats) => (stats?.gamesPlayed || 0) >= 5 && ((stats?.wins || 0) / (stats?.gamesPlayed || 1)) >= 0.5,
    getProgress: (stats) => `${stats?.gamesPlayed ? Math.round(((stats.wins || 0) / stats.gamesPlayed) * 100) : 0}% винрейт (${stats?.gamesPlayed || 0}/5 игр)`,
    getProgressRatio: (stats) => {
      const g = stats?.gamesPlayed || 0;
      const w = stats?.wins || 0;
      if (g === 0) return 0;
      const wr = w / g;
      const gProg = Math.min(g / 5, 1.0);
      const wrProg = wr >= 0.5 ? 1.0 : (wr / 0.5);
      return Math.min(gProg * wrProg, 1.0);
    }
  },
  {
    id: 'oligarch',
    name: 'Олигарх',
    icon: '💎',
    tag: '💎 Олигарх',
    rarity: 'epic',
    rarityName: 'Эпический',
    category: 'achievement',
    color: '#06b6d4',
    bgStyle: 'rgba(6, 182, 212, 0.16)',
    borderStyle: '1px solid #06b6d4',
    description: 'Заработайте $10,000 за всё время игры',
    conditionText: '$10,000 заработка',
    price: 0,
    hasCondition: true,
    checkUnlock: (stats) => (stats?.totalEarned || 0) >= 10000,
    getProgress: (stats) => `$${Math.min(stats?.totalEarned || 0, 10000).toLocaleString()} / $10,000`,
    getProgressRatio: (stats) => Math.min((stats?.totalEarned || 0) / 10000, 1.0)
  },
  {
    id: 'dice_master',
    name: 'Повелитель кубиков',
    icon: '🎲',
    tag: '🎲 Повелитель кубиков',
    rarity: 'legendary',
    rarityName: 'Легендарный',
    category: 'achievement',
    color: '#ec4899',
    bgStyle: 'linear-gradient(135deg, rgba(236, 72, 153, 0.25), rgba(168, 85, 247, 0.25))',
    borderStyle: '1px solid #ec4899',
    glow: '0 0 12px rgba(236, 72, 153, 0.4)',
    description: 'Одержите 15 побед в матчах',
    conditionText: '15 побед',
    price: 0,
    hasCondition: true,
    checkUnlock: (stats) => (stats?.wins || 0) >= 15,
    getProgress: (stats) => `${Math.min(stats?.wins || 0, 15)} / 15 побед`,
    getProgressRatio: (stats) => Math.min((stats?.wins || 0) / 15, 1.0)
  },
  {
    id: 'legend',
    name: 'Легенда',
    icon: '👑',
    tag: '👑 Легенда',
    rarity: 'legendary',
    rarityName: 'Легендарный',
    category: 'achievement',
    color: '#fbbf24',
    bgStyle: 'linear-gradient(135deg, rgba(251, 191, 36, 0.3), rgba(217, 70, 239, 0.3))',
    borderStyle: '1px solid #fbbf24',
    glow: '0 0 16px rgba(251, 191, 36, 0.5)',
    description: 'Одержите 25 побед в матчах',
    conditionText: '25 побед',
    price: 0,
    hasCondition: true,
    checkUnlock: (stats) => (stats?.wins || 0) >= 25,
    getProgress: (stats) => `${Math.min(stats?.wins || 0, 25)} / 25 побед`,
    getProgressRatio: (stats) => Math.min((stats?.wins || 0) / 25, 1.0)
  },

  // --- 3. Pure Shop Purchasable Titles (NO CONDITIONS, BOUGHT FOR COINS) ---
  {
    id: 'investor',
    name: 'Инвестор',
    icon: '💼',
    tag: '💼 Инвестор',
    rarity: 'rare',
    rarityName: 'Редкий',
    category: 'shop',
    color: '#3b82f6',
    bgStyle: 'rgba(59, 130, 246, 0.16)',
    borderStyle: '1px solid #3b82f6',
    description: 'Покупается за монеты в магазине',
    price: 150,
    hasCondition: false,
    getProgressRatio: (stats, coins) => Math.min((coins || 0) / 150, 1.0)
  },
  {
    id: 'vip',
    name: 'VIP Персона',
    icon: '⭐',
    tag: '⭐ VIP Персона',
    rarity: 'epic',
    rarityName: 'Эпический',
    category: 'shop',
    color: '#eab308',
    bgStyle: 'rgba(234, 179, 8, 0.16)',
    borderStyle: '1px solid #eab308',
    glow: '0 0 10px rgba(234, 179, 8, 0.35)',
    description: 'Престижный статус игрока Monopoly',
    price: 300,
    hasCondition: false,
    getProgressRatio: (stats, coins) => Math.min((coins || 0) / 300, 1.0)
  },
  {
    id: 'millionaire',
    name: 'Миллионер',
    icon: '💰',
    tag: '💰 Миллионер',
    rarity: 'epic',
    rarityName: 'Эпический',
    category: 'shop',
    color: '#10b981',
    bgStyle: 'linear-gradient(135deg, rgba(16, 185, 129, 0.22), rgba(6, 182, 212, 0.22))',
    borderStyle: '1px solid #10b981',
    glow: '0 0 12px rgba(16, 185, 129, 0.4)',
    description: 'Для тех, кто умеет копить капитал',
    price: 450,
    hasCondition: false,
    getProgressRatio: (stats, coins) => Math.min((coins || 0) / 450, 1.0)
  },
  {
    id: 'sheikh',
    name: 'Шейх',
    icon: '💰',
    tag: '💰 Шейх',
    rarity: 'legendary',
    rarityName: 'Легендарный',
    category: 'shop',
    color: '#f59e0b',
    bgStyle: 'linear-gradient(135deg, rgba(245, 158, 11, 0.25), rgba(217, 119, 6, 0.25))',
    borderStyle: '1px solid #f59e0b',
    glow: '0 0 14px rgba(245, 158, 11, 0.45)',
    description: 'Премиальный титул высшего общества',
    price: 600,
    hasCondition: false,
    getProgressRatio: (stats, coins) => Math.min((coins || 0) / 600, 1.0)
  },
  {
    id: 'cyber_king',
    name: 'Киберкороль',
    icon: '⚡',
    tag: '⚡ Киберкороль',
    rarity: 'legendary',
    rarityName: 'Легендарный',
    category: 'shop',
    color: '#a855f7',
    bgStyle: 'linear-gradient(135deg, rgba(168, 85, 247, 0.3), rgba(236, 72, 153, 0.3))',
    borderStyle: '1px solid #a855f7',
    glow: '0 0 16px rgba(168, 85, 247, 0.5)',
    description: 'Эксклюзивный неоновый титул киберпространства',
    price: 850,
    hasCondition: false,
    getProgressRatio: (stats, coins) => Math.min((coins || 0) / 850, 1.0)
  },

  // --- 4. Special / Developer Unique Title ---
  {
    id: 'creator',
    name: 'Создатель',
    icon: '🛠️',
    tag: '🛠️ Создатель',
    rarity: 'mythic',
    rarityName: 'Уникальный',
    category: 'special',
    color: '#f43f5e',
    bgStyle: 'linear-gradient(135deg, rgba(244, 63, 94, 0.35), rgba(126, 34, 206, 0.35))',
    borderStyle: '1px solid #f43f5e',
    glow: '0 0 18px rgba(244, 63, 94, 0.6)',
    description: 'Официальный титул создателя Monopoly',
    conditionText: 'Для создателя',
    price: 0,
    hasCondition: true,
    isDevOnly: true,
    getProgressRatio: () => 0.0
  }
];

export function getTitleById(titleId) {
  return TITLES.find(t => t.id === titleId) || TITLES[0];
}

export function getTitleProgressRatio(title, stats, coins) {
  if (!title) return 0;
  if (typeof title.getProgressRatio === 'function') {
    return title.getProgressRatio(stats, coins);
  }
  return 0;
}

export function formatTitleBadge(titleId, customStyle = '') {
  const t = getTitleById(titleId);
  if (!t) return '';
  const glow = t.glow ? `box-shadow: ${t.glow};` : '';
  return `<span class="player-title-badge rarity-${t.rarity}" style="color: ${t.color}; background: ${t.bgStyle}; border: ${t.borderStyle}; ${glow} ${customStyle}">${t.tag}</span>`;
}
