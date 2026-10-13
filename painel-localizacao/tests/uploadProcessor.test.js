// Testes do processamento de upload do app mobile.
// Rodar: node --test tests/
const test = require('node:test');
const assert = require('node:assert');
const { processUploadOperations } = require('../store/uploadProcessor');

/** Firestore em memória, suficiente para o processador. */
function fakeDb(initial = {}, { failPaths = [] } = {}) {
  const docs = new Map(Object.entries(initial)); // 'colecao/id' -> data
  let autoId = 0;
  const ref = (col, id) => ({ id, path: `${col}/${id}` });
  return {
    docs,
    collection: (col) => ({ doc: (id) => ref(col, id || `auto${++autoId}`) }),
    getAll: async (...refs) => refs.map(r => ({
      exists: docs.has(r.path),
      data: () => ({ ...docs.get(r.path) })
    })),
    batch: () => {
      const writes = [];
      return {
        set: (r, data, options) => writes.push({ r, data, options }),
        commit: async () => {
          if (writes.some(w => failPaths.includes(w.r.path))) throw new Error('falha simulada');
          for (const w of writes) {
            const prev = w.options && w.options.merge ? docs.get(w.r.path) || {} : {};
            docs.set(w.r.path, { ...prev, ...w.data });
          }
        }
      };
    }
  };
}

const base = () => ({
  dataStore: { alunos: new Map(), embarques: new Map() },
  addLog: () => {},
  user: { cpf: '000', nome: 'Monitor' },
  now: () => '2026-10-13T20:00:00.000Z'
});

test('embarque offline é gravado com horário do evento', async () => {
  const db = fakeDb({ 'embarques/111': { embarque: '', idPasseio: 'P1' } });
  const { results } = await processUploadOperations({
    ...base(), db,
    operations: [{ id: 'outbox_1', type: 'embarque', data: { cpf: '111', campo: 'embarque', valor: 'SIM', event_at: '2026-10-13T10:00:00.000Z', onibus: '2' } }]
  });
  assert.deepStrictEqual(results, [{ id: 'outbox_1', status: 'ok' }]);
  const doc = db.docs.get('embarques/111');
  assert.strictEqual(doc.embarque, 'SIM');
  assert.strictEqual(doc.embarque_at, '2026-10-13T10:00:00.000Z');
  assert.strictEqual(doc.onibus, '2');
  assert.strictEqual(doc.idPasseio, 'P1'); // não foi apagado
});

test('evento antigo não sobrescreve evento mais novo', async () => {
  const db = fakeDb({ 'embarques/111': { retorno: 'SIM', retorno_at: '2026-10-13T18:00:00.000Z' } });
  const { results } = await processUploadOperations({
    ...base(), db,
    operations: [{ id: 'outbox_2', type: 'embarque', data: { cpf: '111', campo: 'retorno', valor: 'NÃO', event_at: '2026-10-13T09:00:00.000Z' } }]
  });
  assert.strictEqual(results[0].status, 'skipped');
  assert.strictEqual(db.docs.get('embarques/111').retorno, 'SIM');
});

test('embarque e retorno do mesmo aluno no mesmo lote', async () => {
  const db = fakeDb({ 'embarques/111': {} });
  const { results } = await processUploadOperations({
    ...base(), db,
    operations: [
      { id: 'a', type: 'embarque', data: { cpf: '111', campo: 'embarque', valor: 'SIM', event_at: '2026-10-13T08:00:00.000Z' } },
      { id: 'b', type: 'embarque', data: { cpf: '111', campo: 'retorno', valor: 'SIM', event_at: '2026-10-13T17:00:00.000Z' } }
    ]
  });
  assert.deepStrictEqual(results.map(r => r.status), ['ok', 'ok']);
  const doc = db.docs.get('embarques/111');
  assert.strictEqual(doc.embarque, 'SIM');
  assert.strictEqual(doc.retorno, 'SIM');
});

test('aluno de viagem excluída não trava o lote', async () => {
  const db = fakeDb({ 'embarques/111': {} });
  const { results } = await processUploadOperations({
    ...base(), db,
    operations: [
      { id: 'mov_9', type: 'movimentacao', data: { cpf: '999', movimentacao: 'QUARTO' } },
      { id: 'emb_9', type: 'embarque', data: { cpf: '999', campo: 'embarque', valor: 'SIM' } },
      { id: 'ok_1', type: 'embarque', data: { cpf: '111', campo: 'embarque', valor: 'SIM' } },
      { id: 'log_1', type: 'log', data: { cpf: '999', tipo: 'QUARTO' } }
    ]
  });
  assert.deepStrictEqual(results.map(r => r.status), ['skipped', 'skipped', 'ok', 'ok']);
  assert.ok(!db.docs.has('alunos/999'), 'não cria aluno fantasma');
  assert.strictEqual(db.docs.get('embarques/111').embarque, 'SIM');
});

test('falha de commit em uma operação não derruba as outras', async () => {
  const db = fakeDb({ 'embarques/111': {}, 'embarques/222': {} }, { failPaths: ['embarques/222'] });
  const { results } = await processUploadOperations({
    ...base(), db,
    operations: [
      { id: 'a', type: 'embarque', data: { cpf: '111', campo: 'embarque', valor: 'SIM' } },
      { id: 'b', type: 'embarque', data: { cpf: '222', campo: 'embarque', valor: 'SIM' } }
    ]
  });
  assert.deepStrictEqual(results.map(r => r.status), ['ok', 'error']);
  assert.strictEqual(db.docs.get('embarques/111').embarque, 'SIM');
});

test('formato antigo do app continua aceito', async () => {
  const db = fakeDb({ 'embarques/111': { idPasseio: 'P1' } });
  const { results } = await processUploadOperations({
    ...base(), db,
    operations: [{ id: 'emb_old', type: 'embarque', data: { cpf: '111', idPasseio: '', onibus: '3', embarque: 'SIM' } }]
  });
  assert.strictEqual(results[0].status, 'ok');
  const doc = db.docs.get('embarques/111');
  assert.strictEqual(doc.embarque, 'SIM');
  assert.strictEqual(doc.idPasseio, 'P1'); // idPasseio vazio não apaga o existente
});

test('tipo desconhecido vira erro só daquela operação', async () => {
  const db = fakeDb({ 'embarques/111': {} });
  const { results } = await processUploadOperations({
    ...base(), db,
    operations: [
      { id: 'x', type: 'qualquer', data: {} },
      { id: 'y', type: 'embarque', data: { cpf: '111', campo: 'embarque', valor: 'SIM' } }
    ]
  });
  assert.deepStrictEqual(results.map(r => r.status), ['error', 'ok']);
});
