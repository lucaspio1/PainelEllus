// Testes do token de dispositivo. Rodar: npm run test:unit
const test = require('node:test');
const assert = require('node:assert');
const {
  emitirTokenDispositivo,
  validarTokenDispositivo,
  revogarDispositivosDoUsuario,
  hashToken
} = require('../store/deviceTokens');

function fakeDb() {
  const docs = new Map();
  const ref = (col, id) => ({
    id,
    path: `${col}/${id}`,
    get: async () => ({ exists: docs.has(`${col}/${id}`), data: () => ({ ...docs.get(`${col}/${id}`) }) }),
    set: async (data) => { docs.set(`${col}/${id}`, { ...data }); },
    update: async (data) => { docs.set(`${col}/${id}`, { ...docs.get(`${col}/${id}`), ...data }); }
  });
  return {
    docs,
    collection: (col) => ({
      doc: (id) => ref(col, id),
      where: (campo, _op, valor) => ({
        get: async () => {
          const encontrados = [...docs.entries()]
            .filter(([p, d]) => p.startsWith(`${col}/`) && d[campo] === valor)
            .map(([p]) => ({ ref: ref(col, p.split('/')[1]) }));
          return { forEach: (fn) => encontrados.forEach(fn) };
        }
      })
    }),
    batch: () => {
      const ops = [];
      return { update: (r, d) => ops.push(() => r.update(d)), commit: async () => { for (const o of ops) await o(); } };
    }
  };
}

const usuarios = { '111': { cpf: '111', nome: 'Ana', perfil: 'USER', ativo: true } };
const buscar = async (cpf) => usuarios[cpf] || null;

test('token emitido é aceito e guardado só como hash', async () => {
  const db = fakeDb();
  const { refresh_token } = await emitirTokenDispositivo(db, { cpf: '111', nome: 'Ana' });
  assert.ok(!db.docs.has(`dispositivos/${refresh_token}`), 'não guarda o token em texto');
  assert.ok(db.docs.has(`dispositivos/${hashToken(refresh_token)}`));
  const r = await validarTokenDispositivo(db, refresh_token, buscar);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.user.cpf, '111');
});

test('validade é deslizante: uso dentro do prazo estende o vencimento', async () => {
  const db = fakeDb();
  const inicio = new Date('2026-10-01T00:00:00Z');
  const { refresh_token } = await emitirTokenDispositivo(db, { cpf: '111' }, { now: inicio });
  const dia25 = new Date('2026-10-26T00:00:00Z');
  assert.strictEqual((await validarTokenDispositivo(db, refresh_token, buscar, { now: dia25 })).ok, true);
  const dia50 = new Date('2026-11-20T00:00:00Z'); // 50 dias após emissão, 25 após o último uso
  assert.strictEqual((await validarTokenDispositivo(db, refresh_token, buscar, { now: dia50 })).ok, true);
});

test('token vencido é recusado', async () => {
  const db = fakeDb();
  const { refresh_token } = await emitirTokenDispositivo(db, { cpf: '111' }, { now: new Date('2026-01-01T00:00:00Z') });
  const r = await validarTokenDispositivo(db, refresh_token, buscar, { now: new Date('2026-03-01T00:00:00Z') });
  assert.strictEqual(r.ok, false);
});

test('token revogado ou de usuário desativado é recusado', async () => {
  const db = fakeDb();
  const { refresh_token } = await emitirTokenDispositivo(db, { cpf: '111' });
  await revogarDispositivosDoUsuario(db, '111');
  assert.strictEqual((await validarTokenDispositivo(db, refresh_token, buscar)).ok, false);

  const db2 = fakeDb();
  const t2 = (await emitirTokenDispositivo(db2, { cpf: '222' })).refresh_token;
  const desativado = async () => ({ cpf: '222', ativo: false });
  assert.strictEqual((await validarTokenDispositivo(db2, t2, desativado)).ok, false);
});

test('token desconhecido ou malformado é recusado', async () => {
  const db = fakeDb();
  assert.strictEqual((await validarTokenDispositivo(db, 'abc', buscar)).ok, false);
  assert.strictEqual((await validarTokenDispositivo(db, 'f'.repeat(64), buscar)).ok, false);
  assert.strictEqual((await validarTokenDispositivo(db, undefined, buscar)).ok, false);
});
