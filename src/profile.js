import { TITLES, getTitleById } from './titles.js';

export const AVAILABLE_TOKENS = [
  { id: 'diamond', emoji: '💎', name: 'Алмаз' },
  { id: 'hat', emoji: '🎩', name: 'Шляпа' },
  { id: 'moneybag', emoji: '💰', name: 'Мешок денег' },
  { id: 'car', emoji: '🚗', name: 'Авто' },
  { id: 'dog', emoji: '🐕', name: 'Пёс' },
  { id: 'ship', emoji: '🚢', name: 'Корабль' },
  { id: 'rocket', emoji: '🚀', name: 'Ракета' },
  { id: 'cat', emoji: '🐱', name: 'Кот' },
  { id: 'dino', emoji: '🦖', name: 'Дино' },
  { id: 'alien', emoji: '👾', name: 'Пришелец' },
  { id: 'crown', emoji: '👑', name: 'Корона' },
  { id: 'fire', emoji: '🔥', name: 'Огонь' },
  { id: 'star', emoji: '⭐', name: 'Звезда' },
  { id: 'ghost', emoji: '👻', name: 'Призрак' },
  { id: 'pizza', emoji: '🍕', name: 'Пицца' },
  { id: 'gamepad', emoji: '🎮', name: 'Геймпад' },
  { id: 'robot', emoji: '🤖', name: 'Робот' }
];

export const PLAYER_COLORS = [
  '#2563eb', // Blue
  '#dc2626', // Red
  '#16a34a', // Green
  '#d97706', // Amber
  '#9333ea', // Purple
  '#0891b2'  // Cyan
];

