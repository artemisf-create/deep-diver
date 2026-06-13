// network.js — Firebase (primary) + Ably (fallback): scores, friends, race matchmaking
import { S } from './state.js';
import { saveFriends, saveAllPlayers, seedAllPlayers, fbSaveScore, fbSetPresence, fbLoadLeaderboard, fbUnloadLeaderboard, fbCountOnline, showNetBanner, showNetOk } from './db.js';

// ─── Firebase Auth ────────────────────────────────────────────────────────────

/**
 * Анонимный вход в Firebase.
 * После успешного входа обновляет S.playerId и вызывает fbSetPresence().
 * Если Firebase не настроен — тихо возвращается (используется локальный ID).
 */
export async function initFirebaseAuth() {
  // ── Шаг 1: Проверяем, что Firebase вообще загрузился ──
  if (!window.firebaseAuth) {
    console.warn('[FB Auth] window.firebaseAuth отсутствует — Firebase не инициализирован или конфиг не вставлен.');
    showNetBanner('⚠ Firebase не настроен — играем без облака', '⚠ Firebase not configured — offline mode');
    return;
  }

  // ── Шаг 2: Проверяем firebaseDB ──
  if (!window.firebaseDB) {
    console.error('[FB Auth] firebaseAuth есть, но window.firebaseDB отсутствует! Проверь, что Realtime Database создана в Firebase Console.');
    showNetBanner('⚠ Realtime Database не найдена', '⚠ Realtime Database not found');
    return;
  }

  // ── Шаг 3: Анонимный вход ──
  try {
    console.log('[FB Auth] Попытка анонимного входа...');
    const result = await window.firebaseAuth.signInAnonymously();
    S.playerId = result.user.uid;
    localStorage.setItem('deepdiver_pid', S.playerId);
    console.log('[FB Auth] ✅ Успешный вход, uid:', S.playerId);
    showNetOk();

    fbSetPresence();
    if (S.hiScore > 0) fbSaveScore();

  } catch (e) {
    // Детальный разбор по коду ошибки
    if (e.code === 'auth/operation-not-allowed') {
      console.error('[FB Auth] ❌ ОШИБКА: Anonymous Auth НЕ включён в Firebase Console!\n→ Authentication → Sign-in method → Anonymous → Enable');
      showNetBanner('⚠ Анонимный вход отключён в Firebase', '⚠ Anonymous Auth is disabled in Firebase');
    } else if (e.code === 'auth/network-request-failed') {
      console.error('[FB Auth] ❌ Нет сети при попытке авторизации:', e.message);
      showNetBanner('⚠ Нет интернета — играем локально', '⚠ No internet — local mode');
    } else {
      console.error('[FB Auth] ❌ Неизвестная ошибка авторизации:', e.code, e.message);
      showNetBanner('⚠ Firebase Auth ошибка: ' + e.code, '⚠ Firebase Auth error: ' + e.code);
    }
  }
}

