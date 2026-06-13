// render.js — all draw* functions
import { S, t } from './state.js';
import { difficulty, clamp } from './physics.js';

// ─── Background ───────────────────────────────────────────────────────────────
export function drawBackground() {
  const depthRatio = clamp(S.distM / 400, 0, 1);
  const g = S.ctx.createLinearGradient(0, 0, 0, S.VP.h);
  const top = `rgb(${Math.round(20*(1-depthRatio))},${Math.round(130*(1-depthRatio)+40*depthRatio)},${Math.round(200*(1-depthRatio)+80*depthRatio)})`;
  const bot = `rgb(${Math.round(10*(1-depthRatio))},${Math.round(90*(1-depthRatio)+20*depthRatio)},${Math.round(160*(1-depthRatio)+50*depthRatio)})`;
  g.addColorStop(0, top); g.addColorStop(1, bot);
  S.ctx.fillStyle = g; S.ctx.fillRect(0, 0, S.VP.w, S.VP.h);
}

// ─── Tiles ────────────────────────────────────────────────────────────────────
function rockColor(c, r) {
  const base = Math.max(8, 52 - S.distM * 0.08);
  return `rgb(${base + (c*3+r*7)%9},${base-4+(r*5+c)%7},${base+8+(c*11+r)%13})`;
}

export function drawTiles() {
  const startC = Math.floor(S.camXpx / S.T) - 1;
  const endC   = startC + Math.ceil(S.W / S.T) + 2;
  const startR = Math.floor(S.camYpx / S.T) - 1;
  const endR   = startR + Math.ceil(S.H / S.T) + 2;

  for (let c = startC; c <= endC; c++) {
    if (c < 0) continue;
    const ci = c % S.POOL;
    const sx = c * S.T - S.camXpx;
    for (let r = startR; r <= endR; r++) {
      if (r < 0 || r >= S.ROWS) continue;
      const sy = r * S.T - S.camYpx;
      if (S.grid[ci][r] === S.WALL) {
        S.ctx.fillStyle = rockColor(c, r); S.ctx.fillRect(sx, sy, S.T, S.T);
        S.ctx.fillStyle = 'rgba(0,0,0,0.2)'; S.ctx.fillRect(sx, sy, S.T, S.T);
        S.ctx.fillStyle = 'rgba(255,255,255,0.05)';
        S.ctx.fillRect(sx, sy, S.T, 3); S.ctx.fillRect(sx, sy, 3, S.T);
        const d = S.decorData[ci][r];
        if (d && d.type === 'decor') drawWallDecor(sx, sy, d.kind, d.phase + S.worldFrame * 0.012);
      }
    }
  }
}

function drawWallDecor(sx, sy, kind, phase) {
  S.ctx.save();
  if (kind === 0) {
    S.ctx.strokeStyle = 'rgba(220,80,80,0.65)'; S.ctx.lineWidth = 2;
    S.ctx.beginPath();
    S.ctx.moveTo(sx+S.T/2, sy+S.T); S.ctx.lineTo(sx+S.T/2, sy+S.T/2);
    S.ctx.lineTo(sx+S.T/2-6, sy+S.T/4); S.ctx.moveTo(sx+S.T/2, sy+S.T/2);
    S.ctx.lineTo(sx+S.T/2+7, sy+S.T/4); S.ctx.stroke();
  } else if (kind === 1) {
    S.ctx.strokeStyle = 'rgba(50,200,80,0.6)'; S.ctx.lineWidth = 2;
    const sw = Math.sin(phase) * 4;
    S.ctx.beginPath();
    S.ctx.moveTo(sx+S.T/2, sy+S.T);
    S.ctx.bezierCurveTo(sx+S.T/2+sw, sy+S.T*.7, sx+S.T/2-sw, sy+S.T*.4, sx+S.T/2+sw*.5, sy+4);
    S.ctx.stroke();
  } else {
    S.ctx.fillStyle = 'rgba(100,200,255,0.5)';
    S.ctx.beginPath();
    S.ctx.moveTo(sx+S.T/2, sy+4); S.ctx.lineTo(sx+S.T/2+5, sy+S.T/2);
    S.ctx.lineTo(sx+S.T/2, sy+S.T-4); S.ctx.lineTo(sx+S.T/2-5, sy+S.T/2);
    S.ctx.closePath(); S.ctx.fill();
  }
  S.ctx.restore();
}

// ─── Checkpoints ──────────────────────────────────────────────────────────────
export function drawCheckpoints() {
  for (let m = 60; m <= S.distM + 120; m += 60) {
    const wx = m * 40;
    const sx = wx - S.camXpx;
    if (sx < -20 || sx > S.W + 20) continue;
    const passed = m <= S.lastCheckpointDist;
    const wave   = Math.sin(S.worldFrame * 0.1) * 6;
    S.ctx.save();
    S.ctx.strokeStyle = passed ? 'rgba(100,255,150,.6)' : 'rgba(255,220,80,.8)';
    S.ctx.lineWidth = 3;
    S.ctx.beginPath(); S.ctx.moveTo(sx, 0); S.ctx.lineTo(sx, S.VP.h); S.ctx.stroke();
    S.ctx.fillStyle = passed ? 'rgba(80,220,120,.85)' : 'rgba(255,200,50,.9)';
    const fy = S.VP.h / 2 - 30;
    S.ctx.beginPath();
    S.ctx.moveTo(sx, fy);
    S.ctx.lineTo(sx + 28 + wave, fy + 14);
    S.ctx.lineTo(sx, fy + 28);
    S.ctx.closePath(); S.ctx.fill();
    S.ctx.fillStyle = '#fff'; S.ctx.font = 'bold 11px sans-serif'; S.ctx.textAlign = 'center';
    S.ctx.fillText(`${m}m`, sx, fy + 40);
    S.ctx.restore();
  }
}

