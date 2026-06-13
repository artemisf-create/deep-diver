// main.js — entry point: startGame, fullReset, loop, init
import { S } from './state.js';
import { loadProgress, saveProgress, fbSaveScore, fbSetPresence, fsUpdateLeaderboard } from './db.js';
import { initAbly, initFirebaseAuth, syncMyScore, syncRacePos, startRaceFirebase, activateNitro, openLeaderboard, openFriendsPanel, renderFriendsList } from './network.js';
import { initGrid, generateUntil, withSeededRng, makeSeededRng, updateVP, update } from './physics.js';
import {
  drawBackground, drawTiles, drawCheckpoints, drawEntities, drawPlayer, drawOpponent,
  drawParticles, drawHUD, drawRaceHUD, drawPause, drawDead, drawWin, drawLevelUp,
  drawRaceOver, drawMenu, drawMobileControls, openHelp,
} from './render.js';
import { initInput } from './input.js';

// ─── Canvas init ──────────────────────────────────────────────────────────────
S.canvas = document.getElementById('game');
S.ctx    = S.canvas.getContext('2d');
S.W      = window.innerWidth;
S.H      = window.innerHeight;
S.canvas.width  = S.W;
S.canvas.height = S.H;
S.ROWS   = Math.ceil(S.H / S.T) + 2;
S.pathY  = Math.floor(S.ROWS / 2);

updateVP();

// ─── Player identity ──────────────────────────────────────────────────────────
// Сначала используем локальный ID как fallback; Firebase Auth перезапишет его своим uid
let pid = localStorage.getItem('deepdiver_pid');
if (!pid) {
  pid = 'p' + Math.random().toString(36).slice(2,10) + Date.now().toString(36);
  localStorage.setItem('deepdiver_pid', pid);
}
S.playerId   = pid;
S.playerName = localStorage.getItem('deepdiver_name') || '';
S.friends    = JSON.parse(localStorage.getItem('deepdiver_friends') || '[]');
S.allPlayers = JSON.parse(localStorage.getItem('deepdiver_players') || '{}');

loadProgress();

// ─── Wire syncRacePos callback ────────────────────────────────────────────────
S._syncRacePos = syncRacePos;

// ─── Init input (must be after S.canvas is set) ───────────────────────────────
initInput();

// ─── startGame ────────────────────────────────────────────────────────────────
export function startGame() {
  initGrid();
  S.genCol = 0; S.pathY = Math.floor(S.ROWS / 2); S.pathH = 3; S.branchCol = -1;
  generateUntil(S.POOL);

  S.camSpeed = S.isMobile ? 0.6 : 1.2;

  const spawnCol = 2;
  let spawnRow = Math.floor(S.ROWS / 2);
  for (let delta = 0; delta < S.ROWS; delta++) {
    const r1 = Math.floor(S.ROWS/2) + delta;
    const r2 = Math.floor(S.ROWS/2) - delta;
    if (r1 < S.ROWS && S.grid[spawnCol % S.POOL][r1] === S.AIR) { spawnRow = r1; break; }
    if (r2 >= 0  && S.grid[spawnCol % S.POOL][r2] === S.AIR) { spawnRow = r2; break; }
  }
  S.player.x = spawnCol * S.T + S.T / 2;
  S.player.y = spawnRow * S.T + S.T / 2;
  updateVP();
  S.camXpx = Math.max(0, S.player.x - S.VP.w / 2);
  S.camYpx = Math.max(0, S.player.y - S.VP.h / 2);
  S.player.vx = 0; S.player.vy = 0;
  S.player.dead = false; S.player.invincible = 0;
  S.score = 0; S.distM = 0; S.oxygen = 100; S.oxyTick = 0;
  S.lives = S.gameMode === 'sandbox' ? 999 : 3;
  S.lastCheckpointCamX = 0; S.lastCheckpointX = S.player.x; S.lastCheckpointY = S.player.y;
  S.lastCheckpointDist = 0; S.nextCheckpointM = 60;
  S.frame = 0; S.swimPhase = 0; S.particles = []; S.paused = false;
  S.state = 'play';
}

