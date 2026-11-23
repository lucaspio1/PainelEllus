// Testes do Controle de Quartos (/api/pessoas). Rodar: npm run test:unit
const test = require('node:test');
const assert = require('node:assert/strict');

const { listarPessoasControleQuartos } = require('../store/pessoas');

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
