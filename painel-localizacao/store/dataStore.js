/**
 * Armazenamento global em memória (cache) para o sistema Embarque Ellus.
 * Todo o banco de dados do Firestore será mantido na RAM (~5MB).
 */

const dataStore = {
  alunos: new Map(),
  quartos: new Map(),
  usuarios: new Map(),
  embarques: new Map(),
  eventos: new Map(),
  logs: [], // Limite de 1000 entradas
  lastUpdate: {
    alunos: null,
    quartos: null,
    usuarios: null,
    embarques: null,
    eventos: null,
    logs: null
  }
};

/**
 * Retorna todos os documentos de uma coleção.
 * @param {string} colecao - Nome da coleção (alunos, quartos, usuarios, embarques, eventos, logs).
 * @returns {Array} Array de documentos.
 */
function getAll(colecao) {
  if (colecao === 'logs') {
    return dataStore.logs;
  }
  if (dataStore[colecao] instanceof Map) {
    return Array.from(dataStore[colecao].values());
  }
  return [];
}

/**
 * Retorna um documento específico pelo ID.
 * @param {string} colecao - Nome da coleção.
 * @param {string} id - ID do documento.
 * @returns {Object|undefined} O documento ou undefined se não encontrado.
 */
function getById(colecao, id) {
  if (dataStore[colecao] instanceof Map) {
    return dataStore[colecao].get(id);
  }
  return undefined;
}

/**
 * Retorna documentos filtrados de uma coleção.
 * @param {string} colecao - Nome da coleção.
 * @param {Function} filterFn - Função de filtro, ex: doc => doc.status === 'ativo'
 * @returns {Array} Array de documentos que passam no filtro.
 */
function getByFilter(colecao, filterFn) {
  const items = getAll(colecao);
  return items.filter(filterFn);
}

/**
 * Retorna documentos atualizados desde uma data específica (para sincronização delta).
 * @param {string} colecao - Nome da coleção.
 * @param {string} sinceISO - Data no formato ISO.
 * @returns {Array} Array de documentos atualizados.
 */
function getChangedSince(colecao, sinceISO) {
  const sinceDate = new Date(sinceISO);
  return getByFilter(colecao, doc => {
    const docDate = colecao === 'logs' 
      ? new Date(doc.timestamp) 
      : (doc.updated_at ? new Date(doc.updated_at) : new Date(0));
    return docDate > sinceDate;
  });
}

/**
 * Retorna estatísticas do armazenamento.
 * @returns {Object} Objeto com a contagem de documentos por coleção.
 */
function stats() {
  return {
    alunos: dataStore.alunos.size,
    quartos: dataStore.quartos.size,
    usuarios: dataStore.usuarios.size,
    embarques: dataStore.embarques.size,
    eventos: dataStore.eventos.size,
    logs: dataStore.logs.length
  };
}

/**
 * Adiciona um log ao array de logs, mantendo no máximo 1000 entradas.
 * @param {Object} logDoc - Documento de log a ser adicionado.
 */
function addLog(logDoc) {
  dataStore.logs.push(logDoc);
  if (dataStore.logs.length > 1000) {
    // Remove os mais antigos se passar de 1000
    dataStore.logs.shift();
  }
  dataStore.lastUpdate.logs = new Date().toISOString();
}

/**
 * Limpa todos os dados de uma coleção específica.
 * @param {string} colecao - Nome da coleção a ser limpa.
 */
function clearCollection(colecao) {
  if (colecao === 'logs') {
    dataStore.logs = [];
  } else if (dataStore[colecao] instanceof Map) {
    dataStore[colecao].clear();
  }
  if (dataStore.lastUpdate.hasOwnProperty(colecao)) {
    dataStore.lastUpdate[colecao] = null;
  }
}

module.exports = {
  dataStore,
  getAll,
  getById,
  getByFilter,
  getChangedSince,
  stats,
  addLog,
  clearCollection
};
