/**
 * Módulo para configuração de listeners do Firestore.
 * @module firestoreListeners
 *
 * POR QUE NÃO USAMOS MAIS `db.collection(col).onSnapshot()` NA COLEÇÃO INTEIRA
 * ---------------------------------------------------------------------------
 * alunos + quartos + embarques somam ~30.000 documentos. Um onSnapshot sem
 * filtro lê TODOS eles ao abrir e, sempre que a conexão gRPC cai por muito
 * tempo (CPU do Cloud Run congelada, instância ociosa, rede), o Firestore
 * descarta o "resume token" e o SDK lê os ~30.000 de novo, em silêncio.
 * Isso gerava dias de 60k–177k leituras (cota gratuita: 50k/dia).
 *
 * Agora, para as coleções grandes:
 *   1. Carga inicial única com `.get()` (lê 100% dos alunos, quartos e embarques,
 *      sem nenhum limite de quantidade).
 *   2. Listener INCREMENTAL: `where('updated_at', '>=', cursor)`. Uma
 *      reconexão só relê os documentos alterados desde o cursor (poucos).
 *   3. O cursor avança periodicamente (troca de listener), para que mesmo uma
 *      instância que fica dias no ar releia só as últimas horas.
 *
 * Para `logs` (histórico de movimentações de quarto):
 *   1. Carga inicial dos logs recentes das viagens ativas (últimos 5 dias,
 *      até 3.000 registros) + busca sob demanda por CPF quando necessário.
 *   2. Listener INCREMENTAL por `where('timestamp', '>=', cursor)` SEM limite
 *      de quantidade: mesmo que 1.500+ alunos movimentem ao mesmo tempo, nenhum
 *      log é perdido.
 */

const { dataStore, addLog } = require('./dataStore');

const COLECOES_INCREMENTAIS = ['alunos', 'quartos', 'embarques'];
const COLECOES_COMPLETAS = ['usuarios', 'eventos'];

// Folga do cursor: cobre relógios diferentes entre instâncias e escritas em
// andamento enquanto a carga inicial acontece.
const FOLGA_CURSOR_MS = Number(process.env.LISTENER_CURSOR_FOLGA_MS || 2 * 60 * 1000);
// De quanto em quanto tempo o cursor do listener incremental avança.
const AVANCO_CURSOR_MS = Number(process.env.LISTENER_CURSOR_AVANCO_MS || 2 * 60 * 60 * 1000);
// Logs: janela inicial (últimos 5 dias, até 3000 registros) para cobrir viagens com 1500+ alunos.
const LOGS_JANELA_INICIAL_DIAS = Number(process.env.LOGS_JANELA_INICIAL_DIAS || 5);
const LOGS_CARGA_INICIAL = Number(process.env.LOGS_CARGA_INICIAL || 3000);

// Reinscrição após erro: backoff exponencial com jitter (evita que todos os
// listeners reconectem no mesmo milissegundo e disputem o mesmo canal gRPC).
const RETRY_BASE_MS = Number(process.env.LISTENER_RETRY_BASE_MS || 5000);
const RETRY_MAX_MS = Number(process.env.LISTENER_RETRY_MAX_MS || 60000);
const RETRY_JITTER_MS = Number(process.env.LISTENER_RETRY_JITTER_MS ?? 2000);

const isoComFolga = () => new Date(Date.now() - FOLGA_CURSOR_MS).toISOString();
const esperar = (ms) => new Promise(r => setTimeout(r, ms));

/** Data do snapshot (relógio do servidor Firestore quando disponível). */
function horaDoSnapshot(snapshot) {
  try {
    if (snapshot && snapshot.readTime && typeof snapshot.readTime.toDate === 'function') {
      return snapshot.readTime.toDate().getTime();
    }
  } catch (_) { /* usa relógio local */ }
  return Date.now();
}

/**
 * Log estruturado para o Cloud Logging (aparece com a severidade correta,
 * permitindo filtros `severity>=ERROR` e alertas).
 */
function logEstruturado(severity, message, extra = {}) {
  const linha = JSON.stringify({ severity, message, componente: 'firestoreListeners', ...extra });
  if (severity === 'ERROR' || severity === 'WARNING') console.error(linha);
  else console.log(linha);
}

