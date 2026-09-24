export const THEMES = [
  { id: 'midnight', name: 'Pixel Midnight', label: 'Полночь', color: '#38bdf8', preview: '#09090b', icon: '🌑', dotColor: '#38bdf8' },
  { id: 'cyberpunk', name: 'Pixel Cyberpunk', label: 'Киберпанк', color: '#06b6d4', preview: '#06b6d4', icon: '⚡', dotColor: '#22d3ee' },
  { id: 'dusk', name: 'Pixel Dusk', label: 'Сланец', color: '#2b2d42', preview: '#2b2d42', icon: '🌌', dotColor: '#8d99ae' },
  { id: 'emerald', name: 'Pixel Emerald', label: 'Изумруд', color: '#059669', preview: '#059669', icon: '🌲', dotColor: '#10b981' },
  { id: 'ocean', name: 'Pixel Ocean', label: 'Океан', color: '#2d5a88', preview: '#2d5a88', icon: '🌊', dotColor: '#4ea8de' },
  { id: 'purple', name: 'Pixel Purple', label: 'Аметист', color: '#7e22ce', preview: '#7e22ce', icon: '🔮', dotColor: '#a855f7' },
  { id: 'sunset', name: 'Pixel Sunset', label: 'Закат', color: '#db2777', preview: '#db2777', icon: '🌅', dotColor: '#f43f5e' },
  { id: 'gold', name: 'Pixel Gold', label: 'Золото', color: '#ca8a04', preview: '#ca8a04', icon: '👑', dotColor: '#eab308' },
  { id: 'cherry', name: 'Pixel Sakura', label: 'Сакура', color: '#e11d48', preview: '#e11d48', icon: '🌸', dotColor: '#f43f5e' },
  { id: 'lavender', name: 'Pixel Lavender', label: 'Лаванда', color: '#6366f1', preview: '#6366f1', icon: '🪻', dotColor: '#818cf8' },
  { id: 'coffee', name: 'Pixel Coffee', label: 'Кофе', color: '#78350f', preview: '#78350f', icon: '☕', dotColor: '#b45309' },
  { id: 'nordic', name: 'Pixel Frost', label: 'Ледник', color: '#0284c7', preview: '#0284c7', icon: '❄️', dotColor: '#38bdf8' },
  { id: 'crimson', name: 'Pixel Crimson', label: 'Рубин', color: '#be123c', preview: '#be123c', icon: '🩸', dotColor: '#f43f5e' },
  { id: 'solar', name: 'Pixel Solar', label: 'Огонь', color: '#ea580c', preview: '#ea580c', icon: '🔥', dotColor: '#f97316' },
  { id: 'mint', name: 'Pixel Mint', label: 'Мята', color: '#2d6a4f', preview: '#2d6a4f', icon: '🌿', dotColor: '#52b788' },
  { id: 'coral', name: 'Pixel Coral', label: 'Коралл', color: '#b84a39', preview: '#b84a39', icon: '🪸', dotColor: '#e07a5f' }
];

export class ThemeManager {
  constructor() {
    let saved = 'cyberpunk';
    try {
      if (typeof localStorage !== 'undefined') {
        if (localStorage.getItem('monopoly_theme_sync_v8_4_3') !== 'done') {
          // Sync theme from midnight to cyberpunk
          if (!localStorage.getItem('monopoly_theme') || localStorage.getItem('monopoly_theme') === 'midnight') {
            localStorage.setItem('monopoly_theme', 'cyberpunk');
          }
          localStorage.setItem('monopoly_theme_sync_v8_4_3', 'done');
        }
        const stored = localStorage.getItem('monopoly_theme');
        if (stored && stored !== 'mint' && THEMES.some(t => t.id === stored)) {
          saved = stored;
        } else {
          saved = 'cyberpunk';
        }
      }
    } catch (e) {}
    this.currentTheme = saved;
    this.applyTheme(this.currentTheme);
  }

  applyTheme(themeId, pushToSync = true) {
    if (!THEMES.some(t => t.id === themeId)) {
      themeId = 'cyberpunk';
    }
    this.currentTheme = themeId;
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.setAttribute('data-theme', themeId);
    }
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('monopoly_theme', themeId);
      }
    } catch (e) {}

    if (pushToSync && typeof window !== 'undefined' && window.cloudSync) {
      window.cloudSync.syncTheme(themeId);
    }
  }

  getTheme() {
    return this.currentTheme;
  }

  getCurrentThemeObj() {
    return THEMES.find(t => t.id === this.currentTheme) || THEMES[0];
  }

  nextTheme() {
    const idx = THEMES.findIndex(t => t.id === this.currentTheme);
    const nextIdx = (idx + 1) % THEMES.length;
    this.applyTheme(THEMES[nextIdx].id);
    return THEMES[nextIdx];
  }
}

export const themeManager = new ThemeManager();
if (typeof window !== 'undefined') {
  window.themeManager = themeManager;
}
