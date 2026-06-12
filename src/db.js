// db.js — localStorage persistence + Firebase sync
import { S } from './state.js';

// ─── Network status banner ────────────────────────────────────────────────────
// Показывает / скрывает плашку "Firebase недоступен" в UI

let _bannerTimeout = null;

export function showNetBanner(msgRu, msgEn) {
  let banner = document.getElementById('netBanner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'netBanner';
    Object.assign(banner.style, {
      position: 'fixed', top: '8px', left: '50%', transform: 'translateX(-50%)',
      background: 'rgba(200,40,40,0.92)', color: '#fff',
      padding: '7px 18px', borderRadius: '8px', fontSize: '13px',
      fontFamily: 'monospace', zIndex: '9999', pointerEvents: 'none',
      boxShadow: '0 2px 8px rgba(0,0,0,.5)', transition: 'opacity .4s',
    });
    document.body.appendChild(banner);
  }
  banner.textContent = S.lang === 'ru' ? msgRu : msgEn;
  banner.style.opacity = '1';
  clearTimeout(_bannerTimeout);
  _bannerTimeout = setTimeout(() => { banner.style.opacity = '0'; }, 5000);
}

export function showNetOk() {
  const banner = document.getElementById('netBanner');
  if (banner) banner.style.opacity = '0';
}

// ─── Persistence ──────────────────────────────────────────────────────────────
export function saveProgress() {
  localStorage.setItem('deepdiver', JSON.stringify({ hiScore: S.hiScore, level: S.level, wins: S.wins }));
  if (S.ablyScores) {
    try {
      S.ablyScores.publish('score', {
        id: S.playerId,
        n:  S.playerName || ('Diver#' + S.playerId.slice(-4)),
        s:  S.hiScore,
      });
    } catch (e) { console.warn('[Ably] publish score error:', e); }
  }
  fbSaveScore();
  fsUpdateLeaderboard();
}

export function loadProgress() {
  try {
    const d = JSON.parse(localStorage.getItem('deepdiver') || '{}');
    if (d.hiScore) S.hiScore = d.hiScore;
    if (d.level)   S.level   = d.level;
    if (d.wins)    S.wins    = d.wins;
  } catch (e) { console.error('[DB] loadProgress parse error:', e); }
}

export function saveFriends() {
  localStorage.setItem('deepdiver_friends', JSON.stringify(S.friends));
}

export function saveAllPlayers() {
  const toSave = {};
  Object.entries(S.allPlayers).forEach(([id, p]) => {
    if (!p.me) toSave[id] = { n: p.n, s: p.s };
  });
  localStorage.setItem('deepdiver_players', JSON.stringify(toSave));
}

export function seedAllPlayers() {
  S.allPlayers[S.playerId] = {
    n: S.playerName || ('Diver#' + S.playerId.slice(-4)),
    s: S.hiScore,
    me: true,
  };
  S.friends.forEach(f => {
    if (!S.allPlayers[f.id] || S.allPlayers[f.id].s < f.s)
      S.allPlayers[f.id] = { n: f.n, s: f.s || 0, friend: true };
  });
}

// ─── Firebase: score sync ─────────────────────────────────────────────────────

/** Записывает рекорд в RTDB /scores/{uid} */
export async function fbSaveScore() {
  if (!window.firebaseDB) return;

  // ── Проверка: Auth должен быть выполнен ──
  const user = window.firebaseAuth && window.firebaseAuth.currentUser;
  if (!user) {
    console.error('[FB] fbSaveScore — пользователь НЕ авторизован! Auth мог упасть. Попытка переавторизации...');
    showNetBanner('⚠ Не авторизован — рекорд не сохранён', '⚠ Not signed in — score not saved');
    // Пробуем переавторизоваться
    try { await window.firebaseAuth.signInAnonymously(); }
    catch (e) { console.error('[FB] Повторная авторизация провалилась:', e); return; }
  }

  if (!S.playerId) {
    console.error('[FB] fbSaveScore — playerId пустой! Синхронизация невозможна.');
    return;
  }

  try {
    await window.firebaseDB.ref('scores/' + S.playerId).set({
      n: S.playerName || ('Diver#' + S.playerId.slice(-4)),
      s: S.hiScore,
      t: Date.now(),
    });
    console.log('[FB] Score saved OK:', S.hiScore);
    showNetOk();
  } catch (e) {
    console.error('[FB] fbSaveScore FAILED — скорее всего Security Rules блокируют запись. Проверь правила RTDB!', e.code, e.message);
    if (e.code === 'PERMISSION_DENIED') {
      showNetBanner('⚠ Firebase: нет прав записи. Проверь Security Rules', '⚠ Firebase: permission denied. Check Security Rules');
    } else {
      showNetBanner('⚠ Firebase недоступен — рекорд сохранён локально', '⚠ Firebase offline — score saved locally');
    }
  }
}