// ─── Entities ─────────────────────────────────────────────────────────────────
export function drawEntities() {
  const startC = Math.floor(S.camXpx / S.T) - 1;
  const endC   = startC + Math.ceil(S.W / S.T) + 2;
  const startR = Math.floor(S.camYpx / S.T) - 1;
  const endR   = startR + Math.ceil(S.H / S.T) + 2;

  for (let c = startC; c <= endC; c++) {
    if (c < 0) continue;
    const ci  = c % S.POOL;
    const sx  = c * S.T + S.T/2 - S.camXpx;

    for (let r = startR; r <= endR; r++) {
      if (r < 0 || r >= S.ROWS) continue;
      const d = S.decorData[ci][r];
      if (!d || d.type === 'decor') continue;

      const baseY = r * S.T + S.T/2 - S.camYpx;

      if (d.type === 'pearl' && !d.collected) {
        const shine = 0.5 + 0.5 * Math.sin(S.worldFrame * 0.07 + d.phase);
        S.ctx.save(); S.ctx.translate(sx, baseY);
        const g = S.ctx.createRadialGradient(-3,-3,1,0,0,11);
        g.addColorStop(0, `rgba(255,255,230,${.9+shine*.1})`);
        g.addColorStop(1, 'rgba(200,170,100,.6)');
        S.ctx.fillStyle = g; S.ctx.beginPath(); S.ctx.arc(0,0,11,0,Math.PI*2); S.ctx.fill();
        S.ctx.restore();
      }

      if (d.type === 'nitro' && !d.collected) {
        S.ctx.save(); S.ctx.translate(sx, baseY);
        const ng = S.ctx.createRadialGradient(0,0,2,0,0,14);
        ng.addColorStop(0,'rgba(255,180,0,0.9)'); ng.addColorStop(1,'rgba(255,80,0,0.2)');
        S.ctx.fillStyle = ng; S.ctx.beginPath(); S.ctx.arc(0,0,14,0,Math.PI*2); S.ctx.fill();
        S.ctx.strokeStyle = '#ff8800'; S.ctx.lineWidth = 2;
        S.ctx.beginPath(); S.ctx.arc(0,0,14,0,Math.PI*2); S.ctx.stroke();
        S.ctx.fillStyle = '#fff'; S.ctx.font = 'bold 11px sans-serif'; S.ctx.textAlign = 'center';
        S.ctx.fillText('N²', 0, 4);
        S.ctx.restore();
      }

      if (d.type === 'finish' && !d.collected) {
        // вертикальная финишная черта через весь экран
        S.ctx.save();
        S.ctx.strokeStyle = 'rgba(255,220,50,1)';
        S.ctx.lineWidth = 4;
        S.ctx.setLineDash([8, 6]);
        S.ctx.beginPath(); S.ctx.moveTo(sx, 0); S.ctx.lineTo(sx, S.VP.h); S.ctx.stroke();
        S.ctx.setLineDash([]);
        // шашечный флаг
        const pulse = 0.7 + 0.3 * Math.sin(S.worldFrame * 0.1);
        S.ctx.shadowColor = '#ffe680'; S.ctx.shadowBlur = 20 * pulse;
        const fy = S.VP.h / 2 - 50;
        const sqSize = 10;
        for (let row = 0; row < 3; row++) {
          for (let col = 0; col < 4; col++) {
            S.ctx.fillStyle = (row + col) % 2 === 0 ? '#fff' : '#222';
            S.ctx.fillRect(sx + col * sqSize, fy + row * sqSize, sqSize, sqSize);
          }
        }
        S.ctx.fillStyle = 'rgba(255,220,50,0.9)';
        S.ctx.font = 'bold 13px sans-serif'; S.ctx.textAlign = 'center';
        S.ctx.fillText('🏁 FINISH', sx + 20, fy + 50);
        S.ctx.shadowBlur = 0;
        S.ctx.restore();
      }

      if (d.type === 'race_cp') {
        // промежуточный чекпоинт гонки
        S.ctx.save();
        S.ctx.strokeStyle = 'rgba(100,200,255,0.6)';
        S.ctx.lineWidth = 2;
        S.ctx.setLineDash([5, 8]);
        S.ctx.beginPath(); S.ctx.moveTo(sx, 0); S.ctx.lineTo(sx, S.VP.h); S.ctx.stroke();
        S.ctx.setLineDash([]);
        S.ctx.fillStyle = 'rgba(100,200,255,0.85)';
        S.ctx.font = 'bold 11px sans-serif'; S.ctx.textAlign = 'center';
        S.ctx.fillText(d.m + 'm', sx, S.VP.h / 2 - 20);
        S.ctx.restore();
      }

      if (d.type === 'bubble' && !d.collected) {
        S.ctx.save(); S.ctx.translate(sx, baseY);
        S.ctx.strokeStyle = 'rgba(140,220,255,.9)'; S.ctx.lineWidth = 2;
        S.ctx.beginPath(); S.ctx.arc(0,0,14,0,Math.PI*2); S.ctx.stroke();
        S.ctx.fillStyle = 'rgba(180,240,255,.15)'; S.ctx.fill();
        S.ctx.fillStyle = 'rgba(255,255,255,.5)'; S.ctx.beginPath(); S.ctx.arc(-4,-4,4,0,Math.PI*2); S.ctx.fill();
        S.ctx.fillStyle = 'rgba(100,220,255,.9)'; S.ctx.font = 'bold 9px sans-serif'; S.ctx.textAlign = 'center';
        S.ctx.fillText('O₂', 0, 4);
        S.ctx.restore();
      }

      if (d.type === 'shark') {
        const esx = (d.px !== undefined ? d.px : c * S.T + S.T/2) - S.camXpx;
        const esy = d.py - S.camYpx;
        drawShark(esx, esy, S.worldFrame, d.vx || 0, d.aggroed);
      }

      if (d.type === 'jelly') {
        const esx = (d.px !== undefined ? d.px : c * S.T + S.T/2) - S.camXpx;
        const esy = (d.py !== undefined ? d.py : baseY) - S.camYpx;
        drawJelly(esx, esy, d.phase, d.aggroed);
      }

      if (d.type === 'mine') {
        drawMine(sx, baseY, d.phase + S.worldFrame * 0.03);
      }
    }
  }
}

function drawShark(sx, sy, f, vx, aggroed) {
  S.ctx.save(); S.ctx.translate(sx, sy);
  const facing = vx < -0.3 ? -1 : 1;
  S.ctx.scale(facing * (S.isMobile ? 0.9 : 1.5), S.isMobile ? 0.9 : 1.5);
  S.ctx.fillStyle = aggroed ? '#cc4444' : '#6888aa';
  S.ctx.beginPath(); S.ctx.ellipse(0,0,22,9,0,0,Math.PI*2); S.ctx.fill();
  S.ctx.fillStyle = aggroed ? '#aa2222' : '#5577aa';
  S.ctx.beginPath(); S.ctx.moveTo(-18,0); S.ctx.lineTo(-30,-9); S.ctx.lineTo(-30,9); S.ctx.closePath(); S.ctx.fill();
  S.ctx.beginPath(); S.ctx.moveTo(2,-8); S.ctx.lineTo(10,-17); S.ctx.lineTo(14,-8); S.ctx.closePath(); S.ctx.fill();
  S.ctx.fillStyle='#fff'; S.ctx.beginPath(); S.ctx.arc(13,-2,3,0,Math.PI*2); S.ctx.fill();
  S.ctx.fillStyle = aggroed ? '#ff0000' : '#111';
  S.ctx.beginPath(); S.ctx.arc(14,-2,1.8,0,Math.PI*2); S.ctx.fill();
  S.ctx.restore();
  if (aggroed) {
    S.ctx.save();
    S.ctx.font = 'bold 14px sans-serif'; S.ctx.textAlign = 'center';
    S.ctx.fillStyle = '#ff3333';
    S.ctx.fillText('!', sx, sy - 18);
    S.ctx.restore();
  }
}

function drawJelly(sx, sy, phase, aggroed) {
  const pulse = 0.85 + 0.15 * Math.sin(phase * 3);
  const jsc = S.isMobile ? 0.9 : 1.5;
  S.ctx.save(); S.ctx.translate(sx, sy); S.ctx.scale(pulse * jsc, jsc);
  S.ctx.fillStyle = aggroed ? 'rgba(255,60,60,.6)' : 'rgba(200,100,220,.5)';
  S.ctx.beginPath(); S.ctx.arc(0,0,16,Math.PI,0); S.ctx.closePath(); S.ctx.fill();
  S.ctx.strokeStyle = aggroed ? 'rgba(255,120,120,.8)' : 'rgba(230,140,255,.7)';
  S.ctx.lineWidth = 1.5; S.ctx.stroke();
  S.ctx.strokeStyle = aggroed ? 'rgba(255,80,80,.5)' : 'rgba(200,100,220,.45)';
  S.ctx.lineWidth = 1;
  for (let tt = -2; tt <= 2; tt++) {
    S.ctx.beginPath(); S.ctx.moveTo(tt*5, 0);
    S.ctx.bezierCurveTo(tt*5 + Math.sin(phase+tt)*6, 10, tt*5, 22, tt*5, 32);
    S.ctx.stroke();
  }
  S.ctx.restore();
  if (aggroed) {
    S.ctx.save();
    S.ctx.font = 'bold 14px sans-serif'; S.ctx.textAlign = 'center';
    S.ctx.fillStyle = '#ff3333';
    S.ctx.fillText('!', sx, sy - 22);
    S.ctx.restore();
  }
}

function drawMine(sx, sy, phase) {
  S.ctx.save(); S.ctx.translate(sx, sy);
  S.ctx.fillStyle = '#cc3333';
  S.ctx.beginPath(); S.ctx.arc(0,0,11,0,Math.PI*2); S.ctx.fill();
  S.ctx.strokeStyle = '#ff6666'; S.ctx.lineWidth = 2;
  S.ctx.beginPath(); S.ctx.arc(0,0,11,0,Math.PI*2); S.ctx.stroke();
  S.ctx.strokeStyle = '#aa2222'; S.ctx.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    const a = phase + i * Math.PI / 4;
    S.ctx.beginPath(); S.ctx.moveTo(Math.cos(a)*11, Math.sin(a)*11);
    S.ctx.lineTo(Math.cos(a)*17, Math.sin(a)*17); S.ctx.stroke();
  }
  S.ctx.fillStyle = 'rgba(255,200,200,.5)';
  S.ctx.beginPath(); S.ctx.arc(-3,-3,4,0,Math.PI*2); S.ctx.fill();
  S.ctx.restore();
}

