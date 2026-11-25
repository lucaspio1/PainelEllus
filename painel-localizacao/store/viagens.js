/**
 * Viagens: listagem, edição e exclusão.
 *
 * Uma viagem é identificada por COLÉGIO + DATA DE INÍCIO. Os dados dela ficam
 * espalhados em três coleções, com nomes de campo diferentes:
 *   alunos    → colegio, inicio_viagem, fim_viagem, facial
 *   quartos   → colegio, inicio_viagem, fim_viagem, facial
 *   embarques → colegio, inicioViagem, fimViagem, idPasseio, facial
 *
 * `facial` = viagem com pernoite (controle de quartos por reconhecimento facial).
 * Funções puras: recebem o cache em RAM (dataStore) e devolvem o que gravar.
 */
const { normalizarDataISO, mesmaData, chaveDiaMes, deduzirDataISO, paraDate } = require('./datas');

const CAMPOS = {
  alunos: { inicio: 'inicio_viagem', fim: 'fim_viagem' },
  quartos: { inicio: 'inicio_viagem', fim: 'fim_viagem' },
  embarques: { inicio: 'inicioViagem', fim: 'fimViagem' }
};

const limpar = (s) => String(s || '').trim().replace(/\s+/g, ' ');
const limparCpf = (c) => String(c || '').replace(/\D/g, '');

/** Chave estável da viagem (aceita data ISO ou "DD/MM" antigo). */
function chaveViagem(colegio, inicio) {
  const data = normalizarDataISO(inicio) || chaveDiaMes(inicio) || String(inicio || '');
  return `${limpar(colegio).toUpperCase()}|${data}`;
}

function pertenceAViagem(doc, colecao, colegio, inicio) {
  return limpar(doc.colegio).toUpperCase() === limpar(colegio).toUpperCase() &&
    mesmaData(doc[CAMPOS[colecao].inicio], inicio);
}

function docsDaViagem(dataStore, colegio, inicio) {
  const resultado = {};
  for (const col of Object.keys(CAMPOS)) {
    const mapa = dataStore[col] instanceof Map ? dataStore[col] : new Map();
    resultado[col] = [];
    for (const [id, doc] of mapa.entries()) {
      if (pertenceAViagem(doc, col, colegio, inicio)) resultado[col].push({ id, doc });
    }
  }
  return resultado;
}

/**
 * Data antiga "DD/MM" (sem ano) → "AAAA-MM-DD".
 * Usa o momento da importação (created_at) quando existe; senão, o ano que
 * deixa a data mais perto de hoje. Assim "Saem amanhã" e "Acontecendo hoje"
 * funcionam mesmo antes de rodar scripts/migrar-datas-viagem.js.
 */
function completarAno(valor, { referencia, hojeISO }) {
  const iso = normalizarDataISO(valor);
  if (iso) return iso;
  if (!/^\s*\d{1,2}\/\d{1,2}\s*$/.test(String(valor || ''))) return String(valor || '');
  const pelaImportacao = referencia ? deduzirDataISO(valor, referencia) : null;
  if (pelaImportacao) return pelaImportacao;
  const ano = Number(hojeISO.slice(0, 4));
  const hoje = Date.parse(hojeISO);
  const opcoes = [ano - 1, ano, ano + 1].map(a => normalizarDataISO(valor, { anoReferencia: a }));
  return opcoes.reduce((melhor, d) =>
    Math.abs(Date.parse(d) - hoje) < Math.abs(Date.parse(melhor) - hoje) ? d : melhor);
}

function situacao(inicioISO, fimISO, hojeISO) {
  if (!inicioISO) return 'indefinida';
  if (hojeISO < inicioISO) return 'futura';
  if (fimISO && hojeISO > fimISO) return 'encerrada';
  return 'andamento';
}

const sim = (v) => String(v || '').trim().toUpperCase() === 'SIM';

/** Verifica se o documento (aluno ou embarque) indica facial cadastrada. */
function temFacialCadastrada(doc) {
  if (!doc) return false;
  if (doc.facial_cadastrada === true) return true;
  if (String(doc.Facial || '').trim().toUpperCase() === 'CADASTRADA') return true;
  if (Array.isArray(doc.embedding) && doc.embedding.length > 0) return true;
  if (typeof doc.embedding === 'string' && doc.embedding.trim().length > 0) return true;
  return false;
}

