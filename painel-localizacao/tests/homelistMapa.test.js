// Testes do parser e cruzamento de Mapa de Camas. Rodar: npm run test:unit
const test = require('node:test');
const assert = require('node:assert');
const {
  normalizarNome,
  removerCargo,
  parsearNumeroQuarto,
  parsearMapaCamasCSV,
  cruzarMapaComAlunos,
  gerarLinhasModeloPadrao
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

const CSV_PADRAO_25_11 = `Standard,,,COLÉGIO,SEXO,,
Aptos,Pessoas,,,F,,
1001,2,1 cama de casal.,RADIAR ,,
,,SEPARAR CAMA,ISABELLE NEUMANN RODRIGUES,,
,,,HELENA MARTINELLI GOULART,,
1005,4,2  cama de casal e 2 auxiliares.,ESCOLA DA ILHA,F,,
,,,AYMÊ HAMAD BARCARO,,
,,,VAGA LIVRE,,
1012,4,2  cama de casal e 2 auxiliares.,ED SANTA ISABEL,F,,
,,,LIVIA FLORES BIANCHINI,,
,,,KAMILA REGINA DE MELO - PROF,,
1014,2,1 cama de casal. SEPARAR CAMAS,ALFA COQUEIROS,F,,
,,,Carolina Kiara Martins Prates,,
,,,LILIAN FERNANDA ROCHA GOULART,PROF ALFA COQUEIROS,
45 aptos,178,,,,,
Super luxo,,,,,,
Aptos,Pessoas,,,,,
5204.33333333333,4,2 cama de casal ou 4 de solteiro.,COC PORTO BELO,F,,
,,,ESTER BRUN MENGARDA,,
5205.83333333333,4,2 cama de casal ou 4 de solteiro.,COC PORTO BELO,F,,
,,,LETÍCIA DOMINGUES PEREIRA,,
5219.33333333333,4,2 cama de casal ou 4 de solteiro.,PROFESSORAS,F,,
,,,ALINE CLEUSA DE SOUZA,PROF BOM JESUS FLORIPA,
,,COLOCAR CAMA NO QUARTO 5220,CAMA NO 5220,,
5302,4,2 cama de casal ou 4 de solteiro.,AZ FLORIPA,F,,
,,,EDUARDA SCHAFER TOMAZELI,,
,,,Gabriela,,,FALTA NOME COMPLETO DA ALUNA
 Aptos 236,956,,,,,
suite presidencial,,,,,,
Aptos,Pessoas,,,,,
7612,2,1 cama de casal.,ELLUS,,
,,,,,,
7613,2,1 cama de casal.,ELLUS,,
prime terreo,,,,,,
Aptos,Pessoas,,,,,
6012,4,2 cama de casal ou 4 de solteiro.,PROFESSORES,,
10 aptos,40,,Paulo André Banys ,PROF COLÉGIO DO CAMPECHE,
,,,WILSON BIANCHI DE AZEVEDO,PROF COLÉGIO DO CAMPECHE,
,,PROFESSORES NA POUSADA,,,,
,,,,,,
,,CAMANGUI JOSÉ AGNELINO ,PROF PADRE AGOSTINHO,,SEM QUARTO
,,,,2026,,`;

test('parsearNumeroQuarto arredonda decimais de arraste do Excel', () => {
  assert.strictEqual(parsearNumeroQuarto('1001'), '1001');
  assert.strictEqual(parsearNumeroQuarto('5204.33333333333'), '5204');
  assert.strictEqual(parsearNumeroQuarto('5205.83333333333'), '5206');
  assert.strictEqual(parsearNumeroQuarto('5220.83333333333'), '5221');
  assert.strictEqual(parsearNumeroQuarto('10 aptos'), null);
});

test('removerCargo limpa sufixos e prefixos de professor/acompanhante', () => {
  assert.strictEqual(removerCargo('KAMILA REGINA DE MELO - PROF'), 'KAMILA REGINA DE MELO');
  assert.strictEqual(removerCargo('Bianca Marques Fernandes Castro (PROF)'), 'BIANCA MARQUES FERNANDES CASTRO');
  assert.strictEqual(removerCargo('FRANCIELLE TEREZINHA DOS SANTOS - PROF GERAÇÃO'), 'FRANCIELLE TEREZINHA DOS SANTOS');
  assert.strictEqual(removerCargo('PROF LAVINIA'), 'LAVINIA');
});

test('parsearMapaCamasCSV entende o novo formato padrão (25/11) e trata todos os casos especiais', () => {
  const { blocos, itens } = parsearMapaCamasCSV(CSV_PADRAO_25_11);
  assert.strictEqual(blocos.length, 1);
  assert.strictEqual(blocos[0].key, 'padrao');

  const pares = itens.map(i => `${i.quarto}:${i.nome}`);
  // Quartos normais e observação na coluna C
  assert.ok(pares.includes('1001:ISABELLE NEUMANN RODRIGUES'));
  assert.ok(pares.includes('1001:HELENA MARTINELLI GOULART'));
  // Colégio NÃO entra como hóspede
  assert.ok(!itens.some(i => i.nome === 'RADIAR' || i.nome === 'ELLUS' || i.nome === 'PROFESSORES'));
  // Placeholders ignorados
  assert.ok(!itens.some(i => /VAGA LIVRE|CAMA NO 5220|SEM QUARTO|2026|PROF PADRE AGOSTINHO/i.test(i.nome)));
  // Decimais arredondados corretamente
  assert.ok(pares.includes('5204:ESTER BRUN MENGARDA'));
  assert.ok(pares.includes('5206:LETÍCIA DOMINGUES PEREIRA'));
  // Quarto 6012 com "10 aptos" na mesma linha do primeiro hóspede
  assert.ok(pares.includes('6012:Paulo André Banys'));
  assert.ok(pares.includes('6012:WILSON BIANCHI DE AZEVEDO'));

  // Colégio da planilha e marcação de professores
  const isabelle = itens.find(i => i.nome === 'ISABELLE NEUMANN RODRIGUES');
  assert.strictEqual(isabelle.colegioPlanilha, 'RADIAR');
  assert.strictEqual(isabelle.ehProfessor, false);

  const kamila = itens.find(i => i.nome === 'KAMILA REGINA DE MELO - PROF');
  assert.strictEqual(kamila.ehProfessor, true);

  const lilian = itens.find(i => i.nome === 'LILIAN FERNANDA ROCHA GOULART');
  assert.strictEqual(lilian.ehProfessor, true);

  const paulo = itens.find(i => i.nome === 'Paulo André Banys');
  assert.strictEqual(paulo.ehProfessor, true);
});

test('cruzarMapaComAlunos no formato padrão desambigua Gabriela pelo quarto e casa professor com sufixo', () => {
  const { itens } = parsearMapaCamasCSV(CSV_PADRAO_25_11);
  const alunos = [
    { cpf: '101', nome: 'ISABELLE NEUMANN RODRIGUES', colegio: 'RADIAR' },
    { cpf: '102', nome: 'KAMILA REGINA DE MELO', colegio: 'ED SANTA ISABEL' },
    { cpf: '103', nome: 'EDUARDA SCHAFER TOMAZELI', colegio: 'AZ FLORIPA' },
    { cpf: '104', nome: 'GABRIELA MENDES SOUZA', colegio: 'AZ FLORIPA' },
    { cpf: '105', nome: 'GABRIELA COSTA LIMA', colegio: 'OUTRO COLEGIO' }
  ];

  const res = cruzarMapaComAlunos(itens, { padrao: alunos });

  const isabelle = res.find(r => r.nome === 'ISABELLE NEUMANN RODRIGUES');
  assert.strictEqual(isabelle.status, 'exato');
  assert.strictEqual(isabelle.aluno.cpf, '101');

  const kamila = res.find(r => r.nome === 'KAMILA REGINA DE MELO - PROF');
  assert.strictEqual(kamila.status, 'exato');
  assert.strictEqual(kamila.aluno.cpf, '102');

  const gabriela = res.find(r => r.quarto === '5302' && r.nome === 'Gabriela');
  assert.strictEqual(gabriela.status, 'por_quarto');
  assert.strictEqual(gabriela.aluno.cpf, '104');
});

test('gerarLinhasModeloPadrao gera planilha que o próprio parser lê corretamente', () => {
  const linhas = gerarLinhasModeloPadrao();
  const csv = linhas.map(r => r.join(',')).join('\n');
  const { itens } = parsearMapaCamasCSV(csv);

  assert.strictEqual(itens.length, 9);
  assert.strictEqual(itens[0].quarto, '1001');
  assert.strictEqual(itens[0].colegioPlanilha, 'EXEMPLO COLÉGIO A');
  assert.strictEqual(itens[0].sexo, 'F');
  assert.strictEqual(itens[0].nome, 'MARIA SILVA SOUZA');
  assert.ok(!itens.some(i => i.nome === 'VAGA LIVRE'));
  assert.ok(itens.some(i => i.quarto === '2001' && i.nome === 'PEDRO HENRIQUE MARTINS' && i.sexo === 'M'));
});
