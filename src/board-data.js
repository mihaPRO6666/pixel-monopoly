/**
 * 40 Board Tiles & Configuration — Countries & Cities Edition
 * Organized by Countries with iconic, concise names that fit all screen sizes!
 */

export const BOARD_TILES = [
  // Bottom Row: 0 -> 10 (Right to Left / Bottom side of board)
  {
    id: 0,
    name: 'ВПЕРЁД',
    type: 'corner',
    icon: '🚀',
    desc: 'Получите премию за прохождение'
  },
  {
    id: 1,
    name: 'Анапа',
    type: 'street',
    group: 'brown',
    icon: '🏖️',
    price: 60,
    rent: [2, 10, 30, 90, 160, 250],
    houseCost: 50,
    mortgage: 30
  },
  {
    id: 2,
    name: 'Общественная казна',
    type: 'chest',
    icon: '🎁',
    desc: 'Возьмите карточку Казны'
  },
  {
    id: 3,
    name: 'Сочи',
    type: 'street',
    group: 'brown',
    icon: '🌴',
    price: 60,
    rent: [4, 20, 60, 180, 320, 450],
    houseCost: 50,
    mortgage: 30
  },
  {
    id: 4,
    name: 'Подоходный налог',
    type: 'tax',
    icon: '💸',
    taxAmount: 200,
    desc: 'Заплатите $200 налога'
  },
  {
    id: 5,
    name: 'Северный вокзал',
    type: 'station',
    group: 'station',
    icon: '🚆',
    price: 200,
    rent: [25, 50, 100, 200],
    mortgage: 100
  },
  {
    id: 6,
    name: 'Троещина',
    type: 'street',
    group: 'lightblue',
    icon: '🏙️',
    price: 100,
    rent: [6, 30, 90, 270, 400, 550],
    houseCost: 50,
    mortgage: 50
  },
  {
    id: 7,
    name: 'Шанс',
    type: 'chance',
    icon: '❓',
    desc: 'Возьмите карточку Шанса'
  },
  {
    id: 8,
    name: 'Бровары',
    type: 'street',
    group: 'lightblue',
    icon: '🌲',
    price: 100,
    rent: [6, 30, 90, 270, 400, 550],
    houseCost: 50,
    mortgage: 50
  },
  {
    id: 9,
    name: 'Киев',
    type: 'street',
    group: 'lightblue',
    icon: '🇺🇦',
    price: 120,
    rent: [8, 40, 100, 300, 450, 600],
    houseCost: 50,
    mortgage: 60
  },
  {
    id: 10,
    name: 'Тюрьма / Визит',
    type: 'corner',
    icon: '🔒',
    desc: 'Простое посещение или отбывание'
  },

  // Left Row: 11 -> 19 (Bottom to Top)
  {
    id: 11,
    name: 'Варшава',
    type: 'street',
    group: 'pink',
    icon: '🏰',
    price: 140,
    rent: [10, 50, 150, 450, 625, 750],
    houseCost: 100,
    mortgage: 70
  },
  {
    id: 12,
    name: 'Энергосеть',
    type: 'utility',
    group: 'utility',
    icon: '⚡',
    price: 150,
    desc: '4x или 10x броска кубиков',
    mortgage: 75
  },
  {
    id: 13,
    name: 'Краков',
    type: 'street',
    group: 'pink',
    icon: '🐉',
    price: 140,
    rent: [10, 50, 150, 450, 625, 750],
    houseCost: 100,
    mortgage: 70
  },
  {
    id: 14,
    name: 'Гданьск',
    type: 'street',
    group: 'pink',
    icon: '⛵',
    price: 160,
    rent: [12, 60, 180, 500, 700, 900],
    houseCost: 100,
    mortgage: 80
  },
  {
    id: 15,
    name: 'Южный вокзал',
    type: 'station',
    group: 'station',
    icon: '✈️',
    price: 200,
    rent: [25, 50, 100, 200],
    mortgage: 100
  },
  {
    id: 16,
    name: 'Берлин',
    type: 'street',
    group: 'orange',
    icon: '🏛️',
    price: 180,
    rent: [14, 70, 200, 550, 750, 950],
    houseCost: 100,
    mortgage: 90
  },
  {
    id: 17,
    name: 'Общественная казна',
    type: 'chest',
    icon: '🎁',
    desc: 'Возьмите карточку Казны'
  },
  {
    id: 18,
    name: 'Мюнхен',
    type: 'street',
    group: 'orange',
    icon: '🍺',
    price: 180,
    rent: [14, 70, 200, 550, 750, 950],
    houseCost: 100,
    mortgage: 90
  },
  {
    id: 19,
    name: 'Гамбург',
    type: 'street',
    group: 'orange',
    icon: '⚓',
    price: 200,
    rent: [16, 80, 220, 600, 800, 1000],
    houseCost: 100,
    mortgage: 100
  },
  {
    id: 20,
    name: 'Бесплатная стоянка',
    type: 'corner',
    icon: '🅿️',
    desc: 'Отдых или Джекпот'
  },

  // Top Row: 21 -> 29 (Left to Right)
  {
    id: 21,
    name: 'Париж',
    type: 'street',
    group: 'red',
    icon: '🗼',
    price: 220,
    rent: [18, 90, 250, 700, 875, 1050],
    houseCost: 150,
    mortgage: 110
  },
  {
    id: 22,
    name: 'Шанс',
    type: 'chance',
    icon: '❓',
    desc: 'Возьмите карточку Шанса'
  },
  {
    id: 23,
    name: 'Ницца',
    type: 'street',
    group: 'red',
    icon: '🌴',
    price: 220,
    rent: [18, 90, 250, 700, 875, 1050],
    houseCost: 150,
    mortgage: 110
  },
  {
    id: 24,
    name: 'Лион',
    type: 'street',
    group: 'red',
    icon: '🎨',
    price: 240,
    rent: [20, 100, 300, 750, 925, 1100],
    houseCost: 150,
    mortgage: 120
  },
  {
    id: 25,
    name: 'Восточный вокзал',
    type: 'station',
    group: 'station',
    icon: '🚆',
    price: 200,
    rent: [25, 50, 100, 200],
    mortgage: 100
  },
  {
    id: 26,
    name: 'Лондон',
    type: 'street',
    group: 'yellow',
    icon: '🎡',
    price: 260,
    rent: [22, 110, 330, 800, 975, 1150],
    houseCost: 150,
    mortgage: 130
  },
  {
    id: 27,
    name: 'Оксфорд',
    type: 'street',
    group: 'yellow',
    icon: '🎓',
    price: 260,
    rent: [22, 110, 330, 800, 975, 1150],
    houseCost: 150,
    mortgage: 130
  },
  {
    id: 28,
    name: 'Водоканал',
    type: 'utility',
    group: 'utility',
    icon: '🚰',
    price: 150,
    desc: '4x или 10x броска кубиков',
    mortgage: 75
  },
  {
    id: 29,
    name: 'Ливерпуль',
    type: 'street',
    group: 'yellow',
    icon: '🎸',
    price: 280,
    rent: [24, 120, 360, 850, 1025, 1200],
    houseCost: 150,
    mortgage: 140
  },
  {
    id: 30,
    name: 'В тюрьму!',
    type: 'corner',
    icon: '👮',
    desc: 'Прямиком за решётку'
  },

  // Right Row: 31 -> 39 (Top to Bottom)
  {
    id: 31,
    name: 'Токио',
    type: 'street',
    group: 'green',
    icon: '🗼',
    price: 300,
    rent: [26, 130, 390, 900, 1100, 1275],
    houseCost: 200,
    mortgage: 150
  },
  {
    id: 32,
    name: 'Киото',
    type: 'street',
    group: 'green',
    icon: '⛩️',
    price: 300,
    rent: [26, 130, 390, 900, 1100, 1275],
    houseCost: 200,
    mortgage: 150
  },
  {
    id: 33,
    name: 'Общественная казна',
    type: 'chest',
    icon: '🎁',
    desc: 'Возьмите карточку Казны'
  },
  {
    id: 34,
    name: 'Осака',
    type: 'street',
    group: 'green',
    icon: '🏯',
    price: 320,
    rent: [28, 150, 450, 1000, 1200, 1400],
    houseCost: 200,
    mortgage: 160
  },
  {
    id: 35,
    name: 'Западный вокзал',
    type: 'station',
    group: 'station',
    icon: '🚢',
    price: 200,
    rent: [25, 50, 100, 200],
    mortgage: 100
  },
  {
    id: 36,
    name: 'Шанс',
    type: 'chance',
    icon: '❓',
    desc: 'Возьмите карточку Шанса'
  },
  {
    id: 37,
    name: 'Крещатик',
    type: 'street',
    group: 'darkblue',
    icon: '🏛️',
    price: 350,
    rent: [35, 175, 500, 1100, 1300, 1500],
    houseCost: 200,
    mortgage: 175
  },
  {
    id: 38,
    name: 'Налог на роскошь',
    type: 'tax',
    icon: '💎',
    taxAmount: 100,
    desc: 'Заплатите $100'
  },
  {
    id: 39,
    name: 'Киев',
    type: 'street',
    group: 'darkblue',
    icon: '👑',
    price: 400,
    rent: [50, 200, 600, 1400, 1700, 2000],
    houseCost: 200,
    mortgage: 200
  }
];