// ─── Ably init ────────────────────────────────────────────────────────────────
export function initAbly() {
  if (S.ably) return true;

  // ── Проверяем наличие ключа ──
  if (!S.ABLY_KEY || S.ABLY_KEY.length < 10) {
    console.error('[Ably] ABLY_KEY не задан или пустой! Мультиплеер через Ably недоступен.');
    showNetBanner('⚠ Ably ключ не настроен — нет мультиплеера', '⚠ Ably key missing — no multiplayer');
    return false;
  }
  if (!S.playerId) {
    console.error('[Ably] playerId пустой при инициализации Ably!');
    return false;
  }

  try {
    S.ably = new window.Ably.Realtime({ key: S.ABLY_KEY, clientId: S.playerId });

    // ── Слушаем состояние подключения ──
    S.ably.connection.on('connected', () => {
      console.log('[Ably] ✅ Подключено');
      showNetOk();
    });
    S.ably.connection.on('failed', (err) => {
      console.error('[Ably] ❌ Подключение провалилось:', err && err.message);
      showNetBanner('⚠ Ably: нет подключения к мультиплееру', '⚠ Ably: multiplayer connection failed');
    });
    S.ably.connection.on('suspended', () => {
      console.warn('[Ably] Соединение приостановлено (нет сети?)');
      showNetBanner('⚠ Ably: соединение прервано', '⚠ Ably: connection suspended');
    });
    S.ably.connection.on('disconnected', () => {
      console.warn('[Ably] Отключено, переподключается...');
    });

    S.ablyLobby  = S.ably.channels.get('deepdiver:lobby');
    S.ablyMe     = S.ably.channels.get('deepdiver:player:' + S.playerId);
    S.ablyScores = S.ably.channels.get('deepdiver:scores');

    S.ablyScores.subscribe(function (msg) {
      if (msg.data && msg.data.id && msg.data.id !== S.playerId) {
        onScoreReceived(msg.data);
      }
    });

    function broadcastScore() {
      if (S.ably.connection.state !== 'connected') return;
      const myN = S.playerName || ('Diver#' + S.playerId.slice(-4));
      S.ablyScores.publish('score', { id: S.playerId, n: myN, s: S.hiScore, t: Date.now() });
    }
    broadcastScore();
    setInterval(broadcastScore, 5000);

    S.ablyMe.subscribe('hello', function () { broadcastScore(); });
    return true;
  } catch (e) {
    console.error('[Ably] init crashed:', e);
    showNetBanner('⚠ Ably: ошибка инициализации', '⚠ Ably: init error');
    return false;
  }
}

// ─── Score sync ───────────────────────────────────────────────────────────────
export function syncMyScore() {
  if (!S.ablyScores) return;
  if (S.ably && S.ably.connection.state !== 'connected') {
    console.warn('[Ably] syncMyScore пропущен — нет соединения (state:', S.ably.connection.state, ')');
    return;
  }
  try {
    S.ablyScores.publish('score', {
      id: S.playerId,
      n:  S.playerName || ('Diver#' + S.playerId.slice(-4)),
      s:  S.hiScore,
    });
  } catch (e) { console.warn('[Ably] syncMyScore error:', e); }
}

export function onScoreReceived(data) {
  if (!data || !data.id || !data.n) return;
  const isMe     = data.id === S.playerId;
  const isFriend = S.friends.some(f => f.id === data.id);
  S.allPlayers[data.id] = { n: data.n, s: data.s || 0, me: isMe, friend: isFriend, t: Date.now() };
  saveAllPlayers();
  if (isFriend) {
    const fi = S.friends.findIndex(f => f.id === data.id);
    if (fi >= 0 && data.s >= (S.friends[fi].s || 0)) {
      S.friends[fi].n = data.n; S.friends[fi].s = data.s || 0;
      saveFriends();
      renderFriendsList();
    }
  }
  const lbPanel = document.getElementById('leaderboardPanel');
  if (lbPanel && lbPanel.style.display !== 'none') renderLeaderboard();
}

// ─── Leaderboard ──────────────────────────────────────────────────────────────

function renderLeaderboardRows(rows, onlineCount, connected) {
  const ru     = S.lang === 'ru';
  const lbList = document.getElementById('lbList');
  const lbSub  = document.getElementById('lbSubtitle');

  if (!rows.length) {
    lbList.innerHTML = '<div id="lbLoading">' + (ru ? 'Нет данных' : 'No data yet') + '</div>';
    return;
  }
  const myRank = rows.findIndex(r => r.id === S.playerId);
  lbList.innerHTML = rows.map((r, i) => {
    const isMe     = r.id === S.playerId;
    const isFriend = S.friends.some(f => f.id === r.id);
    const medal    = i===0?'🥇':i===1?'🥈':i===2?'🥉':(i+1)+'.';
    const tag      = isMe?(ru?' 👤вы':' 👤you'):isFriend?' 🤝':'';
    const cls      = isMe?'lr me':isFriend?'lr friend':'lr';
    return '<div class="'+cls+'"><span class="lrank">'+medal+'</span>' +
      '<span class="lname">🤿 '+r.n+'<span class="ltag">'+tag+'</span></span>' +
      '<span class="lscore">◆ '+r.s+'</span></div>';
  }).join('');

  const connStatus = connected
    ? (ru ? '🟢 '+onlineCount+' онлайн' : '🟢 '+onlineCount+' online')
    : (ru ? '🔴 нет связи' : '🔴 offline');
  lbSub.textContent = (ru
    ? (rows.length+' в чарте'+(myRank>=0?' · место #'+(myRank+1):''))
    : (rows.length+' in chart'+(myRank>=0?' · rank #'+(myRank+1):'')))
    + ' · ' + connStatus;
}