export const PROFILE_BACKGROUNDS = [
  {
    id: 'default',
    name: 'Стандарт',
    preview: 'linear-gradient(135deg, #334155 0%, #1e293b 100%)',
    bgStyle: 'var(--md-surface-container-low)',
    borderStyle: '1px solid var(--md-outline-variant)',
    textColor: 'var(--md-on-surface)',
    tagColor: 'var(--md-on-surface-variant)'
  },
  {
    id: 'cyberpunk',
    name: 'Кибернеон',
    preview: 'linear-gradient(135deg, #2e0854 0%, #7928ca 50%, #ff0080 100%)',
    bgStyle: 'linear-gradient(135deg, #180829 0%, #340c54 50%, #5c0d41 100%)',
    borderStyle: '1px solid #d946ef',
    glow: '0 0 18px rgba(217, 70, 239, 0.35)',
    textColor: '#ffffff',
    tagColor: '#f5d0fe'
  },
  {
    id: 'emerald',
    name: 'Магнат',
    preview: 'linear-gradient(135deg, #064e3b 0%, #059669 50%, #10b981 100%)',
    bgStyle: 'linear-gradient(135deg, #02261e 0%, #064e3b 50%, #065f46 100%)',
    borderStyle: '1px solid #10b981',
    glow: '0 0 18px rgba(16, 185, 129, 0.35)',
    textColor: '#ffffff',
    tagColor: '#a7f3d0'
  },
  {
    id: 'gold',
    name: 'Золото',
    preview: 'linear-gradient(135deg, #78350f 0%, #d97706 50%, #fbbf24 100%)',
    bgStyle: 'linear-gradient(135deg, #3d1702 0%, #78350f 50%, #92400e 100%)',
    borderStyle: '1px solid #fbbf24',
    glow: '0 0 18px rgba(251, 191, 36, 0.35)',
    textColor: '#ffffff',
    tagColor: '#fef08a'
  },
  {
    id: 'midnight',
    name: 'Полночь',
    preview: 'linear-gradient(135deg, #090d16 0%, #0f172a 50%, #1e293b 100%)',
    bgStyle: 'linear-gradient(135deg, #030712 0%, #0a0f1d 50%, #0f172a 100%)',
    borderStyle: '1px solid #38bdf8',
    glow: '0 0 18px rgba(56, 189, 248, 0.35)',
    textColor: '#ffffff',
    tagColor: '#bae6fd'
  },
  {
    id: 'space',
    name: 'Космос',
    preview: 'linear-gradient(135deg, #0b0f19 0%, #1e1b4b 50%, #312e81 100%)',
    bgStyle: 'linear-gradient(135deg, #060913 0%, #141433 50%, #1d184a 100%)',
    borderStyle: '1px solid #6366f1',
    glow: '0 0 18px rgba(99, 102, 241, 0.35)',
    textColor: '#ffffff',
    tagColor: '#c7d2fe'
  },
  {
    id: 'sunset',
    name: 'Закат',
    preview: 'linear-gradient(135deg, #831843 0%, #db2777 50%, #f43f5e 100%)',
    bgStyle: 'linear-gradient(135deg, #440416 0%, #70133a 50%, #881337 100%)',
    borderStyle: '1px solid #f43f5e',
    glow: '0 0 18px rgba(244, 63, 94, 0.35)',
    textColor: '#ffffff',
    tagColor: '#fbcfe8'
  },
  {
    id: 'ocean',
    name: 'Океан',
    preview: 'linear-gradient(135deg, #0c4a6e 0%, #0284c7 50%, #38bdf8 100%)',
    bgStyle: 'linear-gradient(135deg, #042031 0%, #075985 50%, #0369a1 100%)',
    borderStyle: '1px solid #38bdf8',
    glow: '0 0 18px rgba(56, 189, 248, 0.35)',
    textColor: '#ffffff',
    tagColor: '#bae6fd'
  },
  {
    id: 'aurora',
    name: 'Аврора',
    preview: 'linear-gradient(135deg, #042f2e 0%, #0d9488 50%, #2dd4bf 100%)',
    bgStyle: 'linear-gradient(135deg, #022020 0%, #0f4f4c 50%, #115e59 100%)',
    borderStyle: '1px solid #2dd4bf',
    glow: '0 0 18px rgba(45, 212, 191, 0.35)',
    textColor: '#ffffff',
    tagColor: '#99f6e4'
  },
  {
    id: 'ruby',
    name: 'Рубин',
    preview: 'linear-gradient(135deg, #450a0a 0%, #991b1b 50%, #dc2626 100%)',
    bgStyle: 'linear-gradient(135deg, #2a0404 0%, #570e0e 50%, #7f1d1d 100%)',
    borderStyle: '1px solid #dc2626',
    glow: '0 0 18px rgba(220, 38, 38, 0.35)',
    textColor: '#ffffff',
    tagColor: '#fecaca'
  },
  {
    id: 'sakura',
    name: 'Сакура',
    preview: 'linear-gradient(135deg, #500724 0%, #be185d 50%, #f472b6 100%)',
    bgStyle: 'linear-gradient(135deg, #2b0213 0%, #4c0525 50%, #700a37 100%)',
    borderStyle: '1px solid #f472b6',
    glow: '0 0 18px rgba(244, 114, 182, 0.35)',
    textColor: '#ffffff',
    tagColor: '#fbcfe8'
  },
  {
    id: 'matrix',
    name: 'Матрица',
    preview: 'linear-gradient(135deg, #022c22 0%, #15803d 50%, #22c55e 100%)',
    bgStyle: 'linear-gradient(135deg, #01140f 0%, #032b17 50%, #052e16 100%)',
    borderStyle: '1px solid #22c55e',
    glow: '0 0 18px rgba(34, 197, 94, 0.35)',
    textColor: '#ffffff',
    tagColor: '#bbf7d0'
  },
  {
    id: 'magma',
    name: 'Магма',
    preview: 'linear-gradient(135deg, #431407 0%, #c2410c 50%, #f97316 100%)',
    bgStyle: 'linear-gradient(135deg, #230802 0%, #431407 50%, #541c09 100%)',
    borderStyle: '1px solid #f97316',
    glow: '0 0 18px rgba(249, 115, 22, 0.35)',
    textColor: '#ffffff',
    tagColor: '#fed7aa'
  },
  {
    id: 'frost',
    name: 'Ледник',
    preview: 'linear-gradient(135deg, #083344 0%, #0e7490 50%, #67e8f9 100%)',
    bgStyle: 'linear-gradient(135deg, #041820 0%, #083344 50%, #0e4c63 100%)',
    borderStyle: '1px solid #67e8f9',
    glow: '0 0 18px rgba(103, 232, 249, 0.35)',
    textColor: '#ffffff',
    tagColor: '#cffafe'
  },
  {
    id: 'lavender',
    name: 'Лаванда',
    preview: 'linear-gradient(135deg, #2e1065 0%, #6d28d9 50%, #a78bfa 100%)',
    bgStyle: 'linear-gradient(135deg, #170733 0%, #2e1065 50%, #3b1480 100%)',
    borderStyle: '1px solid #a78bfa',
    glow: '0 0 18px rgba(167, 139, 250, 0.35)',
    textColor: '#ffffff',
    tagColor: '#ddd6fe'
  },
  {
    id: 'coffee',
    name: 'Мокко',
    preview: 'linear-gradient(135deg, #451a03 0%, #92400e 50%, #d97706 100%)',
    bgStyle: 'linear-gradient(135deg, #230d02 0%, #451a03 50%, #522306 100%)',
    borderStyle: '1px solid #d97706',
    glow: '0 0 18px rgba(217, 119, 6, 0.35)',
    textColor: '#ffffff',
    tagColor: '#fde68a'
  },
  {
    id: 'amethyst',
    name: 'Аметист',
    preview: 'linear-gradient(135deg, #3b0764 0%, #7e22ce 50%, #c084fc 100%)',
    bgStyle: 'linear-gradient(135deg, #1c0330 0%, #3b0764 50%, #4c0d7d 100%)',
    borderStyle: '1px solid #c084fc',
    glow: '0 0 18px rgba(192, 132, 252, 0.35)',
    textColor: '#ffffff',
    tagColor: '#f3e8ff'
  },
  {
    id: 'galaxy',
    name: 'Галактика',
    preview: 'linear-gradient(135deg, #1e1b4b 0%, #4338ca 50%, #818cf8 100%)',
    bgStyle: 'linear-gradient(135deg, #0b0924 0%, #1e1b4b 50%, #2b266e 100%)',
    borderStyle: '1px solid #818cf8',
    glow: '0 0 18px rgba(129, 140, 248, 0.35)',
    textColor: '#ffffff',
    tagColor: '#e0e7ff'
  },
  {
    id: 'solar',
    name: 'Солнце',
    preview: 'linear-gradient(135deg, #7c2d12 0%, #ea580c 50%, #fb923c 100%)',
    bgStyle: 'linear-gradient(135deg, #3d1306 0%, #7c2d12 50%, #9a3412 100%)',
    borderStyle: '1px solid #fb923c',
    glow: '0 0 18px rgba(251, 146, 60, 0.35)',
    textColor: '#ffffff',
    tagColor: '#ffedd5'
  },
  {
    id: 'crimson',
    name: 'Багрянец',
    preview: 'linear-gradient(135deg, #4c0519 0%, #be123c 50%, #fb7185 100%)',
    bgStyle: 'linear-gradient(135deg, #27020c 0%, #4c0519 50%, #680b25 100%)',
    borderStyle: '1px solid #fb7185',
    glow: '0 0 18px rgba(251, 113, 133, 0.35)',
    textColor: '#ffffff',
    tagColor: '#ffe4e6'
  }
];

