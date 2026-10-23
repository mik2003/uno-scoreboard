import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';
import { previewData } from './preview-data.js';
import {
  isoDate, weekStart, stepWeek, isoWeekInfo, aggregateLeaderboard,
  matchesInWeek, formatPoints, penaltyPerLoser
} from './scoring.js';

const byId = id => document.getElementById(id);
const TODAY = isoDate(new Date());
const PLACE_IDS = ['first-place', 'second-place', 'third-place'];
const configured = SUPABASE_URL.startsWith('https://') && !SUPABASE_URL.includes('YOUR-PROJECT')
  && !!SUPABASE_PUBLISHABLE_KEY && !SUPABASE_PUBLISHABLE_KEY.includes('YOUR-PUBLISHABLE');
const state = {
  client: null,
  data: { players: [], legacy_scores: [], matches: [] },
  view: 'weekly',
  monday: weekStart(TODAY),
  session: null,
  canEdit: false,
  busy: false,
  selectedLosers: new Set(),
};

function escapeHtml(input) {
  return String(input ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
function setConnection(status, label) {
  const el = byId('connection-status');
  el.className = `status-pill ${status}`;
  byId('connection-label').textContent = label;
}
function showError(message) {
  byId('error-notice').textContent = message;
  byId('error-notice').classList.remove('hidden');
}
function clearError() { byId('error-notice').classList.add('hidden'); }
function inlineMessage(id, message, error = false) {
  const el = byId(id);
  el.textContent = message;
  el.classList.toggle('error', error);
}
function setBusy(busy, buttonId, busyText) {
  const button = byId(buttonId);
  if (busy && !button.dataset.defaultLabel) button.dataset.defaultLabel = button.innerHTML;
  button.disabled = busy;
  button.innerHTML = busy ? busyText : (button.dataset.defaultLabel || button.innerHTML);
}
function playerById(id) { return state.data.players.find(p => p.id === id); }
function playerName(id) { return playerById(id)?.name || 'Unknown player'; }
function initials(name) { return name.trim().split(/\s+/).slice(0,2).map(part => part[0]?.toUpperCase() || '').join(''); }
function avatarPalette(name) {
  const colors = [ ['#eff0fd','#555acc'],['#e2f6ef','#249d76'],['#fff0d7','#c18a2f'],['#ffe9ed','#ce6377'],['#e6f0ff','#4e81c5'],['#efeafa','#8767b5'] ];
  const hash = [...name].reduce((a,c) => a + c.charCodeAt(0), 0);
  return colors[hash % colors.length];
}
function avatarStyle(name) { const [bg, fg] = avatarPalette(name); return `background:${bg};color:${fg}`; }
function prettyDate(iso, options = {}) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...options }).format(new Date(`${iso}T12:00:00Z`));
}
function weekRangeLabel(monday) {
  const sunday = new Date(Date.parse(`${monday}T00:00:00Z`) + 6*86400000).toISOString().slice(0,10);
  const monMonth = monday.slice(5,7), sunMonth = sunday.slice(5,7);
  if (monMonth === sunMonth) return `${prettyDate(monday,{day:'numeric'})}–${prettyDate(sunday,{day:'numeric',month:'long',year:'numeric'})}`;
  return `${prettyDate(monday,{day:'numeric',month:'short'})} – ${prettyDate(sunday,{day:'numeric',month:'short',year:'numeric'})}`;
}