export function renderLeaderboard() {
  const ru = S.lang === 'ru';
  seedAllPlayers();
  const now = Date.now();
  let onlineCount = 0;
  Object.values(S.allPlayers).forEach(p => {
    if (p.me || (p.t && now - p.t < 15000)) onlineCount++;
  });
  const rows = Object.entries(S.allPlayers)
    .map(([id, p]) => ({ id, n: p.n, s: p.s }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 100);

  const connected = S.ably && S.ably.connection && S.ably.connection.state === 'connected';
  renderLeaderboardRows(rows, onlineCount, connected);
}

export function openLeaderboard() {
  const ru = S.lang === 'ru';
  document.getElementById('lbTitle').textContent = ru ? '🏆 Таблица лидеров' : '🏆 Leaderboard';
  document.getElementById('lbClose').textContent = ru ? 'Закрыть' : 'Close';
  const lbPanel = document.getElementById('leaderboardPanel');
  lbPanel.style.display = 'flex';

  // ── Firebase приоритет ──
  if (window.firebaseDB) {
    const user = window.firebaseAuth && window.firebaseAuth.currentUser;
    if (!user) {
      console.error('[LB] openLeaderboard: Firebase DB есть, но пользователь НЕ авторизован! Таблица может быть пустой из-за Security Rules.');
    }

    document.getElementById('lbSubtitle').textContent = ru ? 'Загрузка…' : 'Loading…';
    let onlineCount = 0;

    fbCountOnline(n => { onlineCount = n; });

    fbLoadLeaderboard(rows => {
      if (!rows.find(r => r.id === S.playerId) && S.hiScore > 0) {
        rows.push({ id: S.playerId, n: S.playerName || ('Diver#' + S.playerId.slice(-4)), s: S.hiScore });
        rows.sort((a, b) => b.s - a.s);
      }
      renderLeaderboardRows(rows, onlineCount, true);
    });

    var fbLbInterval = setInterval(() => {
      if (lbPanel.style.display === 'none') {
        clearInterval(fbLbInterval);
        fbUnloadLeaderboard();
        window.firebaseDB.ref('presence').off('value');
      }
    }, 1000);
    return;
  }

  // ── Fallback: Ably ──
  console.warn('[LB] Firebase недоступен, используем Ably fallback');
  if (!initAbly()) {
    document.getElementById('lbSubtitle').textContent = ru ? '🔴 Нет интернета' : '🔴 No internet';
    renderLeaderboard(); return;
  }
  syncMyScore();
  renderLeaderboard();
  var lbIv = setInterval(() => {
    if (lbPanel.style.display === 'none') { clearInterval(lbIv); return; }
    renderLeaderboard();
  }, 1000);
}

// ─── Friends ──────────────────────────────────────────────────────────────────
export function subscribeFriend(fid) {
  if (!initAbly()) return;
  try { S.ably.channels.get('deepdiver:player:' + fid).publish('hello', { id: S.playerId }); } catch (e) {}
}

export function renderFriendsList() {
  const fpList = document.getElementById('friendsList');
  if (!fpList) return;
  if (!S.friends.length) {
    fpList.innerHTML = '<div class="empty">' + (S.lang==='ru' ? 'Пока нет друзей' : 'No friends yet') + '</div>';
    return;
  }
  const sorted = [...S.friends].sort((a, b) => b.s - a.s);
  fpList.innerHTML = sorted.map((f, i) =>
    '<div class="fr">' +
    '<span style="color:rgba(255,255,255,.5);margin-right:8px">' + (i+1) + '.</span>' +
    '<span class="fname">🤿 ' + f.n + '</span>' +
    '<span class="fscore" style="margin-left:auto">◆ ' + f.s + '</span>' +
    '<span class="fdel" data-id="' + f.id + '" title="Remove">✕</span>' +
    '</div>'
  ).join('');
  fpList.querySelectorAll('.fdel').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      S.friends = S.friends.filter(f => f.id !== btn.dataset.id);
      saveFriends(); renderFriendsList();
    });
  });
}