/** Chave normalizada de CPF para deduplicar alunos e faciais entre coleções. */
function cpfChave(doc) {
  if (!doc) return '';
  const bruto = doc.cpf || doc.id || '';
  return limparCpf(bruto) || limpar(bruto);
}

/** Lista as viagens com contagens úteis para o painel. */
function listarViagens(dataStore, { hojeISO = new Date().toISOString().slice(0, 10) } = {}) {
  const viagens = new Map();

  const obter = (colegio, inicio, fim, criadoEm) => {
    const chave = chaveViagem(colegio, inicio);
    if (!viagens.has(chave)) {
      viagens.set(chave, {
        chave,
        colegio: limpar(colegio) || 'Sem Colégio',
        inicio: normalizarDataISO(inicio) || String(inicio || ''),
        fim: normalizarDataISO(fim) || String(fim || ''),
        passeios: new Set(),
        onibus: new Set(),
        cpfs: new Set(),
        embarcados: 0,
        retornados: 0,
        faciais_cpfs: new Set(),
        com_quarto: 0,
        pernoite: false,
        referencia: null // created_at da importação, para deduzir o ano de "DD/MM"
      });
    }
    const v = viagens.get(chave);
    if (!v.fim && fim) v.fim = normalizarDataISO(fim) || String(fim);
    if (!v.referencia && paraDate(criadoEm)) v.referencia = criadoEm;
    return v;
  };

  for (const doc of (dataStore.embarques || new Map()).values()) {
    const v = obter(doc.colegio, doc.inicioViagem, doc.fimViagem, doc.created_at);
    const cpf = cpfChave(doc);
    if (doc.idPasseio) v.passeios.add(doc.idPasseio);
    if (doc.onibus) v.onibus.add(String(doc.onibus));
    if (cpf) v.cpfs.add(cpf);
    if (cpf && temFacialCadastrada(doc)) v.faciais_cpfs.add(cpf);
    if (sim(doc.embarque)) v.embarcados++;
    if (sim(doc.retorno)) v.retornados++;
    if (doc.facial === true) v.pernoite = true;
  }
  for (const doc of (dataStore.alunos || new Map()).values()) {
    const v = obter(doc.colegio, doc.inicio_viagem, doc.fim_viagem);
    const cpf = cpfChave(doc);
    if (cpf) v.cpfs.add(cpf);
    if (doc.facial === true) v.pernoite = true;
    if (cpf && temFacialCadastrada(doc)) v.faciais_cpfs.add(cpf);
  }
  for (const doc of (dataStore.quartos || new Map()).values()) {
    const v = obter(doc.colegio, doc.inicio_viagem, doc.fim_viagem, doc.created_at);
    if (doc.facial === true) v.pernoite = true;
    if (String(doc.numero_quarto || '').trim()) v.com_quarto++;
  }

  // Transição: registros ainda com data "DD/MM" (sem ano) se juntam à viagem
  // do mesmo colégio cuja data completa tem o mesmo dia/mês.
  for (const [chave, v] of [...viagens.entries()]) {
    if (normalizarDataISO(v.inicio)) continue;
    const alvo = [...viagens.values()].find(o => o !== v &&
      limpar(o.colegio).toUpperCase() === limpar(v.colegio).toUpperCase() &&
      normalizarDataISO(o.inicio) && mesmaData(o.inicio, v.inicio));
    if (!alvo) continue;
    v.passeios.forEach(p => alvo.passeios.add(p));
    v.onibus.forEach(o => alvo.onibus.add(o));
    v.cpfs.forEach(c => alvo.cpfs.add(c));
    v.faciais_cpfs.forEach(c => alvo.faciais_cpfs.add(c));
    alvo.embarcados += v.embarcados;
    alvo.retornados += v.retornados;
    alvo.com_quarto += v.com_quarto;
    alvo.pernoite = alvo.pernoite || v.pernoite;
    viagens.delete(chave);
  }

  // Completa o ano das datas antigas "DD/MM"
  for (const v of viagens.values()) {
    if (normalizarDataISO(v.inicio) && normalizarDataISO(v.fim)) continue;
    v.data_sem_ano = true;
    v.inicio = completarAno(v.inicio, { referencia: v.referencia, hojeISO });
    if (v.fim) {
      let fim = completarAno(v.fim, { referencia: normalizarDataISO(v.inicio) || v.referencia, hojeISO });
      if (normalizarDataISO(v.inicio) && normalizarDataISO(fim) && fim < v.inicio) {
        fim = `${Number(fim.slice(0, 4)) + 1}${fim.slice(4)}`; // viagem que vira o ano
      }
      v.fim = fim;
    }
  }

  return [...viagens.values()]
    .map(v => {
      const faciaisCadastradas = v.faciais_cpfs.size;
      const faciaisPendentes = Math.max(0, v.cpfs.size - faciaisCadastradas);
      return {
        chave: v.chave,
        colegio: v.colegio,
        inicio: v.inicio,
        fim: v.fim,
        data_sem_ano: v.data_sem_ano === true,
        passeios: [...v.passeios].sort(),
        onibus: [...v.onibus].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true })),
        qtd_alunos: v.cpfs.size,
        embarcados: v.embarcados,
        retornados: v.retornados,
        faciais_cadastradas: faciaisCadastradas,
        faciais_pendentes: faciaisPendentes,
        com_quarto: v.com_quarto,
        pernoite: v.pernoite,
        situacao: situacao(normalizarDataISO(v.inicio), normalizarDataISO(v.fim), hojeISO)
      };
    })
    .sort((a, b) => {
      const cmpData = String(b.inicio).localeCompare(String(a.inicio));
      if (cmpData !== 0) return cmpData;
      return String(a.colegio).localeCompare(String(b.colegio), 'pt-BR', { sensitivity: 'base' });
    });
}