function hasWeeklyActivity(monday) {
  return state.data.legacy_scores.some(r => r.week_start === monday) || state.data.matches.some(m => weekStart(m.played_on) === monday);
}
function rankingPeriodRows(monday = state.monday) {
  return aggregateLeaderboard(state.data, state.view === 'weekly' ? monday : null);
}
function renderSummary() {
  const overall = aggregateLeaderboard(state.data, null);
  const thisWeek = aggregateLeaderboard(state.data, weekStart(TODAY));
  const weeklyActivity = hasWeeklyActivity(weekStart(TODAY));
  byId('overall-leader').textContent = overall.length && overall.some(p => p.points !== 0) ? overall[0].name : '—';
  byId('overall-leader-points').textContent = overall.length && overall.some(p => p.points !== 0) ? `${formatPoints(overall[0].points)} points` : 'No scores yet';
  byId('weekly-leader').textContent = weeklyActivity ? thisWeek[0]?.name ?? '—' : 'No games yet';
  byId('weekly-leader-points').textContent = weeklyActivity ? `${formatPoints(thisWeek[0].points)} points` : 'Time to play!';
  byId('stat-players').textContent = state.data.players.length;
  byId('stat-matches').textContent = state.data.matches.length;
}
function renderPodium(rows, hasActivity) {
  const el = byId('podium');
  const topThree = hasActivity ? rows.slice(0,3) : [];
  const medals = ['🥇','🥈','🥉'];
  const podiumClasses = ['gold','silver','bronze'];
  el.innerHTML = [0,1,2].map(i => {
    const row = topThree[i];
    return `<div class="podium-card ${podiumClasses[i]}"><span class="podium-medal">${medals[i]}</span>
      <span class="podium-avatar" style="${row ? avatarStyle(row.name) : 'background:#f1f2f2;color:#9ba3aa'}">${row ? escapeHtml(initials(row.name)) : '?'}</span>
      <strong title="${row ? escapeHtml(row.name) : ''}">${row ? escapeHtml(row.name) : 'Unclaimed'}</strong>
      <small>${['The champion','Runner-up','On the podium'][i]}</small>
      <div class="podium-points">${row ? formatPoints(row.points) : '—'}<span>pts</span></div></div>`;
  }).join('');
}
function renderBoard() {
  const weekly = state.view === 'weekly';
  byId('weekly-tab').classList.toggle('selected',weekly);
  byId('alltime-tab').classList.toggle('selected',!weekly);
  byId('weekly-tab').setAttribute('aria-pressed',String(weekly));
  byId('alltime-tab').setAttribute('aria-pressed',String(!weekly));
  byId('week-controls').classList.toggle('hidden',!weekly);
  const { week, year } = isoWeekInfo(state.monday);
  byId('week-label').textContent = `Week ${week}, ${year}`;
  byId('week-range').textContent = weekRangeLabel(state.monday);
  const rows = rankingPeriodRows();
  const active = weekly ? hasWeeklyActivity(state.monday) :
    state.data.legacy_scores.length > 0 || state.data.matches.length > 0;
  renderPodium(rows,active);
  byId('row-count').textContent = rows.length;
  byId('leaderboard-body').innerHTML = rows.length ? rows.map((row,i) => {
    const cls = row.points < 0 ? 'negative' : row.points > 0 ? 'positive' : '';
    return `<tr>
      <td><span class="rank-value ${i < 3 && active ? 'top-rank' : ''}">${String(i+1).padStart(2,'0')}</span></td>
      <td><div class="player-cell"><span class="initial-avatar" style="${avatarStyle(row.name)}">${escapeHtml(initials(row.name))}</span><strong>${escapeHtml(row.name)}</strong></div></td>
      <td class="numeric-col">${row.wins || '–'}</td><td class="numeric-col">${row.seconds || '–'}</td><td class="numeric-col">${row.thirds || '–'}</td>
      <td class="numeric-col">${row.penalties ? `−${formatPoints(row.penalties)}` : '–'}</td>
      <td class="points-cell"><span class="points-detail"><strong class="${cls}">${formatPoints(row.points)}</strong></span></td>
    </tr>`;
  }).join('') : `<tr><td colspan="7" class="table-empty">No players yet. Add one after signing in.</td></tr>`;
  renderHistory();
}
function renderHistory() {
  const matches = state.view === 'weekly'
    ? matchesInWeek(state.data.matches,state.monday)
    : [...state.data.matches].sort((a,b) => b.played_on.localeCompare(a.played_on) || b.created_at.localeCompare(a.created_at));
  byId('history-count').textContent = matches.length;
  const recent = matches.slice(0,6);
  byId('recent-list').innerHTML = recent.length ? recent.map(m => {
    const losers = m.losers.map(playerName);
    const fraction = formatPoints(penaltyPerLoser(m.losers));
    const note = m.notes ? ` · ${escapeHtml(m.notes)}` : '';
    return `<div class="match-item"><div class="match-item-left"><strong><span class="match-win">🏆 ${escapeHtml(playerName(m.first_place))}</span> beat ${escapeHtml(playerName(m.second_place))} &amp; ${escapeHtml(playerName(m.third_place))}</strong>
      <small>${escapeHtml(prettyDate(m.played_on,{day:'numeric',month:'short'}))} · Most cards: ${escapeHtml(losers.join(', '))} (−${fraction} each)${note}</small></div>
      ${state.canEdit ? `<button type="button" class="match-delete" aria-label="Delete this match" title="Delete match" data-delete="${escapeHtml(m.id)}">×</button>` : ''}</div>`;
  }).join('') : `<p class="muted-copy">No individual matches logged ${state.view==='weekly'?'this week':'yet'}.</p>`;
}
function render() { renderSummary(); renderBoard(); }