export function openFriendsPanel() {
  const ru = S.lang === 'ru';
  document.getElementById('fpTitle').textContent      = ru ? '👥 Друзья' : '👥 Friends';
  document.getElementById('fpMyCode').textContent     = ru ? 'Твой код (отправь другу один раз):' : 'Your code (share once with a friend):';
  document.getElementById('fpHint').textContent       = ru ? 'Нажми чтобы скопировать. Рекорды обновляются сами!' : 'Click to copy. Scores sync automatically!';
  document.getElementById('friendCodeInput').placeholder = ru ? 'Вставь код друга…' : "Paste friend's code…";
  document.getElementById('addFriendBtn').textContent = ru ? 'Добавить' : 'Add';
  document.getElementById('friendsClose').textContent = ru ? 'Закрыть' : 'Close';
  document.getElementById('myCode').textContent = btoa(S.playerId);
  document.getElementById('fpMsg').textContent  = '';
  document.getElementById('friendCodeInput').value = '';
  renderFriendsList();
  document.getElementById('friendsPanel').style.display = 'block';
}

// ─── Firebase race ─────────────────────────────────────────────────────────────
export function startRaceFirebase(roomId) {
  if (!window.firebaseDB) return false;
  const raceRef = window.firebaseDB.ref('races/' + roomId + '/pos');

  raceRef.on('child_changed', snap => {
    if (snap.key === S.playerId) return;
    const d = snap.val();
    if (!d) return;
    S.opponentPos.x     = d.x    || 0;
    S.opponentPos.y     = d.y    || 0;
    S.opponentPos.vx    = d.vx   || 0;
    S.opponentPos.dist  = d.dist || 0;
    S.opponentPos.nitro = d.nitro || 0;
    if (d.dist >= 500 && S.raceState === 'racing' && !S.raceWinner) {
      S.raceWinner = 'them'; S.raceState = 'finished';
      setTimeout(() => { S.state = 'raceover'; }, 600);
    }
  }, err => {
    console.error('[FB Race] Ошибка чтения позиции соперника:', err.code, err.message);
  });

  S._syncRacePos = function () {
    if (!window.firebaseDB || S.raceState !== 'racing') return;
    raceRef.child(S.playerId).set({
      x:    Math.round(S.player.x),
      y:    Math.round(S.player.y),
      vx:   Math.round(S.player.vx * 10) / 10,
      dist: S.distM,
      nitro: S.nitro,
      t:    Date.now(),
    }).catch(e => {
      console.error('[FB Race] Ошибка записи позиции:', e.code, e.message);
    });
  };

  window.addEventListener('deepdiver:raceEnd', function onRaceEnd() {
    window.removeEventListener('deepdiver:raceEnd', onRaceEnd);
    raceRef.off();
    window.firebaseDB.ref('races/' + roomId).remove().catch(() => {});
  }, { once: true });

  return true;
}

// ─── Firebase lobby ────────────────────────────────────────────────────────────
let fbLobbyRef = null;
let fbMyLobbyRef = null;

