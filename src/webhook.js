/**
 * Discord Bot Match Stats Dispatcher
 * Posts to /api/match-result (Vercel serverless function)
 * The bot token is stored securely as a server-side env variable — not exposed to browser
 */

export async function sendMatchFinishedWebhook(state, options = {}) {
  if (!state || !state.winner) return;

  const { roomCode = 'Одиночная/Локальная игра', isTestMode = false } = options;

  // Do not send test matches or automated/debug rooms
  if (
    isTestMode ||
    /TEST|DEBUG|MOCK/i.test(roomCode) ||
    (state.players && state.players.some(p => /Test|Playwright|Automated/i.test(p.name || '')))
  ) {
    return;
  }

  try {
    // POST to Vercel serverless function — bot token stays server-side (secure)
    const res = await fetch('/api/match-result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state, roomCode, isTestMode })
    });
    if (res.ok) {
      console.log('✅ Match result sent to Discord bot');
    } else {
      console.warn('Discord bot error:', res.status, await res.text().catch(() => ''));
    }
  } catch (err) {
    console.warn('Failed to send match result to Discord bot:', err);
  }
}
