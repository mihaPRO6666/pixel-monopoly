/**
 * Vercel Serverless Function — Discord Bot Match Result Notifier
 * POST /api/match-result
 * Body: { state, roomCode, isTestMode }
 */

const DISCORD_API = 'https://discord.com/api/v10';

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
  const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;

  if (!BOT_TOKEN || !CHANNEL_ID) {
    return res.status(500).json({ error: 'Bot not configured' });
  }

  let body;
  try {
    body = req.body;
  } catch (e) {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const { state, roomCode = 'Одиночная/Локальная', isTestMode = false } = body || {};

  if (!state || !state.winner) {
    return res.status(400).json({ error: 'No winner in state' });
  }

  // Build embed
  const winner = state.winner;
  const players = state.players || [];
  const properties = state.properties || {};
  const settings = state.settings || {};

  const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣'];

  const playersStats = players.map(p => {
    let ownedCount = 0, totalPropValue = 0, housesCount = 0;
    Object.entries(properties).forEach(([tileId, prop]) => {
      if (prop && String(prop.ownerId) === String(p.id)) {
        ownedCount++;
        const price = prop.price || 0;
        totalPropValue += price;
        housesCount += prop.houses || 0;
      }
    });
    return {
      id: p.id,
      name: p.name || 'Игрок',
      token: p.token || '🎩',
      isBot: Boolean(p.isBot),
      isBankrupt: Boolean(p.isBankrupt),
      cash: p.cash || 0,
      ownedCount,
      housesCount,
      totalPropValue,
      netWorth: (p.isBankrupt ? 0 : (p.cash || 0)) + totalPropValue,
      discordId: p.discordId || null,
      isWinner: String(p.id) === String(winner.id)
    };
  }).sort((a, b) => {
    if (a.isWinner) return -1;
    if (b.isWinner) return 1;
    if (a.isBankrupt && !b.isBankrupt) return 1;
    if (!a.isBankrupt && b.isBankrupt) return -1;
    return b.netWorth - a.netWorth;
  });

  const plural = (n) => {
    const m10 = n % 10, m100 = n % 100;
    if (m100 >= 11 && m100 <= 19) return 'улиц';
    if (m10 === 1) return 'улица';
    if (m10 >= 2 && m10 <= 4) return 'улицы';
    return 'улиц';
  };

  const lines = playersStats.map((p, i) => {
    const medal = medals[i] || `${i + 1}.`;
    const mention = p.discordId ? ` (<@${p.discordId}>)` : '';
    const name = `${p.token} **${p.name}**${mention}`;
    if (p.isBankrupt) return `${medal} ${name} — 💥 Банкрот`;
    return `${medal} ${name} — **$${p.cash.toLocaleString('ru-RU')}** | 🏛️ ${p.ownedCount} ${plural(p.ownedCount)} | Капитал: **$${p.netWorth.toLocaleString('ru-RU')}**`;
  }).join('\n');

  const w = playersStats[0];
  const wMention = w.discordId ? ` (<@${w.discordId}>)` : '';

  const embed = {
    title: '🏆 Партия завершена!',
    description: `Комната: \`${roomCode}\``,
    color: 0xF59E0B,
    fields: [
      {
        name: '👑 Победитель',
        value: `${w.token} **${w.name}**${wMention}\n💰 $${w.cash.toLocaleString('ru-RU')} • 🏛️ ${w.ownedCount} ${plural(w.ownedCount)} • Капитал: $${w.netWorth.toLocaleString('ru-RU')}`,
        inline: false
      },
      {
        name: '📊 Результаты',
        value: lines || 'Нет данных',
        inline: false
      },
      {
        name: '⚙️ Настройки',
        value: `Стартовый капитал: **$${(settings.startingCash || 1500).toLocaleString('ru-RU')}** • Зарплата: **$${(settings.salary || 200).toLocaleString('ru-RU')}** • Игроков: **${players.length}**`,
        inline: false
      }
    ],
    footer: { text: 'Pixel Monopoly • pixel-monopoly-nu.vercel.app' },
    timestamp: new Date().toISOString()
  };

  try {
    const discordRes = await fetch(`${DISCORD_API}/channels/${CHANNEL_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${BOT_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ embeds: [embed] })
    });

    if (!discordRes.ok) {
      const err = await discordRes.text();
      console.error('Discord API error:', err);
      return res.status(502).json({ error: 'Discord API error', detail: err });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Fetch error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