export function getProfileBg(bgId) {
  const found = PROFILE_BACKGROUNDS.find(b => b.id === bgId);
  return found || PROFILE_BACKGROUNDS[0];
}

const TOKEN_EMOJI_DICT = {
  diamond: '💎',
  hat: '🎩',
  tophat: '🎩',
  moneybag: '💰',
  money: '💰',
  bag: '💰',
  car: '🚗',
  dog: '🐕',
  ship: '🚢',
  rocket: '🚀',
  cat: '🐱',
  dino: '🦖',
  alien: '👾',
  crown: '👑',
  fire: '🔥',
  star: '⭐',
  ghost: '👻',
  pizza: '🍕',
  gamepad: '🎮',
  robot: '🤖',
  bot: '🤖'
};

export function getTokenEmoji(token) {
  if (!token) return '💎';
  if (token === 'custom' || (typeof token === 'string' && token.startsWith('data:image'))) {
    return '🎨';
  }
  const str = String(token).toLowerCase().trim();
  if (TOKEN_EMOJI_DICT[str]) return TOKEN_EMOJI_DICT[str];
  const found = AVAILABLE_TOKENS.find(t => t.id.toLowerCase() === str || t.emoji === token);
  return found ? found.emoji : '🎩';
}

export function renderTokenHTML(token, customToken = null, extraClass = '') {
  const isCustomToken = token === 'custom' || (typeof token === 'string' && token.startsWith('data:image'));
  if (isCustomToken) {
    const src = (typeof token === 'string' && token.startsWith('data:image')) 
      ? token 
      : (customToken || (typeof window !== 'undefined' && window.profileManager?.profile?.customToken) || (typeof profileManager !== 'undefined' ? profileManager?.profile?.customToken : null));
    if (src) {
      return `<img class="board-token-img ${extraClass}" src="${src}" alt="Token" draggable="false" />`;
    }
  }
  const emoji = getTokenEmoji(token);
  return `<span class="token-emoji ${extraClass}">${emoji}</span>`;
}