export function lookForOpponentFirebase() {
  if (!window.firebaseDB) return false;

  const user = window.firebaseAuth && window.firebaseAuth.currentUser;
  if (!user) {
    console.error('[FB Lobby] Попытка войти в лобби без авторизации! Это заблокируют Security Rules.');
    showNetBanner('⚠ Не авторизован — лобби недоступно', '⚠ Not signed in — lobby unavailable');
    return false;
  }

  S.raceState = 'looking';
  document.getElementById('raceLookingPanel').style.display = 'block';
  updateRaceTexts();

  const myName = S.playerName || ('Diver#' + S.playerId.slice(-4));
  fbLobbyRef   = window.firebaseDB.ref('lobby');
  fbMyLobbyRef = fbLobbyRef.child(S.playerId);

  // ── Таймаут 30 сек ──
  const matchTimeout = setTimeout(() => {
    if (S.raceState === 'looking' || S.raceState === 'waiting_response') {
      console.warn('[FB Lobby] Таймаут — соперник не найден за 30 сек');
      cleanup();
      cancelLooking();
      alert(S.lang === 'ru'
        ? 'Не удалось найти соперника. Попробуйте позже.'
        : 'Could not find an opponent. Try again later.');
    }
  }, 30000);

  fbMyLobbyRef.set({ n: myName, status: 'waiting', t: Date.now() })
    .then(() => console.log('[FB Lobby] Вошли в лобби как', S.playerId))
    .catch(e => {
      console.error('[FB Lobby] set() FAILED — Security Rules блокируют запись в /lobby:', e.code, e.message);
      clearTimeout(matchTimeout);
      cancelLooking();
      showNetBanner('⚠ Нет прав доступа к лобби. Проверь Rules', '⚠ Lobby access denied. Check Rules');
    });
  fbMyLobbyRef.onDisconnect().remove();

  const myInboxRef = window.firebaseDB.ref('inbox/' + S.playerId);
  myInboxRef.remove();

  function cleanup() {
    clearTimeout(matchTimeout);
    if (fbMyLobbyRef) { fbMyLobbyRef.remove(); fbMyLobbyRef = null; }
    if (fbLobbyRef)   { fbLobbyRef.off(); fbLobbyRef = null; }
    myInboxRef.off();
  }

  myInboxRef.on('child_added', snap => {
    const msg = snap.val();
    if (!msg || !msg.type) return;

    if (msg.type === 'challenge' && (S.raceState === 'looking' || S.raceState === 'waiting_response')) {
      S.raceState = 'challenged';
      fbMyLobbyRef.update({ status: 'busy' });
      document.getElementById('raceLookingPanel').style.display = 'none';
      const panel = document.getElementById('raceChallengePanel');
      document.getElementById('rcSub').textContent = (S.lang==='ru'?'от ':'from ') + msg.name;
      panel.style.display = 'block';
      updateRaceTexts();

      document.getElementById('rcAccept').onclick = function () {
        const seed = Date.now();
        S.raceRoom = { opponentId: msg.from, opponentName: msg.name, seed };
        window.firebaseDB.ref('inbox/' + msg.from).push({ type: 'response', ok: true, seed });
        panel.style.display = 'none';
        cleanup();
        startCountdown();
      };
      document.getElementById('rcReject').onclick = function () {
        window.firebaseDB.ref('inbox/' + msg.from).push({ type: 'response', ok: false });
        panel.style.display = 'none';
        S.raceState = 'looking';
        fbMyLobbyRef.update({ status: 'waiting' });
      };
    }

    if (msg.type === 'response' && S.raceState === 'waiting_response') {
      myInboxRef.off();
      if (msg.ok) {
        S.raceRoom.seed = msg.seed;
        document.getElementById('raceLookingPanel').style.display = 'none';
        cleanup();
        startCountdown();
      } else {
        S.raceRoom = null; S.raceState = 'looking';
        fbMyLobbyRef.update({ status: 'waiting' });
      }
    }
  }, err => {
    console.error('[FB Lobby] inbox read FAILED:', err.code, err.message);
  });

  function tryChallenge(uid, data) {
    if (S.raceState !== 'looking') return;
    if (!data || uid === S.playerId || data.status !== 'waiting') return;
    if (S.playerId < uid) {
      S.raceState = 'waiting_response';
      S.raceRoom  = { opponentId: uid, opponentName: data.n || uid, seed: null };
      fbMyLobbyRef.update({ status: 'busy' });
      window.firebaseDB.ref('inbox/' + uid).push({ type: 'challenge', from: S.playerId, name: myName });
    }
  }

  fbLobbyRef.on('child_added',   snap => { tryChallenge(snap.key, snap.val()); });
  fbLobbyRef.on('child_changed', snap => { tryChallenge(snap.key, snap.val()); });
  fbLobbyRef.once('value', snap => {
    const all = snap.val() || {};
    Object.entries(all).forEach(([k, v]) => tryChallenge(k, v));
  });

  S._fbLobbyCleanup = cleanup;
  return true;
}

// ─── Race matchmaking ─────────────────────────────────────────────────────────
let lobbyPresence = null;