/**
 * Planeja a edição de uma viagem.
 * `novo`: { colegio?, inicio?, fim?, idPasseio?, pernoite? } (só o que mudar)
 * @returns {{ erro: string } | { escritas: Array<{col, id, data}>, total: number }}
 */
function planejarEdicao(dataStore, { colegio, inicio }, novo, { agoraISO = new Date().toISOString() } = {}) {
  const docs = docsDaViagem(dataStore, colegio, inicio);
  const total = Object.values(docs).reduce((n, arr) => n + arr.length, 0);
  if (total === 0) return { erro: 'Viagem não encontrada.' };

  const mudancas = {};
  if (novo.colegio !== undefined) {
    const c = limpar(novo.colegio);
    if (!c) return { erro: 'Informe o colégio.' };
    mudancas.colegio = c;
  }
  if (novo.inicio !== undefined) {
    const d = normalizarDataISO(novo.inicio);
    if (!d) return { erro: 'Data de início inválida.' };
    mudancas.inicio = d;
  }
  if (novo.fim !== undefined) {
    const d = normalizarDataISO(novo.fim);
    if (!d) return { erro: 'Data de fim inválida.' };
    mudancas.fim = d;
  }
  if (novo.idPasseio !== undefined) {
    const p = limpar(novo.idPasseio);
    if (!p) return { erro: 'Informe o ID do passeio.' };
    mudancas.idPasseio = p;
  }
  if (novo.pernoite !== undefined) mudancas.pernoite = novo.pernoite === true;

  // Datas finais para validar início <= fim
  const primeiro = docs.embarques[0] || docs.alunos[0] || docs.quartos[0];
  const colPrimeiro = docs.embarques[0] ? 'embarques' : docs.alunos[0] ? 'alunos' : 'quartos';
  const inicioFinal = mudancas.inicio || normalizarDataISO(primeiro.doc[CAMPOS[colPrimeiro].inicio]);
  const fimFinal = mudancas.fim || normalizarDataISO(primeiro.doc[CAMPOS[colPrimeiro].fim]);
  if (inicioFinal && fimFinal && fimFinal < inicioFinal) {
    return { erro: 'A data de fim não pode ser antes do início.' };
  }
  if (Object.keys(mudancas).length === 0) return { erro: 'Nada para alterar.' };

  const escritas = [];
  for (const [col, lista] of Object.entries(docs)) {
    for (const { id } of lista) {
      const data = { updated_at: agoraISO };
      if (mudancas.colegio) data.colegio = mudancas.colegio;
      if (mudancas.inicio) data[CAMPOS[col].inicio] = mudancas.inicio;
      if (mudancas.fim) data[CAMPOS[col].fim] = mudancas.fim;
      if (mudancas.idPasseio && col === 'embarques') data.idPasseio = mudancas.idPasseio;
      if (mudancas.pernoite !== undefined) data.facial = mudancas.pernoite;
      escritas.push({ col, id, data });
    }
  }
  return { escritas, total };
}

