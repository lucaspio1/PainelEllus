// Testes de alunos de uma viagem (listar, editar, excluir). Rodar: npm run test:unit
const test = require('node:test');
const assert = require('node:assert');
const { listarAlunosDaViagem, planejarEdicaoAluno, planejarExclusaoAluno } = require('../store/viagens');

function store({ alunos = [], quartos = [], embarques = [] } = {}) {
  const m = (arr) => new Map(arr.map(d => [d.cpf, { id: d.cpf, ...d }]));
  return { alunos: m(alunos), quartos: m(quartos), embarques: m(embarques) };
}

const dados = () => store({
  alunos: [
    { cpf: '1', nome: 'Ana', turma: '7A', colegio: 'Colégio A', inicio_viagem: '2026-10-05', fim_viagem: '2026-10-07', facial: true },
    { cpf: '2', nome: 'Bruno', turma: '7B', colegio: 'Colégio A', inicio_viagem: '05/10', fim_viagem: '07/10', facial: true },
    { cpf: '9', nome: 'Zeca', colegio: 'Colégio B', inicio_viagem: '2026-11-01', fim_viagem: '2026-11-01' }
  ],
  quartos: [
    { cpf: '1', nome_hospede: 'Ana', colegio: 'Colégio A', inicio_viagem: '2026-10-05', numero_quarto: '101', facial: true },
    { cpf: '2', nome_hospede: 'Bruno', colegio: 'Colégio A', inicio_viagem: '05/10', numero_quarto: '', facial: true }
  ],
  embarques: [
    { cpf: '1', nome: 'Ana', turma: '7A', colegio: 'Colégio A', inicioViagem: '2026-10-05', idPasseio: 'P1', onibus: '2', embarque: 'SIM' },
    { cpf: '2', nome: 'Bruno', turma: '7B', colegio: 'Colégio A', inicioViagem: '05/10', idPasseio: 'P1', onibus: '1' },
    { cpf: '9', nome: 'Zeca', colegio: 'Colégio B', inicioViagem: '2026-11-01', idPasseio: 'P9', onibus: '1' }
  ]
});

test('lista alunos da viagem juntando as três coleções', () => {
  const lista = listarAlunosDaViagem(dados(), { colegio: 'colégio a', inicio: '2026-10-05' });
  assert.deepStrictEqual(lista.map(a => a.nome), ['Ana', 'Bruno']);
  const ana = lista[0];
  assert.strictEqual(ana.numero_quarto, '101');
  assert.strictEqual(ana.onibus, '2');
  assert.strictEqual(ana.embarque, 'SIM');
  assert.deepStrictEqual(ana.colecoes, { alunos: true, quartos: true, embarques: true });
});

test('editar aluno grava cada campo na coleção certa', () => {
  const plano = planejarEdicaoAluno(dados(), { colegio: 'Colégio A', inicio: '2026-10-05', cpf: '1' },
    { nome: ' Ana  Maria ', turma: '8A', onibus: '3', numero_quarto: '202' }, { agoraISO: 'T' });
  assert.ok(!plano.erro, plano.erro);
  const por = Object.fromEntries(plano.escritas.map(e => [e.col, e.data]));
  assert.deepStrictEqual(por.alunos, { nome: 'Ana Maria', turma: '8A', updated_at: 'T' });
  assert.deepStrictEqual(por.quartos, { nome_hospede: 'Ana Maria', numero_quarto: '202', updated_at: 'T' });
  assert.deepStrictEqual(por.embarques, { nome: 'Ana Maria', turma: '8A', onibus: '3', updated_at: 'T' });
});

test('editar aluno recusa aluno de outra viagem e dados inválidos', () => {
  const s = dados();
  assert.ok(planejarEdicaoAluno(s, { colegio: 'Colégio A', inicio: '2026-10-05', cpf: '9' }, { nome: 'X' }).erro);
  assert.ok(planejarEdicaoAluno(s, { colegio: 'Colégio A', inicio: '2026-10-05', cpf: '1' }, { nome: '  ' }).erro);
  assert.ok(planejarEdicaoAluno(s, { colegio: 'Colégio A', inicio: '2026-10-05', cpf: '1' }, { idPasseio: '' }).erro);
  assert.ok(planejarEdicaoAluno(s, { colegio: 'Colégio A', inicio: '2026-10-05', cpf: '1' }, {}).erro);
});

test('excluir aluno apaga só os documentos dele nesta viagem', () => {
  const plano = planejarExclusaoAluno(dados(), { colegio: 'Colégio A', inicio: '2026-10-05', cpf: '2' });
  assert.deepStrictEqual(plano.exclusoes.map(e => e.col).sort(), ['alunos', 'embarques', 'quartos']);
  assert.ok(plano.exclusoes.every(e => e.id === '2'));
  assert.strictEqual(plano.nome, 'Bruno');
  assert.ok(planejarExclusaoAluno(dados(), { colegio: 'Colégio A', inicio: '2026-10-05', cpf: '9' }).erro);
});
