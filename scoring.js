/** Pure utilities shared by the UI and tests. No server/build needed. */

const DAY_MS = 86_400_000;

export function isoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function weekStart(value) {
  // Strict YYYY-MM-DD parsing: do not use new Date('YYYY-MM-DD') in local-time week math.
  const parts = value.split('-').map(Number);
  const utc = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  const mondayOffset = (utc.getUTCDay() + 6) % 7;
  return new Date(utc.valueOf() - mondayOffset * DAY_MS).toISOString().slice(0, 10);
}

export function stepWeek(monday, difference) {
  return new Date(Date.parse(`${monday}T00:00:00Z`) + difference * 7 * DAY_MS).toISOString().slice(0, 10);
}

export function isoWeekInfo(isoMonday) {
  const day = new Date(`${isoMonday}T00:00:00Z`);
  const thursday = new Date(day.valueOf() + (4 - ((day.getUTCDay() + 6) % 7 + 1)) * DAY_MS);
  // ISO week year is the year containing the Thursday.
  const year = thursday.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const firstMonday = new Date(jan4.valueOf() - ((jan4.getUTCDay() + 6) % 7) * DAY_MS);
  return { year, week: Math.floor((day.valueOf() - firstMonday.valueOf()) / (7 * DAY_MS)) + 1 };
}

export function penaltyPerLoser(losers) {
  return losers.length ? 1 / losers.length : 0;
}

export function scoreMatch(match) {
  const scores = new Map();
  for (const [id, score] of [[match.first_place, 3], [match.second_place, 2], [match.third_place, 1]]) {
    scores.set(id, (scores.get(id) ?? 0) + score);
  }
  const perLoser = penaltyPerLoser(match.losers || []);
  for (const id of match.losers || []) {
    scores.set(id, (scores.get(id) ?? 0) - perLoser);
  }
  return scores;
}

function emptyRow(player) {
  return { id: player.id, name: player.name, wins: 0, seconds: 0, thirds: 0, penalties: 0, points: 0, matchesPlayed: 0 };
}

export function aggregateLeaderboard({ players, legacy_scores, matches }, monday = null) {
  const scores = new Map(players.map(p => [p.id, emptyRow(p)]));
  const inWeek = date => monday === null || weekStart(date) === monday;
  for (const r of legacy_scores) {
    if (!inWeek(r.week_start)) continue;
    const row = scores.get(r.player_id);
    if (!row) continue;
    row.wins += Number(r.wins);
    row.seconds += Number(r.seconds);
    row.thirds += Number(r.thirds);
    row.penalties += Number(r.penalties);
    row.points += Number(r.points);
  }
  for (const match of matches) {
    if (!inWeek(match.played_on)) continue;
    const first = scores.get(match.first_place);
    const second = scores.get(match.second_place);
    const third = scores.get(match.third_place);
    if (first) first.wins += 1;
    if (second) second.seconds += 1;
    if (third) third.thirds += 1;
    for (const id of new Set([match.first_place, match.second_place, match.third_place, ...(match.losers || [])])) {
      const row = scores.get(id);
      if (row) row.matchesPlayed += 1;
    }
    const share = penaltyPerLoser(match.losers || []);
    for (const loserId of match.losers || []) {
      const row = scores.get(loserId);
      if (row) row.penalties += share;
    }
    for (const [id, score] of scoreMatch(match)) {
      const row = scores.get(id);
      if (row) row.points += score;
    }
  }
  return [...scores.values()].sort((a,b) => b.points - a.points || b.wins - a.wins || b.seconds - a.seconds || a.name.localeCompare(b.name));
}

export function matchesInWeek(matches, monday) {
  return matches.filter(m => weekStart(m.played_on) === monday).sort((a,b) => b.played_on.localeCompare(a.played_on) || b.created_at.localeCompare(a.created_at));
}

export function formatPoints(value, { signed = false } = {}) {
  const n = Math.abs(value) < 1e-8 ? 0 : value;
  const text = new Intl.NumberFormat('en', { maximumFractionDigits: 3 }).format(n);
  return signed && n > 0 ? `+${text}` : text;
}