/** Planeja a exclusão de uma viagem (alunos, quartos E embarques). */
function planejarExclusao(dataStore, { colegio, inicio }) {
  const docs = docsDaViagem(dataStore, colegio, inicio);
  const exclusoes = [];
  for (const [col, lista] of Object.entries(docs)) {
    for (const { id } of lista) exclusoes.push({ col, id });
  }
  return { exclusoes, porColecao: Object.fromEntries(Object.entries(docs).map(([c, l]) => [c, l.length])) };
}

// ----------------------------------------------------------------------------
// Alunos de uma viagem (listar, editar e excluir um aluno)
// O ID do documento é o CPF nas três coleções.
// ----------------------------------------------------------------------------

/** Documentos de UM aluno que pertencem à viagem (por coleção). */
function docsDoAluno(dataStore, { colegio, inicio, cpf }) {
  const id = limparCpf(cpf);
  const resultado = {};
  for (const col of Object.keys(CAMPOS)) {
    const mapa = dataStore[col] instanceof Map ? dataStore[col] : new Map();
    const doc = id ? mapa.get(id) : null;
    resultado[col] = doc && pertenceAViagem(doc, col, colegio, inicio) ? doc : null;
  }
  return { id, docs: resultado };
}

/** Lista os alunos da viagem juntando alunos, quartos e embarques. */
function listarAlunosDaViagem(dataStore, { colegio, inicio }) {
  const docs = docsDaViagem(dataStore, colegio, inicio);
  const porCpf = new Map();
  const obter = (id) => {
    if (!porCpf.has(id)) porCpf.set(id, { cpf: id, aluno: null, quarto: null, embarque: null });
    return porCpf.get(id);
  };
  docs.alunos.forEach(({ id, doc }) => { obter(id).aluno = doc; });
  docs.quartos.forEach(({ id, doc }) => { obter(id).quarto = doc; });
  docs.embarques.forEach(({ id, doc }) => { obter(id).embarque = doc; });

  return [...porCpf.values()].map(({ cpf, aluno, quarto, embarque }) => {
    const a = aluno || {}, q = quarto || {}, e = embarque || {};
    return {
      cpf: a.cpf || e.cpf || q.cpf || cpf,
      nome: limpar(a.nome || e.nome || q.nome_hospede) || '(sem nome)',
      turma: limpar(a.turma || e.turma),
      onibus: limpar(e.onibus),
      idPasseio: limpar(e.idPasseio),
      numero_quarto: limpar(q.numero_quarto),
      embarque: limpar(e.embarque),
      retorno: limpar(e.retorno),
      facial_cadastrada: temFacialCadastrada(aluno) || temFacialCadastrada(embarque),
      movimentacao: limpar(a.movimentacao),
      pernoite: a.facial === true || q.facial === true || e.facial === true,
      colecoes: { alunos: !!aluno, quartos: !!quarto, embarques: !!embarque }
    };
  }).sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR'));
}

/**
 * Planeja a edição de UM aluno da viagem.
 * `novo`: { nome?, turma?, onibus?, idPasseio?, numero_quarto? } (só o que mudar)
 */