function updatePlayerPickers() {
  const players = state.data.players.filter(p => p.active).sort((a,b) => a.name.localeCompare(b.name));
  for (const key of PLACE_IDS) {
    const el = byId(key);
    const previous = el.value;
    el.innerHTML = `<option value="">Select player</option>${players.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join('')}`;
    if (players.some(p=>p.id===previous)) el.value=previous;
  }
  state.selectedLosers = new Set([...state.selectedLosers].filter(id => players.some(p=>p.id===id)));
  byId('losers-grid').innerHTML = players.map(p => `<button type="button" class="loser-chip" data-loser-id="${escapeHtml(p.id)}" aria-pressed="${state.selectedLosers.has(p.id)}">${escapeHtml(p.name)}</button>`).join('');
  updatePenaltyPreview();
}
function updatePenaltyPreview() {
  for (const chip of byId('losers-grid').querySelectorAll('[data-loser-id]')) chip.setAttribute('aria-pressed', String(state.selectedLosers.has(chip.dataset.loserId)));
  const count = state.selectedLosers.size;
  byId('penalty-preview').textContent = count
    ? `${count} most-card ${count===1?'player':'players'} · −${formatPoints(1/count)} point${count===1?'':'s'} per person (−1 total)`
    : 'Pick at least one player who had the most cards.';
}

async function fetchAll(tableName, sortColumn, secondary = null) {
  const collected=[];
  const size=500;
  for (let offset=0;;offset+=size) {
    let request = state.client.from(tableName).select('*').order(sortColumn,{ascending:true}).range(offset,offset+size-1);
    if (secondary) request=request.order(secondary,{ascending:true});
    const {data,error}=await request;
    if (error) throw error;
    collected.push(...data);
    if (data.length<size) return collected;
  }
}
async function refreshData() {
  if (!configured) {
    state.data = previewData;
    render();updatePlayerPickers();return;
  }
  byId('refresh-button').disabled = true;
  try {
    const [players,legacy_scores,matches] = await Promise.all([
      fetchAll('players','name'),fetchAll('legacy_weekly_scores','week_start','player_id'),
      fetchAll('matches','created_at','id')
    ]);
    state.data={players,legacy_scores,matches};
    clearError();setConnection('','Live scoreboard');
    render();updatePlayerPickers();
  } catch (err) {
    setConnection('error','Connection issue');
    showError(`Couldn't load the leaderboard: ${err.message}. Check your Supabase URL, public key, and whether schema.sql was installed.`);
  } finally { byId('refresh-button').disabled = false; }
}
function updateAuth(session) {
  state.session = session;
  state.canEdit = false;
  if (!session) {
    byId('auth-locked').classList.remove('hidden');
    byId('auth-no-permission').classList.add('hidden');
    byId('match-entry').classList.add('hidden');
    renderHistory();
    return;
  }
  byId('auth-locked').classList.add('hidden');
  byId('user-email').textContent = session.user?.email || 'Signed in';
  // Show a protected view only after the database confirms edit permissions.
  state.client.rpc('can_edit_scores').then(({data,error}) => {
    // Ignore outdated permission responses from previous login sessions.
    if (state.session?.access_token !== session.access_token) return;
    state.canEdit = !error && data === true;
    byId('auth-no-permission').classList.toggle('hidden',state.canEdit);
    byId('match-entry').classList.toggle('hidden',!state.canEdit);
    renderHistory();
    if (error) showError(`Couldn't verify edit permissions: ${error.message}`);
  });
}