export function getTokenName(token) {
  if (token === 'custom' || (typeof token === 'string' && token.startsWith('data:image'))) return 'Моя пешка';
  const str = String(token).toLowerCase().trim();
  const found = AVAILABLE_TOKENS.find(t => t.id.toLowerCase() === str || t.emoji === token);
  return found ? found.name : 'Фишка';
}

export function isDevUser(p) {
  if (!p) return false;
  if (p.discordId === '1472673126859935765' || p.id === 'discord_1472673126859935765') return true;
  const username = String(p.discordUsername || '').toLowerCase();
  const name = String(p.name || '').toLowerCase();
  if (username.includes('hizuhara') || name.includes('hizuhara') || username.includes('misha') || name.includes('misha')) return true;
  try {
    if (localStorage.getItem('monopoly_dev_mode') === 'true' || 
        sessionStorage.getItem('monopoly_dev_mode') === 'true' || 
        localStorage.getItem('monopoly_is_creator') === 'true') {
      return true;
    }
  } catch (e) {}
  return false;
}

export const ALL_DICE_IDS = [
  'classic',
  'neon_ruby',
  'cyber_emerald',
  'amethyst_twilight',
  'frost_crystal',
  'golden_tycoon',
  'magma_flame',
  'cosmic_void'
];

export const ALL_TITLE_IDS = [
  'novice',
  'shark',
  'monopolist',
  'magnate',
  'lucky',
  'oligarch',
  'dice_master',
  'legend',
  'investor',
  'vip',
  'millionaire',
  'sheikh',
  'cyber_king',
  'creator'
];

class ProfileManager {
  constructor() {
    this.profile = this.loadProfile();
  }

  isDev() {
    return isDevUser(this.profile);
  }

  loadProfile() {
    const isOwnerDomain = typeof window !== 'undefined' && 
      (window.location.hostname.includes('mihapro6666') || 
       window.location.hostname.includes('pixel-monopoly') || 
       window.location.hostname === 'localhost' || 
       window.location.hostname === '127.0.0.1');
    const isLoggedOut = typeof localStorage !== 'undefined' && localStorage.getItem('monopoly_user_logged_out') === '1';

    const customPawnData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAABmUlEQVR4AUySS3LjMAxEG9rFc724rJzQcsVzvImXmPcgyRUWIHwaaIKklrgq2T5frVYqih88TUoHRfK4UofGAF1Kr5P170dVde7XH6LM6sIYHXpi6/dHhZzw0uPVTNCS0eMkG0TgAAAABJRU5ErkJggg==';

    const getOwnerProfile = () => ({
      id: 'discord_1472673126859935765',
      name: 'hizuhara.',
      token: 'custom',
      customToken: customPawnData,
      color: '#2563eb',
      bg: 'space',
      profileBg: 'space',
      coins: 0,
      unlockedDice: [...ALL_DICE_IDS],
      diceSkin: 'cosmic_void',
      unlockedTitles: [...ALL_TITLE_IDS],
      title: 'creator',
      isRegistered: true,
      authProvider: 'discord',
      discordId: '1472673126859935765',
      discordUsername: 'hizuhara.',
      avatarUrl: 'https://cdn.discordapp.com/avatars/1472673126859935765/8819b4f951abe3f4f76a1646dee1ba9d.png',
      stats: {
        gamesPlayed: 2,
        wins: 2,
        losses: 0,
        totalEarned: 2700,
        maxNetWorth: 2500
      }
    });

    const saved = localStorage.getItem('monopoly_player_profile');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);