// ─── Player ───────────────────────────────────────────────────────────────────
export function drawPlayer() {
  if (S.player.dead) return;
  if (S.player.invincible > 0 && !S.player.dead && Math.floor(S.frame/3)%2===0) return;

  const sx  = S.player.x - S.camXpx;
  const sy  = S.player.y - S.camYpx;
  const bob = Math.sin(S.swimPhase) * 2;

  S.ctx.save(); S.ctx.translate(sx, sy);
  S.ctx.scale(S.isMobile ? 0.9 : 1.5, S.isMobile ? 0.9 : 1.5);

  S.ctx.fillStyle = '#cc6600';
  S.ctx.beginPath(); S.ctx.ellipse(-16, 4+bob, 8, 4, -0.4, 0, Math.PI*2); S.ctx.fill();
  S.ctx.beginPath(); S.ctx.ellipse(-14, -3+bob, 8, 4, 0.4, 0, Math.PI*2); S.ctx.fill();

  S.ctx.fillStyle = '#0d3d5c';
  S.ctx.beginPath(); S.ctx.roundRect(-8, -8+bob*.3, 18, 16, 4); S.ctx.fill();

  const sway = Math.sin(S.swimPhase * 0.9) * 2;
  S.ctx.fillStyle = '#0d3d5c';
  S.ctx.beginPath(); S.ctx.ellipse(1, -8+sway, 6, 3, 0.15, 0, Math.PI*2); S.ctx.fill();
  S.ctx.beginPath(); S.ctx.ellipse(1,  8-sway, 6, 3, -0.15, 0, Math.PI*2); S.ctx.fill();

  S.ctx.fillStyle = '#888'; S.ctx.beginPath(); S.ctx.roundRect(-6, -5+bob*.3, 6, 12, 2); S.ctx.fill();
  S.ctx.fillStyle = '#aaa'; S.ctx.beginPath(); S.ctx.roundRect(-5.5, -3+bob*.3, 4, 5, 1); S.ctx.fill();

  S.ctx.fillStyle = '#b07830'; S.ctx.beginPath(); S.ctx.arc(10, 0+bob*.3, 9, 0, Math.PI*2); S.ctx.fill();

  S.ctx.fillStyle = '#0d3d5c'; S.ctx.beginPath(); S.ctx.ellipse(10, 0+bob*.3, 7, 9, Math.PI/2, -0.3, Math.PI+0.3); S.ctx.fill();
  S.ctx.fillStyle = 'rgba(160,220,255,.5)'; S.ctx.beginPath(); S.ctx.ellipse(11, 0+bob*.3, 5, 6.5, Math.PI/2, -0.3, Math.PI+0.3); S.ctx.fill();

  S.ctx.fillStyle = '#fff';
  S.ctx.beginPath(); S.ctx.arc(10, -3+bob*.3, 2, 0, Math.PI*2); S.ctx.fill();
  S.ctx.beginPath(); S.ctx.arc(10,  3+bob*.3, 2, 0, Math.PI*2); S.ctx.fill();
  S.ctx.fillStyle = '#224';
  S.ctx.beginPath(); S.ctx.arc(10, -3+bob*.3, 1, 0, Math.PI*2); S.ctx.fill();
  S.ctx.beginPath(); S.ctx.arc(10,  3+bob*.3, 1, 0, Math.PI*2); S.ctx.fill();

  if (S.frame % 22 < 4) {
    S.ctx.fillStyle = 'rgba(200,240,255,.6)'; S.ctx.beginPath(); S.ctx.arc(16, 6+bob*.3, 2.5, 0, Math.PI*2); S.ctx.fill();
  }
  S.ctx.restore();
}

export function drawOpponent() {
  if (S.gameMode !== 'race' || S.raceState !== 'racing') return;
  const sx = S.opponentPos.x - S.camXpx;
  const sy = S.opponentPos.y - S.camYpx;
  if (sx < -60 || sx > S.W + 60) return;

  const bob = Math.sin(S.worldFrame * 0.12) * 2;

  S.ctx.save(); S.ctx.translate(sx, sy);
  S.ctx.scale(S.isMobile ? 0.9 : 1.5, S.isMobile ? 0.9 : 1.5);
  S.ctx.globalAlpha = 0.85;

  // ласты
  S.ctx.fillStyle = '#cc6600';
  S.ctx.beginPath(); S.ctx.ellipse(-16, 4+bob, 8, 4, -0.4, 0, Math.PI*2); S.ctx.fill();
  S.ctx.beginPath(); S.ctx.ellipse(-14, -3+bob, 8, 4, 0.4, 0, Math.PI*2); S.ctx.fill();

  // тело
  S.ctx.fillStyle = '#0d3d5c';
  S.ctx.beginPath(); S.ctx.roundRect(-8, -8+bob*.3, 18, 16, 4); S.ctx.fill();

  // плавники
  S.ctx.fillStyle = '#0d3d5c';
  S.ctx.beginPath(); S.ctx.ellipse(1, -8+Math.sin(S.worldFrame*0.09)*2, 6, 3, 0.15, 0, Math.PI*2); S.ctx.fill();
  S.ctx.beginPath(); S.ctx.ellipse(1,  8-Math.sin(S.worldFrame*0.09)*2, 6, 3, -0.15, 0, Math.PI*2); S.ctx.fill();

  // баллон
  S.ctx.fillStyle = '#888'; S.ctx.beginPath(); S.ctx.roundRect(-6, -5+bob*.3, 6, 12, 2); S.ctx.fill();
  S.ctx.fillStyle = '#aaa'; S.ctx.beginPath(); S.ctx.roundRect(-5.5, -3+bob*.3, 4, 5, 1); S.ctx.fill();

  // маска
  S.ctx.fillStyle = '#b07830'; S.ctx.beginPath(); S.ctx.arc(10, 0+bob*.3, 9, 0, Math.PI*2); S.ctx.fill();
  S.ctx.fillStyle = '#0d3d5c'; S.ctx.beginPath(); S.ctx.ellipse(10, 0+bob*.3, 7, 9, Math.PI/2, -0.3, Math.PI+0.3); S.ctx.fill();
  S.ctx.fillStyle = 'rgba(160,220,255,.5)'; S.ctx.beginPath(); S.ctx.ellipse(11, 0+bob*.3, 5, 6.5, Math.PI/2, -0.3, Math.PI+0.3); S.ctx.fill();

  // глаза
  S.ctx.fillStyle = '#fff';
  S.ctx.beginPath(); S.ctx.arc(10, -3+bob*.3, 2, 0, Math.PI*2); S.ctx.fill();
  S.ctx.beginPath(); S.ctx.arc(10,  3+bob*.3, 2, 0, Math.PI*2); S.ctx.fill();
  S.ctx.fillStyle = '#224';
  S.ctx.beginPath(); S.ctx.arc(10, -3+bob*.3, 1, 0, Math.PI*2); S.ctx.fill();
  S.ctx.beginPath(); S.ctx.arc(10,  3+bob*.3, 1, 0, Math.PI*2); S.ctx.fill();

  S.ctx.globalAlpha = 1;
  S.ctx.restore();

  // имя над дайвером
  S.ctx.save();
  S.ctx.fillStyle = '#ffaaaa'; S.ctx.font = 'bold 12px sans-serif'; S.ctx.textAlign = 'center';
  S.ctx.fillText('🤿 ' + (S.raceRoom ? S.raceRoom.opponentName : '???'), sx, sy - 28);
  S.ctx.restore();
}

