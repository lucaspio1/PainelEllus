// Testes do delta sync. Rodar: npm run test:unit
const test = require('node:test');
const assert = require('node:assert');
const { montarDelta, MARGEM_MS } = require('../store/delta');

function store({ pronto = true, alunos = [] } = {}) {
  const m = (arr) => new Map(arr.map(d => [d.id, d]));
  return {
    alunos: m(alunos),
    quartos: new Map(),
    embarques: new Map(),
    eventos: new Map(),
    ready: { alunos: pronto, quartos: pronto, embarques: pronto, eventos: pronto }
  };
}

const agora = new Date('2026-10-13T21:00:00.000Z');

test('cache ainda carregando não responde (não deixa o app avançar o since)', () => {
  const r = montarDelta({ dataStore: store({ pronto: false }), since: '2026-10-13T20:00:00Z', now: agora });
  assert.strictEqual(r.pronto, false);
});

test('serverTime volta com margem de segurança', () => {
  const r = montarDelta({ dataStore: store(), since: '2026-10-13T20:00:00Z', now: agora });
  assert.strictEqual(Date.parse(r.serverTime), agora.getTime() - MARGEM_MS);
});

test('escrita que chega ao cache atrasada ainda é entregue no ciclo seguinte', () => {
  // 1º ciclo às 21:00 — o doc gravado às 20:59:50 ainda não estava no cache desta instância
  const s = store();
  const r1 = montarDelta({ dataStore: s, since: '2026-10-13T20:00:00Z', now: agora });
  assert.deepStrictEqual(r1.delta, {});
  // Doc chega ao cache depois (listener / outra instância)
  s.alunos.set('1', { id: '1', updated_at: '2026-10-13T20:59:50.000Z' });
  // 2º ciclo usa o serverTime devolvido no 1º
  const r2 = montarDelta({ dataStore: s, since: r1.serverTime, now: new Date('2026-10-13T21:01:00Z') });
  assert.strictEqual(r2.delta.alunos.length, 1);
});

test('sync completo inclui documentos sem updated_at', () => {
  const s = store({ alunos: [{ id: 'a' }, { id: 'b', updated_at: '2026-01-01T00:00:00Z' }] });
  const r = montarDelta({ dataStore: s, since: undefined, now: agora });
  assert.strictEqual(r.completo, true);
  assert.strictEqual(r.delta.alunos.length, 2);
});

test('delta incremental filtra por updated_at (string ou Timestamp)', () => {
  const ts = { toDate: () => new Date('2026-10-13T20:30:00Z') };
  const s = store({ alunos: [
    { id: 'velho', updated_at: '2026-10-13T19:00:00Z' },
    { id: 'novo', updated_at: '2026-10-13T20:30:00Z' },
    { id: 'timestamp', updated_at: ts },
    { id: 'sem_data' }
  ] });
  const r = montarDelta({ dataStore: s, since: '2026-10-13T20:00:00Z', now: agora });
  assert.deepStrictEqual(r.delta.alunos.map(d => d.id).sort(), ['novo', 'timestamp']);
});