        // If on owner domain and not logged out, sync canonical owner data
        if (isOwnerDomain && !isLoggedOut) {
          parsed.id = parsed.id || 'discord_1472673126859935765';
          parsed.name = parsed.name || 'hizuhara.';
          parsed.discordUsername = parsed.discordUsername || parsed.name || 'hizuhara.';
          parsed.discordId = parsed.discordId || '1472673126859935765';
          parsed.avatarUrl = parsed.avatarUrl || 'https://cdn.discordapp.com/avatars/1472673126859935765/8819b4f951abe3f4f76a1646dee1ba9d.png';
          parsed.authProvider = 'discord';
          parsed.isRegistered = true;
          // Revert mistakenly injected 100 coins back to actual balance
          if (parsed.coins === 100 && localStorage.getItem('monopoly_coins_reset_v8_4_2') !== 'done') {
            parsed.coins = 0;
            localStorage.setItem('monopoly_coins_reset_v8_4_2', 'done');
          }
          parsed.coins = typeof parsed.coins === 'number' ? parsed.coins : 0;
          if (parsed.customToken && typeof parsed.customToken === 'string' && parsed.customToken.startsWith('data:image')) {
            parsed.customToken = parsed.customToken;
          } else {
            parsed.customToken = parsed.customToken || customPawnData;
          }
          parsed.token = parsed.token || 'custom';
          parsed.color = parsed.color || '#2563eb';
          parsed.bg = parsed.bg || 'space';
          parsed.profileBg = parsed.profileBg || 'space';
          parsed.title = parsed.title || 'creator';
          parsed.diceSkin = parsed.diceSkin || 'cosmic_void';
          parsed.unlockedTitles = [...ALL_TITLE_IDS];
          parsed.unlockedDice = [...ALL_DICE_IDS];
          if (!parsed.stats) parsed.stats = {};
          parsed.stats.gamesPlayed = Math.max(parsed.stats.gamesPlayed || 0, 2);
          parsed.stats.wins = Math.max(parsed.stats.wins || 0, 2);
          parsed.stats.losses = parsed.stats.losses || 0;
          parsed.stats.totalEarned = Math.max(parsed.stats.totalEarned || 0, 2700);
          parsed.stats.maxNetWorth = Math.max(parsed.stats.maxNetWorth || 0, 2500);
          this.saveProfile(parsed);
          return parsed;
        }

        if (parsed.token && parsed.token !== 'custom' && !parsed.token.startsWith('data:image')) {
          parsed.token = getTokenEmoji(parsed.token);
        }
        parsed.customToken = parsed.customToken || null;
        parsed.bg = parsed.bg || 'default';
        parsed.coins = typeof parsed.coins === 'number' ? parsed.coins : 0;
        parsed.unlockedDice = Array.isArray(parsed.unlockedDice) ? parsed.unlockedDice : ['classic'];
        if (!parsed.unlockedDice.includes('classic')) parsed.unlockedDice.unshift('classic');
        parsed.diceSkin = parsed.diceSkin || 'classic';
        parsed.unlockedTitles = Array.isArray(parsed.unlockedTitles) ? parsed.unlockedTitles : ['novice'];
        if (!parsed.unlockedTitles.includes('novice')) parsed.unlockedTitles.unshift('novice');
        
        if (isDevUser(parsed) || (typeof localStorage !== 'undefined' && localStorage.getItem('monopoly_is_creator') === 'true')) {
          parsed.unlockedTitles = [...ALL_TITLE_IDS];
          parsed.unlockedDice = [...ALL_DICE_IDS];
          parsed.title = parsed.title || 'creator';
          parsed.diceSkin = parsed.diceSkin || 'cosmic_void';
        }
        
