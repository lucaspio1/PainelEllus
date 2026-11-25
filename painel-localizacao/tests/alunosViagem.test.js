// Testes de alunos de uma viagem (listar, editar, excluir). Rodar: npm run test:unit
const test = require('node:test');
const assert = require('node:assert');
const { listarAlunosDaViagem, planejarAdicaoAluno, planejarEdicaoAluno, planejarExclusaoAluno } = require('../store/viagens');

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
  assert.strictEqual(ana.facial_cadastrada, false);
  assert.deepStrictEqual(ana.colecoes, { alunos: true, quartos: true, embarques: true });
});

test('identifica facial cadastrada do aluno por facial_cadastrada, Facial ou embedding', () => {
  const s = store({
    alunos: [
      { cpf: '1', nome: 'Ana', colegio: 'Colégio A', inicio_viagem: '2026-10-05', facial_cadastrada: true },
      { cpf: '2', nome: 'Bruno', colegio: 'Colégio A', inicio_viagem: '2026-10-05', embedding: [0.5, 0.4] },
      { cpf: '3', nome: 'Carla', colegio: 'Colégio A', inicio_viagem: '2026-10-05', facial_cadastrada: false }
    ],
    embarques: [
      { cpf: '3', nome: 'Carla', colegio: 'Colégio A', inicioViagem: '2026-10-05', Facial: 'CADASTRADA' },
      { cpf: '4', nome: 'Diego', colegio: 'Colégio A', inicioViagem: '2026-10-05', Facial: 'PENDENTE' }
    ]
  });
  const lista = listarAlunosDaViagem(s, { colegio: 'Colégio A', inicio: '2026-10-05' });
  const porNome = Object.fromEntries(lista.map(a => [a.nome, a.facial_cadastrada]));
  assert.deepStrictEqual(porNome, { Ana: true, Bruno: true, Carla: true, Diego: false });
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

test('adicionar aluno puxa dados da viagem e replica para alunos, quartos e embarques', () => {
  const plano = planejarAdicaoAluno(
    dados(),
    { colegio: 'Colégio A', inicio: '2026-10-05' },
    { nome: '  Gabriel  Campos ', cpf: '104.325.549-47' },
    { agoraISO: '2026-11-23T00:00:00.000Z' }
  );
  assert.ok(!plano.erro, plano.erro);
  assert.strictEqual(plano.escritas.length, 3);
  const por = Object.fromEntries(plano.escritas.map(e => [e.col, e]));
  assert.strictEqual(por.alunos.id, '10432554947');
  assert.strictEqual(por.alunos.data.colegio, 'Colégio A');
  assert.strictEqual(por.alunos.data.inicio_viagem, '2026-10-05');
  assert.strictEqual(por.alunos.data.fim_viagem, '2026-10-07');
  assert.strictEqual(por.alunos.data.facial, true);
  assert.strictEqual(por.alunos.data.movimentacao, 'QUARTO');
  assert.strictEqual(por.quartos.data.nome_hospede, 'Gabriel Campos');
  assert.strictEqual(por.quartos.data.numero_quarto, '');
  assert.strictEqual(por.embarques.data.idPasseio, 'P1');
  assert.strictEqual(por.embarques.data.onibus, '1');
  assert.strictEqual(por.embarques.data.Facial, 'PENDENTE');
  assert.strictEqual(por.embarques.data.facial_cadastrada, false);
});

test('adicionar aluno recusa CPF já existente na viagem e dados inválidos', () => {
  const s = dados();
  assert.ok(planejarAdicaoAluno(s, { colegio: 'Colégio A', inicio: '2026-10-05' }, { nome: 'Repetido', cpf: '1' }).erro);
  assert.ok(planejarAdicaoAluno(s, { colegio: 'Colégio A', inicio: '2026-10-05' }, { nome: '  ', cpf: '555' }).erro);
  assert.ok(planejarAdicaoAluno(s, { colegio: 'Colégio A', inicio: '2026-10-05' }, { nome: 'Sem CPF', cpf: '' }).erro);
  assert.ok(planejarAdicaoAluno(s, { colegio: 'Inexistente', inicio: '2026-10-05' }, { nome: 'X', cpf: '555' }).erro);
});