// ─── HUD ──────────────────────────────────────────────────────────────────────
export function drawHUD() {
  const cx   = S.VP.w / 2;
  const diff = difficulty(Math.floor(S.camXpx / S.T));
  const label   = diff < 0.25 ? (S.distM >= 100 ? t('diff_normal') : t('diff_easy')) : diff < 0.5 ? t('diff_medium') : diff < 0.75 ? t('diff_hard') : t('diff_danger');
  const diffCol = diff < 0.25 ? '#88ff88' : diff < 0.5 ? '#ffee44' : diff < 0.75 ? '#ff9944' : '#ff4444';

  if (S.isMobile) {
    const ph = 26, py = 0;
    const bw = S.VP.w * 0.5, bh = ph, bx2 = cx - bw / 2, by2 = py;
    S.ctx.fillStyle = 'rgba(0,0,0,.40)';
    S.ctx.fillRect(0, py, bx2, ph);
    S.ctx.fillRect(bx2 + bw, py, S.VP.w - (bx2 + bw), ph);
    S.ctx.fillStyle = 'rgba(0,0,0,.88)';
    S.ctx.fillRect(bx2, py, bw, ph);
    S.ctx.fillStyle = '#88ddff'; S.ctx.font = 'bold 9px monospace'; S.ctx.textAlign = 'left';
    S.ctx.fillText(`➡${S.distM}m`, 6, py + 10);
    S.ctx.fillStyle = '#ffe680'; S.ctx.font = 'bold 9px monospace'; S.ctx.textAlign = 'right';
    S.ctx.fillText(`◆${S.score}`, S.VP.w - 6, py + 10);
    S.ctx.fillStyle = S.oxygen > 50 ? 'rgba(68,221,170,.45)' : S.oxygen > 25 ? 'rgba(255,204,68,.45)' : 'rgba(255,85,68,.45)';
    S.ctx.fillRect(bx2, by2, bw * S.oxygen / 100, bh);
    const livesStr = S.lives >= 99 ? '🤿∞' : '🤿'.repeat(Math.min(S.lives,3)) + '🩶'.repeat(Math.max(0,3-S.lives));
    S.ctx.font = 'bold 11px sans-serif'; S.ctx.textAlign = 'center';
    S.ctx.fillStyle = '#ffffff';
    S.ctx.shadowColor = '#88ffee'; S.ctx.shadowBlur = 6;
    S.ctx.fillText(livesStr, cx, py + 22);
    S.ctx.shadowBlur = 0;
  } else {
    const panelH = 42, panelY = 0;
    S.ctx.fillStyle = 'rgba(0,0,0,.6)';
    S.ctx.fillRect(0, panelY, S.VP.w, panelH);
    S.ctx.fillStyle = '#88ddff'; S.ctx.font = 'bold 20px monospace'; S.ctx.textAlign = 'left';
    S.ctx.fillText(`➡ ${S.distM}m`, 16, panelY + 28);
    S.ctx.fillStyle = diffCol; S.ctx.font = 'bold 18px sans-serif'; S.ctx.textAlign = 'center';
    S.ctx.fillText(label, cx, panelY + 28);
    S.ctx.fillStyle = '#ffe680'; S.ctx.font = 'bold 20px monospace'; S.ctx.textAlign = 'right';
    S.ctx.fillText(`◆ ${S.score}`, S.VP.w - 16, panelY + 28);

    const bw = Math.min(400, S.VP.w * 0.5), bh = 20, bx = cx - bw/2, by = panelY + panelH + 4;
    S.ctx.fillStyle = 'rgba(0,0,0,.55)';
    S.ctx.beginPath(); S.ctx.roundRect(bx, by, bw, bh, 8); S.ctx.fill();
    S.ctx.fillStyle = S.oxygen > 50 ? '#44ddaa' : S.oxygen > 25 ? '#ffcc44' : '#ff5544';
    S.ctx.beginPath(); S.ctx.roundRect(bx+3, by+3, (bw-6)*S.oxygen/100, bh-6, 5); S.ctx.fill();
    S.ctx.fillStyle = 'rgba(255,255,255,.9)'; S.ctx.font = 'bold 12px sans-serif'; S.ctx.textAlign = 'center';
    S.ctx.fillText('O₂', cx, by + 14);

    S.ctx.font = 'bold 22px sans-serif'; S.ctx.textAlign = 'center';
    const heartsY = by + bh + 20;
    S.ctx.fillText(S.lives >= 99 ? '🤿 ∞' : '🤿'.repeat(Math.min(S.lives,3)) + '🩶'.repeat(Math.max(0, 3-S.lives)), cx, heartsY);
    const toNext = S.nextCheckpointM - S.distM;
    S.ctx.fillStyle = 'rgba(100,255,180,.8)'; S.ctx.font = 'bold 11px sans-serif';
    S.ctx.fillText(t('next_cp')(toNext), cx, heartsY + 16);

    const threatW = 260, threatH = 26, tx = cx - threatW/2, ty = S.VP.h - 34;
    S.ctx.fillStyle = 'rgba(0,0,0,.5)';
    S.ctx.beginPath(); S.ctx.roundRect(tx, ty, threatW, threatH, 6); S.ctx.fill();
    S.ctx.fillStyle = '#ffaaaa'; S.ctx.font = 'bold 13px sans-serif'; S.ctx.textAlign = 'center';
    S.ctx.fillText(t('danger_bar')(Math.round(diff*5)), cx, ty + 18);
  }

  if (S.oxygen < 25 && Math.floor(S.frame/20)%2===0) {
    S.ctx.fillStyle = 'rgba(255,80,60,.15)'; S.ctx.fillRect(0, 0, S.VP.w, S.VP.h);
    S.ctx.fillStyle = '#ff5544'; S.ctx.font = 'bold 15px sans-serif'; S.ctx.textAlign = 'center';
    S.ctx.fillText(t('low_oxy'), cx, S.VP.h/2 - 14);
  }
}

// ─── Race HUD ─────────────────────────────────────────────────────────────────
export function drawRaceHUD() {
  if (S.gameMode !== 'race') return;
  const ru = S.lang === 'ru';
  const bx = S.VP.w/2 - 60, by = S.VP.h - 36, bw = 120, bh = 18;
  S.ctx.fillStyle = 'rgba(0,0,0,.55)';
  S.ctx.beginPath(); S.ctx.roundRect(bx, by, bw, bh, 8); S.ctx.fill();
  for (let i = 0; i < 3; i++) {
    const filled = i < S.nitro;
    const cx2 = bx + 8 + i * 38;
    S.ctx.fillStyle = filled ? (S.nitroActive > 0 ? '#ffdd00' : '#ff8800') : 'rgba(255,255,255,.15)';
    S.ctx.beginPath(); S.ctx.roundRect(cx2, by+3, 32, bh-6, 5); S.ctx.fill();
    if (filled) {
      S.ctx.fillStyle = '#fff'; S.ctx.font = 'bold 10px sans-serif'; S.ctx.textAlign = 'center';
      S.ctx.fillText('N²', cx2+16, by+13);
    }
  }
  if (S.nitroActive > 0) {
    S.ctx.fillStyle = 'rgba(255,150,0,.18)'; S.ctx.fillRect(0,0,S.VP.w,S.VP.h);
  }
  const myX = S.player.x, oppX = S.opponentPos.x || 0;
  const diff2 = myX - oppX;
  const diffM = Math.round(diff2 / 40);
  const label2 = diffM > 0
    ? (ru ? '+'+diffM+'м впереди' : '+'+diffM+'m ahead')
    : (diffM < 0 ? (ru ? Math.abs(diffM)+'м сзади' : Math.abs(diffM)+'m behind') : (ru ? 'рядом' : 'tied'));
  const col = diffM > 0 ? '#44ffaa' : diffM < 0 ? '#ff6666' : '#ffee44';
  S.ctx.fillStyle = col; S.ctx.font = 'bold 13px sans-serif'; S.ctx.textAlign = 'center';
  S.ctx.fillText('🏁 ' + label2, S.VP.w/2, S.VP.h - 44);
  if (S.nitro > 0 && !S.isMobile) {
    S.ctx.fillStyle = 'rgba(255,255,255,.5)'; S.ctx.font = '11px sans-serif';
    S.ctx.fillText(ru ? '[ПРОБЕЛ] — нитро' : '[SPACE] — nitro', S.VP.w/2, S.VP.h - 58);
  }
}

// ─── Pause ────────────────────────────────────────────────────────────────────
export function drawPause() {
  const sx = S.VP.x, sy = S.VP.y, sw = S.VP.w, sh = S.VP.h;
  const cx = sx + sw / 2, cy = sy + sh / 2;
  const sz = Math.round(Math.min(48, sh * 0.13));

  S.ctx.fillStyle = 'rgba(0,0,0,.55)'; S.ctx.fillRect(sx, sy, sw, sh);
  S.ctx.fillStyle = '#fff'; S.ctx.font = `bold ${sz}px sans-serif`; S.ctx.textAlign = 'center';
  S.ctx.fillText(t('paused'), cx, cy - 30);
  S.ctx.font = `${Math.round(sz*0.4)}px sans-serif`; S.ctx.fillStyle = '#aaddff';
  S.ctx.fillText(t('resume_hint'), cx, cy + 10);

  const bw = Math.min(220, sw * 0.55), bh = Math.round(sz * 0.75);
  const bx = cx - bw/2, by = cy + 30;
  S.ctx.fillStyle = 'rgba(255,255,255,.12)';
  S.ctx.strokeStyle = 'rgba(255,255,255,.45)'; S.ctx.lineWidth = 2;
  S.ctx.beginPath(); S.ctx.roundRect(bx, by, bw, bh, 10); S.ctx.fill(); S.ctx.stroke();
  S.ctx.fillStyle = '#fff'; S.ctx.font = `bold ${Math.round(sz*0.38)}px sans-serif`;
  S.ctx.fillText(t('menu_btn'), cx, by + bh * 0.65);
  S.ui.pauseMenuBtn = { x: bx, y: by, w: bw, h: bh };
}

