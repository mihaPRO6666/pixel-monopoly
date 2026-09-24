/**
 * Web Audio API Sound Engine with Granular Volume & Category Controls
 * Supports per-category volume sliders (master, dice, buy, win, ui, card)
 */

const STORAGE_KEYS = {
  master:  'monopoly_volume',
  muted:   'monopoly_muted',
  dice:    'monopoly_vol_dice',
  buy:     'monopoly_vol_buy',
  win:     'monopoly_vol_win',
  ui:      'monopoly_vol_ui',
  card:    'monopoly_vol_card',
};

class SoundEngine {
  constructor() {
    this.ctx = null;

    // volumes: 0..1
    this.volume     = parseFloat(localStorage.getItem(STORAGE_KEYS.master) ?? '0.5');
    this.isMuted    = localStorage.getItem(STORAGE_KEYS.muted) === '1';
    this.catVol     = {
      dice: parseFloat(localStorage.getItem(STORAGE_KEYS.dice) ?? '0.8'),
      buy:  parseFloat(localStorage.getItem(STORAGE_KEYS.buy)  ?? '0.85'),
      win:  parseFloat(localStorage.getItem(STORAGE_KEYS.win)  ?? '0.75'),
      ui:   parseFloat(localStorage.getItem(STORAGE_KEYS.ui)   ?? '0.5'),
      card: parseFloat(localStorage.getItem(STORAGE_KEYS.card) ?? '0.65'),
    };

    this.initAudioContext();
  }

  initAudioContext() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    } catch (e) {
      console.warn('Web Audio API not supported:', e);
    }
  }

  ensureAudio() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  // ── Setters ──────────────────────────────────────────────────────────────

  setVolume(val) {
    this.volume = Math.max(0, Math.min(1, parseFloat(val)));
    localStorage.setItem(STORAGE_KEYS.master, this.volume);
  }

  setMuted(muted) {
    this.isMuted = !!muted;
    localStorage.setItem(STORAGE_KEYS.muted, this.isMuted ? '1' : '0');
  }

  toggleMuted() {
    this.setMuted(!this.isMuted);
    return this.isMuted;
  }

  setCatVolume(cat, val) {
    if (!(cat in this.catVol)) return;
    this.catVol[cat] = Math.max(0, Math.min(1, parseFloat(val)));
    localStorage.setItem(STORAGE_KEYS[cat], this.catVol[cat]);
  }

  // Legacy compat
  setSfxMuted(muted)  { /* no-op, use catVol */ }
  setUiMuted(muted)   { if (muted) this.setCatVolume('ui', 0); }

  // ── Volume resolver ───────────────────────────────────────────────────────

  getEffectiveVolume(cat = 'buy') {
    if (this.isMuted) return 0;
    const catMult = this.catVol[cat] ?? 1;
    return this.volume * catMult;
  }

  // ── Core tone player ─────────────────────────────────────────────────────

  playTone(freq, type = 'sine', duration = 0.1, delay = 0, cat = 'buy') {
    const effVol = this.getEffectiveVolume(cat);
    if (!this.ctx || effVol <= 0) return;
    this.ensureAudio();

    const osc  = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime + delay);

    const now = this.ctx.currentTime + delay;
    const vol = effVol * 0.25;

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(vol, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    try {
      osc.start(now);
      osc.stop(now + duration + 0.05);
    } catch (e) {}
  }

  // ── Named sounds ─────────────────────────────────────────────────────────

  playClick() {
    this.playTone(800, 'sine', 0.04, 0, 'ui');
  }

  playTokenStep() {
    this.playTone(480, 'triangle', 0.06, 0, 'buy');
  }

  playDiceRoll() {
    if (this.getEffectiveVolume('dice') <= 0 || !this.ctx) return;
    for (let i = 0; i < 6; i++) {
      const freq = 300 + Math.random() * 200;
      this.playTone(freq, 'square', 0.03, i * 0.05, 'dice');
    }
  }
  playDice() { this.playDiceRoll(); }

  playCash() {
    this.playTone(987.77,  'sine', 0.12, 0,    'buy');
    this.playTone(1318.51, 'sine', 0.25, 0.08, 'buy');
  }
  playMoney() { this.playCash(); }

  playBuy() {
    this.playTone(523.25, 'sine', 0.1,  0,    'buy');
    this.playTone(659.25, 'sine', 0.1,  0.08, 'buy');
    this.playTone(783.99, 'sine', 0.2,  0.16, 'buy');
  }

  playBuild() {
    this.playTone(440, 'triangle', 0.08, 0,    'buy');
    this.playTone(880, 'sine',     0.18, 0.06, 'buy');
  }

  playCard() {
    this.playTone(600, 'triangle', 0.08, 0,    'card');
    this.playTone(900, 'sine',     0.12, 0.05, 'card');
  }

  playJail() {
    this.playTone(160, 'sawtooth', 0.35, 0,    'win');
    this.playTone(90,  'sawtooth', 0.45, 0.05, 'win');
  }

  playBankrupt() {
    this.playTone(400, 'sawtooth', 0.2, 0,    'win');
    this.playTone(360, 'sawtooth', 0.2, 0.15, 'win');
    this.playTone(300, 'sawtooth', 0.4, 0.3,  'win');
  }

  playWin() {
    const notes = [523.25, 659.25, 783.99, 1046.50];
    notes.forEach((freq, idx) => {
      this.playTone(freq, 'sine', 0.25, idx * 0.12, 'win');
    });
  }
}

export const sound = new SoundEngine();
