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
const { normalizarDataISO, mesmaData, chaveDiaMes } = require('./datas');

const CAMPOS = {
  alunos: { inicio: 'inicio_viagem', fim: 'fim_viagem' },
  quartos: { inicio: 'inicio_viagem', fim: 'fim_viagem' },
  embarques: { inicio: 'inicioViagem', fim: 'fimViagem' }
};

const limpar = (s) => String(s || '').trim().replace(/\s+/g, ' ');

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

function situacao(inicioISO, fimISO, hojeISO) {
  if (!inicioISO) return 'indefinida';
  if (hojeISO < inicioISO) return 'futura';
  if (fimISO && hojeISO > fimISO) return 'encerrada';
  return 'andamento';
}

const sim = (v) => String(v || '').trim().toUpperCase() === 'SIM';

/** Lista as viagens com contagens úteis para o painel. */
function listarViagens(dataStore, { hojeISO = new Date().toISOString().slice(0, 10) } = {}) {
  const viagens = new Map();

  const obter = (colegio, inicio, fim) => {
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
        faciais_cadastradas: 0,
        com_quarto: 0,
        pernoite: false
      });
    }
    const v = viagens.get(chave);
    if (!v.fim && fim) v.fim = normalizarDataISO(fim) || String(fim);
    return v;
  };

  for (const doc of (dataStore.embarques || new Map()).values()) {
    const v = obter(doc.colegio, doc.inicioViagem, doc.fimViagem);
    if (doc.idPasseio) v.passeios.add(doc.idPasseio);
    if (doc.onibus) v.onibus.add(String(doc.onibus));
    if (doc.cpf) v.cpfs.add(doc.cpf);
    if (sim(doc.embarque)) v.embarcados++;
    if (sim(doc.retorno)) v.retornados++;
    if (doc.facial === true) v.pernoite = true;
  }
  for (const doc of (dataStore.alunos || new Map()).values()) {
    const v = obter(doc.colegio, doc.inicio_viagem, doc.fim_viagem);
    if (doc.cpf) v.cpfs.add(doc.cpf);
    if (doc.facial === true) v.pernoite = true;
    if (doc.facial_cadastrada === true) v.faciais_cadastradas++;
  }
  for (const doc of (dataStore.quartos || new Map()).values()) {
    const v = obter(doc.colegio, doc.inicio_viagem, doc.fim_viagem);
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
    alvo.embarcados += v.embarcados;
    alvo.retornados += v.retornados;
    alvo.faciais_cadastradas += v.faciais_cadastradas;
    alvo.com_quarto += v.com_quarto;
    alvo.pernoite = alvo.pernoite || v.pernoite;
    viagens.delete(chave);
  }

  return [...viagens.values()]
    .map(v => ({
      chave: v.chave,
      colegio: v.colegio,
      inicio: v.inicio,
      fim: v.fim,
      passeios: [...v.passeios].sort(),
      onibus: [...v.onibus].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true })),
      qtd_alunos: v.cpfs.size,
      embarcados: v.embarcados,
      retornados: v.retornados,
      faciais_cadastradas: v.faciais_cadastradas,
      com_quarto: v.com_quarto,
      pernoite: v.pernoite,
      situacao: situacao(normalizarDataISO(v.inicio), normalizarDataISO(v.fim), hojeISO)
    }))
    .sort((a, b) => String(b.inicio).localeCompare(String(a.inicio)));
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
  aplicarEmLotes,
  docsDaViagem,
  chaveViagem
};