// ─── Dead / Win / LevelUp / RaceOver ─────────────────────────────────────────
export function drawDead() {
  const compact = S.isMobile && S.W > S.H;
  const s = Math.min(S.H / 500, S.W / 700, 1);
  const titleSz = Math.round(Math.min(56, S.H * 0.13));
  const textSz  = Math.round(titleSz * 0.36);
  const smallSz = Math.round(titleSz * 0.30);

  S.ctx.fillStyle = 'rgba(0,0,20,.72)'; S.ctx.fillRect(0,0,S.W,S.H);
  S.ctx.fillStyle = '#ff1111'; S.ctx.font = `bold ${titleSz}px sans-serif`; S.ctx.textAlign = 'center';
  S.ctx.shadowColor = '#ff0000'; S.ctx.shadowBlur = 20;
  S.ctx.fillText(t('game_over'), S.W/2, S.H * 0.20);
  S.ctx.shadowBlur = 0;
  if (S.playerName) {
    S.ctx.fillStyle = '#aaddff'; S.ctx.font = `${Math.round(titleSz*0.38)}px sans-serif`;
    S.ctx.fillText(`🤿 ${S.playerName}`, S.W/2, S.H * 0.30);
  }

  if (compact) {
    const lx = S.W * 0.30, rx = S.W * 0.70;
    S.ctx.fillStyle = '#ffe680'; S.ctx.font = `${textSz}px sans-serif`;
    S.ctx.fillText(`${t('score_lbl')}: ${S.score}`, lx, S.H * 0.42);
    S.ctx.fillText(`${t('dist_lbl')}: ${S.distM}m`, lx, S.H * 0.57);
    S.ctx.fillStyle = '#aaffcc'; S.ctx.font = `${textSz}px sans-serif`;
    S.ctx.fillText(`${t('best')}: ${S.hiScore}`, lx, S.H * 0.72);
    if (S.isMobile) drawControlSelector(S.H * 0.32, rx);
    S.ctx.fillStyle = '#88ddff'; S.ctx.font = `bold ${smallSz}px sans-serif`;
    S.ctx.fillText(t('play_again_m'), rx, S.H * 0.72);
    const mw = Math.min(180, S.W * 0.24), mh = Math.round(34 * s + 8);
    const mx = rx - mw/2, my = S.H * 0.80;
    S.ctx.fillStyle = 'rgba(255,255,255,.1)';
    S.ctx.strokeStyle = 'rgba(255,255,255,.4)'; S.ctx.lineWidth = 2;
    S.ctx.beginPath(); S.ctx.roundRect(mx, my, mw, mh, 8); S.ctx.fill(); S.ctx.stroke();
    S.ctx.fillStyle = 'rgba(255,255,255,.8)'; S.ctx.font = `${smallSz}px sans-serif`;
    S.ctx.fillText(t('main_menu'), rx, my + mh * 0.65);
    S.ui.menuBackBtn = { x: mx, y: my, w: mw, h: mh };
  } else {
    S.ctx.fillStyle = '#ffe680'; S.ctx.font = `${textSz}px sans-serif`;
    S.ctx.fillText(`${t('score_lbl')}: ${S.score}`, S.W/2, S.H * 0.38);
    S.ctx.fillText(`${t('dist_lbl')}: ${S.distM}m`, S.W/2, S.H * 0.47);
    S.ctx.fillStyle = '#aaffcc'; S.ctx.font = `${textSz}px sans-serif`;
    S.ctx.fillText(`${t('best')}: ${S.hiScore}`, S.W/2, S.H * 0.56);
    if (S.isMobile) drawControlSelector(S.H * 0.63);
    S.ctx.fillStyle = '#88ddff'; S.ctx.font = `bold ${textSz}px sans-serif`;
    S.ctx.fillText(t('play_again'), S.W/2, S.H * 0.80);
    const mw = Math.min(220, S.W * 0.30), mh = Math.round(40 * s + 5);
    const mx = S.W/2 - mw/2, my = S.H * 0.87;
    S.ctx.fillStyle = 'rgba(255,255,255,.1)';
    S.ctx.strokeStyle = 'rgba(255,255,255,.4)'; S.ctx.lineWidth = 2;
    S.ctx.beginPath(); S.ctx.roundRect(mx, my, mw, mh, 10); S.ctx.fill(); S.ctx.stroke();
    S.ctx.fillStyle = 'rgba(255,255,255,.8)'; S.ctx.font = `${smallSz}px sans-serif`;
    S.ctx.fillText(t('main_menu_btn'), S.W/2, my + mh * 0.65);
    S.ui.menuBackBtn = { x: mx, y: my, w: mw, h: mh };
  }
}

export function drawWin() {
  const titleSz = Math.round(Math.min(54, S.H * 0.12));
  const textSz  = Math.round(titleSz * 0.44);
  const pipSz   = Math.round(titleSz * 0.60);
  S.ctx.fillStyle = 'rgba(0,20,10,.8)'; S.ctx.fillRect(0,0,S.W,S.H);
  S.ctx.fillStyle = '#44ffaa'; S.ctx.font = `bold ${titleSz}px sans-serif`; S.ctx.textAlign = 'center';
  S.ctx.shadowColor = '#00ff88'; S.ctx.shadowBlur = 28;
  S.ctx.fillText(t('victory'), S.W/2, S.H * 0.20);
  S.ctx.shadowBlur = 0;
  S.ctx.fillStyle = '#fff'; S.ctx.font = `${textSz}px sans-serif`;
  S.ctx.fillText(`${t('dist_lbl')}: 500m`, S.W/2, S.H * 0.36);
  S.ctx.fillText(`${t('score_lbl')}: ${S.score}`, S.W/2, S.H * 0.47);
  S.ctx.font = `${pipSz}px sans-serif`;
  S.ctx.fillText('🏅'.repeat(S.wins) + '⬜'.repeat(5 - S.wins), S.W/2, S.H * 0.60);
  S.ctx.fillStyle = '#aaffcc'; S.ctx.font = `${textSz}px sans-serif`;
  S.ctx.fillText(`${t('wins_to')}: ${S.wins} / 5 ${t('to_next')}`, S.W/2, S.H * 0.72);
  S.ctx.fillStyle = '#ffee66'; S.ctx.font = `bold ${textSz}px sans-serif`;
  S.ctx.fillText(t('next_round'), S.W/2, S.H * 0.78);
  const bw = Math.min(220, S.W * 0.30), bh = Math.round(textSz * 1.1);
  const bx = S.W/2 - bw/2, by = S.H * 0.86;
  S.ctx.fillStyle = 'rgba(255,255,255,.1)';
  S.ctx.strokeStyle = 'rgba(255,255,255,.4)'; S.ctx.lineWidth = 2;
  S.ctx.beginPath(); S.ctx.roundRect(bx, by, bw, bh, 10); S.ctx.fill(); S.ctx.stroke();
  S.ctx.fillStyle = '#fff'; S.ctx.font = `${textSz}px sans-serif`; S.ctx.textAlign = 'center';
  S.ctx.fillText(t('menu_btn'), S.W/2, by + bh * 0.65);
  S.ui.winMenuBtn = { x: bx, y: by, w: bw, h: bh };
}

export function drawLevelUp() {
  const titleSz = Math.round(Math.min(52, S.H * 0.12));
  const textSz  = Math.round(titleSz * 0.52);
  const smallSz = Math.round(titleSz * 0.36);
  S.ctx.fillStyle = 'rgba(0,0,30,.85)'; S.ctx.fillRect(0,0,S.W,S.H);
  S.ctx.fillStyle = '#ffdd00'; S.ctx.font = `bold ${titleSz}px sans-serif`; S.ctx.textAlign = 'center';
  S.ctx.shadowColor = '#ffaa00'; S.ctx.shadowBlur = 30;
  S.ctx.fillText(t('new_level'), S.W/2, S.H * 0.22);
  S.ctx.shadowBlur = 0;
  S.ctx.fillStyle = '#fff'; S.ctx.font = `${textSz}px sans-serif`;
  S.ctx.fillText(`${t('level_lbl')} ${S.level}  →  ${S.level + 1}`, S.W/2, S.H * 0.42);
  S.ctx.fillStyle = '#ffaaaa'; S.ctx.font = `${smallSz}px sans-serif`;
  S.ctx.fillText(t('enemies_faster'), S.W/2, S.H * 0.58);
  S.ctx.fillStyle = '#88ddff'; S.ctx.font = `bold ${textSz * 0.9}px sans-serif`;
  S.ctx.fillText(t('lets_go'), S.W/2, S.H * 0.76);
}

