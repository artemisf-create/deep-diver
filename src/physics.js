// physics.js — world generation, collision, player update, particles
import { S } from './state.js';
import { saveProgress } from './db.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────
export function rand(a, b) { return a + Math.random() * (b - a); }
export function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

export function makeSeededRng(seed) {
  let s = seed >>> 0;
  return function () {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
export function withSeededRng(seed, fn) {
  const orig = Math.random;
  Math.random = makeSeededRng(seed);
  fn();
  Math.random = orig;
}

// ─── Difficulty ───────────────────────────────────────────────────────────────
export function difficulty(col) {
  return Math.min(1, (col / 800) * (1 + (S.level - 1) * 0.3));
}

// ─── Grid ─────────────────────────────────────────────────────────────────────
export function initGrid() {
  S.grid = [];
  S.decorData = [];
  for (let c = 0; c < S.POOL; c++) {
    S.grid.push(new Uint8Array(S.ROWS));
    S.decorData.push(new Array(S.ROWS).fill(null));
  }
}

export function generateUntil(targetCol) {
  const rng = S.raceRng || Math.random.bind(Math);
  // В гонке используем фиксированное кол-во строк — одинаково на всех устройствах
  const genRows  = S.gameMode === 'race' ? S.RACE_ROWS : S.ROWS;
  const rowOffset = S.gameMode === 'race' ? Math.floor((S.ROWS - genRows) / 2) : 0;

  while (S.genCol < targetCol) {
    const ci  = S.genCol % S.POOL;
    const col = S.grid[ci];
    const dec = S.decorData[ci];
    col.fill(S.WALL);
    for (let r = 0; r < S.ROWS; r++) dec[r] = null;

    if (rng() < 0.18) S.pathY += 1;
    if (rng() < 0.10) S.pathY -= 1;
    if (rng() < 0.08) S.pathH = S.pathH === 2 ? 3 : (S.pathH === 3 ? (rng() < 0.5 ? 2 : 4) : 3);
    S.pathY = Math.max(S.pathH + 1, Math.min(genRows - S.pathH - 2, S.pathY));

    for (let r = S.pathY - S.pathH; r <= S.pathY + S.pathH; r++) {
      const ar = r + rowOffset;
      if (ar >= 0 && ar < S.ROWS) col[ar] = S.AIR;
    }

    if (S.branchCol < 0 && rng() < 0.035 && S.genCol > 40) {
      S.branchCol = S.genCol;
      S.branchY   = S.pathY > genRows / 2
        ? Math.floor(rng() * (S.pathY - S.pathH - 3) + 1)
        : S.pathY + S.pathH + 2 + Math.floor(rng() * 3);
      S.branchY = Math.max(2, Math.min(genRows - 3, S.branchY));
    }
    if (S.branchCol >= 0) {
      if (rng() < 0.12) S.branchY += rng() < 0.5 ? -1 : 1;
      S.branchY = Math.max(2, Math.min(genRows - 3, S.branchY));
      for (let r = S.branchY - 2; r <= S.branchY + 2; r++) {
        const ar = r + rowOffset;
        if (ar >= 0 && ar < S.ROWS) col[ar] = S.AIR;
      }
      if (S.genCol - S.branchCol > 15 + rng() * 25) {
        const lo = Math.min(S.pathY - S.pathH, S.branchY - 2);
        const hi = Math.max(S.pathY + S.pathH, S.branchY + 2);
        for (let r = lo; r <= hi; r++) { const ar = r + rowOffset; if (ar >= 0 && ar < S.ROWS) col[ar] = S.AIR; }
        S.branchCol = -1;
      }
    }

    for (let r = 0; r < S.ROWS; r++) {
      if (col[r] === S.WALL && rng() < 0.07)
        dec[r] = { type: 'decor', kind: Math.floor(rng() * 3), phase: rng() * Math.PI * 2 };
    }

    const diff = difficulty(S.genCol);
    const airRows = [];
    for (let r = 0; r < S.ROWS; r++) if (col[r] === S.AIR) airRows.push(r);
    if (!airRows.length) { S.genCol++; continue; }

    const pick = () => airRows[Math.floor(rng() * airRows.length)];

    if (S.gameMode === 'race') {
      // нитро каждые ~10 колонок
      if (S.genCol > 5 && S.genCol % 10 === 0 && rng() < 0.75) {
        const r = pick();
        if (!dec[r]) dec[r] = { type: 'nitro', phase: rng() * Math.PI * 2, collected: false };
      }
      // пузыри O₂ каждые ~14 колонок как в кампании
      if (S.genCol > 10 && S.genCol % 14 === 0 && rng() < 0.65) {
        const r = pick();
        if (!dec[r]) dec[r] = { type: 'bubble', phase: rng() * Math.PI * 2, collected: false };
      }
      // промежуточные метки каждые 100м
      const mPerCol = S.T / 40;
      const distCol = S.genCol * mPerCol;
      if (distCol > 0 && distCol < 500 && Math.round(distCol) % 100 === 0 && Math.abs(distCol - Math.round(distCol)) < mPerCol / 2) {
        dec[0] = { type: 'race_cp', m: Math.round(distCol) };
      }
      // финишная черта на 500м
      const finishCol = Math.round(500 * 40 / S.T);
      if (S.genCol === finishCol) {
        dec[0] = { type: 'finish', phase: 0, collected: false };
      }
    } else {
      if (S.genCol > 5 && S.genCol % 6 === 0 && rng() < 0.7) {
        const r = pick();
        if (!dec[r]) dec[r] = { type: 'pearl', phase: rng() * Math.PI * 2, collected: false };
      }
      if (S.genCol > 10 && S.genCol % 14 === 0 && rng() < 0.65) {
        const r = pick();
        if (!dec[r]) dec[r] = { type: 'bubble', phase: rng() * Math.PI * 2, collected: false };
      }
      const sharkInterval = Math.round(30 - diff * 18);
      if (S.genCol > 50 && S.genCol % sharkInterval === 0 && rng() < 0.6 + diff * 0.3) {
        const r = pick();
        if (!dec[r]) dec[r] = { type: 'shark', vy: (rng() < 0.5 ? 1 : -1) * (0.5 + diff * 1.2), py: r * S.T + S.T / 2, px: S.genCol * S.T + S.T / 2, vx: 0, aggroed: false };
      }
      const jellyInterval = Math.round(28 - diff * 15);
      if (S.genCol > 70 && S.genCol % jellyInterval === 0 && rng() < 0.55 + diff * 0.35) {
        const r = pick();
        if (!dec[r]) dec[r] = { type: 'jelly', phase: rng() * Math.PI * 2, py: r * S.T + S.T / 2, px: S.genCol * S.T + S.T / 2, vx: 0, vy: 0, aggroed: false };
      }
      if (diff > 0.4 && S.genCol % 40 === 0 && rng() < diff * 0.6) {
        const r = pick();
        if (!dec[r]) dec[r] = { type: 'mine', phase: rng() * Math.PI * 2 };
      }
    }

    S.genCol++;
  }
}

// ─── Tile queries ─────────────────────────────────────────────────────────────
export function tileAt(wx, wy) {
  const c = Math.floor(wx / S.T);
  const r = Math.floor(wy / S.T);
  if (c < 0 || r < 0 || r >= S.ROWS) return S.WALL;
  return S.grid[c % S.POOL][r];
}

export function collidesWall(wx, wy, hw, hh) {
  const corners = [
    [wx - hw, wy - hh], [wx + hw - 1, wy - hh],
    [wx - hw, wy + hh - 1], [wx + hw - 1, wy + hh - 1],
  ];
  return corners.some(([x, y]) => tileAt(x, y) === S.WALL);
}

// ─── Particles ────────────────────────────────────────────────────────────────
export function spawnFx(wx, wy, color, n = 8) {
  const sx = wx - S.camXpx, sy = wy - S.camYpx;
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), sp = rand(1, 4);
    S.particles.push({ x: sx, y: sy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, color, r: rand(2, 5) });
  }
}