/**
 * Configura os listeners do Firestore para manter o cache em memória
 * (dataStore) atualizado. Emite eventos via Socket.IO quando ocorrem
 * mudanças (com debounce).
 *
 * @param {Object} db - Instância do Firestore.
 * @param {Object} io - Instância do Socket.IO.
 * @returns {Object} Objeto com método `unsubscribe()` e `readyPromise`.
 */
function setupFirestoreListeners(db, io) {
  const pendingEmits = new Map();
  const unsubscribes = new Map(); // nome -> função de cancelamento
  const timers = [];
  let encerrado = false;

  /**
   * Função para emitir eventos de socket com debounce.
   * @param {string} colecao - Nome da coleção.
   */
  function debouncedEmit(colecao) {
    if (pendingEmits.has(colecao)) clearTimeout(pendingEmits.get(colecao));
    pendingEmits.set(colecao, setTimeout(() => {
      io.emit('dados_atualizados', { tipo: colecao, timestamp: dataStore.lastUpdate[colecao] });
      pendingEmits.delete(colecao);
      console.log(`📡 Notificação enviada: ${colecao} atualizado`);
    }, 2000));
  }

  function registrar(nome, unsubscribe) {
    const anterior = unsubscribes.get(nome);
    unsubscribes.set(nome, unsubscribe);
    return anterior;
  }

  // ------------------------------------------------------------------
  // Reinscrição automática
  // ------------------------------------------------------------------
  // Último momento em que cada listener comprovadamente estava saudável
  // (último snapshot recebido). Ao reconectar, o cursor volta até aqui, e não
  // só "agora - folga": se a conexão ficou parada por vários minutos (CPU do
  // Cloud Run congelada, rede), nenhuma escrita desse intervalo é perdida.
  const ultimoSaudavel = new Map(); // nome -> epoch ms
  const tentativas = new Map();     // nome -> nº de falhas seguidas
  const retryTimers = new Map();    // nome -> timeout pendente

  function marcarSaudavel(nome, snapshot) {
    ultimoSaudavel.set(nome, horaDoSnapshot(snapshot));
    const falhas = tentativas.get(nome) || 0;
    if (falhas > 0) {
      tentativas.delete(nome);
      logEstruturado('NOTICE', `✅ Listener de ${nome} reconectado após ${falhas} falha(s)`, { listener: nome });
    }
  }

  /** Cursor de retomada: último instante saudável menos a folga. */
  function cursorRetomada(nome) {
    const saudavel = ultimoSaudavel.get(nome);
    const base = saudavel ? Math.min(saudavel, Date.now()) : Date.now();
    return new Date(base - FOLGA_CURSOR_MS).toISOString();
  }

  /**
   * Trata erro de um listener: cancela o stream morto e agenda UMA
   * reinscrição com backoff exponencial + jitter.
   */
  function agendarReinscricao(nome, unsubscribeMorto, error, reabrir) {
    try { unsubscribeMorto(); } catch (_) { /* já encerrado */ }
    if (unsubscribes.get(nome) === unsubscribeMorto) unsubscribes.delete(nome);
    if (encerrado) return;

    const falhas = (tentativas.get(nome) || 0) + 1;
    tentativas.set(nome, falhas);
    const atraso = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** (falhas - 1)) + Math.floor(Math.random() * RETRY_JITTER_MS);

    logEstruturado('ERROR', `❌ Erro no listener de ${nome}: ${error && error.message}`, {
      listener: nome,
      codigo: error && error.code,
      tentativa: falhas,
      reinscricaoEmMs: atraso
    });

    if (retryTimers.has(nome)) clearTimeout(retryTimers.get(nome));
    retryTimers.set(nome, setTimeout(() => {
      retryTimers.delete(nome);
      if (encerrado) return;
      try {
        reabrir();
      } catch (e) {
        agendarReinscricao(nome, () => {}, e, reabrir);
      }
    }, atraso));
  }

  /** Aplica as mudanças de um snapshot no Map da coleção. */
  function aplicarMudancas(col, snapshot) {
    let alterados = 0;
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added' || change.type === 'modified') {
        dataStore[col].set(change.doc.id, { id: change.doc.id, ...change.doc.data() });
        alterados++;
      }
      // Em um listener incremental, 'removed' só significa "saiu da consulta"
      // (não acontece com updated_at crescente) ou "documento apagado".
      if (change.type === 'removed') {
        dataStore[col].delete(change.doc.id);
        alterados++;
      }
    });
    return alterados;
  }

  // ------------------------------------------------------------------
  // Coleções grandes: carga inicial (100% dos docs) + listener incremental
  // ------------------------------------------------------------------
  function abrirListenerIncremental(col, cursor) {
    let primeiro = true;
    const unsubscribe = db.collection(col)
      .where('updated_at', '>=', cursor)
      .onSnapshot((snapshot) => {
        const alterados = aplicarMudancas(col, snapshot);
        marcarSaudavel(col, snapshot);
        if (primeiro) {
          primeiro = false;
          // A troca de listener (avanço do cursor) só cancela o anterior
          // depois que o novo já entregou o estado atual: sem janela cega.
          // (Nunca cancela a si mesmo — acontecia no boot, quando o próprio
          // listener já era o registrado.)
          const anterior = registrar(col, unsubscribe);
          if (anterior && anterior !== unsubscribe) anterior();
        }
        if (alterados > 0) {
          dataStore.lastUpdate[col] = new Date().toISOString();
          debouncedEmit(col);
        }
      }, (error) => {
        agendarReinscricao(col, unsubscribe, error, () => abrirListenerIncremental(col, cursorRetomada(col)));
      });
    if (!unsubscribes.has(col)) unsubscribes.set(col, unsubscribe);
  }

  async function cargaInicial(col) {
    for (let tentativa = 1; !encerrado; tentativa++) {
      // Cursor ANTES da leitura: o que mudar durante a carga entra pelo listener
      const cursor = isoComFolga();
      try {
        const inicio = Date.now();
        const snap = await db.collection(col).get();
        const mapa = dataStore[col];
        mapa.clear();
        snap.forEach(doc => mapa.set(doc.id, { id: doc.id, ...doc.data() }));
        dataStore.lastUpdate[col] = new Date().toISOString();
        console.log(`📦 Carga inicial de ${col}: ${snap.size} docs em ${Date.now() - inicio} ms`);
        // Saudável desde o instante do cursor (antes da leitura)
        ultimoSaudavel.set(col, Date.parse(cursor) + FOLGA_CURSOR_MS);
        abrirListenerIncremental(col, cursor);
        dataStore.ready[col] = true;
        debouncedEmit(col);
        return;
      } catch (error) {
        const atraso = Math.min(60000, 2000 * tentativa);
        console.error(`❌ Falha na carga inicial de ${col} (tentativa ${tentativa}): ${error.message}. Nova tentativa em ${atraso / 1000}s`);
        await esperar(atraso);
      }
    }
  }

  // ------------------------------------------------------------------
  // Coleções pequenas: listener completo (barato e capta exclusões)
  // ------------------------------------------------------------------
  function abrirListenerCompleto(col) {
    return new Promise((resolve) => {
      let resolvido = false;
      const concluir = () => {
        if (!resolvido) {
          resolvido = true;
          resolve();
        }
      };
      let primeiro = true;
      const unsubscribe = db.collection(col).onSnapshot((snapshot) => {
        if (primeiro && dataStore.ready[col]) {
          // Reinscrição: o primeiro snapshot traz a coleção inteira. Reconstrói
          // o Map para descartar documentos apagados enquanto estava offline.
          const mapa = dataStore[col];
          mapa.clear();
          snapshot.docs.forEach(doc => mapa.set(doc.id, { id: doc.id, ...doc.data() }));
        } else {
          aplicarMudancas(col, snapshot);
        }
        primeiro = false;
        marcarSaudavel(col, snapshot);
        dataStore.lastUpdate[col] = new Date().toISOString();
        if (!dataStore.ready[col]) {
          dataStore.ready[col] = true;
          console.log(`📦 Carga inicial de ${col}: ${dataStore[col].size} docs`);
        }
        concluir();
        debouncedEmit(col);
      }, (error) => {
        concluir();
        agendarReinscricao(col, unsubscribe, error, () => abrirListenerCompleto(col));
      });
      registrar(col, unsubscribe);
    });
  }

  // ------------------------------------------------------------------
  // Logs: carga inicial dos últimos dias + listener incremental por timestamp
  // (sem limite fixo no listener, suportando 1500+ alunos movimentando juntos)
  // ------------------------------------------------------------------
  function abrirListenerIncrementalLogs(cursor) {
    let primeiro = true;
    const unsubscribe = db.collection('logs')
      .where('timestamp', '>=', cursor)
      .onSnapshot((snapshot) => {
        let alterados = 0;
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added' || change.type === 'modified') {
            addLog({ id: change.doc.id, ...change.doc.data() });
            alterados++;
          }
        });
        marcarSaudavel('logs', snapshot);
        if (primeiro) {
          primeiro = false;
          const anterior = registrar('logs', unsubscribe);
          if (anterior && anterior !== unsubscribe) anterior();
        }
        if (alterados > 0) {
          dataStore.lastUpdate.logs = new Date().toISOString();
          debouncedEmit('logs');
        }
      }, (error) => {
        agendarReinscricao('logs', unsubscribe, error, () => abrirListenerIncrementalLogs(cursorRetomada('logs')));
      });
    if (!unsubscribes.has('logs')) unsubscribes.set('logs', unsubscribe);
  }

  async function iniciarLogs() {
    const cursor = isoComFolga();
    const corteInicial = new Date(Date.now() - LOGS_JANELA_INICIAL_DIAS * 24 * 60 * 60 * 1000).toISOString();
    try {
      const snap = await db.collection('logs')
        .where('timestamp', '>=', corteInicial)
        .orderBy('timestamp', 'desc')
        .limit(LOGS_CARGA_INICIAL)
        .get();
      // Mais antigos primeiro: addLog descarta do início ao passar de MAX_LOGS_RAM (5000)
      snap.docs.slice().reverse().forEach(doc => addLog({ id: doc.id, ...doc.data() }));
      console.log(`📦 Carga inicial de logs (últimos ${LOGS_JANELA_INICIAL_DIAS}d): ${snap.size} docs`);
    } catch (error) {
      console.error(`❌ Falha na carga inicial de logs: ${error.message}`);
    }
    dataStore.ready.logs = true;
    ultimoSaudavel.set('logs', Date.parse(cursor) + FOLGA_CURSOR_MS);
    abrirListenerIncrementalLogs(cursor);
  }

  // ------------------------------------------------------------------
  // Inicialização
  // ------------------------------------------------------------------
  const inicioBoot = Date.now();
  const promessasCompletas = COLECOES_COMPLETAS.map(abrirListenerCompleto);
  const promessaLogs = iniciarLogs();
  const promessasIncrementais = COLECOES_INCREMENTAIS.map(cargaInicial);

  const readyPromise = Promise.all([
    ...promessasCompletas,
    promessaLogs,
    ...promessasIncrementais
  ]).then(() => {
    if (encerrado) return;
    console.log(`✅ Cache carregado em ${Math.round((Date.now() - inicioBoot) / 1000)}s: ${dataStore.alunos.size} alunos, ${dataStore.quartos.size} quartos, ${dataStore.usuarios.size} usuarios, ${dataStore.embarques.size} embarques`);
  });

  // Avanço periódico do cursor: reconexões futuras releem só as últimas horas
  const avanco = setInterval(() => {
    const novoCursor = isoComFolga();
    // Não avança listener que está aguardando reinscrição (a reinscrição usa o
    // cursor do último instante saudável, que é mais seguro).
    COLECOES_INCREMENTAIS.forEach(col => {
      if (dataStore.ready[col] && !retryTimers.has(col)) abrirListenerIncremental(col, novoCursor);
    });
    if (dataStore.ready.logs && !retryTimers.has('logs')) abrirListenerIncrementalLogs(novoCursor);
  }, AVANCO_CURSOR_MS);
  if (avanco.unref) avanco.unref();
  timers.push(avanco);

  return {
    readyPromise,
    unsubscribe: () => {
      encerrado = true;
      timers.forEach(clearInterval);
      retryTimers.forEach(clearTimeout);
      retryTimers.clear();
      unsubscribes.forEach(unsub => unsub());
      unsubscribes.clear();
    }
  };
}

module.exports = { setupFirestoreListeners };
