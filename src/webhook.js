/**
 * Discord Webhook Match Stats Dispatcher
 */

import { BOARD_TILES } from './board-data.js';
import { getTitleById } from './titles.js';

export const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1551014727688134666/NwicaE-U3CwtL_vVKJTJY8UHYphJ1HcKbmhlNliCUM-yV-ht9mlhCOBaZNqxAjHftFlr';

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

  const properties = state.properties || {};
  const winner = state.winner;

  // Calculate detailed stats for each player
  const playersStats = (state.players || []).map(p => {
    let ownedCount = 0;
    let totalPropValue = 0;
    let housesCount = 0;

    Object.entries(properties).forEach(([tileIdStr, prop]) => {
      if (prop && String(prop.ownerId) === String(p.id)) {
        ownedCount++;
        const tile = BOARD_TILES[parseInt(tileIdStr, 10)];
        if (tile) {
          totalPropValue += tile.price || 0;
          const houses = prop.houses || 0;
          housesCount += houses;
          if (houses > 0 && tile.housePrice) {
            totalPropValue += houses * tile.housePrice;
          }
        }
      }
    });

    const netWorth = (p.isBankrupt ? 0 : (p.cash || 0)) + totalPropValue;
    const titleObj = getTitleById(p.title || 'novice');

    return {
      id: p.id,
      name: p.name || 'Игрок',
      token: p.token || '🎩',
      titleTag: titleObj ? titleObj.tag : '',
      isBot: Boolean(p.isBot),
      isBankrupt: Boolean(p.isBankrupt),
      cash: p.cash || 0,
      ownedCount,
      housesCount,
      totalPropValue,
      netWorth,
      discordId: p.discordId || null,
      isWinner: String(p.id) === String(winner.id)
    };
  });

  // Sort players: winner first, then active by netWorth desc, then bankrupts
  playersStats.sort((a, b) => {
    if (a.isWinner) return -1;
    if (b.isWinner) return 1;
    if (a.isBankrupt && !b.isBankrupt) return 1;
    if (!a.isBankrupt && b.isBankrupt) return -1;
    return b.netWorth - a.netWorth;
  });

  const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣'];
  const playersSummaryLines = playersStats.map((p, idx) => {
    const medal = medals[idx] || `${idx + 1}.`;
    const titlePart = p.titleTag ? ` [${p.titleTag}]` : '';
    const userDisplay = p.discordId ? `${p.token} **${p.name}**${titlePart} (<@${p.discordId}>)` : `${p.token} **${p.name}**${titlePart}`;
    
    if (p.isBankrupt) {
      return `${medal} ${userDisplay} — 💥 *Банкрот*`;
    }
    
    const propsInfo = p.ownedCount > 0 ? `🏛️ ${p.ownedCount} ${getPluralProps(p.ownedCount)}` : '🏛️ нет владений';
    return `${medal} ${userDisplay} — **$${p.cash.toLocaleString('ru-RU')}** • ${propsInfo} *(Капитал: $${p.netWorth.toLocaleString('ru-RU')})*`;
  }).join('\n');

  const winnerData = playersStats.find(p => p.isWinner) || playersStats[0];
  const winnerDiscord = winnerData.discordId ? ` (<@${winnerData.discordId}>)` : '';
  const winnerTitlePart = winnerData.titleTag ? ` [${winnerData.titleTag}]` : '';
  const winnerPropsText = `${winnerData.ownedCount} ${getPluralProps(winnerData.ownedCount)}`;

  const settings = state.settings || {};
  const settingsText = [
    `• Режим: **${isTestMode ? '🧪 Тестовый' : '🎲 Стандарт'}**`,
    `• Стартовый капитал: **$${(settings.startingCash || 1500).toLocaleString('ru-RU')}**`,
    `• Зарплата за круг: **$${(settings.salary || 200).toLocaleString('ru-RU')}**`,
    `• Участников в партии: **${playersStats.length}**`
  ].join('\n');

  const embed = {
    title: '🏆 Партия завершена | Монополия',
    description: `Итоги игры в комнате \`${roomCode}\``,
    color: isTestMode ? 0xD946EF : 0xF59E0B, // Magenta for test, Amber for standard
    fields: [
      {
        name: '👑 Победитель матча',
        value: `${winnerData.token} **${winnerData.name}**${winnerDiscord}\n💰 Баланс: **$${winnerData.cash.toLocaleString('ru-RU')}** • Владений: **${winnerPropsText}**\n📊 Общий итоговый капитал: **$${winnerData.netWorth.toLocaleString('ru-RU')}**`,
        inline: false
      },
      {
        name: '📊 Итоговый рейтинг игроков',
        value: playersSummaryLines || 'Нет данных',
        inline: false
      },
      {
        name: '⚙️ Параметры матча',
        value: settingsText,
        inline: false
      }
    ],
    footer: {
      text: 'Пиксельная Монополия • pixel-monopoly-nu.vercel.app',
      icon_url: 'https://pixel-monopoly-nu.vercel.app/favicon.ico'
    },
    timestamp: new Date().toISOString()
  };

  const payload = {
    username: 'Монополия Бот',
    avatar_url: 'https://pixel-monopoly-nu.vercel.app/favicon.ico',
    embeds: [embed]
  };

  try {
    await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    console.warn('Failed to send Discord webhook:', err);
  }
}

function getPluralProps(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 19) return 'улиц';
  if (mod10 === 1) return 'улица';
  if (mod10 >= 2 && mod10 <= 4) return 'улицы';
  return 'улиц';
}
