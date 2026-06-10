// db.js — localStorage persistence + Firebase sync
import { S } from './state.js';

export function saveProgress() {
  localStorage.setItem('deepdiver', JSON.stringify({ hiScore: S.hiScore, level: S.level, wins: S.wins }));
  // Publish score to Ably if connected (fallback)
  if (S.ablyScores) {
    try {
      S.ablyScores.publish('score', {
        id: S.playerId,
        n: S.playerName || ('Diver#' + S.playerId.slice(-4)),
        s: S.hiScore,
      });
    } catch (e) {}
  }
  // Firebase sync (primary) — async, не блокирует
  fbSaveScore();
  fsUpdateLeaderboard();
}

export function loadProgress() {
  try {
    const d = JSON.parse(localStorage.getItem('deepdiver') || '{}');
    if (d.hiScore) S.hiScore = d.hiScore;
    if (d.level)   S.level   = d.level;
    if (d.wins)    S.wins    = d.wins;
  } catch (e) {}
}

export function saveFriends() {
  localStorage.setItem('deepdiver_friends', JSON.stringify(S.friends));
}

export function saveAllPlayers() {
  const toSave = {};
  Object.entries(S.allPlayers).forEach(function (e) {
    if (!e[1].me) toSave[e[0]] = { n: e[1].n, s: e[1].s };
  });
  localStorage.setItem('deepdiver_players', JSON.stringify(toSave));
}

export function seedAllPlayers() {
  S.allPlayers[S.playerId] = {
    n: S.playerName || ('Diver#' + S.playerId.slice(-4)),
    s: S.hiScore,
    me: true,
  };
  S.friends.forEach(function (f) {
    if (!S.allPlayers[f.id] || S.allPlayers[f.id].s < f.s)
      S.allPlayers[f.id] = { n: f.n, s: f.s || 0, friend: true };
  });
}

// ─── Firebase: score sync ─────────────────────────────────────────────────────

/** Записывает рекорд в RTDB /scores/{uid} */
export async function fbSaveScore() {
  if (!window.firebaseDB || !S.playerId) return;
  try {
    const ref = window.firebaseDB.ref('scores/' + S.playerId);
    await ref.set({
      n: S.playerName || ('Diver#' + S.playerId.slice(-4)),
      s: S.hiScore,
      t: Date.now(),
    });
  } catch (e) { console.warn('[FB] fbSaveScore error:', e); }
}

/** Подписывается на топ-100 из RTDB /scores и вызывает callback(rows[]) */
export function fbLoadLeaderboard(callback) {
  if (!window.firebaseDB) return;
  window.firebaseDB.ref('scores').orderByChild('s').limitToLast(100)
    .on('value', function (snap) {
      const data = snap.val() || {};
      const rows = Object.entries(data)
        .map(function (e) { return { id: e[0], n: e[1].n, s: e[1].s, t: e[1].t }; })
        .sort(function (a, b) { return b.s - a.s; });
      callback(rows);
    });
}

/** Отписывается от лидерборда */
export function fbUnloadLeaderboard() {
  if (!window.firebaseDB) return;
  window.firebaseDB.ref('scores').off('value');
}

/** Устанавливает онлайн-присутствие в RTDB /presence/{uid} */
export function fbSetPresence() {
  if (!window.firebaseDB || !S.playerId) return;
  try {
    const presRef = window.firebaseDB.ref('presence/' + S.playerId);
    presRef.set({
      n: S.playerName || ('Diver#' + S.playerId.slice(-4)),
      s: S.hiScore,
      online: true,
      t: Date.now(),
    });
    presRef.onDisconnect().remove();
  } catch (e) { console.warn('[FB] fbSetPresence error:', e); }
}

/** Считает онлайн-игроков через /presence */
export function fbCountOnline(callback) {
  if (!window.firebaseDB) return;
  window.firebaseDB.ref('presence').on('value', function (snap) {
    const data = snap.val() || {};
    callback(Object.keys(data).length);
  });
}

/** Сохраняет топ-рекорд в Firestore /leaderboard/{uid} (только если новый рекорд выше) */
export async function fsUpdateLeaderboard() {
  if (!window.firebaseFS || !S.playerId) return;
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
    }
  } catch (e) { console.warn('[FB] fsUpdateLeaderboard error:', e); }
}
