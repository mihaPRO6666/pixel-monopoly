/**
 * Chance & Community Chest Card Decks
 */

export const CHANCE_CARDS = [
  {
    id: 'ch_go',
    title: 'Отправляйтесь на поле «ВПЕРЁД»',
    desc: 'Переместитесь на клетку ВПЕРЁД и получите зарплату.',
    action: { type: 'move_to', tileId: 0, collectSalary: true }
  },
  {
    id: 'ch_kiev',
    title: 'Поездка в Киев',
    desc: 'Переместитесь на клетку Киев. Если проходите через «Вперёд», получите деньги.',
    action: { type: 'move_to', tileId: 39, collectSalary: true }
  },
  {
    id: 'ch_jail',
    title: 'Отправляйтесь в тюрьму!',
    desc: 'Идите прямо в тюрьму. Не проходите через Вперёд, не получайте денег.',
    action: { type: 'go_to_jail' }
  },
  {
    id: 'ch_out_jail',
    title: 'Бесплатное освобождение из тюрьмы',
    desc: 'Эту карточку можно сохранить до востребования или продать другому игроку.',
    action: { type: 'jail_free_card' }
  },
  {
    id: 'ch_bank_div',
    title: 'Банковские дивиденды',
    desc: 'Банк выплачивает вам дивиденды в размере $50.',
    action: { type: 'gain_money', amount: 50 }
  },
  {
    id: 'ch_speeding',
    title: 'Штраф за превышение скорости',
    desc: 'Заплатите штраф $50 в банк.',
    action: { type: 'pay_money', amount: 50 }
  },
  {
    id: 'ch_repairs',
    title: 'Капитальный ремонт',
    desc: 'Заплатите за каждый дом $25, за каждый отель $100.',
    action: { type: 'property_repair', houseCost: 25, hotelCost: 100 }
  },
  {
    id: 'ch_station',
    title: 'Поездка на вокзал',
    desc: 'Отправляйтесь на ближайший вокзал. Если проходите Вперёд — получите выплату.',
    action: { type: 'move_to_nearest', targetGroup: 'station' }
  },
  {
    id: 'ch_loan',
    title: 'Погашение кредита',
    desc: 'Срок вашего строительного кредита истёк. Получите $150.',
    action: { type: 'gain_money', amount: 150 }
  }
];

export const CHEST_CARDS = [
  {
    id: 'cc_doctor',
    title: 'Приём у врача',
    desc: 'Оплатите счёт за консультацию $50.',
    action: { type: 'pay_money', amount: 50 }
  },
  {
    id: 'cc_bank_error',
    title: 'Банковская ошибка в вашу пользу',
    desc: 'Банк ошибочно начислил вам $200. Заберите их!',
    action: { type: 'gain_money', amount: 200 }
  },
  {
    id: 'cc_holiday',
    title: 'Праздничный фонд созрел',
    desc: 'Получите накопленные $100 из праздничного фонда.',
    action: { type: 'gain_money', amount: 100 }
  },
  {
    id: 'cc_birthday',
    title: 'Ваш день рождения!',
    desc: 'Каждый игрок дарит вам подарок в размере $20.',
    action: { type: 'collect_from_all', amount: 20 }
  },
  {
    id: 'cc_tax_refund',
    title: 'Возврат подоходного налога',
    desc: 'Налоговая служба вернула вам переплату $80.',
    action: { type: 'gain_money', amount: 80 }
  },
  {
    id: 'cc_jail',
    title: 'Отправляйтесь в тюрьму!',
    desc: 'Идите прямо в тюрьму. Не проходите через Вперёд.',
    action: { type: 'go_to_jail' }
  },
  {
    id: 'cc_out_jail',
    title: 'Бесплатное освобождение из тюрьмы',
    desc: 'Карточка выхода из тюрьмы. Сохраните её.',
    action: { type: 'jail_free_card' }
  },
  {
    id: 'cc_hospital',
    title: 'Оплата страховки',
    desc: 'Заплатите за страховку $100.',
    action: { type: 'pay_money', amount: 100 }
  },
  {
    id: 'cc_inherit',
    title: 'Наследство',
    desc: 'Вы получили неожиданное наследство $100.',
    action: { type: 'gain_money', amount: 100 }
  }
];