async function logIn(evt) {
  evt.preventDefault();
  if (!state.client) return;
  const email = byId('login-email').value.trim();
  inlineMessage('auth-message','');
  setBusy(true,'login-button','Sending…');
  try {
    const redirect = `${window.location.origin}${window.location.pathname}`;
    const {error} = await state.client.auth.signInWithOtp({ email, options: { emailRedirectTo:redirect } });
    if (error) throw error;
    inlineMessage('auth-message','Check your inbox for a one-click sign-in link.');
  } catch (err) {inlineMessage('auth-message',err.message,true);}
  finally {setBusy(false,'login-button');}
}
async function logOut() {
  if (state.client) {
    const {error}=await state.client.auth.signOut();
    if (error) showError(error.message);
  }
  updateAuth(null);
}
async function saveMatch(evt) {
  evt.preventDefault();
  if (!state.canEdit || state.busy) return;
  inlineMessage('match-message','');
  const [first,second,third] = PLACE_IDS.map(id=>byId(id).value);
  const winners=[first,second,third];
  if (!winners.every(Boolean) || new Set(winners).size!==3) return inlineMessage('match-message','Pick three different players for the podium.',true);
  if (state.selectedLosers.size===0) return inlineMessage('match-message','Select at least one player with the most cards.',true);
  const date=byId('match-date').value;
  if (!date || date>TODAY) return inlineMessage('match-message','Select today or an earlier date.',true);
  state.busy=true;setBusy(true,'submit-match','Saving score…');
  try {
    const {error}=await state.client.rpc('record_match',{
      p_played_on:date,p_first_place:first,p_second_place:second,p_third_place:third,
      p_losers:[...state.selectedLosers],p_notes:byId('match-notes').value.trim() || null
    });
    if (error) throw error;
    byId('match-form').reset();byId('match-date').value=TODAY;
    state.selectedLosers.clear();updatePenaltyPreview();
    state.view='weekly';state.monday=weekStart(date);
    await refreshData();
    inlineMessage('match-message','✓ Match saved. The leaderboard is up to date!');
  } catch(err){inlineMessage('match-message',err.message,true);}
  finally{state.busy=false;setBusy(false,'submit-match');}
}
async function addPlayer(evt) {
  evt.preventDefault();
  if (!state.canEdit) return;
  const name=byId('new-player-name').value.trim();
  if (!name) return;
  inlineMessage('player-message','');setBusy(true,'player-save','Adding…');
  try {
    const {error}=await state.client.rpc('add_player',{p_name:name});
    if (error) throw error;
    byId('player-dialog').close();byId('player-form').reset();
    await refreshData();
  } catch(err){ inlineMessage('player-message',err.message,true); }
  finally{setBusy(false,'player-save');}
}
async function deleteMatch(id) {
  if (!state.canEdit || !window.confirm('Delete this match? This immediately updates the scores and cannot be undone.')) return;
  const {error}=await state.client.rpc('delete_match',{p_match_id:id});
  if (error) showError(`Couldn't delete the match: ${error.message}`);
  else await refreshData();
}
function bindEvents() {
  byId('weekly-tab').addEventListener('click',()=>{state.view='weekly';renderBoard();});
  byId('alltime-tab').addEventListener('click',()=>{state.view='alltime';renderBoard();});
  byId('previous-week').addEventListener('click',()=>{state.monday=stepWeek(state.monday,-1);renderBoard();});
  byId('next-week').addEventListener('click',()=>{state.monday=stepWeek(state.monday,1);renderBoard();});
  byId('today-week').addEventListener('click',()=>{state.monday=weekStart(TODAY);renderBoard();});
  byId('refresh-button').addEventListener('click',refreshData);
  byId('login-form').addEventListener('submit',logIn);
  byId('sign-out').addEventListener('click',logOut);
  byId('sign-out-no-permission').addEventListener('click',logOut);
  byId('match-form').addEventListener('submit',saveMatch);
  byId('losers-grid').addEventListener('click',evt=>{
    const button=evt.target.closest('[data-loser-id]');
    if (!button) return;
    const id=button.dataset.loserId;
    if (state.selectedLosers.has(id)) state.selectedLosers.delete(id);
    else state.selectedLosers.add(id);
    updatePenaltyPreview();
  });
  byId('recent-list').addEventListener('click',evt=>{
    const button=evt.target.closest('[data-delete]');
    if (button) deleteMatch(button.dataset.delete);
  });
  byId('add-player-open').addEventListener('click',()=>{
    inlineMessage('player-message','');
    byId('player-dialog').showModal();
    byId('new-player-name').focus();
  });
  byId('player-dialog-close').addEventListener('click',()=>byId('player-dialog').close());
  byId('player-form').addEventListener('submit',addPlayer);
}
async function init() {
  byId('match-date').value=TODAY;
  byId('match-date').max=TODAY;
  bindEvents();
  if (!configured) {
    byId('preview-notice').classList.remove('hidden');
    byId('login-button').disabled=true;
    byId('login-email').disabled=true;
    inlineMessage('auth-message','Set up Supabase to enable email sign-in and score entry.');
    setConnection('preview','Excel preview');
    await refreshData();
    return;
  }
  try {
    // Only load the external SDK when the project is configured, so Excel preview works offline.
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    state.client=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
    const {data:{session},error}=await state.client.auth.getSession();
    if (error) throw error;
    updateAuth(session);
    state.client.auth.onAuthStateChange((_event,newSession)=>{
      // Supabase recommends deferring further SDK calls from auth callbacks.
      setTimeout(()=>updateAuth(newSession),0);
    });
    await refreshData();
    setInterval(()=>refreshData(),60_000);
  } catch (err) {setConnection('error','Setup error');showError(`Initialization error: ${err.message}`);}
}
init();