/** Подписывается на топ-100 из RTDB /scores и вызывает callback(rows[]) */
export function fbLoadLeaderboard(callback) {
  if (!window.firebaseDB) {
    console.error('[FB] fbLoadLeaderboard — firebaseDB не инициализирован!');
    return;
  }
  console.log('[FB] Подписываемся на /scores...');
  window.firebaseDB.ref('scores').orderByChild('s').limitToLast(100)
    .on('value', snap => {
      const data = snap.val() || {};
      const rows = Object.entries(data)
        .map(([id, v]) => ({ id, n: v.n, s: v.s, t: v.t }))
        .sort((a, b) => b.s - a.s);
      console.log('[FB] Leaderboard loaded:', rows.length, 'entries');
      callback(rows);
    }, err => {
      console.error('[FB] fbLoadLeaderboard READ FAILED — Security Rules или сеть:', err.code, err.message);
      if (err.code === 'PERMISSION_DENIED') {
        showNetBanner('⚠ Нет доступа к лидерборду. Проверь Rules', '⚠ Leaderboard access denied. Check Rules');
      } else {
        showNetBanner('⚠ Firebase недоступен — показываем локальных игроков', '⚠ Firebase offline — showing local players');
      }
      callback([]); // fallback — пустой список, network.js отрисует локальных
    });
}

/** Отписывается от лидерборда */
export function fbUnloadLeaderboard() {
  if (!window.firebaseDB) return;
  window.firebaseDB.ref('scores').off('value');
  console.log('[FB] Unsubscribed from /scores');
}

/** Устанавливает онлайн-присутствие в RTDB /presence/{uid} */
export function fbSetPresence() {
  if (!window.firebaseDB) return;
  if (!S.playerId) { console.error('[FB] fbSetPresence — playerId пустой!'); return; }

  try {
    const presRef = window.firebaseDB.ref('presence/' + S.playerId);
    presRef.set({
      n: S.playerName || ('Diver#' + S.playerId.slice(-4)),
      s: S.hiScore,
      online: true,
      t: Date.now(),
    });
    presRef.onDisconnect().remove();
    console.log('[FB] Presence set OK for', S.playerId);
  } catch (e) {
    console.error('[FB] fbSetPresence error:', e.code, e.message);
  }
}

/** Считает онлайн-игроков через /presence */
export function fbCountOnline(callback) {
  if (!window.firebaseDB) return;
  window.firebaseDB.ref('presence').on('value', snap => {
    const data = snap.val() || {};
    callback(Object.keys(data).length);
  }, err => {
    console.error('[FB] fbCountOnline READ FAILED:', err.code, err.message);
    callback(0);
  });
}

/** Сохраняет топ-рекорд в Firestore /leaderboard/{uid} (только если новый рекорд выше) */
export async function fsUpdateLeaderboard() {
  if (!window.firebaseFS) return;
  if (!S.playerId) { console.error('[FS] fsUpdateLeaderboard — playerId пустой!'); return; }

  try {
    const docRef = window.firebaseFS.collection('leaderboard').doc(S.playerId);
    const snap   = await docRef.get();
    const prev   = snap.exists ? (snap.data().score || 0) : 0;
    if (S.hiScore > prev) {
      await docRef.set({
        name:      S.playerName || ('Diver#' + S.playerId.slice(-4)),
        score:     S.hiScore,
        updatedAt: window.firebase && window.firebase.firestore
          ? window.firebase.firestore.FieldValue.serverTimestamp()
          : Date.now(),
      });
      console.log('[FS] Leaderboard updated:', S.hiScore);
    }
  } catch (e) {
    console.error('[FS] fsUpdateLeaderboard FAILED — проверь Security Rules Firestore!', e.code, e.message);
    if (e.code === 'permission-denied') {
      showNetBanner('⚠ Firestore: нет прав записи. Проверь Rules', '⚠ Firestore: permission denied');
    }
  }
}
