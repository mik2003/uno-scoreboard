import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateLeaderboard, scoreMatch, penaltyPerLoser, weekStart, stepWeek, isoWeekInfo, formatPoints } from '../scoring.js';
import { previewData } from '../preview-data.js';

const playerId = n => previewData.players.find(p=>p.name===n).id;

test('one most-card player loses exactly 1 point', () => {
  const scores=scoreMatch({first_place:'a',second_place:'b',third_place:'c',losers:['d']});
  assert.deepEqual(Object.fromEntries(scores),{a:3,b:2,c:1,d:-1});
});

test('two tied losers lose 0.5 each', () => {
  const scores=scoreMatch({first_place:'a',second_place:'b',third_place:'c',losers:['d','e']});
  assert.equal(scores.get('d'),-.5);
  assert.equal(scores.get('e'),-.5);
  assert.equal(penaltyPerLoser(['d','e']),.5);
  assert.equal([...scores.values()].reduce((a,b)=>a+b,0),5);
});

test('three tied losers share 1 point without dropping residual points', () => {
  const scores=scoreMatch({first_place:'a',second_place:'b',third_place:'c',losers:['d','e','f']});
  assert.ok(Math.abs(scores.get('d')+1/3)<1e-12);
  assert.ok(Math.abs(scores.get('e')+1/3)<1e-12);
  assert.ok(Math.abs(scores.get('f')+1/3)<1e-12);
  assert.ok(Math.abs([...scores.values()].reduce((a,b)=>a+b,0)-5)<1e-12);
});

test('penalties combine with podium points if a person appears in both', () => {
  const scores=scoreMatch({first_place:'a',second_place:'b',third_place:'c',losers:['b','d']});
  assert.equal(scores.get('b'),1.5);
  assert.equal(scores.get('d'),-.5);
});

test('ISO weeks cover the correct date range including year boundaries', () => {
  assert.equal(weekStart('2026-10-23'),'2026-10-19');
  assert.equal(weekStart('2026-10-12'),'2026-10-12');
  assert.equal(stepWeek('2026-10-19',1),'2026-10-26');
  assert.deepEqual(isoWeekInfo('2026-10-19'),{week:43,year:2026});
  assert.deepEqual(isoWeekInfo('2025-12-29'),{week:1,year:2026});
  assert.equal(weekStart('2027-01-01'),'2026-12-28');
});

test('imported spreadsheet scores sum to historical all-time totals', () => {
  const rows=aggregateLeaderboard(previewData,null);
  const get=name=>rows.find(p=>p.name===name);
  assert.equal(rows.length,18);
  assert.equal(get('Alice').points,22);
  assert.equal(get('Yasmin').points,18.5);
  assert.equal(get('Michelangelo').points,13);
  assert.equal(get('Emil').points,7.5);
  assert.equal(get('Noa').points,-2);
  assert.equal(rows.reduce((total,p)=>total+p.points,0),124);
  assert.equal(rows[0].name,'Alice');
});

test('Week 42, Week 43 and Week 44 are separated correctly', () => {
  const w42=aggregateLeaderboard(previewData,'2026-10-12');
  const w43=aggregateLeaderboard(previewData,'2026-10-19');
  const w44=aggregateLeaderboard(previewData,'2026-10-26');
  assert.equal(w42.find(p=>p.name==='Alice').points,6);
  assert.equal(w43.find(p=>p.name==='Alice').points,16);
  assert.equal(w43.find(p=>p.name==='Yasmin').points,9.5);
  assert.ok(w44.every(p=>p.points===0));
});

test('fresh matches add to imported scores without rewriting legacy records', () => {
  const modified={...previewData,matches:[{
    first_place:playerId('Emil'),second_place:playerId('Alice'),third_place:playerId('Noa'),losers:[playerId('Yasmin'),playerId('Fleur')],played_on:'2026-10-23'
  }]};
  const rows=aggregateLeaderboard(modified,'2026-10-19');
  assert.equal(rows.find(p=>p.name==='Emil').points,11.5);
  assert.equal(rows.find(p=>p.name==='Alice').points,18);
  assert.equal(rows.find(p=>p.name==='Yasmin').points,9);
  assert.equal(rows.find(p=>p.name==='Fleur').penalties,1.5);
});

test('fractional points are shown to three decimals, not rounded in storage', () => {
  assert.equal(formatPoints(1/3),'0.333');
  assert.equal(formatPoints(-.5),'−0.5'.replace('−','-'));
});
