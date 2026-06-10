// network.js — Firebase (primary) + Ably (fallback): scores, friends, race matchmaking
import { S } from './state.js';
import { saveFriends, saveAllPlayers, seedAllPlayers, fbSaveScore, fbSetPresence, fbLoadLeaderboard, fbUnloadLeaderboard, fbCountOnline } from './db.js';

// ─── Firebase Auth ────────────────────────────────────────────────────────────

/**
 * Анонимный вход в Firebase.
 * После успешного входа обновляет S.playerId и вызывает fbSetPresence().
 * Если Firebase не настроен — тихо возвращается (используется локальный ID).
 */
export async function initFirebaseAuth() {
  if (!window.firebaseAuth) return;
  try {
    const result = await window.firebaseAuth.signInAnonymously();
    S.playerId = result.user.uid;
    localStorage.setItem('deepdiver_pid', S.playerId);
    console.log('[FB Auth] signed in as', S.playerId);
    fbSetPresence();
    // Если уже есть рекорд — сразу синхронизируем
    if (S.hiScore > 0) fbSaveScore();
  } catch (e) {
    console.warn('[FB Auth] anonymous sign-in failed, using local ID:', e.message);
  }
}

// ─── Ably init ────────────────────────────────────────────────────────────────
export function initAbly() {
  if (S.ably) return true;
  try {
    S.ably = new window.Ably.Realtime({ key: S.ABLY_KEY, clientId: S.playerId });
    S.ablyLobby  = S.ably.channels.get('deepdiver:lobby');
    S.ablyMe     = S.ably.channels.get('deepdiver:player:' + S.playerId);
    S.ablyScores = S.ably.channels.get('deepdiver:scores');

    S.ablyScores.subscribe(function (msg) {
      if (msg.data && msg.data.id && msg.data.id !== S.playerId) {
        onScoreReceived(msg.data);
      }
    });

    function broadcastScore() {
      const myN = S.playerName || ('Diver#' + S.playerId.slice(-4));
      S.ablyScores.publish('score', { id: S.playerId, n: myN, s: S.hiScore, t: Date.now() });
    }
    broadcastScore();
    setInterval(broadcastScore, 5000);

    S.ablyMe.subscribe('hello', function () { broadcastScore(); });
    return true;
  } catch (e) {
    console.error('Ably init failed:', e);
    return false;
  }
}

// ─── Score sync ───────────────────────────────────────────────────────────────
export function syncMyScore() {
  if (!S.ablyScores) return;
  try {
    S.ablyScores.publish('score', {
      id: S.playerId,
      n: S.playerName || ('Diver#' + S.playerId.slice(-4)),
      s: S.hiScore,
    });
  } catch (e) {}
}