// ─── Player ───────────────────────────────────────────────────────────────────
export function killPlayer() {
  if (S.player.dead) return;
  S.player.dead = true; S.player.invincible = 999;
  spawnFx(S.player.x, S.player.y, '#ff6060', 14);
  S.lives--;
  if (S.lives > 0) {
    setTimeout(() => respawnPlayer(), S.gameMode === 'sandbox' ? 300 : 900);
  } else {
    if (S.score > S.hiScore) S.hiScore = S.score;
    saveProgress();
    setTimeout(() => { S.state = 'dead'; }, 1200);
  }
}

export function respawnPlayer() {
  if (S.gameMode === 'sandbox') {
    S.player.x = S.camXpx + S.VP.w / 2;
    const spawnC = Math.floor(S.player.x / S.T);
    let spawnR = Math.floor(S.player.y / S.T);
    for (let d = 0; d < S.ROWS; d++) {
      const col_ = S.grid[(spawnC) % S.POOL];
      if (col_ && col_[spawnR + d] === S.AIR) { spawnR = spawnR + d; break; }
      const col2_ = S.grid[(spawnC) % S.POOL];
      if (col2_ && col2_[spawnR - d] === S.AIR) { spawnR = spawnR - d; break; }
    }
    S.player.y = spawnR * S.T + S.T / 2;
    S.player.vx = 0; S.player.vy = 0;
  } else {
    S.camXpx    = S.lastCheckpointCamX;
    S.player.x  = S.lastCheckpointX;
    S.player.y  = S.lastCheckpointY;
    S.player.vx = 0; S.player.vy = 0;
    S.distM     = S.lastCheckpointDist;
    S.nextCheckpointM = S.lastCheckpointDist + 60;
  }
  S.player.dead = false;
  S.player.invincible = 180;
  S.oxygen = 100;
  resetInput();
}