function planejarEdicaoAluno(dataStore, { colegio, inicio, cpf }, novo, { agoraISO = new Date().toISOString() } = {}) {
  const { id, docs } = docsDoAluno(dataStore, { colegio, inicio, cpf });
  if (!id || !Object.values(docs).some(Boolean)) return { erro: 'Aluno não encontrado nesta viagem.' };
  if (!novo || typeof novo !== 'object') return { erro: 'Nada para alterar.' };

  const mudancas = {};
  if (novo.nome !== undefined) {
    const n = limpar(novo.nome);
    if (!n) return { erro: 'Informe o nome do aluno.' };
    mudancas.nome = n;
  }
  for (const campo of ['turma', 'onibus', 'idPasseio', 'numero_quarto']) {
    if (novo[campo] !== undefined) mudancas[campo] = limpar(novo[campo]);
  }
  if (Object.keys(mudancas).length === 0) return { erro: 'Nada para alterar.' };

  const escritas = [];
  if (docs.alunos) {
    const data = {};
    if (mudancas.nome !== undefined) data.nome = mudancas.nome;
    if (mudancas.turma !== undefined) data.turma = mudancas.turma;
    if (Object.keys(data).length) escritas.push({ col: 'alunos', id, data: { ...data, updated_at: agoraISO } });
  }
  if (docs.quartos) {
    const data = {};
    if (mudancas.nome !== undefined) data.nome_hospede = mudancas.nome;
    if (mudancas.numero_quarto !== undefined) data.numero_quarto = mudancas.numero_quarto;
    if (Object.keys(data).length) escritas.push({ col: 'quartos', id, data: { ...data, updated_at: agoraISO } });
  }
  if (docs.embarques) {
    const data = {};
    if (mudancas.nome !== undefined) data.nome = mudancas.nome;
    if (mudancas.turma !== undefined) data.turma = mudancas.turma;
    if (mudancas.onibus !== undefined) data.onibus = mudancas.onibus;
    if (mudancas.idPasseio !== undefined) {
      if (!mudancas.idPasseio) return { erro: 'Informe o ID do passeio.' };
      data.idPasseio = mudancas.idPasseio;
    }
    if (Object.keys(data).length) escritas.push({ col: 'embarques', id, data: { ...data, updated_at: agoraISO } });
  }
  if (escritas.length === 0) return { erro: 'Nada para alterar.' };
  return { escritas, mudancas };
}