export function lookForOpponent() {
  if (window.firebaseDB) {
    lookForOpponentFirebase();
    return;
  }
  console.warn('[Match] Firebase недоступен, пробуем Ably...');
  if (!initAbly()) {
    alert(S.lang==='ru' ? 'Нет подключения. Проверь интернет.' : 'No connection. Check internet.');
    return;
  }
  S.raceState = 'looking';
  document.getElementById('raceLookingPanel').style.display = 'block';
  updateRaceTexts();

  const myName = S.playerName || ('Diver#' + S.playerId.slice(-4));
  lobbyPresence = S.ably.channels.get('deepdiver:lobby-v2');

  S.ablyMe.subscribe('challenge', msg => {
    if (S.raceState !== 'looking' && S.raceState !== 'waiting_response') return;
    const d = msg.data;
    if (!d || !d.from) return;
    S.raceState = 'challenged';
    lobbyPresence.presence.update({ status: 'busy' });
    document.getElementById('raceLookingPanel').style.display = 'none';
    const panel = document.getElementById('raceChallengePanel');
    document.getElementById('rcSub').textContent = (S.lang==='ru'?'от ':'from ') + d.name;
    panel.style.display = 'block';
    updateRaceTexts();
    document.getElementById('rcAccept').onclick = function () {
      const seed = Date.now();
      S.raceRoom = { opponentId: d.from, opponentName: d.name, seed };
      S.ably.channels.get('deepdiver:player:' + d.from).publish('response', { ok: true, seed });
      panel.style.display = 'none';
      lobbyPresence.presence.leave();
      startCountdown();
    };
    document.getElementById('rcReject').onclick = function () {
      S.ably.channels.get('deepdiver:player:' + d.from).publish('response', { ok: false });
      panel.style.display = 'none';
      S.raceState = 'looking';
      lobbyPresence.presence.update({ status: 'waiting', name: myName });
    };
  });

  lobbyPresence.presence.subscribe('enter',  m => { tryChallenge(m.clientId, m.data); });
  lobbyPresence.presence.subscribe('update', m => { tryChallenge(m.clientId, m.data); });

  function tryChallenge(uid, data) {
    if (S.raceState !== 'looking') return;
    if (!data || uid === S.playerId || data.status !== 'waiting') return;
    if (S.playerId < uid) {
      S.raceState = 'waiting_response';
      S.raceRoom = { opponentId: uid, opponentName: data.name || uid, seed: null };
      S.ably.channels.get('deepdiver:player:' + uid).publish('challenge', { from: S.playerId, name: myName });
      S.ablyMe.subscribe('response', msg2 => {
        S.ablyMe.unsubscribe('response');
        if (!msg2.data) return;
        if (msg2.data.ok) {
          S.raceRoom.seed = msg2.data.seed;
          document.getElementById('raceLookingPanel').style.display = 'none';
          lobbyPresence.presence.leave();
          startCountdown();
        } else {
          S.raceRoom = null; S.raceState = 'looking';
          lobbyPresence.presence.update({ status: 'waiting', name: myName });
        }
      });
    }
  }

  lobbyPresence.presence.enter({ status: 'waiting', name: myName }, () => {
    lobbyPresence.presence.get((err, members) => {
      if (err || !members) return;
      members.forEach(m => { tryChallenge(m.clientId, m.data); });
    });
  });
}

export function cancelLooking() {
  S.raceState = 'idle';
  if (S._fbLobbyCleanup) { S._fbLobbyCleanup(); S._fbLobbyCleanup = null; }
  if (lobbyPresence) { lobbyPresence.presence.leave(); lobbyPresence.presence.unsubscribe(); lobbyPresence = null; }
  if (S.ablyMe) S.ablyMe.unsubscribe();
  document.getElementById('raceLookingPanel').style.display = 'none';
}

// ─── Countdown ────────────────────────────────────────────────────────────────
export function startCountdown() {
  S.raceState = 'countdown';
  const panel = document.getElementById('raceCountdownPanel');
  const numEl = document.getElementById('raceCountNum');
  document.getElementById('rcdSub').textContent = 'vs ' + S.raceRoom.opponentName;
  panel.style.display = 'block';
  let n = 3; numEl.textContent = n;
  const iv = setInterval(() => {
    n--;
    if (n > 0) { numEl.textContent = n; }
    else {
      numEl.textContent = 'GO!';
      clearInterval(iv);
      setTimeout(() => {
        panel.style.display = 'none';
        window.dispatchEvent(new CustomEvent('deepdiver:startRace', { detail: S.raceRoom }));
      }, 700);
    }
  }, 1000);
}