export function drawRaceOver() {
  const won = S.raceWinner === 'me';
  const ru  = S.lang === 'ru';
  S.ctx.fillStyle = 'rgba(0,0,0,.8)'; S.ctx.fillRect(0,0,S.W,S.H);
  const titleSz = Math.round(Math.min(60, S.H*0.13));
  S.ctx.textAlign = 'center';
  S.ctx.fillStyle = won ? '#44ffaa' : '#ff4444';
  S.ctx.font = 'bold '+titleSz+'px sans-serif';
  S.ctx.shadowColor = won ? '#00ff88' : '#ff0000'; S.ctx.shadowBlur = 28;
  S.ctx.fillText(won ? (ru?'🏆 ПОБЕДА!':'🏆 YOU WIN!') : (ru?'😔 ПОРАЖЕНИЕ':'😔 YOU LOSE'), S.W/2, S.H*0.28);
  S.ctx.shadowBlur = 0;
  const ts = Math.round(titleSz*0.45);
  S.ctx.fillStyle = '#fff'; S.ctx.font = ts+'px sans-serif';
  S.ctx.fillText((ru?'Дистанция: ':'Distance: ')+S.distM+'m', S.W/2, S.H*0.44);
  S.ctx.fillStyle = '#aaddff'; S.ctx.font = (ts*0.8)+'px sans-serif';
  S.ctx.fillText(ru?'[ ПРОБЕЛ / тап ] — в меню':'[ SPACE / tap ] — main menu', S.W/2, S.H*0.62);
}

// ─── Particles ────────────────────────────────────────────────────────────────
export function drawParticles() {
  for (const p of S.particles) {
    S.ctx.save(); S.ctx.globalAlpha = p.life;
    S.ctx.fillStyle = p.color;
    S.ctx.beginPath(); S.ctx.arc(p.x, p.y, p.r, 0, Math.PI*2); S.ctx.fill();
    S.ctx.restore();
  }
}

// ─── Menu ─────────────────────────────────────────────────────────────────────
export function drawMenu() {
  const compact = S.isMobile && S.W > S.H;
  const scale = Math.min(S.H / 500, S.W / 700, 1);

  const g = S.ctx.createLinearGradient(0,0,0,S.H);
  g.addColorStop(0,'#001830'); g.addColorStop(1,'#000a18');
  S.ctx.fillStyle = g; S.ctx.fillRect(0,0,S.W,S.H);
  S.ctx.fillStyle = 'rgba(140,220,255,.1)';
  for (let i = 0; i < 18; i++) {
    const bx = (i*137 + S.worldFrame*.25) % S.W;
    const by = S.H - ((i*83 + S.worldFrame*(0.3+i*.02)) % S.H);
    S.ctx.beginPath(); S.ctx.arc(bx, by, 3+(i%5), 0, Math.PI*2); S.ctx.fill();
  }

  if (compact) {
    const lx = S.W * 0.27, rx = S.W * 0.73;
    S.ctx.fillStyle = '#80dfff'; S.ctx.font = `bold ${Math.round(26*scale+14)}px sans-serif`; S.ctx.textAlign = 'center';
    S.ctx.fillText(t('title'), lx, S.H * 0.18);
    S.ctx.fillStyle = '#aaffee'; S.ctx.font = `${Math.round(11*scale+8)}px sans-serif`;
    S.ctx.fillText(t('subtitle'), lx, S.H * 0.30);
    S.ctx.fillStyle = '#cceeff'; S.ctx.font = `${Math.round(9*scale+8)}px sans-serif`;
    S.ctx.fillText(t('desc1'), lx, S.H * 0.44);
    S.ctx.fillText(t('desc2'), lx, S.H * 0.55);
    S.ctx.fillStyle = '#aaffcc'; S.ctx.font = `${Math.round(8*scale+7)}px sans-serif`;
    S.ctx.fillText(t('controls_hint_m'), lx, S.H * 0.67);
    if (S.isMobile) drawControlSelector(S.H * 0.10, rx);
    const bw = Math.min(150, S.W * 0.20), bh = Math.round(38 * scale + 16), gap = 14;
    const b1x = rx - bw - gap/2, b2x = rx + gap/2;
    const by = S.H * (S.isMobile ? 0.50 : 0.40);
    S.ctx.fillStyle = 'rgba(80,160,255,.25)';
    S.ctx.strokeStyle = '#55aaff'; S.ctx.lineWidth = 2;
    S.ctx.beginPath(); S.ctx.roundRect(b1x, by, bw, bh, 10); S.ctx.fill(); S.ctx.stroke();
    S.ctx.fillStyle = '#fff'; S.ctx.font = `bold ${Math.round(13*scale+9)}px sans-serif`; S.ctx.textAlign = 'center';
    S.ctx.fillText(t('campaign'), b1x + bw/2, by + bh*0.42);
    S.ctx.fillStyle = 'rgba(255,255,255,.55)'; S.ctx.font = `${Math.round(8*scale+7)}px sans-serif`;
    S.ctx.fillText(t('campaign_sub_m'), b1x + bw/2, by + bh*0.78);
    S.ctx.fillStyle = 'rgba(80,220,120,.2)';
    S.ctx.strokeStyle = '#44dd88'; S.ctx.lineWidth = 2;
    S.ctx.beginPath(); S.ctx.roundRect(b2x, by, bw, bh, 10); S.ctx.fill(); S.ctx.stroke();
    S.ctx.fillStyle = '#fff'; S.ctx.font = `bold ${Math.round(13*scale+9)}px sans-serif`;
    S.ctx.fillText(t('sandbox'), b2x + bw/2, by + bh*0.42);
    S.ctx.fillStyle = 'rgba(255,255,255,.55)'; S.ctx.font = `${Math.round(8*scale+7)}px sans-serif`;
    S.ctx.fillText(t('sandbox_sub_m'), b2x + bw/2, by + bh*0.78);
    S.ui.btnCampaign = { x: b1x, y: by, w: bw, h: bh };
    S.ui.btnSandbox  = { x: b2x, y: by, w: bw, h: bh };
    if (S.hiScore > 0) {
      S.ctx.fillStyle = '#ffe680'; S.ctx.font = `${Math.round(8*scale+7)}px sans-serif`; S.ctx.textAlign = 'center';
      S.ctx.fillText(`${t('best')}: ${S.hiScore}  |  Lv${S.level}  |  ${t('wins_lbl')}: ${S.wins}/5`, rx, by + bh + 18);
    }
  } else {
    const titleSize = Math.round(Math.min(40, S.H * 0.08));
    S.ctx.fillStyle = '#80dfff'; S.ctx.font = `bold ${titleSize}px sans-serif`; S.ctx.textAlign = 'center';
    S.ctx.fillText(t('title'), S.W/2, S.H * 0.20);
    S.ctx.fillStyle = '#aaffee'; S.ctx.font = `${Math.round(titleSize*0.38)}px sans-serif`;
    S.ctx.fillText(t('subtitle'), S.W/2, S.H * 0.28);
    const bw = Math.min(190, S.W * 0.26), bh = Math.round(54 * scale + 10), gap = 20;
    const b1x = S.W/2 - bw - gap/2, b2x = S.W/2 + gap/2;
    const by = S.H * 0.34;
    S.ctx.fillStyle = 'rgba(80,160,255,.25)';
    S.ctx.strokeStyle = '#55aaff'; S.ctx.lineWidth = 2;
    S.ctx.beginPath(); S.ctx.roundRect(b1x, by, bw, bh, 12); S.ctx.fill(); S.ctx.stroke();
    S.ctx.fillStyle = '#fff'; S.ctx.font = `bold ${Math.round(titleSize*0.42)}px sans-serif`; S.ctx.textAlign = 'center';
    S.ctx.fillText(t('campaign'), b1x + bw/2, by + bh*0.42);
    S.ctx.fillStyle = 'rgba(255,255,255,.55)'; S.ctx.font = `${Math.round(titleSize*0.28)}px sans-serif`;
    S.ctx.fillText(t('campaign_sub'), b1x + bw/2, by + bh*0.78);
    S.ctx.fillStyle = 'rgba(80,220,120,.2)';
    S.ctx.strokeStyle = '#44dd88'; S.ctx.lineWidth = 2;
    S.ctx.beginPath(); S.ctx.roundRect(b2x, by, bw, bh, 12); S.ctx.fill(); S.ctx.stroke();
    S.ctx.fillStyle = '#fff'; S.ctx.font = `bold ${Math.round(titleSize*0.42)}px sans-serif`;
    S.ctx.fillText(t('sandbox'), b2x + bw/2, by + bh*0.42);
    S.ctx.fillStyle = 'rgba(255,255,255,.55)'; S.ctx.font = `${Math.round(titleSize*0.28)}px sans-serif`;
    S.ctx.fillText(t('sandbox_sub'), b2x + bw/2, by + bh*0.78);
    S.ui.btnCampaign = { x: b1x, y: by, w: bw, h: bh };
    S.ui.btnSandbox  = { x: b2x, y: by, w: bw, h: bh };
    const descY = by + bh + S.H * 0.05;
    S.ctx.fillStyle = '#cceeff'; S.ctx.font = `${Math.round(titleSize*0.34)}px sans-serif`; S.ctx.textAlign = 'center';
    S.ctx.fillText(t('desc1'), S.W/2, descY);
    S.ctx.fillText(t('desc2'), S.W/2, descY + S.H * 0.07);
    S.ctx.fillStyle = '#aaffcc'; S.ctx.font = `${Math.round(titleSize*0.32)}px sans-serif`;
    S.ctx.fillText(t('controls_hint'), S.W/2, descY + S.H * 0.14);
    if (S.isMobile) drawControlSelector(descY + S.H * 0.21);
    if (S.H > S.W) {
      S.ctx.save();
      S.ctx.fillStyle = `rgba(255,20,20,${0.7 + 0.3 * Math.sin(S.worldFrame * 0.1)})`;
      S.ctx.font = `bold ${Math.round(titleSize*0.45)}px sans-serif`; S.ctx.textAlign = 'center';
      S.ctx.shadowColor = '#ff0000'; S.ctx.shadowBlur = 16;
      S.ctx.fillText(t('rotate'), S.W/2, S.H * 0.06);
      S.ctx.shadowBlur = 0;
      S.ctx.restore();
    }
    if (S.hiScore > 0) {
      S.ctx.fillStyle = '#ffe680'; S.ctx.font = `${Math.round(titleSize*0.30)}px sans-serif`; S.ctx.textAlign = 'center';
      S.ctx.fillText(`${t('best')}: ${S.hiScore}  |  ${t('level_lbl')}: ${S.level}  |  ${t('wins_lbl')}: ${S.wins}/5`, S.W/2, by + bh + 22);
    }
  }
  drawLangBtn();
  drawHelpBtn();
  drawNameBtn();
  drawFriendsBtn();
  drawLeaderboardBtn();
  drawRaceBtn();
  drawFriendsLeaderboard();
}

