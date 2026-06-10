// input.js — keyboard, mouse, touch handlers
import { S } from './state.js';
import { dpadButtons, pauseBtn } from './render.js';

function getTouchCoords(touch) {
  const r = S.canvas.getBoundingClientRect();
  return {
    tx: (touch.clientX - r.left) * (S.W / r.width),
    ty: (touch.clientY - r.top)  * (S.H / r.height),
  };
}
function hitBtn(b, tx, ty) { return tx >= b.x && tx <= b.x+b.w && ty >= b.y && ty <= b.y+b.h; }

function joyUpdate(tx, ty) {
  const dx = tx - S.joy.baseX, dy = ty - S.joy.baseY;
  const d  = Math.sqrt(dx*dx + dy*dy);
  const DEAD = 8;
  if (d < DEAD) { S.joy.dx = 0; S.joy.dy = 0; return; }
  const clamped = Math.min(d, S.JOY_R);
  S.joy.dx = (dx / d) * (clamped / S.JOY_R);
  S.joy.dy = (dy / d) * (clamped / S.JOY_R);
}

function checkMenuButtons(tx, ty) {
  const hb = S.ui.helpBtn;
  if (hb && tx>=hb.x && tx<=hb.x+hb.w && ty>=hb.y && ty<=hb.y+hb.h) {
    window.dispatchEvent(new CustomEvent('deepdiver:openHelp')); return true;
  }
  const nb = S.ui.nameBtn;
  if (nb && tx>=nb.x && tx<=nb.x+nb.w && ty>=nb.y && ty<=nb.y+nb.h) {
    window.dispatchEvent(new CustomEvent('deepdiver:openNameInput')); return true;
  }
  const fb = S.ui.friendsBtn;
  if (fb && tx>=fb.x && tx<=fb.x+fb.w && ty>=fb.y && ty<=fb.y+fb.h) {
    window.dispatchEvent(new CustomEvent('deepdiver:openFriends')); return true;
  }
  const lbBtn2 = S.ui.lbBtn;
  if (lbBtn2 && tx>=lbBtn2.x && tx<=lbBtn2.x+lbBtn2.w && ty>=lbBtn2.y && ty<=lbBtn2.y+lbBtn2.h) {
    window.dispatchEvent(new CustomEvent('deepdiver:openLeaderboard')); return true;
  }
  const rbtn = S.ui.raceBtn;
  if (rbtn && tx>=rbtn.x && tx<=rbtn.x+rbtn.w && ty>=rbtn.y && ty<=rbtn.y+rbtn.h) {
    window.dispatchEvent(new CustomEvent('deepdiver:lookForOpponent')); return true;
  }
  const lb = S.ui.langBtn;
  if (lb && tx>=lb.x && tx<=lb.x+lb.w && ty>=lb.y && ty<=lb.y+lb.h) {
    S.lang = S.lang === 'en' ? 'ru' : 'en';
    localStorage.setItem('deepdiver_lang', S.lang);
    return true;
  }
  const bd = S.ui.menuBtnDpad, bj = S.ui.menuBtnJoy;
  if (bd && tx>=bd.x && tx<=bd.x+bd.w && ty>=bd.y && ty<=bd.y+bd.h) { S.controlMode='dpad'; return true; }
  if (bj && tx>=bj.x && tx<=bj.x+bj.w && ty>=bj.y && ty<=bj.y+bj.h) { S.controlMode='joystick'; return true; }
  const bc = S.ui.btnCampaign, bs = S.ui.btnSandbox;
  if (bc && tx>=bc.x && tx<=bc.x+bc.w && ty>=bc.y && ty<=bc.y+bc.h) {
    S.gameMode='campaign'; window.dispatchEvent(new CustomEvent('deepdiver:startGame')); return true;
  }
  if (bs && tx>=bs.x && tx<=bs.x+bs.w && ty>=bs.y && ty<=bs.y+bs.h) {
    S.gameMode='sandbox'; window.dispatchEvent(new CustomEvent('deepdiver:startGame')); return true;
  }
  return false;
}

// ─── Keyboard ─────────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  S.keys[e.key] = true;
  if ((e.key === 'p' || e.key === 'P' || e.key === 'Escape') && S.state === 'play') S.paused = !S.paused;
  if (e.key === 'Enter' && S.state === 'dead') { S.state = 'menu'; }
  if (e.key === ' ' || e.code === 'Space') {
    if (S.state === 'play') S.paused = !S.paused;
    else if (S.state === 'dead') window.dispatchEvent(new CustomEvent('deepdiver:startGame'));
    else if (S.state === 'win')  window.dispatchEvent(new CustomEvent('deepdiver:startGame'));
    else if (S.state === 'levelup') window.dispatchEvent(new CustomEvent('deepdiver:levelUp'));
  }
  if (S.state === 'raceover' && (e.key === ' ' || e.key === 'Enter')) {
    S.state = 'menu'; S.gameMode = 'campaign'; S.raceState = 'idle'; S.raceRoom = null;
  }
  if (e.code === 'Space' && S.state === 'play' && S.gameMode === 'race') {
    window.dispatchEvent(new CustomEvent('deepdiver:activateNitro'));
  }
  if (e.key === ' ') e.preventDefault();
});

document.addEventListener('keyup', e => { S.keys[e.key] = false; });

// ─── Mouse ────────────────────────────────────────────────────────────────────
function updateMouse(clientX, clientY) {
  const r = S.canvas.getBoundingClientRect();
  S.mouse.x = (clientX - r.left) * (S.W / r.width);
  S.mouse.y = (clientY - r.top)  * (S.H / r.height);
}

S.canvas.addEventListener('mousemove', e => updateMouse(e.clientX, e.clientY));

