/**
 * Módulo para configuração de listeners do Firestore.
 * @module firestoreListeners
 */

const { dataStore, addLog } = require('./dataStore');

/**
 * Configura os listeners onSnapshot do Firestore para manter o cache em memória (dataStore) atualizado.
 * Emite eventos via Socket.IO quando ocorrem mudanças (com debounce).
 * 
 * @param {Object} db - Instância do Firestore.
 * @param {Object} io - Instância do Socket.IO.
 * @returns {Object} Objeto com método `unsubscribe()` para cancelar todos os listeners.
 */
function setupFirestoreListeners(db, io) {
  const pendingEmits = new Map();
  const unsubscribes = [];
  const initialLoadComplete = {
    alunos: false,
    quartos: false,
    usuarios: false,
    embarques: false,
    eventos: false,
    logs: false,
    logged: false
  };

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

  /**
   * Verifica se o carregamento inicial foi concluído para registrar no log.
   */
  function checkInitialLoad() {
    const { alunos, quartos, usuarios, embarques, logged } = initialLoadComplete;
    if (alunos && quartos && usuarios && embarques && !logged) {
      console.log(`✅ Cache carregado: ${dataStore.alunos.size} alunos, ${dataStore.quartos.size} quartos, ${dataStore.usuarios.size} usuarios, ${dataStore.embarques.size} embarques`);
      initialLoadComplete.logged = true;
    }
  }

  const colecoesPadrao = ['alunos', 'quartos', 'usuarios', 'embarques', 'eventos'];

  colecoesPadrao.forEach((col) => {
    const unsubscribe = db.collection(col).onSnapshot((snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added' || change.type === 'modified') {
          dataStore[col].set(change.doc.id, { id: change.doc.id, ...change.doc.data() });
        }
        if (change.type === 'removed') {
          dataStore[col].delete(change.doc.id);
        }
      });

      dataStore.lastUpdate[col] = new Date().toISOString();
      debouncedEmit(col);

      if (!initialLoadComplete[col]) {
        initialLoadComplete[col] = true;
        checkInitialLoad();
      }
    }, (error) => {
      console.error(`❌ Erro no listener de ${col}: ${error.message}`);
    });

    unsubscribes.push(unsubscribe);
  });

  // Listener específico para logs (dataStore.logs é um Array, não Map)
  const logsUnsubscribe = db.collection('logs')
    .orderBy('timestamp', 'desc')
    .limit(1000)
    .onSnapshot((snapshot) => {
      snapshot.docChanges().forEach((change) => {
        const logData = { id: change.doc.id, ...change.doc.data() };
        if (change.type === 'added') {
          addLog(logData);
        } else if (change.type === 'modified') {
          const idx = dataStore.logs.findIndex(l => l.id === change.doc.id);
          if (idx >= 0) dataStore.logs[idx] = logData;
        } else if (change.type === 'removed') {
          const idx = dataStore.logs.findIndex(l => l.id === change.doc.id);
          if (idx >= 0) dataStore.logs.splice(idx, 1);
        }
      });

      dataStore.lastUpdate['logs'] = new Date().toISOString();
      debouncedEmit('logs');

      if (!initialLoadComplete['logs']) {
        initialLoadComplete['logs'] = true;
      }
    }, (error) => {
      console.error(`❌ Erro no listener de logs: ${error.message}`);
    });

  unsubscribes.push(logsUnsubscribe);

  return {
    unsubscribe: () => {
      unsubscribes.forEach(unsub => unsub());
    }
  };
}

module.exports = { setupFirestoreListeners };