/** Valor mais frequente (não vazio) de um campo em uma lista de documentos. */
function valorMaisFrequente(lista, campo) {
  const contagem = new Map();
  for (const { doc } of lista) {
    const v = limpar(doc && doc[campo]);
    if (!v) continue;
    contagem.set(v, (contagem.get(v) || 0) + 1);
  }
  if (contagem.size === 0) return '';
  return [...contagem.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR', { numeric: true }))[0][0];
}

/**
 * Planeja a adição de UM aluno em uma viagem existente, puxando automaticamente
 * colégio, datas, pernoite (facial), ID do passeio, ônibus e turma (quando única)
 * e replicando nas 3 coleções: alunos, quartos e embarques.
 */
function planejarAdicaoAluno(dataStore, { colegio, inicio }, novo, { agoraISO = new Date().toISOString() } = {}) {
  const nome = limpar(novo && novo.nome);
  const cpf = limparCpf(novo && novo.cpf);
  if (!nome) return { erro: 'Informe o nome do aluno.' };
  if (!cpf) return { erro: 'Informe o CPF do aluno.' };

  const docs = docsDaViagem(dataStore, colegio, inicio);
  const totalViagem = docs.alunos.length + docs.quartos.length + docs.embarques.length;
  if (totalViagem === 0) return { erro: 'Viagem não encontrada.' };

  const jaNaViagem = docs.alunos.some(d => d.id === cpf) ||
    docs.quartos.some(d => d.id === cpf) ||
    docs.embarques.some(d => d.id === cpf);
  if (jaNaViagem) return { erro: 'Este CPF já está cadastrado nesta viagem.' };

  const refEmb = docs.embarques[0] && docs.embarques[0].doc;
  const refAluno = docs.alunos[0] && docs.alunos[0].doc;
  const refQuarto = docs.quartos[0] && docs.quartos[0].doc;
  const ref = refEmb || refAluno || refQuarto;

  const colegioViagem = limpar(ref.colegio) || limpar(colegio);
  const inicioBruto = (refEmb && refEmb.inicioViagem) || (refAluno && refAluno.inicio_viagem) || (refQuarto && refQuarto.inicio_viagem) || inicio;
  const fimBruto = (refEmb && refEmb.fimViagem) || (refAluno && refAluno.fim_viagem) || (refQuarto && refQuarto.fim_viagem) || inicioBruto;
  const inicioFinal = normalizarDataISO(inicioBruto) || String(inicioBruto || '');
  const fimFinal = normalizarDataISO(fimBruto) || String(fimBruto || inicioFinal);

  const pernoite = [...docs.alunos, ...docs.quartos, ...docs.embarques].some(({ doc }) => doc && doc.facial === true);
  const idPasseio = valorMaisFrequente(docs.embarques, 'idPasseio');
  const onibus = valorMaisFrequente(docs.embarques, 'onibus');

  // Só preenche turma automaticamente se todos os alunos da viagem com turma forem da mesma turma
  const turmas = new Set(
    [...docs.alunos, ...docs.embarques]
      .map(({ doc }) => limpar(doc && doc.turma))
      .filter(Boolean)
  );
  const turma = turmas.size === 1 ? [...turmas][0] : '';

  const alunoExistente = dataStore.alunos instanceof Map ? dataStore.alunos.get(cpf) : null;
  const quartoExistente = dataStore.quartos instanceof Map ? dataStore.quartos.get(cpf) : null;
  const embarqueExistente = dataStore.embarques instanceof Map ? dataStore.embarques.get(cpf) : null;
  const jaTemFacial = !!(alunoExistente && alunoExistente.facial_cadastrada === true);

  const dadosAluno = {
    colegio: colegioViagem,
    cpf,
    nome,
    turma,
    inicio_viagem: inicioFinal,
    fim_viagem: fimFinal,
    facial: pernoite,
    movimentacao: 'QUARTO',
    updated_at: agoraISO
  };

  const dadosQuarto = {
    colegio: colegioViagem,
    cpf,
    nome_hospede: nome,
    numero_quarto: '',
    inicio_viagem: inicioFinal,
    fim_viagem: fimFinal,
    facial: pernoite,
    updated_at: agoraISO
  };
  if (!quartoExistente) dadosQuarto.created_at = agoraISO;

  const dadosEmbarque = {
    colegio: colegioViagem,
    cpf,
    nome,
    turma,
    idPasseio,
    onibus,
    inicioViagem: inicioFinal,
    fimViagem: fimFinal,
    facial: pernoite,
    embarque: '',
    retorno: '',
    embarque_at: null,
    retorno_at: null,
    Facial: jaTemFacial ? 'CADASTRADA' : 'PENDENTE',
    facial_cadastrada: jaTemFacial,
    updated_at: agoraISO
  };
  if (!embarqueExistente) dadosEmbarque.created_at = agoraISO;

  return {
    escritas: [
      { col: 'alunos', id: cpf, data: dadosAluno },
      { col: 'quartos', id: cpf, data: dadosQuarto },
      { col: 'embarques', id: cpf, data: dadosEmbarque }
    ],
    aluno: {
      cpf,
      nome,
      colegio: colegioViagem,
      turma,
      inicio_viagem: inicioFinal,
      fim_viagem: fimFinal,
      idPasseio,
      onibus,
      numero_quarto: '',
      pernoite
    }
  };
}

/** Planeja a exclusão de UM aluno da viagem (alunos, quartos e embarques). */
function planejarExclusaoAluno(dataStore, { colegio, inicio, cpf }) {
  const { id, docs } = docsDoAluno(dataStore, { colegio, inicio, cpf });
  const exclusoes = Object.entries(docs).filter(([, doc]) => doc).map(([col]) => ({ col, id }));
  if (exclusoes.length === 0) return { erro: 'Aluno não encontrado nesta viagem.' };
  const nome = limpar((docs.alunos && docs.alunos.nome) || (docs.embarques && docs.embarques.nome) ||
    (docs.quartos && docs.quartos.nome_hospede));
  return { exclusoes, nome };
}

/** Grava em lotes de até 450 operações (limite do Firestore: 500). */
async function aplicarEmLotes(db, operacoes, aplicar) {
  for (let i = 0; i < operacoes.length; i += 450) {
    const batch = db.batch();
    operacoes.slice(i, i + 450).forEach(op => aplicar(batch, op));
    await batch.commit();
  }
}

module.exports = {
  listarViagens,
  planejarEdicao,
  planejarExclusao,
  listarAlunosDaViagem,
  planejarAdicaoAluno,
  planejarEdicaoAluno,
  planejarExclusaoAluno,
  aplicarEmLotes,
  docsDaViagem,
  chaveViagem,
  completarAno,
  temFacialCadastrada
};
