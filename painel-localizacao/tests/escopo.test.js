// Testes do escopo (só viagens relevantes no celular). Rodar: npm run test:unit
const test = require('node:test');
const assert = require('node:assert');
const { docRelevante, janelaAtiva, hojeBrasil, limparMemo } = require('../store/escopo');
const { montarDelta } = require('../store/delta');

// 13/10/2026 às 22h em Brasília = 14/10 01h UTC
const agora = new Date('2026-10-14T01:00:00Z');

test('data de hoje considera o fuso do Brasil', () => {
  assert.strictEqual(hojeBrasil(agora), '2026-10-13');
  assert.deepStrictEqual(janelaAtiva(agora, { diasAntes: 3, diasDepois: 1 }), { hoje: '2026-10-13', de: '2026-10-12', ate: '2026-10-16' });
});

test('janela: em andamento, próximas e recém-encerradas entram; o resto não', () => {
  const j = janelaAtiva(agora, { diasAntes: 3, diasDepois: 1 });
  const ok = (ini, fim) => docRelevante({ inicio_viagem: ini, fim_viagem: fim }, 'alunos', j);
  assert.ok(ok('2026-10-10', '2026-10-15'), 'em andamento');
  assert.ok(ok('2026-10-16', '2026-10-17'), 'começa em 3 dias');
  assert.ok(!ok('2026-10-17', '2026-10-18'), 'começa em 4 dias');
  assert.ok(ok('2026-10-08', '2026-10-12'), 'terminou ontem (folga para o retorno)');
  assert.ok(!ok('2026-10-01', '2026-10-05'), 'encerrada');
  assert.ok(ok('14/10', '14/10'), 'formato antigo sem ano');
  assert.ok(!ok('', ''), 'sem data');
  assert.ok(docRelevante({ inicioViagem: '2026-10-14', fimViagem: '2026-10-14' }, 'embarques', j), 'campos de embarques');
});

function store() {
  const m = (arr) => new Map(arr.map(d => [d.cpf, d]));
  return {
    ready: { alunos: true, quartos: true, embarques: true, eventos: true },
    lastUpdate: {},
    alunos: m([
      { cpf: 'ativo', inicio_viagem: '2026-10-13', fim_viagem: '2026-10-14', updated_at: '2026-01-01T00:00:00Z' },
      { cpf: 'antigo', inicio_viagem: '2026-09-01', fim_viagem: '2026-09-03', updated_at: '2026-10-13T20:00:00Z' }
    ]),
    quartos: m([{ cpf: 'ativo', inicio_viagem: '2026-10-13', fim_viagem: '2026-10-14' }]),
    embarques: m([{ cpf: 'amanha', inicioViagem: '2026-10-14', fimViagem: '2026-10-14' }]),
    eventos: new Map()
  };
}

test('app novo recebe só viagens relevantes e a lista de CPFs a manter', () => {
  limparMemo();
  const r = montarDelta({ dataStore: store(), since: undefined, now: agora, soViagensAtivas: true });
  assert.deepStrictEqual(r.delta.alunos.map(d => d.cpf), ['ativo']);
  assert.deepStrictEqual(r.escopo.cpfs.sort(), ['amanha', 'ativo']);
  // Delta incremental: aluno antigo alterado agora NÃO vai para o celular
  const inc = montarDelta({ dataStore: store(), since: '2026-10-13T00:00:00Z', now: agora, soViagensAtivas: true });
  assert.ok(!inc.delta.alunos, 'nada de alunos de viagem encerrada');
});

test('app antigo continua recebendo tudo, sem escopo', () => {
  limparMemo();
  const r = montarDelta({ dataStore: store(), since: undefined, now: agora });
  assert.strictEqual(r.delta.alunos.length, 2);
  assert.strictEqual(r.escopo, undefined);
});
