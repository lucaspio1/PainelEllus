// Testes da reinscrição automática dos listeners. Rodar: npm run test:unit
process.env.LISTENER_RETRY_BASE_MS = '5';
process.env.LISTENER_RETRY_JITTER_MS = '0';

const test = require('node:test');
const assert = require('node:assert');
const { setupFirestoreListeners } = require('../store/firestoreListeners');
const { dataStore } = require('../store/dataStore');

const esperar = (ms) => new Promise(r => setTimeout(r, ms));

/** Firestore falso: registra cada onSnapshot aberto e permite disparar eventos. */
function fakeDb(docsIniciais = {}) {
  const listeners = [];
  function query(col, filtro) {
    return {
      where: (campo, op, valor) => query(col, { campo, op, valor }),
      orderBy: () => query(col, filtro),
      limit: () => query(col, filtro),
      get: async () => {
        const docs = (docsIniciais[col] || []).map(d => ({ id: d.id, data: () => d }));
        return { size: docs.length, docs, forEach: (fn) => docs.forEach(fn) };
      },
      onSnapshot: (next, err) => {
        const l = { col, filtro, next, err, ativo: true };
        listeners.push(l);
        return () => { l.ativo = false; };
      }
    };
  }
  return { listeners, collection: (col) => query(col, null) };
}

const snap = (docs = [], changes = []) => ({
  docs: docs.map(d => ({ id: d.id, data: () => d })),
  docChanges: () => changes.map(([type, d]) => ({ type, doc: { id: d.id, data: () => d } }))
});

const ativos = (db, col) => db.listeners.filter(l => l.col === col && l.ativo);
const io = { emit: () => {} };

test('listener incremental não se cancela no primeiro snapshot e se reinscreve após erro', async (t) => {
  const origErr = console.error; const origLog = console.log;
  console.error = () => {}; console.log = () => {};
  t.after(() => { console.error = origErr; console.log = origLog; });

  const db = fakeDb({ alunos: [{ id: 'a1', nome: 'Ana' }] });
  const fl = setupFirestoreListeners(db, io);

  // Dispara os snapshots iniciais de todos os listeners
  await esperar(20);
  db.listeners.forEach(l => l.next(snap([], [])));
  await fl.readyPromise;

  assert.strictEqual(ativos(db, 'alunos').length, 1, 'listener de alunos deve continuar ativo após o 1º snapshot');

  // Mudança chega normalmente
  ativos(db, 'alunos')[0].next(snap([], [['modified', { id: 'a1', nome: 'Ana B' }]]));
  assert.strictEqual(dataStore.alunos.get('a1').nome, 'Ana B');

  // Erro do SDK (o que aconteceu em produção)
  const morto = ativos(db, 'alunos')[0];
  const cursorAntes = morto.filtro.valor;
  morto.err(new Error('A backoff operation is already in progress.'));
  assert.strictEqual(morto.ativo, false, 'stream com erro deve ser cancelado');

  await esperar(30);
  const novos = ativos(db, 'alunos');
  assert.strictEqual(novos.length, 1, 'deve reinscrever exatamente um listener');
  assert.ok(novos[0].filtro.valor <= new Date().toISOString());
  assert.ok(novos[0].filtro.valor >= cursorAntes, 'cursor de retomada não deve voltar antes do cursor original');

  novos[0].next(snap([], [['added', { id: 'a2', nome: 'Bia' }]]));
  assert.strictEqual(ativos(db, 'alunos').length, 1, 'reinscrito continua ativo após o 1º snapshot');
  assert.strictEqual(dataStore.alunos.get('a2').nome, 'Bia');

  fl.unsubscribe();
});

test('listener completo reconstrói a coleção ao reinscrever (remove apagados)', async (t) => {
  const origErr = console.error; const origLog = console.log;
  console.error = () => {}; console.log = () => {};
  t.after(() => { console.error = origErr; console.log = origLog; });

  const db = fakeDb();
  const fl = setupFirestoreListeners(db, io);
  await esperar(20);
  db.listeners.filter(l => l.col !== 'eventos').forEach(l => l.next(snap([], [])));
  const ev = ativos(db, 'eventos')[0];
  ev.next(snap([{ id: 'e1' }, { id: 'e2' }], [['added', { id: 'e1' }], ['added', { id: 'e2' }]]));
  await fl.readyPromise;
  assert.strictEqual(dataStore.eventos.size, 2);

  ev.err(new Error('A backoff operation is already in progress.'));
  await esperar(30);
  const novo = ativos(db, 'eventos');
  assert.strictEqual(novo.length, 1);
  // e2 foi apagado enquanto estava offline
  novo[0].next(snap([{ id: 'e1' }], [['added', { id: 'e1' }]]));
  assert.deepStrictEqual([...dataStore.eventos.keys()], ['e1']);

  fl.unsubscribe();
});
