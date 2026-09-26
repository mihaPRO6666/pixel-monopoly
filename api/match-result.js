/**
 * Vercel Serverless Function — Discord Bot Match Result Notifier
 * POST /api/match-result
 * Body: { state, roomCode, isTestMode }
 * Also saves match to GitHub repo data/match-history.json
 */

const DISCORD_API = 'https://discord.com/api/v10';
const GITHUB_API = 'https://api.github.com/repos/mihaPRO6666/pixel-monopoly/contents/data/match-history.json';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
  const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

  if (!BOT_TOKEN || !CHANNEL_ID) return res.status(500).json({ error: 'Bot not configured' });

  const { state, roomCode = 'Неизвестная комната', isTestMode = false } = req.body || {};
  if (!state) return res.status(400).json({ error: 'No state provided' });

  // Filter test/solo/bot matches
  if (isTestMode || /TEST|DEBUG|MOCK/i.test(roomCode)) {
    return res.status(200).json({ ok: true, skipped: 'test match' });
  }

  const players = state.players || [];
  const properties = state.properties || {};
  const settings = state.settings || {};
  const reason = state.reason || state.statusText || null;

  // Find winner or remaining/lead player
  let winner = state.winner;
  if (!winner || !winner.id) {
    winner = players.find(p => !p.hasLeft && !p.isBankrupt) || players[0] || { name: 'Никто', token: '❓' };
  }

  const isAllLeft = players.length > 0 && players.every(p => p.hasLeft);
  const isEarlyFinish = Boolean(reason) || isAllLeft;

  const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣'];

  const plural = (n) => {
    const m10 = n % 10, m100 = n % 100;
    if (m100 >= 11 && m100 <= 19) return 'улиц';
    if (m10 === 1) return 'улица';
    if (m10 >= 2 && m10 <= 4) return 'улицы';
    return 'улиц';
  };

  const playersStats = players.map(p => {
    let ownedCount = 0, totalPropValue = 0;
    Object.entries(properties).forEach(([tileId, prop]) => {
      if (prop && String(prop.ownerId) === String(p.id)) {
        ownedCount++;
        totalPropValue += prop.price || 0;
      }
    });
    return {
      id: p.id, name: p.name || 'Игрок', token: p.token || '🎩',
      isBot: Boolean(p.isBot), isBankrupt: Boolean(p.isBankrupt),
      hasLeft: Boolean(p.hasLeft),
      cash: p.cash || 0, ownedCount, totalPropValue,
      netWorth: (p.isBankrupt ? 0 : (p.cash || 0)) + totalPropValue,
      discordId: p.discordId || null,
      isWinner: String(p.id) === String(winner.id)
    };
  }).sort((a, b) => {
    if (a.isWinner && !b.isWinner) return -1;
    if (b.isWinner && !a.isWinner) return 1;
    if (!a.hasLeft && b.hasLeft) return -1;
    if (a.hasLeft && !b.hasLeft) return 1;
    if (!a.isBankrupt && b.isBankrupt) return -1;
    if (a.isBankrupt && !b.isBankrupt) return 1;
    return b.netWorth - a.netWorth;
  });

  const lines = playersStats.map((p, i) => {
    const medal = medals[i] || `${i + 1}.`;
    const mention = p.discordId ? ` (<@${p.discordId}>)` : '';
    const name = `${p.token} **${p.name}**${mention}`;
    if (p.hasLeft) return `${medal} ${name} — 🚪 *Вышел из лобби/игры*`;
    if (p.isBankrupt) return `${medal} ${name} — 💥 *Банкрот*`;
    return `${medal} ${name} — **$${p.cash.toLocaleString('ru-RU')}** | 🏛️ ${p.ownedCount} ${plural(p.ownedCount)} | Капитал: **$${p.netWorth.toLocaleString('ru-RU')}**`;
  }).join('\n');

  const w = playersStats[0] || { name: 'Никто', token: '❓', cash: 0, netWorth: 0, ownedCount: 0 };
  const wMention = w.discordId ? ` (<@${w.discordId}>)` : '';
  const now = new Date();

  const embedFields = [];

  if (isEarlyFinish) {
    embedFields.push({
      name: '⚠️ Статус матча',
      value: `**${reason || 'Все игроки вышли из лобби/игры'}**`,
      inline: false
    });
  }

  if (w && w.id && !isAllLeft) {
    embedFields.push({
      name: isEarlyFinish ? '👑 Оставшийся победитель' : '👑 Победитель',
      value: `${w.token} **${w.name}**${wMention}\n💰 $${w.cash.toLocaleString('ru-RU')} • 🏛️ ${w.ownedCount} ${plural(w.ownedCount)} • Капитал: $${w.netWorth.toLocaleString('ru-RU')}`,
      inline: false
    });
  }

  embedFields.push({
    name: '📊 Игроки и позиции',
    value: lines || 'Нет данных',
    inline: false
  });

  embedFields.push({
    name: '⚙️ Настройки',
    value: `Стартовый капитал: **$${(settings.startingCash || 1500).toLocaleString('ru-RU')}** • Зарплата: **$${(settings.salary || 200).toLocaleString('ru-RU')}** • Игроков: **${players.length}**`,
    inline: false
  });

  const embed = {
    title: isEarlyFinish ? '🚪 Партия завершена досрочно | Монополия' : '🏆 Партия завершена | Монополия',
    description: `Комната: \`${roomCode}\``,
    color: isEarlyFinish ? 0xEF4444 : 0xF59E0B,
    fields: embedFields,
    footer: { text: 'Pixel Monopoly • pixel-monopoly-nu.vercel.app' },
    timestamp: now.toISOString()
  };

  // Send to Discord
  let discordMsgId = null;
  try {
    const discordRes = await fetch(`${DISCORD_API}/channels/${CHANNEL_ID}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bot ${BOT_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] })
    });
    if (discordRes.ok) {
      const msg = await discordRes.json();
      discordMsgId = msg.id;
    }
  } catch (err) {
    console.warn('Discord send error:', err);
  }

  // Save to match history in GitHub repo
  if (GITHUB_TOKEN) {
    try {
      const fileRes = await fetch(GITHUB_API, {
        headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, 'User-Agent': 'pixel-monopoly-bot' }
      });
      let sha = null;
      let history = { matches: [] };
      if (fileRes.ok) {
        const fileData = await fileRes.json();
        sha = fileData.sha;
        history = JSON.parse(Buffer.from(fileData.content, 'base64').toString('utf8'));
      }

      const matchReason = reason || (isAllLeft ? 'Все вышли из лобби' : (isEarlyFinish ? 'Игроки вышли' : null));
      const newMatch = {
        id: `${Date.now()}-${roomCode}`,
        roomCode,
        date: now.toISOString(),
        discordMsgId,
        reason: matchReason,
        winner: { name: w.name, token: w.token, discordId: w.discordId, cash: w.cash, netWorth: w.netWorth, ownedCount: w.ownedCount },
        players: playersStats.map(p => ({
          name: p.name, token: p.token, discordId: p.discordId,
          cash: p.cash, netWorth: p.netWorth, ownedCount: p.ownedCount,
          isBankrupt: p.isBankrupt, hasLeft: p.hasLeft, isBot: p.isBot, isWinner: p.isWinner
        })),
        settings: { startingCash: settings.startingCash || 1500, salary: settings.salary || 200 }
      };
      history.matches = [newMatch, ...(history.matches || [])].slice(0, 50);

      const updateBody = {
        message: `Match history: ${roomCode} - ${matchReason || `Winner: ${w.name}`}`,
        content: Buffer.from(JSON.stringify(history, null, 2)).toString('base64'),
        sha
      };
      await fetch(GITHUB_API, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'pixel-monopoly-bot' },
        body: JSON.stringify(updateBody)
      });
      console.log('✅ Match saved to history');
    } catch (e) {
      console.warn('History save error:', e);
    }
  }

  return res.status(200).json({ ok: true });
}