export function fullReset() {
  S.wins = 0; S.level = 1;
  startGame();
}

// ─── startRace (triggered by network.js via CustomEvent) ─────────────────────
function startRace(raceRoom) {
  S.raceRoom  = raceRoom;
  S.gameMode  = 'race'; S.raceState = 'racing'; S.raceWinner = null;
  S.nitro = 0; S.nitroActive = 0;

  // Сидированный RNG для всей гонки — одинаков у обоих игроков
  S.raceRng = makeSeededRng(raceRoom.seed);

  initGrid();
  S.genCol = 0; S.pathY = Math.floor(S.ROWS/2); S.pathH = 3; S.branchCol = -1;
  generateUntil(S.POOL);
  S.camSpeed = S.isMobile ? 0.6 : 1.2;
  const spawnCol = 2; let spawnRow = Math.floor(S.ROWS/2);
  for (let delta = 0; delta < S.ROWS; delta++) {
    const r1 = Math.floor(S.ROWS/2)+delta, r2 = Math.floor(S.ROWS/2)-delta;
    if (r1 < S.ROWS && S.grid[spawnCol%S.POOL][r1]===S.AIR) { spawnRow=r1; break; }
    if (r2 >= 0  && S.grid[spawnCol%S.POOL][r2]===S.AIR) { spawnRow=r2; break; }
  }
  S.player.x = spawnCol*S.T+S.T/2; S.player.y = spawnRow*S.T+S.T/2;
  // Противник стартует рядом но чуть ниже — пока не придут реальные координаты
  S.opponentPos = { x: S.player.x, y: S.player.y + S.T * 2, vx: 0, dist: 0, nitro: 0 };
  updateVP();
  S.camXpx = Math.max(0, S.player.x-S.VP.w/2);
  S.camYpx = Math.max(0, S.player.y-S.VP.h/2);
  S.player.vx=0; S.player.vy=0; S.player.dead=false; S.player.invincible=0;
  S.score=0; S.distM=0; S.oxygen=100; S.oxyTick=0; S.lives=3;
  S.lastCheckpointCamX=0; S.lastCheckpointX=S.player.x; S.lastCheckpointY=S.player.y;
  S.lastCheckpointDist=0; S.nextCheckpointM=60;
  S.frame=0; S.swimPhase=0; S.particles=[]; S.paused=false;
  S.state='play';

  // Subscribe to opponent position — Firebase приоритет, Ably fallback
  const roomId = [S.playerId, raceRoom.opponentId].sort().join('_');

  if (window.firebaseDB) {
    // Firebase RTDB race
    startRaceFirebase(roomId);
  } else if (S.ably) {
    // Ably fallback
    S.ablyRaceChannel = S.ably.channels.get('deepdiver:race:' + roomId);
    S.ablyRaceChannel.subscribe('pos', function (msg) {
      const d = msg.data;
      if (!d || d.id === S.playerId) return;
      S.opponentPos.x = d.x || 0; S.opponentPos.y = d.y || 0;
      S.opponentPos.vx = d.vx || 0; S.opponentPos.dist = d.dist || 0;
      S.opponentPos.nitro = d.nitro || 0;
      if (d.dist >= 500 && S.raceState === 'racing' && !S.raceWinner) {
        S.raceWinner = 'them'; S.raceState = 'finished';
        setTimeout(function () { S.state = 'raceover'; }, 600);
      }
    });
  }
}

// ─── Name input ───────────────────────────────────────────────────────────────
function openNameInput() {
  const nameInputDiv   = document.getElementById('nameInput');
  const nameInputLabel = document.getElementById('nameInputLabel');
  const nameField      = document.getElementById('nameField');
  nameInputLabel.textContent = S.lang === 'ru' ? 'Введи никнейм:' : 'Enter your name:';
  nameField.value = S.playerName;
  nameInputDiv.style.display = 'block';
  nameField.focus();
  nameField.select();
}

