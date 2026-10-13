/**
 * Monta a resposta do delta sync do app mobile (GET /api/mobile/sync).
 *
 * Correções em relação à versão anterior:
 * - Cold start: enquanto o cache em RAM não carregou do Firestore, responde
 *   "não pronto" (503). Antes respondia vazio e o app avançava o `since`,
 *   perdendo tudo o que mudou antes.
 * - Margem de segurança: o `serverTime` devolvido fica MARGEM_MS no passado.
 *   Uma escrita feita em outra instância do Cloud Run (ou ainda em commit)
 *   pode chegar ao cache desta instância alguns segundos depois do horário
 *   gravado em `updated_at`; sem margem ela nunca era enviada ao celular.
 *   Documentos dentro da margem são reenviados — o app grava por chave
 *   (upsert), então repetir é inofensivo.
 * - Sync completo (sem `since`): envia tudo, inclusive documentos antigos sem
 *   `updated_at`, que antes nunca entravam no delta.
 */

const COLECOES_DELTA = ['alunos', 'quartos', 'embarques', 'eventos'];
const MARGEM_MS = Number(process.env.DELTA_MARGIN_MS || 5 * 60 * 1000);

/** updated_at pode ser string ISO, Date ou Timestamp do Firestore. */
function paraMillis(valor) {
  if (!valor) return NaN;
  if (typeof valor === 'string') return Date.parse(valor);
  if (valor instanceof Date) return valor.getTime();
  if (typeof valor.toDate === 'function') return valor.toDate().getTime();
  if (typeof valor._seconds === 'number') return valor._seconds * 1000;
  return NaN;
}

function cacheProntoParaDelta(dataStore) {
  return COLECOES_DELTA.every(col => dataStore.ready && dataStore.ready[col] === true);
}

/**
 * @returns {{pronto: false} | {pronto: true, delta: object, serverTime: string, completo: boolean}}
 */
function montarDelta({ dataStore, since, now = new Date() }) {
  if (!cacheProntoParaDelta(dataStore)) return { pronto: false };

  const sinceMs = since ? Date.parse(since) : NaN;
  const completo = Number.isNaN(sinceMs);

  const delta = {};
  for (const col of COLECOES_DELTA) {
    const docs = dataStore[col] instanceof Map ? Array.from(dataStore[col].values()) : [];
    const alterados = completo
      ? docs
      : docs.filter(doc => {
          const atualizado = paraMillis(doc.updated_at);
          return !Number.isNaN(atualizado) && atualizado > sinceMs;
        });
    if (alterados.length > 0) delta[col] = alterados;
  }

  return {
    pronto: true,
    delta,
    completo,
    serverTime: new Date(now.getTime() - MARGEM_MS).toISOString()
  };
}

module.exports = { montarDelta, paraMillis, cacheProntoParaDelta, COLECOES_DELTA, MARGEM_MS };
