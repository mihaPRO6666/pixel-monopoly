/**
 * Monopoly Rule Presets & Custom Modifiers
 */

export const GAME_PRESETS = [
  {
    id: 'classic',
    name: 'Классика',
    desc: 'Оригинальные турнирные правила Монополии',
    settings: {
      startingCash: 1500,
      salary: 200,
      doubleSalaryOnGoLanding: false,
      freeParkingJackpot: false,
      rentInJail: true,
      initialRandomStreets: 0,
      allowBuildingWithoutMonopoly: false,
      buildingCostMultiplier: 1.0,
      rentMultiplier: 1.0,
      taxMultiplier: 1.0,
      turnTimerSeconds: 60,
      botDifficulty: 'medium'
    }
  },
  {
    id: 'blitz',
    name: 'Быстрый блиц',
    desc: '$2500 на старте, зарплата $400, раздача по 2 улицы каждому игроку',
    settings: {
      startingCash: 2500,
      salary: 400,
      doubleSalaryOnGoLanding: true,
      freeParkingJackpot: true,
      rentInJail: true,
      initialRandomStreets: 2,
      allowBuildingWithoutMonopoly: false,
      buildingCostMultiplier: 0.8,
      rentMultiplier: 1.2,
      taxMultiplier: 1.0,
      turnTimerSeconds: 30
    }
  },
  {
    id: 'jackpot',
    name: 'Джекпот и казна',
    desc: 'Все налоги и штрафы накапливаются в фонде «Бесплатной стоянки»',
    settings: {
      startingCash: 1500,
      salary: 200,
      doubleSalaryOnGoLanding: true,
      freeParkingJackpot: true,
      initialJackpot: 500,
      rentInJail: true,
      initialRandomStreets: 0,
      allowBuildingWithoutMonopoly: false,
      buildingCostMultiplier: 1.0,
      rentMultiplier: 1.0,
      taxMultiplier: 1.5,
      turnTimerSeconds: 60
    }
  },
  {
    id: 'boom',
    name: 'Строительный бум',
    desc: 'Разрешена стройка без сбора монополии, дома дешевле на 30%',
    settings: {
      startingCash: 2000,
      salary: 250,
      doubleSalaryOnGoLanding: false,
      freeParkingJackpot: false,
      rentInJail: true,
      initialRandomStreets: 1,
      allowBuildingWithoutMonopoly: true,
      buildingCostMultiplier: 0.7,
      rentMultiplier: 1.3,
      taxMultiplier: 1.0,
      turnTimerSeconds: 45
    }
  },
  {
    id: 'hardcore',
    name: 'Хардкор',
    desc: '$1000 на старте, удвоенные налоги, запрет сбора ренты в тюрьме',
    settings: {
      startingCash: 1000,
      salary: 150,
      doubleSalaryOnGoLanding: false,
      freeParkingJackpot: false,
      rentInJail: false,
      initialRandomStreets: 0,
      allowBuildingWithoutMonopoly: false,
      buildingCostMultiplier: 1.2,
      rentMultiplier: 1.5,
      taxMultiplier: 2.0,
      turnTimerSeconds: 30
    }
  }
];

export function getPresetById(id) {
  return GAME_PRESETS.find(p => p.id === id) || GAME_PRESETS[0];
}
