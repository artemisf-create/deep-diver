// state.js — shared mutable state + constants. Imports nothing.

export const TEXTS = {
  en: {
    title: '🤿 DEEP DIVER', subtitle: 'Underwater Cave Labyrinth',
    desc1: 'Swim right, dodge enemies,', desc2: 'collect pearls, watch O₂.',
    controls_hint: 'WASD / arrows  or  hold LMB', controls_hint_m: 'WASD / arrows / hold LMB',
    campaign: '🏆 Campaign', campaign_sub: '500m, levels, victories', campaign_sub_m: '500m, levels',
    sandbox: '🏖 Sandbox', sandbox_sub: 'endless, no goal', sandbox_sub_m: 'endless',
    best: 'Best', level_lbl: 'Level', wins_lbl: 'Wins', controls_lbl: 'Controls:',
    rotate: '📱 Rotate your screen! 🔄',
    game_over: 'GAME OVER', score_lbl: 'Score', dist_lbl: 'Distance',
    play_again: '[ SPACE / click ] — play again', play_again_m: 'tap — play again',
    main_menu: 'main menu', main_menu_btn: '[ ENTER ] — main menu',
    victory: '🏆 VICTORY!', wins_to: 'Wins', to_next: 'to next level',
    next_round: '[ SPACE / tap ] — next round', menu_btn: '🏠 Main Menu',
    new_level: '⬆ NEW LEVEL!', enemies_faster: 'Enemies faster, caves more dangerous!',
    lets_go: "[ SPACE / tap ] — let's go!",
    paused: '⏸ PAUSED', resume_hint: 'P / ESC — resume',
    low_oxy: '⚠ LOW OXYGEN!',
    next_cp: m => `⚑ next checkpoint in ${m}m`,
    danger_bar: n => `Danger: ${'▮'.repeat(n)}${'▯'.repeat(5-n)}`,
    diff_easy: 'EASY', diff_normal: 'NORMAL', diff_medium: 'MEDIUM', diff_hard: 'HARD', diff_danger: '⚠ DANGER',
    lang_btn: '🇷🇺 RU',
  },
  ru: {
    title: '🤿 DEEP DIVER', subtitle: 'Подводный пещерный лабиринт',
    desc1: 'Плыви вправо, уворачивайся от врагов,', desc2: 'собирай жемчуг, следи за О₂.',
    controls_hint: 'WASD / стрелки  или  зажми ЛКМ', controls_hint_m: 'WASD / стрелки / зажми ЛКМ',
    campaign: '🏆 Кампания', campaign_sub: '500м, уровни, победы', campaign_sub_m: '500м, уровни',
    sandbox: '🏖 Песочница', sandbox_sub: 'бесконечно, без цели', sandbox_sub_m: 'бесконечно',
    best: 'Рекорд', level_lbl: 'Уровень', wins_lbl: 'Победы', controls_lbl: 'Управление:',
    rotate: '📱 Поверните экран! 🔄',
    game_over: 'КОНЕЦ ИГРЫ', score_lbl: 'Счёт', dist_lbl: 'Дистанция',
    play_again: '[ ПРОБЕЛ / клик ] — ещё раз', play_again_m: 'тап — ещё раз',
    main_menu: 'главное меню', main_menu_btn: '[ ENTER ] — главное меню',
    victory: '🏆 ПОБЕДА!', wins_to: 'Победы', to_next: 'до следующего уровня',
    next_round: '[ ПРОБЕЛ / тап ] — следующий раунд', menu_btn: '🏠 Главное меню',
    new_level: '⬆ НОВЫЙ УРОВЕНЬ!', enemies_faster: 'Враги быстрее, пещеры опаснее!',
    lets_go: '[ ПРОБЕЛ / тап ] — вперёд!',
    paused: '⏸ ПАУЗА', resume_hint: 'P / ESC — продолжить',
    low_oxy: '⚠ МАЛО КИСЛОРОДА!',
    next_cp: m => `⚑ следующий чекпоинт через ${m}м`,
    danger_bar: n => `Угроза: ${'▮'.repeat(n)}${'▯'.repeat(5-n)}`,
    diff_easy: 'ЛЕГКО', diff_normal: 'НОРМА', diff_medium: 'СРЕДНЕ', diff_hard: 'СЛОЖНО', diff_danger: '⚠ ОПАСНО',
    lang_btn: '🇬🇧 EN',
  },
};

const _isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
               || (navigator.maxTouchPoints > 1);

export const S = {
  // Canvas / screen
  canvas: null,
  ctx: null,
  W: window.innerWidth,
  H: window.innerHeight,
  VP: { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight },

  // Tile config
  T: _isMobile ? 28 : 48,
  POOL: 800,
  AIR: 0,
  WALL: 1,

  // Device
  isMobile: _isMobile,
  JOY_R: 55,
  DPAD: {
    size: _isMobile ? (window.screen.height < 500 || window.screen.width < 500 ? 34 : 44) : 58,
    gap: 4,
  },

  // Game state
  state: 'menu',
  score: 0,
  hiScore: 0,
  distM: 0,
  oxygen: 100,
  lives: 3,
  paused: false,
  gameMode: 'campaign',
  level: 1,
  wins: 0,
  frame: 0,
  swimPhase: 0,
  worldFrame: 0,
  oxyTick: 0,
  particles: [],

  // Camera
  camXpx: 0,
  camYpx: 0,
  camSpeed: _isMobile ? 0.6 : 1.2,

  // Player
  player: { x: 80, y: 200, vx: 0, vy: 0, hw: 14, hh: 18, dead: false, invincible: 0 },

  // World generation
  grid: [],
  decorData: [],
  genCol: 0,
  ROWS: 0,
  pathY: 0,
  pathH: 3,
  branchCol: -1,
  branchY: -1,

  // Checkpoints
  lastCheckpointCamX: 0,
  lastCheckpointX: 0,
  lastCheckpointY: 0,
  lastCheckpointDist: 0,
  nextCheckpointM: 60,

  // Input
  keys: {},
  mouse: { x: 0, y: 0, down: false },
  joy: { active: false, baseX: 0, baseY: 0, dx: 0, dy: 0, touchId: null },
  controlMode: 'dpad',

  // Language & texts
  lang: localStorage.getItem('deepdiver_lang') || 'en',
  TEXTS,

  // Players & social
  playerId: '',
  playerName: '',
  friends: [],
  allPlayers: {},

  // Ably
  ably: null,
  ablyLobby: null,
  ablyMe: null,
  ablyScores: null,
  ablyRaceChannel: null,
  ABLY_KEY: 'fPA0OQ.fOAFuQ:vSdoLoATEzApqdWcrHXLRJZac06YjTYqWy7rcT5nrlY',

  // Race
  raceState: 'idle',
  raceRoom: null,
  raceWinner: null,
  nitro: 0,
  nitroActive: 0,
  raceSyncTimer: 0,
  opponentPos: { x: 200, y: 200, vx: 0, dist: 0, nitro: 0 },

  // Seeded RNG для гонки — используется вместо Math.random при генерации пещеры
  raceRng: null,

  // Callbacks set by main.js to avoid circular deps
  _syncRacePos: null,
  _fbLobbyCleanup: null,

  // UI button hit-boxes (set by render/draw functions)
  ui: {},
};

// Helper: translate key
export function t(k) { return S.TEXTS[S.lang][k]; }