        parsed.title = parsed.title || 'novice';
        const isReg = Boolean(parsed.isRegistered || parsed.discordId || parsed.authProvider === 'discord');
        parsed.isRegistered = isReg;
        if (!parsed.name || parsed.name === 'Гость') {
          parsed.name = isReg ? (parsed.discordUsername || 'Игрок') : (parsed.name || 'Игрок');
        }
        return parsed;
      } catch (e) {
        console.error('Failed to parse profile:', e);
      }
    }

    if (isOwnerDomain && !isLoggedOut) {
      const owner = getOwnerProfile();
      this.saveProfile(owner);
      return owner;
    }

    const randomId = 'usr_' + Math.random().toString(36).substring(2, 9);
    const defaultProfile = {
      id: randomId,
      name: 'Гость',
      token: '💎',
      color: PLAYER_COLORS[0],
      bg: 'default',
      coins: 0,
      unlockedDice: ['classic'],
      diceSkin: 'classic',
      unlockedTitles: ['novice'],
      title: 'novice',
      isRegistered: false,
      authProvider: null,
      discordId: null,
      discordUsername: null,
      avatarUrl: null,
      stats: {
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
        totalEarned: 0,
        maxNetWorth: 0
      }
    };
    this.saveProfile(defaultProfile);
    return defaultProfile;
  }

  saveProfile(profile = this.profile) {
    this.profile = profile;
    localStorage.setItem('monopoly_player_profile', JSON.stringify(this.profile));
  }

  setDiscordUser({ id, discordId, name, username, avatarUrl, isRegistered = true, authProvider = 'discord' }) {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('monopoly_user_logged_out');
    }
    this.profile.id = id || (discordId ? `discord_${discordId}` : this.profile.id);
    this.profile.discordId = discordId || this.profile.discordId;

    if (name && name.trim()) {
      this.profile.name = name.trim().substring(0, 20);
    }

    this.profile.discordUsername = username || name || this.profile.discordUsername;
    this.profile.avatarUrl = avatarUrl || this.profile.avatarUrl || null;
    this.profile.isRegistered = true;
    this.profile.authProvider = authProvider;

    if (isDevUser(this.profile)) {
      this.profile.unlockedDice = [...ALL_DICE_IDS];
      this.profile.unlockedTitles = [...ALL_TITLE_IDS];
      this.profile.title = 'creator';
      this.profile.diceSkin = 'cosmic_void';
      try {
        localStorage.setItem('monopoly_is_creator', 'true');
        localStorage.setItem('monopoly_dev_mode', 'true');
      } catch (e) {}
    }

    this.saveProfile();
  }

  logout() {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('monopoly_user_logged_out', '1');
    }
    const randomId = 'usr_' + Math.random().toString(36).substring(2, 9);
    this.profile.id = randomId;
    this.profile.name = 'Гость';
    this.profile.isRegistered = false;
    this.profile.authProvider = null;
    this.profile.discordId = null;
    this.profile.discordUsername = null;
    this.profile.avatarUrl = null;
    this.saveProfile();
  }

  logoutDiscord() {
    this.logout();
  }

  isRegisteredUser() {
    return Boolean(this.profile && (this.profile.isRegistered || this.profile.discordId || this.profile.authProvider === 'discord'));
  }

  updateName(newName) {
    if (newName && newName.trim()) {
      const clean = newName.trim().substring(0, 20);
      this.profile.name = clean;
      if (this.profile.discordUsername) {
        this.profile.discordUsername = clean;
      }
      this.saveProfile();
      return clean;
    }
    return this.profile.name;
  }

  setCustomToken(dataUrl) {
    if (!dataUrl) return;
    this.profile.customToken = dataUrl;
    this.profile.token = 'custom';
    this.saveProfile();
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('monopoly_player_profile');
        const p = raw ? JSON.parse(raw) : {};
        p.token = 'custom';
        p.customToken = dataUrl;
        localStorage.setItem('monopoly_player_profile', JSON.stringify(p));
      } catch (e) {}
    }
  }

  updateToken(tokenVal) {
    if (tokenVal === 'custom') {
      this.profile.token = 'custom';
    } else {
      this.profile.token = getTokenEmoji(tokenVal);
    }
    this.saveProfile();
  }

  updateBg(bgId) {
    this.profile.bg = bgId || 'default';
    this.saveProfile();
  }

  equipDiceSkin(skinId) {
    if (!this.profile.unlockedDice) this.profile.unlockedDice = ['classic'];
    if (this.profile.unlockedDice.includes(skinId)) {
      this.profile.diceSkin = skinId;
      this.saveProfile();
      return true;
    }
    return false;
  }

  unlockDiceSkin(skinId) {
    if (!this.profile.unlockedDice) this.profile.unlockedDice = ['classic'];
    if (!this.profile.unlockedDice.includes(skinId)) {
      this.profile.unlockedDice.push(skinId);
      this.saveProfile();
      return true;
    }
    return false;
  }

  grantCreatorTitle() {
    if (!this.profile.unlockedTitles) this.profile.unlockedTitles = ['novice'];
    if (!this.profile.unlockedTitles.includes('creator')) {
      this.profile.unlockedTitles.push('creator');
    }
    this.profile.title = 'creator';
    try {
      localStorage.setItem('monopoly_is_creator', 'true');
      localStorage.setItem('monopoly_dev_mode', 'true');
    } catch (e) {}
    this.saveProfile();
    return true;
  }

  buyTitle(titleId) {
    const title = TITLES.find(t => t.id === titleId);
    if (!title) return false;
    // Condition titles cannot be purchased!
    if (title.hasCondition || title.isDevOnly || !title.price || title.price <= 0) {
      return false;
    }
    if (this.spendCoins(title.price)) {
      this.unlockTitle(titleId);
      return true;
    }
    return false;
  }

  equipTitle(titleId) {
    if (!this.profile.unlockedTitles) this.profile.unlockedTitles = ['novice'];
    if ((this.isDev() || (typeof localStorage !== 'undefined' && localStorage.getItem('monopoly_is_creator') === 'true')) && !this.profile.unlockedTitles.includes('creator')) {
      this.profile.unlockedTitles.push('creator');
    }
    if (this.profile.unlockedTitles.includes(titleId)) {
      this.profile.title = titleId;
      this.saveProfile();
      return true;
    }
    return false;
  }

  unlockTitle(titleId) {
    if (!this.profile.unlockedTitles) this.profile.unlockedTitles = ['novice'];
    if (!this.profile.unlockedTitles.includes(titleId)) {
      this.profile.unlockedTitles.push(titleId);
      this.saveProfile();
      return true;
    }
    return false;
  }

  checkAutomaticTitleUnlocks() {
    if (!this.profile.unlockedTitles) this.profile.unlockedTitles = ['novice'];
    if (this.isDev() || (typeof localStorage !== 'undefined' && localStorage.getItem('monopoly_is_creator') === 'true')) {
      this.profile.unlockedTitles = [...ALL_TITLE_IDS];
      this.profile.unlockedDice = [...ALL_DICE_IDS];
    }
    TITLES.forEach(t => {
      if (t.checkUnlock && t.checkUnlock(this.profile.stats)) {
        if (!this.profile.unlockedTitles.includes(t.id)) {
          this.profile.unlockedTitles.push(t.id);
        }
      }
    });
    this.saveProfile();
  }

  addCoins(amount) {
    if (typeof amount !== 'number' || amount <= 0) return this.profile.coins || 0;
    this.profile.coins = (this.profile.coins || 0) + amount;
    this.saveProfile();
    return this.profile.coins;
  }

  removeCoins(amount) {
    const val = parseInt(amount) || 0;
    if (val <= 0) return this.profile.coins || 0;
    this.profile.coins = Math.max(0, (this.profile.coins || 0) - val);
    this.saveProfile();
    return this.profile.coins;
  }

  setCoins(amount) {
    this.profile.coins = Math.max(0, parseInt(amount) || 0);
    this.saveProfile();
    return this.profile.coins;
  }

  spendCoins(amount) {
    if (typeof amount !== 'number' || amount <= 0) return false;
    if ((this.profile.coins || 0) >= amount) {
      this.profile.coins -= amount;
      this.saveProfile();
      return true;
    }
    return false;
  }

  recordGameResult(isWin, earnedMoney, netWorth) {
    this.profile.stats.gamesPlayed += 1;
    if (isWin) {
      this.profile.stats.wins += 1;
      this.addCoins(50); // 50 монет за победу
    } else {
      this.profile.stats.losses += 1;
    }
    this.profile.stats.totalEarned += (earnedMoney || 0);
    if (netWorth > this.profile.stats.maxNetWorth) {
      this.profile.stats.maxNetWorth = netWorth;
    }
    this.checkAutomaticTitleUnlocks();
    this.saveProfile();
  }

  getWinRate() {
    if (this.profile.stats.gamesPlayed === 0) return 0;
    return Math.round((this.profile.stats.wins / this.profile.stats.gamesPlayed) * 100);
  }
}

export const profileManager = (typeof window !== 'undefined' && window.__monopoly_profile_instance)
  ? window.__monopoly_profile_instance
  : new ProfileManager();

if (typeof window !== 'undefined') {
  window.__monopoly_profile_instance = profileManager;
  window.profileManager = profileManager;
}