export function onScoreReceived(data) {
  if (!data || !data.id || !data.n) return;
  const isMe     = data.id === S.playerId;
  const isFriend = S.friends.some(function (f) { return f.id === data.id; });
  S.allPlayers[data.id] = { n: data.n, s: data.s || 0, me: isMe, friend: isFriend, t: Date.now() };
  saveAllPlayers();
  if (isFriend) {
    const fi = S.friends.findIndex(function (f) { return f.id === data.id; });
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

/** Рисует строки лидерборда из переданного массива rows */
function renderLeaderboardRows(rows, onlineCount, connected) {
  const ru      = S.lang === 'ru';
  const lbList  = document.getElementById('lbList');
  const lbSub   = document.getElementById('lbSubtitle');

  if (!rows.length) {
    lbList.innerHTML = '<div id="lbLoading">' + (ru ? 'Нет данных' : 'No data yet') + '</div>';
    return;
  }
  const myRank = rows.findIndex(function (r) { return r.id === S.playerId; });
  lbList.innerHTML = rows.map(function (r, i) {
    const isMe     = r.id === S.playerId;
    const isFriend = S.friends.some(function (f) { return f.id === r.id; });
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

/** Рисует лидерборд из локального S.allPlayers (Ably / localStorage) */
export function renderLeaderboard() {
  const ru = S.lang === 'ru';
  seedAllPlayers();
  const now = Date.now();
  let onlineCount = 0;
  Object.values(S.allPlayers).forEach(function (p) {
    if (p.me || (p.t && now - p.t < 15000)) onlineCount++;
  });
  const rows = Object.entries(S.allPlayers)
    .map(function (e) { return { id: e[0], n: e[1].n, s: e[1].s }; })
    .sort(function (a, b) { return b.s - a.s; })
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
    document.getElementById('lbSubtitle').textContent = ru ? 'Загрузка…' : 'Loading…';
    let onlineCount = 0;

    // Считаем онлайн-игроков
    fbCountOnline(function (n) { onlineCount = n; });

    // Подписываемся на топ-100 из RTDB
    fbLoadLeaderboard(function (rows) {
      // Убедимся, что наши данные есть
      if (!rows.find(function (r) { return r.id === S.playerId; }) && S.hiScore > 0) {
        rows.push({ id: S.playerId, n: S.playerName || ('Diver#' + S.playerId.slice(-4)), s: S.hiScore });
        rows.sort(function (a, b) { return b.s - a.s; });
      }
      renderLeaderboardRows(rows, onlineCount, true);
    });

    // Отписываемся при закрытии панели
    var fbLbInterval = setInterval(function () {
      if (lbPanel.style.display === 'none') {
        clearInterval(fbLbInterval);
        fbUnloadLeaderboard();
        window.firebaseDB.ref('presence').off('value');
      }
    }, 1000);
    return;
  }

  // ── Fallback: Ably ──
  if (!initAbly()) {
    document.getElementById('lbSubtitle').textContent = ru ? '🔴 Нет интернета' : '🔴 No internet';
    renderLeaderboard(); return;
  }
  syncMyScore();
  renderLeaderboard();
  var lbIv = setInterval(function () {
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
  const sorted = [...S.friends].sort(function (a, b) { return b.s - a.s; });
  fpList.innerHTML = sorted.map(function (f, i) {
    return '<div class="fr">' +
      '<span style="color:rgba(255,255,255,.5);margin-right:8px">' + (i+1) + '.</span>' +
      '<span class="fname">🤿 ' + f.n + '</span>' +
      '<span class="fscore" style="margin-left:auto">◆ ' + f.s + '</span>' +
      '<span class="fdel" data-id="' + f.id + '" title="Remove">✕</span>' +
    '</div>';
  }).join('');
  fpList.querySelectorAll('.fdel').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      const id = btn.dataset.id;
      S.friends = S.friends.filter(function (f) { return f.id !== id; });
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

/** Запускает Firebase-гонку: слушает позицию соперника, шлёт свою */
export function startRaceFirebase(roomId) {
  if (!window.firebaseDB) return false;
  const raceRef = window.firebaseDB.ref('races/' + roomId + '/pos');

  // Слушаем позицию соперника
  raceRef.on('child_changed', function (snap) {
    if (snap.key === S.playerId) return;
    const d = snap.val();
    if (!d) return;
    S.opponentPos.x    = d.x    || 0;
    S.opponentPos.y    = d.y    || 0;
    S.opponentPos.vx   = d.vx   || 0;
    S.opponentPos.dist = d.dist || 0;
    S.opponentPos.nitro = d.nitro || 0;
    if (d.dist >= 500 && S.raceState === 'racing' && !S.raceWinner) {
      S.raceWinner = 'them'; S.raceState = 'finished';
      setTimeout(function () { S.state = 'raceover'; }, 600);
    }
  });

  // Callback для синхронизации своей позиции (вызывается из main.js)
  S._syncRacePos = function () {
    if (!window.firebaseDB || S.raceState !== 'racing') return;
    raceRef.child(S.playerId).set({
      x:    Math.round(S.player.x),
      y:    Math.round(S.player.y),
      vx:   Math.round(S.player.vx * 10) / 10,
      dist: S.distM,
      nitro: S.nitro,
      t:    Date.now(),
    });
  };

  // Очистка при окончании гонки
  window.addEventListener('deepdiver:raceEnd', function onRaceEnd() {
    window.removeEventListener('deepdiver:raceEnd', onRaceEnd);
    raceRef.off();
    window.firebaseDB.ref('races/' + roomId).remove().catch(function () {});
  }, { once: true });

  return true;
}

// ─── Firebase lobby ────────────────────────────────────────────────────────────

let fbLobbyRef = null;
let fbMyLobbyRef = null;

/** Ищет соперника через Firebase RTDB /lobby */
export function lookForOpponentFirebase() {
  if (!window.firebaseDB) return false;

  S.raceState = 'looking';
  document.getElementById('raceLookingPanel').style.display = 'block';
  updateRaceTexts();

  const myName = S.playerName || ('Diver#' + S.playerId.slice(-4));
  fbLobbyRef   = window.firebaseDB.ref('lobby');
  fbMyLobbyRef = fbLobbyRef.child(S.playerId);

  // Входим в лобби
  fbMyLobbyRef.set({ n: myName, status: 'waiting', t: Date.now() });
  fbMyLobbyRef.onDisconnect().remove();

  // Личный канал для входящих вызовов
  const myInboxRef = window.firebaseDB.ref('inbox/' + S.playerId);
  myInboxRef.remove(); // очищаем старые сообщения

  function cleanup() {
    if (fbMyLobbyRef) { fbMyLobbyRef.remove(); fbMyLobbyRef = null; }
    if (fbLobbyRef)   { fbLobbyRef.off(); fbLobbyRef = null; }
    myInboxRef.off();
  }

  // Слушаем входящие вызовы
  myInboxRef.on('child_added', function (snap) {
    const msg = snap.val();
    if (!msg || !msg.type) return;

    if (msg.type === 'challenge' && (S.raceState === 'looking' || S.raceState === 'waiting_response')) {
      // Нас вызвали
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
        // Отвечаем через inbox соперника
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
  });

  function tryChallenge(uid, data) {
    if (S.raceState !== 'looking') return;
    if (!data || uid === S.playerId || data.status !== 'waiting') return;
    // Детерминированно: меньший uid инициирует
    if (S.playerId < uid) {
      S.raceState = 'waiting_response';
      S.raceRoom  = { opponentId: uid, opponentName: data.n || uid, seed: null };
      fbMyLobbyRef.update({ status: 'busy' });
      window.firebaseDB.ref('inbox/' + uid).push({ type: 'challenge', from: S.playerId, name: myName });
    }
  }

  // Смотрим в лобби
  fbLobbyRef.on('child_added', function (snap) { tryChallenge(snap.key, snap.val()); });
  fbLobbyRef.on('child_changed', function (snap) { tryChallenge(snap.key, snap.val()); });

  // Проверяем текущих участников лобби
  fbLobbyRef.once('value', function (snap) {
    const all = snap.val() || {};
    Object.entries(all).forEach(function (e) { tryChallenge(e[0], e[1]); });
  });

  // Сохраняем cleanup для cancelLooking
  S._fbLobbyCleanup = cleanup;
  return true;
}

// ─── Race matchmaking ─────────────────────────────────────────────────────────
let lobbyPresence = null;

export function lookForOpponent() {
  // Приоритет: Firebase, fallback: Ably
  if (window.firebaseDB) {
    lookForOpponentFirebase();
    return;
  }
  if (!initAbly()) {
    alert(S.lang==='ru' ? 'Нет подключения. Проверь интернет.' : 'No connection. Check internet.');
    return;
  }
  S.raceState = 'looking';
  document.getElementById('raceLookingPanel').style.display = 'block';
  updateRaceTexts();

  const myName = S.playerName || ('Diver#' + S.playerId.slice(-4));
  lobbyPresence = S.ably.channels.get('deepdiver:lobby-v2');

  S.ablyMe.subscribe('challenge', function (msg) {
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

  lobbyPresence.presence.subscribe('enter', function (member) { tryChallenge(member.clientId, member.data); });
  lobbyPresence.presence.subscribe('update', function (member) { tryChallenge(member.clientId, member.data); });

  function tryChallenge(uid, data) {
    if (S.raceState !== 'looking') return;
    if (!data || uid === S.playerId || data.status !== 'waiting') return;
    if (S.playerId < uid) {
      S.raceState = 'waiting_response';
      S.raceRoom = { opponentId: uid, opponentName: data.name || uid, seed: null };
      S.ably.channels.get('deepdiver:player:' + uid).publish('challenge', { from: S.playerId, name: myName });
      S.ablyMe.subscribe('response', function (msg2) {
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

  lobbyPresence.presence.enter({ status: 'waiting', name: myName }, function () {
    lobbyPresence.presence.get(function (err, members) {
      if (err || !members) return;
      members.forEach(function (m) { tryChallenge(m.clientId, m.data); });
    });
  });
}

export function cancelLooking() {
  S.raceState = 'idle';
  // Firebase lobby cleanup
  if (S._fbLobbyCleanup) { S._fbLobbyCleanup(); S._fbLobbyCleanup = null; }
  // Ably lobby cleanup
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
  const iv = setInterval(function () {
    n--;
    if (n > 0) { numEl.textContent = n; }
    else {
      numEl.textContent = 'GO!';
      clearInterval(iv);
      setTimeout(function () {
        panel.style.display = 'none';
        // Dispatch to main.js to avoid circular dep
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
document.getElementById('lbClose').addEventListener('click', function () {
  document.getElementById('leaderboardPanel').style.display = 'none';
});

document.getElementById('friendsClose').addEventListener('click', function () {
  document.getElementById('friendsPanel').style.display = 'none';
});

document.getElementById('rlCancel').addEventListener('click', cancelLooking);

document.getElementById('myCode').addEventListener('click', function () {
  const code = btoa(S.playerId);
  document.getElementById('myCode').textContent = code;
  if (navigator.clipboard) navigator.clipboard.writeText(code).catch(function () {});
  document.getElementById('myCode').style.color = '#44ffaa';
  setTimeout(function () { document.getElementById('myCode').style.color = ''; }, 1200);
});

document.getElementById('addFriendBtn').addEventListener('click', function () {
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
  if (S.friends.find(function (f) { return f.id === fid; })) {
    fpMsg.textContent = S.lang === 'ru' ? 'Уже в списке!' : 'Already added!'; return;
  }
  S.friends.push({ id: fid, n: '…', s: 0 });
  saveFriends();
  subscribeFriend(fid);
  friendCodeIn.value = '';
  fpMsg.textContent = S.lang === 'ru' ? '✅ Добавлен! Загружаем данные…' : '✅ Added! Loading data…';
  renderFriendsList();
});

document.getElementById('friendCodeInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') document.getElementById('addFriendBtn').click(); e.stopPropagation(); });
document.getElementById('friendCodeInput').addEventListener('keyup',   function (e) { e.stopPropagation(); });
document.getElementById('friendCodeInput').addEventListener('mousedown', function (e) { e.stopPropagation(); });
document.getElementById('friendCodeInput').addEventListener('touchstart', function (e) { e.stopPropagation(); });
