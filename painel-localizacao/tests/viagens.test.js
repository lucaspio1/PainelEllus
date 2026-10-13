// Testes de viagens e importação. Rodar: npm run test:unit
const test = require('node:test');
const assert = require('node:assert');
const { listarViagens, planejarEdicao, planejarExclusao } = require('../store/viagens');
const { planejarImportacao } = require('../store/importacao');

function store({ alunos = [], quartos = [], embarques = [] } = {}) {
  const m = (arr) => new Map(arr.map(d => [d.cpf, { id: d.cpf, ...d }]));
  return { alunos: m(alunos), quartos: m(quartos), embarques: m(embarques) };
}

const viagemA = {
  alunos: [
    { cpf: '1', colegio: 'Colégio A', inicio_viagem: '2026-10-05', fim_viagem: '2026-10-07', facial: true, facial_cadastrada: true },
    { cpf: '2', colegio: 'Colégio A', inicio_viagem: '05/10', fim_viagem: '07/10', facial: true } // formato antigo
  ],
  quartos: [
    { cpf: '1', colegio: 'Colégio A', inicio_viagem: '2026-10-05', fim_viagem: '2026-10-07', numero_quarto: '101', facial: true },
    { cpf: '2', colegio: 'Colégio A', inicio_viagem: '05/10', fim_viagem: '07/10', numero_quarto: '', facial: true }
  ],
  embarques: [
    { cpf: '1', colegio: 'Colégio A', inicioViagem: '2026-10-05', fimViagem: '2026-10-07', idPasseio: 'P1', onibus: '2', embarque: 'SIM', retorno: '' },
    { cpf: '2', colegio: 'Colégio A', inicioViagem: '05/10', fimViagem: '07/10', idPasseio: 'P1', onibus: '10', embarque: '', retorno: '' },
    { cpf: '9', colegio: 'Colégio B', inicioViagem: '2026-11-01', fimViagem: '2026-11-01', idPasseio: 'P9', onibus: '1', embarque: '', retorno: '' }
  ]
};

test('lista viagens juntando formatos de data antigos e novos', () => {
  const lista = listarViagens(store(viagemA), { hojeISO: '2026-10-06' });
  assert.strictEqual(lista.length, 2);
  const a = lista.find(v => v.colegio === 'Colégio A');
  assert.strictEqual(a.qtd_alunos, 2);
  assert.strictEqual(a.embarcados, 1);
  assert.strictEqual(a.faciais_cadastradas, 1);
  assert.strictEqual(a.com_quarto, 1);
  assert.strictEqual(a.pernoite, true);
  assert.strictEqual(a.situacao, 'andamento');
  assert.deepStrictEqual(a.onibus, ['2', '10']); // ordem numérica
  const b = lista.find(v => v.colegio === 'Colégio B');
  assert.strictEqual(b.pernoite, false);
  assert.strictEqual(b.situacao, 'futura');
});

test('editar viagem atualiza as três coleções com os nomes de campo de cada uma', () => {
  const plano = planejarEdicao(store(viagemA), { colegio: 'Colégio A', inicio: '2026-10-05' },
    { inicio: '2026-10-06', fim: '2026-10-08', idPasseio: 'P1-NOVO', pernoite: false }, { agoraISO: 'T' });
  assert.ok(!plano.erro, plano.erro);
  assert.strictEqual(plano.escritas.length, 6); // 2 alunos + 2 quartos + 2 embarques
  const emb = plano.escritas.find(e => e.col === 'embarques' && e.id === '2');
  assert.deepStrictEqual(emb.data, { updated_at: 'T', inicioViagem: '2026-10-06', fimViagem: '2026-10-08', idPasseio: 'P1-NOVO', facial: false });
  const aluno = plano.escritas.find(e => e.col === 'alunos' && e.id === '1');
  assert.deepStrictEqual(aluno.data, { updated_at: 'T', inicio_viagem: '2026-10-06', fim_viagem: '2026-10-08', facial: false });
});

test('edição inválida é recusada', () => {
  const s = store(viagemA);
  assert.ok(planejarEdicao(s, { colegio: 'X', inicio: '2026-10-05' }, { fim: '2026-10-09' }).erro);
  assert.ok(planejarEdicao(s, { colegio: 'Colégio A', inicio: '2026-10-05' }, { fim: '2026-10-01' }).erro);
  assert.ok(planejarEdicao(s, { colegio: 'Colégio A', inicio: '2026-10-05' }, { colegio: '  ' }).erro);
  assert.ok(planejarEdicao(s, { colegio: 'Colégio A', inicio: '2026-10-05' }, {}).erro);
});

test('excluir viagem inclui embarques e não toca outras viagens', () => {
  const plano = planejarExclusao(store(viagemA), { colegio: 'colégio a', inicio: '05/10' });
  assert.deepStrictEqual(plano.porColecao, { alunos: 2, quartos: 2, embarques: 2 });
  assert.ok(!plano.exclusoes.some(e => e.id === '9'));
});

test('reimportar a mesma viagem preserva embarque, quarto e movimentação', () => {
  const s = store(viagemA);
  const linha = { nome: 'Aluno 1', cpf: '1', colegio: 'Colégio A', inicio_viagem: '2026-10-05', fim_viagem: '2026-10-07', id_passeio: 'P1', onibus: '2', facial: true };
  const plano = planejarImportacao([linha], s);
  assert.strictEqual(plano.atualizados, 1);
  const emb = plano.escritas.find(e => e.col === 'embarques').data;
  assert.ok(!('embarque' in emb) && !('retorno' in emb) && !('Facial' in emb));
  const quarto = plano.escritas.find(e => e.col === 'quartos').data;
  assert.ok(!('numero_quarto' in quarto), 'não apaga o quarto atribuído');
  const aluno = plano.escritas.find(e => e.col === 'alunos').data;
  assert.ok(!('movimentacao' in aluno));
});

test('aluno vindo de outra viagem começa do zero', () => {
  const s = store(viagemA);
  const plano = planejarImportacao([{ nome: 'Aluno 1', cpf: '1', colegio: 'Colégio Z', inicio_viagem: '2026-12-01', fim_viagem: '2026-12-02', facial: false }], s);
  assert.strictEqual(plano.novos, 1);
  const emb = plano.escritas.find(e => e.col === 'embarques').data;
  assert.strictEqual(emb.embarque, '');
  assert.strictEqual(emb.Facial, 'CADASTRADA'); // a facial do aluno continua valendo
  assert.strictEqual(plano.escritas.find(e => e.col === 'quartos').data.numero_quarto, '');
  assert.strictEqual(plano.escritas.find(e => e.col === 'alunos').data.movimentacao, 'QUARTO');
});

test('linhas sem CPF e CPF repetido são informadas', () => {
  const plano = planejarImportacao([
    { nome: 'Sem CPF', cpf: '' },
    { nome: 'Ana', cpf: '123.456.789-00', colegio: 'C', inicio_viagem: '2026-10-05' },
    { nome: 'Ana de novo', cpf: '12345678900', colegio: 'C', inicio_viagem: '2026-10-05' }
  ], store());
  assert.deepStrictEqual(plano.ignorados.map(i => i.motivo), ['sem CPF', 'CPF repetido na planilha']);
  assert.strictEqual(plano.novos, 1);
  assert.strictEqual(plano.escritas.length, 3);
});
