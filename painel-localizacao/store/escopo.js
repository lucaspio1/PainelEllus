/**
 * Escopo do celular: só as viagens relevantes agora.
 *
 * Antes, todo celular recebia TODOS os alunos de todas as viagens (nome, CPF
 * e facial), inclusive viagens encerradas e de outros colégios: dados pessoais
 * desnecessários no aparelho (LGPD), sincronização pesada e mais chance de o
 * reconhecimento confundir alunos.
 *
 * Relevante = viagem que já começou ou começa em até DIAS_ANTES dias, e que
 * terminou há no máximo DIAS_DEPOIS dias (folga para o retorno).
 *
 * Só vale para o app que pede (`escopo=viagens_ativas`): o app antigo só baixa
 * o que mudou e nunca receberia uma viagem importada com antecedência quando a
 * data dela chegasse.
 */
const { normalizarDataISO } = require('./datas');
const { completarAno } = require('./viagens');

const DIAS_ANTES = Number(process.env.SYNC_DIAS_ANTES || 3);
const DIAS_DEPOIS = Number(process.env.SYNC_DIAS_DEPOIS || 1);

const CAMPOS = {
  alunos: ['inicio_viagem', 'fim_viagem'],
  quartos: ['inicio_viagem', 'fim_viagem'],
  embarques: ['inicioViagem', 'fimViagem']
};

/** Data de hoje no Brasil (o servidor roda em UTC). */
function hojeBrasil(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(now);
}

function somarDias(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function janelaAtiva(now = new Date(), { diasAntes = DIAS_ANTES, diasDepois = DIAS_DEPOIS } = {}) {
  const hoje = hojeBrasil(now);
  return { hoje, de: somarDias(hoje, -diasDepois), ate: somarDias(hoje, diasAntes) };
}

/** O documento pertence a uma viagem dentro da janela? Sem data → não. */
function docRelevante(doc, colecao, janela) {
  const [campoInicio, campoFim] = CAMPOS[colecao];
  const inicio = completarAno(doc[campoInicio], { referencia: doc.created_at, hojeISO: janela.hoje });
  if (!normalizarDataISO(inicio)) return false;
  let fim = completarAno(doc[campoFim], { referencia: inicio, hojeISO: janela.hoje });
  if (!normalizarDataISO(fim)) fim = inicio;
  if (fim < inicio) fim = `${Number(fim.slice(0, 4)) + 1}${fim.slice(4)}`; // vira o ano
  return inicio <= janela.ate && fim >= janela.de;
}

// Cálculo leve, mas roda a cada sincronização de cada celular: guarda por 30 s
let memo = null;

/**
 * @returns {{ janela, cpfs: Set<string>, porColecao: {alunos:Set, quartos:Set, embarques:Set} }}
 */
function calcularEscopo(dataStore, now = new Date()) {
  const janela = janelaAtiva(now);
  const assinatura = [janela.hoje, ...Object.keys(CAMPOS).map(c => (dataStore.lastUpdate || {})[c])].join('|');
  if (memo && memo.assinatura === assinatura && now.getTime() - memo.em < 30000) return memo.resultado;

  const porColecao = {};
  const cpfs = new Set();
  for (const col of Object.keys(CAMPOS)) {
    porColecao[col] = new Set();
    const mapa = dataStore[col] instanceof Map ? dataStore[col] : new Map();
    for (const [id, doc] of mapa.entries()) {
      if (docRelevante(doc, col, janela)) {
        porColecao[col].add(id);
        cpfs.add(id); // ID do documento = CPF nas três coleções
      }
    }
  }
  const resultado = { janela, cpfs, porColecao };
  memo = { assinatura, em: now.getTime(), resultado };
  return resultado;
}

function limparMemo() { memo = null; }

module.exports = { calcularEscopo, docRelevante, janelaAtiva, hojeBrasil, limparMemo, CAMPOS };
