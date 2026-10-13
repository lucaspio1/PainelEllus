// Testes das datas de viagem. Rodar: npm run test:unit
const test = require('node:test');
const assert = require('node:assert');
const { normalizarDataISO, mesmaData, formatarDataBR, deduzirDataISO } = require('../store/datas');
const { planejarDoc } = require('../scripts/migrar-datas-viagem');

test('normaliza formatos aceitos para AAAA-MM-DD', () => {
  assert.strictEqual(normalizarDataISO('2026-10-05'), '2026-10-05');
  assert.strictEqual(normalizarDataISO('5/10/2026'), '2026-10-05');
  assert.strictEqual(normalizarDataISO('05/10'), null); // sem ano não adivinha
  assert.strictEqual(normalizarDataISO('05/10', { anoReferencia: 2026 }), '2026-10-05');
  assert.strictEqual(normalizarDataISO({ toDate: () => new Date('2026-10-05T00:00:00Z') }), '2026-10-05');
  assert.strictEqual(normalizarDataISO(''), null);
});

test('compara datas novas (ISO) com dados antigos (DD/MM)', () => {
  assert.ok(mesmaData('2026-10-05', '05/10'));
  assert.ok(mesmaData('05/10', '2026-10-05'));
  assert.ok(mesmaData('2026-10-05', '2026-10-05'));
  assert.ok(!mesmaData('2026-10-05', '2025-10-05')); // anos diferentes não se confundem mais
  assert.ok(!mesmaData('2026-10-05', ''));
});

test('formata para exibição', () => {
  assert.strictEqual(formatarDataBR('2026-10-05'), '05/10/2026');
  assert.strictEqual(formatarDataBR('05/10'), '05/10');
});

test('deduz o ano a partir da data de importação', () => {
  assert.strictEqual(deduzirDataISO('20/10', '2026-10-01T12:00:00Z'), '2026-10-20');
  assert.strictEqual(deduzirDataISO('15/01', '2026-12-10T12:00:00Z'), '2027-01-15'); // virada de ano
  assert.strictEqual(deduzirDataISO('28/09', '2026-10-05T12:00:00Z'), '2026-09-28'); // importada durante a viagem
  assert.strictEqual(deduzirDataISO('20/10', null), null);
});

test('migração corrige DD/MM e ignora o que já está em ISO', () => {
  const agora = '2026-10-13T00:00:00.000Z';
  const plano = planejarDoc('alunos', { inicio_viagem: '28/12', fim_viagem: '03/01', updated_at: '2026-11-20T10:00:00Z' }, agora);
  assert.deepStrictEqual(plano.update, { inicio_viagem: '2026-12-28', fim_viagem: '2027-01-03', updated_at: agora });

  const emb = planejarDoc('embarques', { inicioViagem: '05/10', fimViagem: '07/10', created_at: { toDate: () => new Date('2026-09-20T00:00:00Z') } }, agora);
  assert.deepStrictEqual(emb.update, { inicioViagem: '2026-10-05', fimViagem: '2026-10-07', updated_at: agora });

  assert.strictEqual(planejarDoc('quartos', { inicio_viagem: '2026-10-05', fim_viagem: '2026-10-07' }, agora), null);
  assert.ok(planejarDoc('quartos', { inicio_viagem: '05/10', fim_viagem: '07/10' }, agora).pendente);
});