// ─── Race position sync ───────────────────────────────────────────────────────
export function syncRacePos() {
  if (!S.ablyRaceChannel || S.raceState !== 'racing') return;
  S.ablyRaceChannel.publish('pos', {
    id: S.playerId,
    x: Math.round(S.player.x), y: Math.round(S.player.y),
    vx: Math.round(S.player.vx * 10) / 10,
    dist: S.distM, nitro: S.nitro,
  });
}

export function activateNitro() {
  if (S.nitro <= 0 || S.nitroActive > 0) return;
  S.nitro--; S.nitroActive = 90;
}

// ─── Race UI texts ────────────────────────────────────────────────────────────
function updateRaceTexts() {
  const ru = S.lang === 'ru';
  document.getElementById('rlTitle').textContent  = ru ? 'Ищем соперника…' : 'Looking for opponent…';
  document.getElementById('rlSub').textContent    = ru ? 'Ищем свободного игрока' : 'Searching for a free player';
  document.getElementById('rlCancel').textContent = ru ? 'Отмена' : 'Cancel';
  document.getElementById('rcTitle').textContent  = ru ? 'Вызов на гонку!' : 'Race challenge!';
  document.getElementById('rcAccept').textContent = ru ? 'Принять' : 'Accept';
  document.getElementById('rcReject').textContent = ru ? 'Отклонить' : 'Decline';
}

// ─── DOM event listeners for panels ──────────────────────────────────────────
document.getElementById('lbClose').addEventListener('click', () => {
  document.getElementById('leaderboardPanel').style.display = 'none';
});
document.getElementById('friendsClose').addEventListener('click', () => {
  document.getElementById('friendsPanel').style.display = 'none';
});
document.getElementById('rlCancel').addEventListener('click', cancelLooking);

document.getElementById('myCode').addEventListener('click', () => {
  const code = btoa(S.playerId);
  document.getElementById('myCode').textContent = code;
  if (navigator.clipboard) navigator.clipboard.writeText(code).catch(() => {});
  document.getElementById('myCode').style.color = '#44ffaa';
  setTimeout(() => { document.getElementById('myCode').style.color = ''; }, 1200);
});

document.getElementById('addFriendBtn').addEventListener('click', () => {
  const friendCodeIn = document.getElementById('friendCodeInput');
  const fpMsg = document.getElementById('fpMsg');
  const code = friendCodeIn.value.trim();
  if (!code) return;
  let fid;
  try { fid = atob(code); } catch (e) { fid = null; }
  if (!fid || fid.length < 5) {
    fpMsg.textContent = S.lang === 'ru' ? '❌ Неверный код' : '❌ Invalid code'; return;
  }
  if (fid === S.playerId) {
    fpMsg.textContent = S.lang === 'ru' ? '😅 Это твой собственный код!' : '😅 That is your own code!'; return;
  }
  if (S.friends.find(f => f.id === fid)) {
    fpMsg.textContent = S.lang === 'ru' ? 'Уже в списке!' : 'Already added!'; return;
  }
  S.friends.push({ id: fid, n: '…', s: 0 });
  saveFriends();
  subscribeFriend(fid);
  friendCodeIn.value = '';
  fpMsg.textContent = S.lang === 'ru' ? '✅ Добавлен! Загружаем данные…' : '✅ Added! Loading data…';
  renderFriendsList();
});

document.getElementById('friendCodeInput').addEventListener('keydown',   e => { if (e.key === 'Enter') document.getElementById('addFriendBtn').click(); e.stopPropagation(); });
document.getElementById('friendCodeInput').addEventListener('keyup',     e => { e.stopPropagation(); });
document.getElementById('friendCodeInput').addEventListener('mousedown', e => { e.stopPropagation(); });
document.getElementById('friendCodeInput').addEventListener('touchstart', e => { e.stopPropagation(); });