function closeNameInput() {
  const nameField = document.getElementById('nameField');
  const val = nameField.value.trim();
  if (val) { S.playerName = val; localStorage.setItem('deepdiver_name', val); syncMyScore(); }
  document.getElementById('nameInput').style.display = 'none';
}

document.getElementById('nameConfirm').addEventListener('click', closeNameInput);
const _nameField = document.getElementById('nameField');
_nameField.addEventListener('keydown', e => { if (e.key === 'Enter') closeNameInput(); e.stopPropagation(); });
_nameField.addEventListener('keyup',   e => e.stopPropagation());
_nameField.addEventListener('mousedown', e => e.stopPropagation());
_nameField.addEventListener('touchstart', e => e.stopPropagation());

// ─── CustomEvent listeners ────────────────────────────────────────────────────
window.addEventListener('deepdiver:startGame',    () => startGame());
window.addEventListener('deepdiver:startRace',    e  => startRace(e.detail));
window.addEventListener('deepdiver:levelUp',      () => { S.level++; S.wins = 0; saveProgress(); startGame(); });
window.addEventListener('deepdiver:openHelp',     () => openHelp());
window.addEventListener('deepdiver:openNameInput', () => openNameInput());
window.addEventListener('deepdiver:openFriends',  () => openFriendsPanel());
window.addEventListener('deepdiver:openLeaderboard', () => openLeaderboard());
window.addEventListener('deepdiver:lookForOpponent', () => { import('./network.js').then(m => m.lookForOpponent()); });
window.addEventListener('deepdiver:activateNitro', () => activateNitro());

// ─── Resize ───────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  S.W = window.innerWidth; S.H = window.innerHeight;
  S.canvas.width = S.W; S.canvas.height = S.H;
  S.ROWS = Math.ceil(S.H / S.T) + 2;
  updateVP();
});

window.addEventListener('orientationchange', () => {
  setTimeout(() => {
    S.W = window.innerWidth; S.H = window.innerHeight;
    S.canvas.width = S.W; S.canvas.height = S.H;
    S.ROWS = Math.ceil(S.H / S.T) + 2;
  }, 200);
});

// ─── Main loop ────────────────────────────────────────────────────────────────
function loop() {
  try {
    S.worldFrame++;
    S.ctx.clearRect(0, 0, S.W, S.H);

    if (S.state === 'menu') {
      drawMenu();
    } else {
      update();
      S.ctx.save();
      S.ctx.translate(S.VP.x, S.VP.y);
      S.ctx.beginPath(); S.ctx.rect(0, 0, S.VP.w, S.VP.h); S.ctx.clip();
      drawBackground();
      drawTiles();
      drawCheckpoints();
      drawEntities();
      drawPlayer();
      drawParticles();
      drawHUD();
      S.ctx.restore();

      if (S.paused) drawPause();
      if (S.state === 'dead')     drawDead();
      if (S.state === 'win')      drawWin();
      if (S.state === 'levelup')  drawLevelUp();
      if (S.state === 'raceover') drawRaceOver();
      if (S.gameMode === 'race')  { drawOpponent(); drawRaceHUD(); }
      drawMobileControls();
    }
  } catch (e) {
    S.ctx.fillStyle='rgba(0,0,0,.8)'; S.ctx.fillRect(0,0,S.W,S.H);
    S.ctx.fillStyle='#ff4444'; S.ctx.font='16px monospace'; S.ctx.textAlign='center';
    S.ctx.fillText('ERROR: '+e.message, S.W/2, S.H/2);
    S.ctx.fillText((e.stack||'').split('\n')[1]||'', S.W/2, S.H/2+24);
    console.error(e);
  }
  requestAnimationFrame(loop);
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
initGrid();
generateUntil(S.POOL);

// Firebase Auth — запускаем сразу, не блокирует UI
initFirebaseAuth().catch(function (e) { console.warn('[Boot] Firebase auth error:', e); });

// Ably — запускаем с задержкой как fallback
setTimeout(function () { initAbly(); }, 1000);

requestAnimationFrame(loop);