export const COLOR_GROUPS = {
  brown: { name: 'Черноморье', count: 2, color: '#8B4513' },
  lightblue: { name: 'Украина', count: 3, color: '#38bdf8' },
  pink: { name: 'Польша', count: 3, color: '#ec4899' },
  orange: { name: 'Германия', count: 3, color: '#f97316' },
  red: { name: 'Франция', count: 3, color: '#ef4444' },
  yellow: { name: 'Великобритания', count: 3, color: '#eab308' },
  green: { name: 'Япония', count: 3, color: '#10b981' },
  darkblue: { name: 'Топ Столицы', count: 2, color: '#3b82f6' },
  station: { name: 'Транспорт', count: 4, color: '#64748b' },
  utility: { name: 'Службы', count: 2, color: '#94a3b8' }
};

export const CHANCE_CARDS = [
  { id: 'ch_1', text: 'Отправляйтесь на клетку ВПЕРЁД. Получите премию $200.', action: 'advance_go' },
  { id: 'ch_2', text: 'Банк выплачивает вам дивиденды $50.', action: 'receive_cash', amount: 50 },
  { id: 'ch_3', text: 'Штраф за превышение скорости: заплатите $15.', action: 'pay_cash', amount: 15 },
  { id: 'ch_4', text: 'Отправляйтесь прямиком в Тюрьму.', action: 'go_to_jail' },
  { id: 'ch_5', text: 'Вы выиграли в лотерею: получите $100.', action: 'receive_cash', amount: 100 },
  { id: 'ch_6', text: 'Оплата услуг врача: заплатите $50.', action: 'pay_cash', amount: 50 },
  { id: 'ch_7', text: 'Бесплатное освобождение из Тюрьмы.', action: 'jail_free_card' }
];

export const CHEST_CARDS = [
  { id: 'cc_1', text: 'Банковская ошибка в вашу пользу. Получите $200.', action: 'receive_cash', amount: 200 },
  { id: 'cc_2', text: 'Оплата страховки. Заплатите $50.', action: 'pay_cash', amount: 50 },
  { id: 'cc_3', text: 'Возврат подоходного налога. Получите $20.', action: 'receive_cash', amount: 20 },
  { id: 'cc_4', text: 'Сбор на ремонт дорог: заплатите $25.', action: 'pay_cash', amount: 25 },
  { id: 'cc_5', text: 'Вам начислены проценты по вкладу: получите $100.', action: 'receive_cash', amount: 100 },
  { id: 'cc_6', text: 'Штраф за парковку: заплатите $20.', action: 'pay_cash', amount: 20 }
];
