// Testes do parser e cruzamento de Mapa de Camas. Rodar: npm run test:unit
const test = require('node:test');
const assert = require('node:assert');
const {
  normalizarNome,
  parsearMapaCamasCSV,
  cruzarMapaComAlunos
} = require('../public/homelistMapa');

const CSV_EXEMPLO = `,,,,,,,,,,,,,,22 a 24/11/2026 - 15 aptos,grupo 1511
,Pne,,,super luxo,,,suite super luxo,,,suite nupcial,,Prime,,,
,Aptos,Pessoas,,Aptos,Pessoas,,Aptos,Pessoas,,Aptos,Pessoas,Aptos,Pessoas,,
,,,,,,,,,,,,7007,5,PROFESSSOR THOMAZ GUIMARAES MULLER,
,,,,,,,,,,,,02 Aptos,10,,
,,,,,,,,,,,,Prime Lago,,,
,,,,,,,,,,,,Aptos,Pessoas,,
,,,,,,,,,,,,7019,5,LUANA BORBA TOOM,
,,,,,,,,,,,,,,LUIZA BORBA TOOM,
,,,,,,,,,,,,,,JULIA RODRIGUES MELO,
,,,,,,,,,,,,,,MIGUEL,
,,,,,,,,,,,,7020,5,MARIAH DA ROSA,
,,,,,,,,,,,,,,MARIA CLARA CLARA DE SOUZA FRAGA,
,,,,,,,,,,,,7614,4,2 camas de casal ou 4 solteiro.,
,,,,,,,,,,,,,,VAZIO,
,,,,,,,,,,,,7612,2,EQUIPE ELLUS,
,,,,,,,,,,,,,,23 a 25/11/2026 - 6 aptos,
,,,,,,,,,,,,Prime,,,
,,,,,,,,,,,,Aptos,Pessoas,,
,,,,,,,,,,,,7003,5,AMABILE  MDEIROS PEREIRA,
,,,,,,,,,,,,,,LAVINIA DE SOUZA MAURICIO,
,,,,,,,,,,,,7006,5,,
,,,,,,,,,,,,,,VAZIO,`;

test('normalizarNome remove acentos e palavras duplicadas em sequência', () => {
  assert.strictEqual(
    normalizarNome('MARIA CLARA CLARA DE SOUZA FRAGA'),
    'MARIA CLARA DE SOUZA FRAGA'
  );
  assert.strictEqual(normalizarNome('JOÃO   LOURENÇO'), 'JOAO LOURENCO');
});

test('parsearMapaCamasCSV extrai blocos de data, quartos e ignora VAZIO/camas', () => {
  const { blocos, itens } = parsearMapaCamasCSV(CSV_EXEMPLO);
  assert.strictEqual(blocos.length, 2);
  assert.deepStrictEqual(
    blocos.map(b => `${b.inicio}|${b.fim}`),
    ['2026-11-22|2026-11-24', '2026-11-23|2026-11-25']
  );

  const nomes = itens.map(i => `${i.quarto}:${i.nome}`);
  assert.ok(nomes.includes('7019:MIGUEL'));
  assert.ok(nomes.includes('7020:MARIA CLARA CLARA DE SOUZA FRAGA'));
  assert.ok(nomes.includes('7003:AMABILE  MDEIROS PEREIRA'));
  assert.ok(nomes.includes('7612:EQUIPE ELLUS'));
  assert.ok(!itens.some(i => /VAZIO|camas/i.test(i.nome)));
});

test('cruzarMapaComAlunos resolve MIGUEL pelo colégio das outras alunas do quarto 7019', () => {
  const { itens } = parsearMapaCamasCSV(CSV_EXEMPLO);
  const alunosBloco1 = [
    { cpf: '111', nome: 'LUANA BORBA TOOM', colegio: 'COLEGIO A', inicio_viagem: '2026-11-22' },
    { cpf: '222', nome: 'LUIZA BORBA TOOM', colegio: 'COLEGIO A', inicio_viagem: '2026-11-22' },
    { cpf: '333', nome: 'JULIA RODRIGUES MELO', colegio: 'COLEGIO A', inicio_viagem: '2026-11-22' },
    { cpf: '444', nome: 'MIGUEL HENRIQUE SILVA', colegio: 'COLEGIO A', inicio_viagem: '2026-11-22' },
    // Outro Miguel em outro colégio na mesma data — não deve confundir!
    { cpf: '555', nome: 'MIGUEL OLIVEIRA COSTA', colegio: 'COLEGIO B', inicio_viagem: '2026-11-22' },
    { cpf: '666', nome: 'MARIAH DA ROSA', colegio: 'COLEGIO A', inicio_viagem: '2026-11-22' },
    { cpf: '777', nome: 'MARIA CLARA DE SOUZA FRAGA', colegio: 'COLEGIO A', inicio_viagem: '2026-11-22' }
  ];
  const alunosBloco2 = [
    { cpf: '888', nome: 'AMABILE MEDEIROS PEREIRA', colegio: 'COLEGIO C', inicio_viagem: '2026-11-23' },
    { cpf: '999', nome: 'LAVINIA DE SOUZA MAURICIO', colegio: 'COLEGIO C', inicio_viagem: '2026-11-23' }
  ];

  const res = cruzarMapaComAlunos(itens, {
    '2026-11-22|2026-11-24': alunosBloco1,
    '2026-11-23|2026-11-25': alunosBloco2
  });

  const miguel = res.find(r => r.quarto === '7019' && r.nome === 'MIGUEL');
  assert.strictEqual(miguel.status, 'por_quarto');
  assert.strictEqual(miguel.aluno.cpf, '444');

  const mariaClara = res.find(r => r.quarto === '7020' && r.nome.includes('CLARA'));
  assert.strictEqual(mariaClara.status, 'exato');
  assert.strictEqual(mariaClara.aluno.cpf, '777');

  const amabile = res.find(r => r.quarto === '7003' && r.nome.includes('AMABILE'));
  assert.strictEqual(amabile.status, 'aproximado');
  assert.strictEqual(amabile.aluno.cpf, '888');

  const equipe = res.find(r => r.quarto === '7612');
  assert.strictEqual(equipe.status, 'ignorado');
});
