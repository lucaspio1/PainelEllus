/**
 * Datas de viagem (inicio_viagem / fim_viagem).
 *
 * Formato oficial a partir de agora: ISO "AAAA-MM-DD".
 * Até esta correção, a importação gravava "DD/MM" (sem ano). O app não
 * conseguia interpretar e tratava o aluno como sempre ativo: alunos com facial
 * de TODAS as viagens antigas entravam no reconhecimento.
 *
 * Durante a transição convivem os dois formatos, então as comparações usam
 * `mesmaData`, que aceita ambos.
 */

const RE_ISO = /^(\d{4})-(\d{2})-(\d{2})/;
const RE_BR_COMPLETA = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const RE_BR_CURTA = /^(\d{1,2})\/(\d{1,2})$/;

const pad = (n) => String(n).padStart(2, '0');

function paraDate(valor) {
  if (!valor) return null;
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor;
  if (typeof valor.toDate === 'function') return valor.toDate();
  if (typeof valor._seconds === 'number') return new Date(valor._seconds * 1000);
  if (typeof valor === 'string') {
    const t = Date.parse(valor);
    return Number.isNaN(t) ? null : new Date(t);
  }
  return null;
}

/**
 * Converte para "AAAA-MM-DD". Para "DD/MM" (sem ano) só converte se receber
 * `anoReferencia`. Retorna null se não conseguir.
 */
function normalizarDataISO(valor, { anoReferencia } = {}) {
  if (valor === null || valor === undefined || valor === '') return null;
  if (typeof valor !== 'string') {
    const d = paraDate(valor);
    return d ? `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` : null;
  }
  const v = valor.trim();
  let m = v.match(RE_ISO);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = v.match(RE_BR_COMPLETA);
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  m = v.match(RE_BR_CURTA);
  if (m && anoReferencia) return `${anoReferencia}-${pad(m[2])}-${pad(m[1])}`;
  return null;
}

/** "DD/MM" de qualquer formato aceito (para comparar com dados sem ano). */
function chaveDiaMes(valor) {
  if (!valor) return null;
  const v = String(valor).trim();
  let m = v.match(RE_ISO);
  if (m) return `${m[3]}/${m[2]}`;
  m = v.match(RE_BR_COMPLETA) || v.match(RE_BR_CURTA);
  if (m) return `${pad(m[1])}/${pad(m[2])}`;
  return null;
}

/** Compara datas de viagem em qualquer formato aceito. */
function mesmaData(a, b) {
  if (!a || !b) return false;
  const isoA = normalizarDataISO(a);
  const isoB = normalizarDataISO(b);
  if (isoA && isoB) return isoA === isoB;
  const ca = chaveDiaMes(a);
  return ca !== null && ca === chaveDiaMes(b);
}

/** "DD/MM/AAAA" para exibição (aceita qualquer formato; devolve o original se não reconhecer). */
function formatarDataBR(valor) {
  const iso = normalizarDataISO(valor);
  if (!iso) return valor || '';
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

/**
 * Deduz o ano de uma data "DD/MM" gravada sem ano, a partir do momento em que
 * o documento foi criado/importado. Viagens são importadas antes de acontecer;
 * se a data cair mais de 60 dias ANTES da importação, a viagem é do ano seguinte
 * (ex.: importada em dezembro para viajar em janeiro).
 */
function deduzirDataISO(diaMes, referencia) {
  const ref = paraDate(referencia);
  const m = String(diaMes || '').trim().match(RE_BR_CURTA);
  if (!m || !ref) return null;
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  let ano = ref.getUTCFullYear();
  const candidata = Date.UTC(ano, mes - 1, dia);
  if (candidata < ref.getTime() - 60 * 24 * 60 * 60 * 1000) ano += 1;
  return `${ano}-${pad(mes)}-${pad(dia)}`;
}

module.exports = { normalizarDataISO, mesmaData, formatarDataBR, deduzirDataISO, chaveDiaMes, paraDate };