export function resetInput() {
  ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d','W','A','S','D'].forEach(k => S.keys[k] = false);
  S.joy.active = false; S.joy.dx = 0; S.joy.dy = 0;
  S.mouse.down = false;
}

// ─── Main update ──────────────────────────────────────────────────────────────
export function updateVP() {
  const pad = S.isMobile ? 6 : 0;
  let bottom = S.H - pad;
  if (S.isMobile) {
    const s = S.DPAD.size, g = S.DPAD.gap, margin = 10;
    const dpadLRBottom = S.H - s - g - margin;
    const joyBottom    = S.H - 15;
    bottom = Math.min(dpadLRBottom, joyBottom) + 4;
  }
  S.VP.x = pad; S.VP.y = pad; S.VP.w = S.W - pad * 2; S.VP.h = bottom - pad;
}

export function update() {
  if (S.paused) return;
  S.frame++; S.worldFrame++;
  S.swimPhase += 0.14;

  if (!S.player.dead) {
    if (S.gameMode === 'sandbox') {
      const targetCamX = S.player.x - S.VP.w / 2;
      S.camXpx += (targetCamX - S.camXpx) * 0.08;
      S.camXpx = Math.max(0, S.camXpx);
      S.camSpeed = 0;
      S.distM = Math.floor(S.player.x / 40);
    } else {
      const nitroBoost = (S.gameMode === 'race' && S.nitroActive > 0) ? 3.5 : 0;
      if (S.nitroActive > 0) S.nitroActive--;
      S.camSpeed = Math.min(S.gameMode === 'race' ? 2.0 : (S.isMobile ? 2.0 : 4.0), S.camSpeed + 0.0004) + nitroBoost;
      S.camXpx  += S.camSpeed;
      S.distM    = Math.floor(S.camXpx / 40);
    }
  }

  generateUntil(Math.floor(S.camXpx / S.T) + Math.ceil(S.W / S.T) + 12);

  const targetCamY = S.player.y - S.VP.h / 2;
  S.camYpx += (targetCamY - S.camYpx) * 0.08;
  S.camYpx = clamp(S.camYpx, 0, S.ROWS * S.T - S.VP.h);

  S.oxyTick++;
  if (!S.player.dead && S.oxyTick % 95 === 0) S.oxygen = Math.max(0, S.oxygen - 1);
  if (S.oxygen <= 0 && !S.player.dead) killPlayer();

  const ACCEL = 0.55 + Math.floor(S.distM / 100) * 0.1, FRIC = 0.84;
  let ax = 0, ay = 0;

  if (S.keys['ArrowRight'] || S.keys['d'] || S.keys['D']) ax += 1;
  if (S.keys['ArrowLeft']  || S.keys['a'] || S.keys['A']) ax -= 2.2;
  if (S.keys['ArrowDown']  || S.keys['s'] || S.keys['S']) ay += 1;
  if (S.keys['ArrowUp']    || S.keys['w'] || S.keys['W']) ay -= 1;

  if (S.mouse.down) {
    const wx = S.mouse.x + S.camXpx, wy = S.mouse.y + S.camYpx;
    const dx = wx - S.player.x, dy = wy - S.player.y;
    const d  = Math.sqrt(dx * dx + dy * dy);
    if (d > 8) { ax += (dx / d) * 1.6; ay += (dy / d) * 1.6; }
  }
  if (S.controlMode === 'joystick' && S.joy.active) {
    ax += S.joy.dx * (S.joy.dx > 0 ? 1.0 : 2.2);
    ay += S.joy.dy * 1.0;
  }

  S.player.vx = S.player.vx * FRIC + ax * ACCEL + S.camSpeed * 0.15;
  S.player.vy = S.player.vy * FRIC + ay * ACCEL + 0.04;

  const spd = Math.sqrt(S.player.vx ** 2 + S.player.vy ** 2);
  if (spd > 6.0) { S.player.vx *= 6.0 / spd; S.player.vy *= 6.0 / spd; }

  S.player.x += S.player.vx;
  if (collidesWall(S.player.x, S.player.y, S.player.hw, S.player.hh)) {
    S.player.x -= S.player.vx; S.player.vx = 0;
  }
  S.player.y += S.player.vy;
  if (collidesWall(S.player.x, S.player.y, S.player.hw, S.player.hh)) {
    S.player.y -= S.player.vy; S.player.vy = 0;
  }

  S.player.y = clamp(S.player.y, S.player.hh, S.ROWS * S.T - S.player.hh);

  const leftBound  = S.gameMode === 'sandbox' ? S.player.hw : S.camXpx + S.player.hw + 2;
  const rightBound = S.camXpx + S.VP.w - S.player.hw - 2;
  if (S.player.x < leftBound) {
    S.player.x = leftBound;
    S.player.vx = Math.max(S.player.vx, 0);
    if (collidesWall(S.player.x, S.player.y, S.player.hw, S.player.hh)) {
      const baseCol = Math.floor(S.player.x / S.T);
      const baseRow = Math.floor(S.player.y / S.T);
      outer: for (let r = 0; r <= 6; r++) {
        for (let dc = 0; dc <= 3; dc++) {
          for (const dr of (r === 0 ? [0] : [r, -r])) {
            const c = baseCol + dc;
            const row = clamp(baseRow + dr, 0, S.ROWS - 1);
            if (S.grid[c % S.POOL][row] === 0) {
              S.player.x = c * S.T + S.T / 2;
              S.player.y = row * S.T + S.T / 2;
              break outer;
            }
          }
        }
      }
    }
  }
  if (S.player.x > rightBound) S.player.x = rightBound;
  if (S.player.invincible > 0) S.player.invincible--;

  const colLo = Math.floor(S.camXpx / S.T) - 1;
  const colHi = Math.floor((S.camXpx + S.W) / S.T) + 1;

  for (let c = colLo; c <= colHi; c++) {
    if (c < 0) continue;
    const ci  = c % S.POOL;
    const dec = S.decorData[ci];

    for (let r = 0; r < S.ROWS; r++) {
      const d = dec[r];
      if (!d || d.type === 'decor') continue;

      const wx = c * S.T + S.T / 2;
      const wy = r * S.T + S.T / 2;

      if (d.type === 'pearl' && !d.collected) {
        const dx = S.player.x - wx, dy = S.player.y - wy;
        if (dx*dx + dy*dy < (S.player.hw + 7)**2) {
          d.collected = true; S.score += 10;
          spawnFx(wx, wy, '#ffe680', 6);
        }
      }

      if (d.type === 'bubble' && !d.collected) {
        const dx = S.player.x - wx, dy = S.player.y - wy;
        if (dx*dx + dy*dy < (S.player.hw + 9)**2) {
          d.collected = true; S.oxygen = Math.min(100, S.oxygen + 12.5);
          spawnFx(wx, wy, '#80dfff', 8);
        }
      }

      if (d.type === 'nitro' && !d.collected) {
        const dx = S.player.x - wx, dy = S.player.y - wy;
        if (dx*dx + dy*dy < (S.player.hw + 10)**2) {
          d.collected = true; S.nitro = Math.min(3, S.nitro + 1);
          spawnFx(wx, wy, '#ff8800', 10);
        }
      }

      if (d.type === 'finish' && !d.collected) {
        const dx = S.player.x - wx, dy = S.player.y - wy;
        if (dx*dx + dy*dy < (S.player.hw + 20)**2) {
          d.collected = true;
          if (S.gameMode === 'race' && S.raceState === 'racing' && !S.raceWinner) {
            S.raceWinner = 'me';
            S.raceState = 'finished';
            spawnFx(wx, wy, '#ffe680', 20);
            setTimeout(function () { S.state = 'raceover'; }, 800);
          }
        }
      }

      if (d.type === 'shark') {
        if (d.px === undefined) d.px = wx;
        if (d.vx === undefined) d.vx = 0;
        const AGGRO_DIST = 160, DEAGGRO_DIST = 600;
        const dxP = S.player.x - d.px, dyP = S.player.y - d.py;
        const distP = Math.sqrt(dxP*dxP + dyP*dyP);
        if (!d.aggroed && distP < AGGRO_DIST) { d.aggroed = true; spawnFx(d.px, d.py, '#ff4444', 4); }
        if (d.aggroed && distP > DEAGGRO_DIST) d.aggroed = false;

        if (d.aggroed) {
          const spd = (S.isMobile ? 1.4 : 2.8) + difficulty(c) * (S.isMobile ? 0.8 : 1.5);
          d.vx += (dxP / distP) * 0.35;
          d.vy += (dyP / distP) * 0.35;
          const s = Math.sqrt(d.vx*d.vx + d.vy*d.vy);
          if (s > spd) { d.vx *= spd/s; d.vy *= spd/s; }
        } else {
          d.vx *= 0.85;
          d.vy = (Math.abs(d.vy) < 0.3 ? (Math.random()<0.5?1:-1) : d.vy > 0 ? 1 : -1) * (0.5 + difficulty(c) * 1.2);
        }

        d.px += d.vx; d.py += d.vy;
        if (tileAt(d.px, d.py) === S.WALL) { d.vx *= -1; d.vy *= -1; d.px += d.vx*2; d.py += d.vy*2; }
        d.py = clamp(d.py, S.T, (S.ROWS-1)*S.T);

        if (S.player.invincible === 0 && !S.player.dead) {
          const dx2 = S.player.x - d.px, dy2 = S.player.y - d.py;
          if (Math.abs(dx2) < 26 && Math.abs(dy2) < 14) killPlayer();
        }
      }

      if (d.type === 'jelly') {
        if (d.px === undefined) d.px = wx;
        if (d.vx === undefined) d.vx = 0;
        if (d.vy === undefined) d.vy = 0;
        const AGGRO_DIST = 130, DEAGGRO_DIST = 500;
        const dxP = S.player.x - d.px, dyP = S.player.y - d.py;
        const distP = Math.sqrt(dxP*dxP + dyP*dyP);
        if (!d.aggroed && distP < AGGRO_DIST) { d.aggroed = true; spawnFx(d.px, d.py, '#dd44ff', 4); }
        if (d.aggroed && distP > DEAGGRO_DIST) d.aggroed = false;

        if (d.aggroed) {
          const spd = (S.isMobile ? 1.1 : 2.2) + difficulty(c) * (S.isMobile ? 0.6 : 1.2);
          d.vx += (dxP / distP) * 0.18;
          d.vy += (dyP / distP) * 0.18;
          const s = Math.sqrt(d.vx*d.vx + d.vy*d.vy);
          if (s > spd) { d.vx *= spd/s; d.vy *= spd/s; }
          d.phase += 0.06;
        } else {
          d.vx *= 0.9; d.vy *= 0.9; d.phase += 0.025;
          d.px = wx + Math.sin(d.phase) * (S.T * 0.9);
          d.py = r * S.T + S.T/2 + Math.cos(d.phase * 0.7) * (S.T * 0.5);
        }

        if (d.aggroed) {
          d.px += d.vx; d.py += d.vy;
          if (tileAt(d.px, d.py) === S.WALL) { d.vx *= -0.5; d.vy *= -0.5; d.px -= d.vx; d.py -= d.vy; }
          d.py = clamp(d.py, S.T, (S.ROWS-1)*S.T);
        }

        if (S.player.invincible === 0 && !S.player.dead) {
          const dx2 = S.player.x - d.px, dy2 = S.player.y - d.py;
          if (dx2*dx2 + dy2*dy2 < 22*22) killPlayer();
        }
      }

      if (d.type === 'mine') {
        if (S.player.invincible === 0 && !S.player.dead) {
          const dx = S.player.x - wx, dy = S.player.y - wy;
          if (dx*dx + dy*dy < 20*20) killPlayer();
        }
      }
    }
  }

  for (const p of S.particles) {
    p.x += p.vx; p.y += p.vy; p.vx *= 0.91; p.vy *= 0.91; p.life -= 0.04;
  }
  S.particles = S.particles.filter(p => p.life > 0);

  // Race sync — via callback set by main.js
  if (S.gameMode === 'race' && S.raceState === 'racing') {
    S.raceSyncTimer++;
    if (S.raceSyncTimer % 6 === 0 && S._syncRacePos) S._syncRacePos();
  }

  if (S.gameMode === 'campaign' && !S.player.dead && S.distM >= 500) {
    S.player.dead = true;
    S.wins++;
    if (S.score > S.hiScore) S.hiScore = S.score;
    saveProgress();
    setTimeout(() => { S.state = S.wins >= 5 ? 'levelup' : 'win'; }, 800);
    return;
  }

  if (!S.player.dead && S.distM >= S.nextCheckpointM) {
    S.lastCheckpointCamX = S.camXpx;
    S.lastCheckpointX    = S.player.x;
    S.lastCheckpointY    = S.player.y;
    S.lastCheckpointDist = S.distM;
    S.nextCheckpointM   += 60;
    spawnFx(S.player.x, S.player.y, '#44ffaa', 16);
  }
}