// ─── Left-side small buttons ──────────────────────────────────────────────────
function drawLeftBtn(label, byOffset, uiKey) {
  S.ctx.save();
  S.ctx.font = 'bold 14px sans-serif';
  const tw = S.ctx.measureText(label).width;
  const bw = tw + 28, bh = 32, bx = 12, by = byOffset;
  S.ctx.fillStyle = 'rgba(255,255,255,.12)';
  S.ctx.strokeStyle = 'rgba(255,255,255,.45)'; S.ctx.lineWidth = 2;
  S.ctx.beginPath(); S.ctx.roundRect(bx, by, bw, bh, 10); S.ctx.fill(); S.ctx.stroke();
  S.ctx.fillStyle = '#fff'; S.ctx.textAlign = 'center';
  S.ctx.fillText(label, bx + bw / 2, by + bh * 0.68);
  S.ctx.restore();
  S.ui[uiKey] = { x: bx, y: by, w: bw, h: bh };
}

function drawFriendsBtn()     { drawLeftBtn(S.lang === 'ru' ? '👥 Друзья' : '👥 Friends', 52, 'friendsBtn'); }
function drawLeaderboardBtn() { drawLeftBtn(S.lang === 'ru' ? '🏆 Чарт' : '🏆 Chart', 92, 'lbBtn'); }
function drawRaceBtn()        { drawLeftBtn(S.lang === 'ru' ? '🏁 Гонка' : '🏁 Race', 132, 'raceBtn'); }

function drawFriendsLeaderboard() {
  if (!S.friends.length) return;
  const sorted = [...S.friends].sort((a,b) => b.s - a.s).slice(0,5);
  const cx = S.W / 2, startY = S.H * 0.88;
  const rowH = 20, pad = 12;
  const boxW = Math.min(300, S.W * 0.5), boxH = rowH * sorted.length + pad * 2 + 20;
  const bx = cx - boxW/2, by = startY - boxH;
  S.ctx.save();
  S.ctx.fillStyle = 'rgba(0,0,0,.45)';
  S.ctx.beginPath(); S.ctx.roundRect(bx, by, boxW, boxH, 10); S.ctx.fill();
  S.ctx.fillStyle = '#80dfff'; S.ctx.font = 'bold 12px sans-serif'; S.ctx.textAlign = 'center';
  S.ctx.fillText(S.lang === 'ru' ? '👥 Рекорды друзей' : '👥 Friends leaderboard', cx, by + pad + 8);
  sorted.forEach((f, i) => {
    const y = by + pad + 22 + i * rowH;
    S.ctx.fillStyle = '#aaddff'; S.ctx.font = '12px sans-serif'; S.ctx.textAlign = 'left';
    S.ctx.fillText(`${i+1}. 🤿 ${f.n}`, bx + 12, y);
    S.ctx.fillStyle = '#ffe680'; S.ctx.textAlign = 'right';
    S.ctx.fillText(`◆ ${f.s}`, bx + boxW - 12, y);
  });
  S.ctx.restore();
}

function drawNameBtn() {
  const label = S.playerName ? `🤿 ${S.playerName}` : (S.lang === 'ru' ? '✏ Никнейм' : '✏ Nickname');
  S.ctx.save();
  S.ctx.font = 'bold 14px sans-serif';
  const tw = S.ctx.measureText(label).width;
  const bw = tw + 28, bh = 32, bx = 12, by = 12;
  S.ctx.fillStyle = 'rgba(255,255,255,.12)';
  S.ctx.strokeStyle = 'rgba(255,255,255,.45)'; S.ctx.lineWidth = 2;
  S.ctx.beginPath(); S.ctx.roundRect(bx, by, bw, bh, 10); S.ctx.fill(); S.ctx.stroke();
  S.ctx.fillStyle = '#fff'; S.ctx.textAlign = 'center';
  S.ctx.fillText(label, bx + bw / 2, by + bh * 0.68);
  S.ctx.restore();
  S.ui.nameBtn = { x: bx, y: by, w: bw, h: bh };
}

function drawHelpBtn() {
  const bw = 38, bh = 32, bx = S.W - bw - 12, by = 52;
  S.ctx.save();
  S.ctx.fillStyle = 'rgba(255,255,255,.12)';
  S.ctx.strokeStyle = 'rgba(255,255,255,.45)'; S.ctx.lineWidth = 2;
  S.ctx.beginPath(); S.ctx.roundRect(bx, by, bw, bh, 10); S.ctx.fill(); S.ctx.stroke();
  S.ctx.fillStyle = '#fff'; S.ctx.font = 'bold 16px sans-serif'; S.ctx.textAlign = 'center';
  S.ctx.fillText('?', bx + bw / 2, by + bh * 0.68);
  S.ctx.restore();
  S.ui.helpBtn = { x: bx, y: by, w: bw, h: bh };
}

function drawLangBtn() {
  const bw = 72, bh = 32, bx = S.W - bw - 12, by = 12;
  S.ctx.fillStyle = 'rgba(255,255,255,.12)';
  S.ctx.strokeStyle = 'rgba(255,255,255,.45)'; S.ctx.lineWidth = 2;
  S.ctx.beginPath(); S.ctx.roundRect(bx, by, bw, bh, 10); S.ctx.fill(); S.ctx.stroke();
  S.ctx.fillStyle = '#fff'; S.ctx.font = 'bold 14px sans-serif'; S.ctx.textAlign = 'center';
  S.ctx.fillText(t('lang_btn'), bx + bw / 2, by + bh * 0.68);
  S.ui.langBtn = { x: bx, y: by, w: bw, h: bh };
}

