// db.js — localStorage persistence
import { S } from './state.js';

export function saveProgress() {
  localStorage.setItem('deepdiver', JSON.stringify({ hiScore: S.hiScore, level: S.level, wins: S.wins }));
  // Publish score to Ably if connected
  if (S.ablyScores) {
    try {
      S.ablyScores.publish('score', {
        id: S.playerId,
        n: S.playerName || ('Diver#' + S.playerId.slice(-4)),
        s: S.hiScore,
      });
    } catch (e) {}
  }
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
