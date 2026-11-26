// Testes do Controle de Quartos (/api/pessoas). Rodar: npm run test:unit
const test = require('node:test');
const assert = require('node:assert/strict');

const { listarPessoasControleQuartos, planejarMovimentacaoLote } = require('../store/pessoas');

test('exclui da lista do Controle de Quartos qualquer CPF que pertença a um monitor', () => {
  const quartos = [
    { id: '11111111111', cpf: '11111111111', nome_hospede: 'Aluno Normal', colegio: 'COL A', numero_quarto: '101', facial: true },
    { id: '80094235996', cpf: '80094235996', nome_hospede: 'Monitor Teste', colegio: 'COL A', numero_quarto: '102', facial: true },
    { id: '22222222222', cpf: '222.222.222-22', nome_hospede: 'Monitor Formatado', colegio: 'COL A', numero_quarto: '103', facial: true },
    { id: '33333333333', cpf: '33333333333', nome_hospede: 'Sem Facial', colegio: 'COL A', numero_quarto: '104', facial: false }
  ];

  const alunos = [
    { id: '11111111111', cpf: '11111111111', facial: true, movimentacao: 'SAIU_DO_QUARTO', facial_cadastrada: true, turma: '3A' },
    { id: '80094235996', cpf: '80094235996', facial: true, movimentacao: 'QUARTO', facial_cadastrada: true }
  ];

  const usuarios = [
    { id: '80094235996', cpf: '800.942.359-96', nome: 'Monitor Teste', perfil: 'USER' },
    { id: '22222222222', nome: 'Monitor Formatado', perfil: 'ADMIN' }
  ];

  const pessoas = listarPessoasControleQuartos({ quartos, alunos, usuarios });

  assert.equal(pessoas.length, 1);
  assert.equal(pessoas[0].cpf, '11111111111');
  assert.equal(pessoas[0].nome, 'Aluno Normal');
  assert.equal(pessoas[0].movimentacao, 'SAIU_DO_QUARTO');
  assert.equal(pessoas[0].facial_cadastrada, true);
  assert.equal(pessoas[0].turma_aluno, '3A');
});

test('mantém todos os alunos com facial === true quando não há monitores correspondentes', () => {
  const quartos = [
    { id: '10432554947', cpf: '10432554947', nome_hospede: 'Gabriel Nascimento Campos', colegio: 'FERREIRA NETO', numero_quarto: '', facial: true }
  ];
  const alunos = [
    { id: '10432554947', cpf: '10432554947', facial: true, movimentacao: 'QUARTO', facial_cadastrada: false, turma: 'TERCEIRÃO' }
  ];
  const usuarios = [
    { id: '99999999999', cpf: '99999999999', nome: 'Outro Monitor', perfil: 'USER' }
  ];

  const pessoas = listarPessoasControleQuartos({ quartos, alunos, usuarios });

  assert.equal(pessoas.length, 1);
  assert.equal(pessoas[0].cpf, '10432554947');
  assert.equal(pessoas[0].movimentacao, 'QUARTO');
});

test('planejarMovimentacaoLote move alunos para FOI_PARA_BALADA e ignora quem já está lá ou CPFs duplicados', () => {
  const dataStore = {
    alunos: new Map([
      ['11111111111', { id: '11111111111', cpf: '11111111111', nome: 'Aluno 1', movimentacao: 'VOLTOU_AO_QUARTO' }],
      ['22222222222', { id: '22222222222', cpf: '22222222222', nome: 'Aluno 2', movimentacao: 'FOI_PARA_BALADA' }],
      ['33333333333', { id: '33333333333', cpf: '33333333333', nome: 'Aluno 3', movimentacao: 'SAIU_DO_QUARTO' }]
    ])
  };

  const ts = '2026-11-25T23:00:00.000Z';
  const plano = planejarMovimentacaoLote([
    { cpf: '111.111.111-11', nome: 'Aluno 1', quarto: '101' },
    { cpf: '11111111111', nome: 'Aluno 1 duplicado', quarto: '101' },
    { cpf: '22222222222', nome: 'Aluno 2', quarto: '102' },
    { cpf: '33333333333', nome: 'Aluno 3', quarto: '103' }
  ], 'FOI_PARA_BALADA', { operador: 'Coordenador', timestamp: ts, dataStore });

  assert.equal(plano.erro, undefined);
  assert.equal(plano.jaEstavam, 1);
  assert.deepEqual(plano.movidos, ['11111111111', '33333333333']);
  assert.equal(plano.escritasAlunos.length, 2);
  assert.equal(plano.logs.length, 2);
  assert.deepEqual(plano.escritasAlunos[0].data, {
    movimentacao: 'FOI_PARA_BALADA',
    movimentacao_at: ts,
    updated_at: ts,
    ultimo_usuario: 'Coordenador'
  });
  assert.equal(plano.logs[0].quarto, '101');
  assert.equal(plano.logs[0].tipo, 'FOI_PARA_BALADA');
  assert.equal(plano.logs[0].operador, 'Coordenador');
});