export function drawControlSelector(cy, cx) {
  cx = cx || S.W/2;
  const scale = Math.min(S.H / 500, S.W / 700, 1);
  const btnW = Math.round(Math.min(120, S.W * 0.17) * scale + 30);
  const btnH = Math.round(28 * scale + 12);
  const gap = 12;
  const b1x = cx - btnW - gap/2, b2x = cx + gap/2;
  const fs = Math.round(9 * scale + 7);
  S.ctx.fillStyle = '#88ddff'; S.ctx.font = `bold ${fs}px sans-serif`; S.ctx.textAlign = 'center';
  S.ctx.fillText(t('controls_lbl'), cx, cy - 5);
  S.ctx.fillStyle = S.controlMode==='dpad' ? 'rgba(80,200,255,.5)' : 'rgba(255,255,255,.1)';
  S.ctx.strokeStyle = S.controlMode==='dpad' ? '#80dfff' : 'rgba(255,255,255,.3)';
  S.ctx.lineWidth = 2;
  S.ctx.beginPath(); S.ctx.roundRect(b1x, cy, btnW, btnH, 8); S.ctx.fill(); S.ctx.stroke();
  S.ctx.fillStyle = '#fff'; S.ctx.font = `bold ${fs}px sans-serif`;
  S.ctx.fillText('🕹 D-Pad', b1x + btnW/2, cy + btnH*0.65);
  S.ctx.fillStyle = S.controlMode==='joystick' ? 'rgba(80,200,255,.5)' : 'rgba(255,255,255,.1)';
  S.ctx.strokeStyle = S.controlMode==='joystick' ? '#80dfff' : 'rgba(255,255,255,.3)';
  S.ctx.beginPath(); S.ctx.roundRect(b2x, cy, btnW, btnH, 8); S.ctx.fill(); S.ctx.stroke();
  S.ctx.fillStyle = '#fff';
  S.ctx.fillText('🎮 Joystick', b2x + btnW/2, cy + btnH*0.65);
  S.ui.menuBtnDpad = { x: b1x, y: cy, w: btnW, h: btnH };
  S.ui.menuBtnJoy  = { x: b2x, y: cy, w: btnW, h: btnH };
}

// ─── Mobile controls ──────────────────────────────────────────────────────────
export function dpadButtons() {
  const s = S.DPAD.size, g = S.DPAD.gap, margin = 10;
  const mx = S.W - margin - 2*s - g;
  const my = (S.VP.y + S.VP.h) - s * 3 - g * 2 - 10;
  return {
    up:    { x: mx,         y: my,           w: s, h: s, key: 'ArrowUp'    },
    left:  { x: mx - s - g, y: my + s + g,   w: s, h: s, key: 'ArrowLeft'  },
    right: { x: mx + s + g, y: my + s + g,   w: s, h: s, key: 'ArrowRight' },
    down:  { x: mx,         y: my + s*2+g*2, w: s, h: s, key: 'ArrowDown'  },
  };
}

export function pauseBtn() { return { x: S.W - 58, y: 8, w: 50, h: 50 }; }

export function drawMobileControls() {
  if (S.state !== 'play') return;
  S.ctx.save();
  if (S.controlMode === 'dpad') {
    const btns = dpadButtons();
    for (const [dir, b] of Object.entries(btns)) {
      const pressed = S.keys[b.key];
      S.ctx.fillStyle = pressed ? 'rgba(255,255,255,.35)' : 'rgba(255,255,255,.15)';
      S.ctx.strokeStyle = 'rgba(255,255,255,.5)'; S.ctx.lineWidth = 2;
      S.ctx.beginPath(); S.ctx.roundRect(b.x, b.y, b.w, b.h, 10); S.ctx.fill(); S.ctx.stroke();
      S.ctx.fillStyle = pressed ? '#fff' : 'rgba(255,255,255,.8)';
      const arrowSz = Math.round(S.DPAD.size * 0.42);
      S.ctx.font = `bold ${arrowSz}px sans-serif`; S.ctx.textAlign = 'center';
      const arrows = { left:'◀', right:'▶', up:'▲', down:'▼' };
      S.ctx.fillText(arrows[dir], b.x + b.w/2, b.y + b.h/2 + arrowSz*0.35);
    }
  } else {
    const _s = S.DPAD.size, _g = S.DPAD.gap;
    const _my = (S.VP.y + S.VP.h) - _s * 3 - _g * 2 - 10;
    const dpadCenterY = _my + _s + _g + _s / 2;
    const bx = S.joy.active ? S.joy.baseX : S.W - S.JOY_R - 15;
    const by = S.joy.active ? S.joy.baseY : dpadCenterY;
    S.ctx.strokeStyle = 'rgba(255,255,255,.3)'; S.ctx.lineWidth = 3;
    S.ctx.beginPath(); S.ctx.arc(bx, by, S.JOY_R, 0, Math.PI*2); S.ctx.stroke();
    S.ctx.fillStyle = 'rgba(255,255,255,.08)';
    S.ctx.beginPath(); S.ctx.arc(bx, by, S.JOY_R, 0, Math.PI*2); S.ctx.fill();
    const tx = bx + S.joy.dx * S.JOY_R;
    const ty = by + S.joy.dy * S.JOY_R;
    S.ctx.fillStyle = S.joy.active ? 'rgba(100,210,255,.7)' : 'rgba(255,255,255,.25)';
    S.ctx.beginPath(); S.ctx.arc(tx, ty, 26, 0, Math.PI*2); S.ctx.fill();
    S.ctx.strokeStyle = 'rgba(255,255,255,.6)'; S.ctx.lineWidth = 2;
    S.ctx.stroke();
  }
  const pb = pauseBtn();
  S.ctx.fillStyle = S.paused ? 'rgba(255,220,80,.4)' : 'rgba(255,255,255,.15)';
  S.ctx.strokeStyle = 'rgba(255,255,255,.5)'; S.ctx.lineWidth = 2;
  S.ctx.beginPath(); S.ctx.roundRect(pb.x, pb.y, pb.w, pb.h, 10); S.ctx.fill(); S.ctx.stroke();
  S.ctx.fillStyle = '#fff'; S.ctx.font = '22px sans-serif'; S.ctx.textAlign = 'center';
  S.ctx.fillText(S.paused ? '▶' : '⏸', pb.x + pb.w/2, pb.y + pb.h/2 + 8);
  S.ctx.restore();
}

// ─── Help Panel ───────────────────────────────────────────────────────────────
export function openHelp() {
  const ru = S.lang === 'ru';
  document.getElementById('helpTitle').textContent     = ru ? '❓ Как играть' : '❓ How to play';
  document.getElementById('helpCtrlTitle').textContent = ru ? 'Управление' : 'Controls';
  document.getElementById('h1').textContent = ru ? 'Движение' : 'Move';
  document.getElementById('h2').textContent = ru ? 'Движение' : 'Move';
  document.getElementById('h3').textContent = ru ? 'Плыть к курсору' : 'Swim toward cursor';
  document.getElementById('h4').textContent = ru ? 'Пауза' : 'Pause';
  document.getElementById('helpGoalTitle').textContent  = ru ? 'Цель' : 'Goal';
  document.getElementById('helpGoal').textContent       = ru
    ? 'Плыви вправо как можно дальше! В кампании цель — проплыть 500 метров. Следи за кислородом (O₂) — подбирай пузыри чтобы пополнить его. Собирай жемчуг для очков. У тебя 3 жизни.'
    : 'Swim right as far as you can! In Campaign mode the goal is 500 metres. Watch your oxygen (O₂) — grab bubbles to refill it. Collect pearls for points. You have 3 lives.';
  document.getElementById('helpItemsTitle').textContent = ru ? 'Предметы и враги' : 'Items & enemies';
  document.getElementById('hi1').textContent = ru ? 'Жемчуг — +10 очков' : 'Pearl — +10 points';
  document.getElementById('hi2').textContent = ru ? 'Пузырь O₂ — восстанавливает кислород' : 'O₂ bubble — restores oxygen';
  document.getElementById('hi3').textContent = ru ? 'Акула и медуза — теряешь жизнь' : 'Shark & jellyfish — lose a life';
  document.getElementById('hi4').textContent = ru ? 'Мина — теряешь жизнь' : 'Mine — lose a life';
  document.getElementById('helpClose').textContent = ru ? 'Понятно!' : 'Got it!';
  document.getElementById('helpPanel').style.display = 'block';
}

document.getElementById('helpClose').addEventListener('click', function () {
  document.getElementById('helpPanel').style.display = 'none';
});