S.canvas.addEventListener('mousedown', e => {
  updateMouse(e.clientX, e.clientY);
  if (S.state === 'menu') {
    const r = S.canvas.getBoundingClientRect();
    const cx = (e.clientX - r.left) * (S.W / r.width);
    const cy = (e.clientY - r.top)  * (S.H / r.height);
    checkMenuButtons(cx, cy); return;
  }
  if (S.state === 'dead') {
    const r = S.canvas.getBoundingClientRect();
    const cx = (e.clientX - r.left) * (S.W / r.width);
    const cy = (e.clientY - r.top)  * (S.H / r.height);
    const mb = S.ui.menuBackBtn;
    if (mb && cx>=mb.x && cx<=mb.x+mb.w && cy>=mb.y && cy<=mb.y+mb.h) { S.state = 'menu'; return; }
    window.dispatchEvent(new CustomEvent('deepdiver:startGame')); return;
  }
  if (S.state === 'play' && S.paused) {
    const r = S.canvas.getBoundingClientRect();
    const cx = (e.clientX - r.left) * (S.W / r.width);
    const cy = (e.clientY - r.top)  * (S.H / r.height);
    const pb = S.ui.pauseMenuBtn;
    if (pb && cx>=pb.x && cx<=pb.x+pb.w && cy>=pb.y && cy<=pb.y+pb.h) { S.paused = false; S.state = 'menu'; return; }
  }
  if (S.state === 'win') {
    const r = S.canvas.getBoundingClientRect();
    const cx = (e.clientX - r.left) * (S.W / r.width);
    const cy = (e.clientY - r.top)  * (S.H / r.height);
    const wb = S.ui.winMenuBtn;
    if (wb && cx>=wb.x && cx<=wb.x+wb.w && cy>=wb.y && cy<=wb.y+wb.h) { S.state='menu'; return; }
    window.dispatchEvent(new CustomEvent('deepdiver:startGame')); return;
  }
  S.mouse.down = true;
  if (S.state === 'levelup') window.dispatchEvent(new CustomEvent('deepdiver:levelUp'));
});

S.canvas.addEventListener('mouseup', () => { S.mouse.down = false; });

// ─── Touch ────────────────────────────────────────────────────────────────────
S.canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  const t0 = e.changedTouches[0];
  const { tx, ty } = getTouchCoords(t0);

  if (S.state === 'menu') { if (!checkMenuButtons(tx, ty)) window.dispatchEvent(new CustomEvent('deepdiver:startGame')); return; }
  if (S.state === 'dead') {
    const mb = S.ui.menuBackBtn;
    if (mb && tx>=mb.x && tx<=mb.x+mb.w && ty>=mb.y && ty<=mb.y+mb.h) {
      S.state='menu'; S.wins=0; S.level=1; return;
    }
    if (!checkMenuButtons(tx, ty)) window.dispatchEvent(new CustomEvent('deepdiver:startGame'));
    return;
  }
  if (S.state === 'win') {
    const wb = S.ui.winMenuBtn;
    if (wb && tx>=wb.x && tx<=wb.x+wb.w && ty>=wb.y && ty<=wb.y+wb.h) { S.state='menu'; return; }
    window.dispatchEvent(new CustomEvent('deepdiver:startGame')); return;
  }
  if (S.state === 'levelup') { window.dispatchEvent(new CustomEvent('deepdiver:levelUp')); return; }
  if (S.state !== 'play') return;

  if (S.paused) {
    const pmb = S.ui.pauseMenuBtn;
    if (pmb && tx>=pmb.x && tx<=pmb.x+pmb.w && ty>=pmb.y && ty<=pmb.y+pmb.h) {
      S.paused = false; S.state = 'menu'; return;
    }
  }

  for (const touch of e.changedTouches) {
    const { tx: cx, ty: cy } = getTouchCoords(touch);
    const pb = pauseBtn();
    if (hitBtn(pb, cx, cy)) { S.paused = !S.paused; continue; }
    if (S.controlMode === 'joystick') {
      if (!S.joy.active) {
        S.joy.active = true; S.joy.touchId = touch.identifier;
        S.joy.baseX = cx; S.joy.baseY = cy; S.joy.dx = 0; S.joy.dy = 0;
      }
    } else {
      for (const b of Object.values(dpadButtons())) {
        if (hitBtn(b, cx, cy)) { S.keys[b.key] = true; }
      }
    }
  }
}, { passive: false });

S.canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  for (const touch of e.changedTouches) {
    const { tx, ty } = getTouchCoords(touch);
    if (S.controlMode === 'joystick') {
      if (S.joy.active && touch.identifier === S.joy.touchId) joyUpdate(tx, ty);
    }
  }
}, { passive: false });

S.canvas.addEventListener('touchend', e => {
  e.preventDefault();
  for (const touch of e.changedTouches) {
    if (S.controlMode === 'joystick') {
      if (touch.identifier === S.joy.touchId) { S.joy.active = false; S.joy.dx = 0; S.joy.dy = 0; }
    } else {
      const { tx, ty } = getTouchCoords(touch);
      let anyDpad = false;
      for (const b of Object.values(dpadButtons())) {
        if (hitBtn(b, tx, ty)) { S.keys[b.key] = false; anyDpad = true; }
      }
      if (!anyDpad) S.mouse.down = false;
    }
  }
}, { passive: false });

// ─── Gesture / scroll blocking ────────────────────────────────────────────────
document.addEventListener('gesturestart',  e => e.preventDefault(), { passive: false });
document.addEventListener('gesturechange', e => e.preventDefault(), { passive: false });
document.addEventListener('gestureend',    e => e.preventDefault(), { passive: false });
document.addEventListener('contextmenu',   e => e.preventDefault());
document.addEventListener('touchmove',     e => e.preventDefault(), { passive: false });
