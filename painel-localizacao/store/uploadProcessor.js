/**
 * Processa as operações enviadas pelo app mobile em /api/mobile/sync/upload.
 *
 * Garantias:
 * - Cada operação recebe seu próprio status ('ok', 'skipped' ou 'error').
 *   O app só remove da fila local o que voltou 'ok' ou 'skipped'.
 * - Uma operação inválida NÃO derruba as outras: se o commit do lote falhar,
 *   cada operação é gravada individualmente.
 * - Movimentação/embarque para aluno que não existe mais (ex.: viagem excluída)
 *   volta 'skipped' em vez de travar a fila do celular para sempre.
 * - Embarque/retorno respeitam a ordem dos eventos: um evento mais antigo
 *   (celular que ficou offline) não sobrescreve um mais novo.
 */

const CHUNK_SIZE = 200; // cada operação gera no máximo 2 escritas (limite do batch: 500)

function cpfDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function toMillis(iso) {
  if (!iso) return NaN;
  return Date.parse(iso);
}

/** true se `incoming` é mais antigo que `current` (ambos ISO). */
function isOlder(incoming, current) {
  const a = toMillis(incoming);
  const b = toMillis(current);
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  return a < b;
}

function planLog(op, ctx) {
  const { db, timestamp, user, addLog } = ctx;
  const data = op.data || {};
  const logRef = db.collection('logs').doc();
  const logData = {
    ...data,
    timestamp: data.timestamp || timestamp,
    synced_from: 'mobile',
    synced_by: user.cpf
  };
  return {
    status: 'ok',
    writes: [{ ref: logRef, data: logData }],
    onCommitted: () => addLog({ id: logRef.id, ...logData })
  };
}

function planMovimentacao(op, ctx) {
  const { db, snaps, timestamp, user, dataStore } = ctx;
  const data = op.data || {};
  const cpf = cpfDigits(data.cpf);
  if (!cpf) return { status: 'error', message: 'CPF ausente' };

  const snap = snaps.get(`alunos/${cpf}`);
  if (!snap || !snap.exists) {
    return { status: 'skipped', message: 'Aluno não existe (viagem excluída?)' };
  }

  const updateData = {
    movimentacao: data.movimentacao || data.novaLocalizacao,
    updated_at: timestamp,
    ultimo_usuario: data.operador || user.nome
  };
  return {
    status: 'ok',
    writes: [{ ref: db.collection('alunos').doc(cpf), data: updateData, options: { merge: true } }],
    onCommitted: () => {
      const aluno = dataStore.alunos.get(cpf);
      if (aluno) Object.assign(aluno, updateData);
    }
  };
}

function planEmbedding(op, ctx) {
  const { db, timestamp, dataStore } = ctx;
  const data = op.data || {};
  const cpf = cpfDigits(data.cpf);
  if (!cpf) return { status: 'error', message: 'CPF ausente' };

  const embData = {
    embedding: data.embedding,
    facial_cadastrada: true,
    updated_at: timestamp
  };
  const embarqueData = {
    Facial: 'CADASTRADA',
    facial_cadastrada: true,
    updated_at: timestamp
  };
  return {
    status: 'ok',
    writes: [
      { ref: db.collection('alunos').doc(cpf), data: embData, options: { merge: true } },
      { ref: db.collection('embarques').doc(cpf), data: embarqueData, options: { merge: true } }
    ],
    onCommitted: () => {
      const aluno = dataStore.alunos.get(cpf);
      if (aluno) Object.assign(aluno, embData);
      const embarque = dataStore.embarques.get(cpf);
      if (embarque) Object.assign(embarque, embarqueData);
    }
  };
}

/**
 * Embarque/retorno.
 * Formato novo (app com fila offline):
 *   { cpf, campo: 'embarque'|'retorno', valor, event_at, onibus? }
 * Formato antigo (versões anteriores do app), mantido por compatibilidade:
 *   { cpf, idPasseio, onibus, embarque?, retorno? }
 */
function planEmbarque(op, ctx) {
  const { db, snaps, timestamp, dataStore, views } = ctx;
  const data = op.data || op; // ApiService.registrarEmbarque antigo mandava os campos no topo
  const cpf = cpfDigits(data.cpf);
  if (!cpf) return { status: 'error', message: 'CPF ausente' };

  const key = `embarques/${cpf}`;
  const snap = snaps.get(key);
  if (!snap || !snap.exists) {
    return { status: 'skipped', message: 'Embarque não existe (viagem excluída?)' };
  }

  // Estado atual do documento, incluindo escritas anteriores deste mesmo lote
  if (!views.has(key)) views.set(key, { ...snap.data() });
  const view = views.get(key);

  const campos = {};
  if (data.campo === 'embarque' || data.campo === 'retorno') {
    campos[data.campo] = data.valor;
  } else {
    if (data.embarque !== undefined && data.embarque !== null) campos.embarque = data.embarque;
    if (data.retorno !== undefined && data.retorno !== null) campos.retorno = data.retorno;
  }
  if (Object.keys(campos).length === 0) {
    return { status: 'error', message: 'Nenhum campo de embarque/retorno informado' };
  }

  const eventAt = data.event_at || timestamp;
  const update = {};
  for (const [campo, valor] of Object.entries(campos)) {
    if (isOlder(eventAt, view[`${campo}_at`])) continue; // já existe evento mais novo
    update[campo] = valor;
    update[`${campo}_at`] = eventAt;
  }

  if (Object.keys(update).length === 0) {
    return { status: 'skipped', message: 'Evento mais antigo que o registrado' };
  }

  if (update.embarque !== undefined && data.onibus) update.onibus = String(data.onibus);
  if (data.idPasseio) update.idPasseio = String(data.idPasseio); // nunca apagar com vazio
  update.updated_at = timestamp;

  Object.assign(view, update);

  return {
    status: 'ok',
    writes: [{ ref: db.collection('embarques').doc(cpf), data: update, options: { merge: true } }],
    onCommitted: () => {
      const embarque = dataStore.embarques.get(cpf);
      if (embarque) Object.assign(embarque, update);
    }
  };
}

const PLANNERS = {
  log: planLog,
  movimentacao: planMovimentacao,
  embedding: planEmbedding,
  embarque: planEmbarque
};

function addWritesToBatch(batch, writes) {
  for (const w of writes) {
    if (w.options) batch.set(w.ref, w.data, w.options);
    else batch.set(w.ref, w.data);
  }
}

async function processUploadOperations({ db, dataStore, addLog, operations, user, now }) {
  const timestamp = now ? now() : new Date().toISOString();
  const results = [];

  for (let i = 0; i < operations.length; i += CHUNK_SIZE) {
    const chunk = operations.slice(i, i + CHUNK_SIZE);

    // 1. Ler de uma vez os documentos que precisam existir
    const refsByKey = new Map();
    for (const op of chunk) {
      const cpf = cpfDigits((op && (op.data || op)).cpf);
      if (!cpf) continue;
      if (op.type === 'movimentacao') refsByKey.set(`alunos/${cpf}`, db.collection('alunos').doc(cpf));
      if (op.type === 'embarque') refsByKey.set(`embarques/${cpf}`, db.collection('embarques').doc(cpf));
    }
    const snaps = new Map();
    if (refsByKey.size > 0) {
      const keys = [...refsByKey.keys()];
      const docs = await db.getAll(...keys.map(k => refsByKey.get(k)));
      docs.forEach((snap, idx) => snaps.set(keys[idx], snap));
    }

    // 2. Planejar cada operação isoladamente
    const ctx = { db, snaps, timestamp, user, dataStore, addLog, views: new Map() };
    const planned = chunk.map(op => {
      const id = op && op.id;
      try {
        const planner = op && PLANNERS[op.type];
        if (!planner) return { id, status: 'error', message: `Tipo desconhecido: ${op && op.type}` };
        return { id, ...planner(op, ctx) };
      } catch (e) {
        return { id, status: 'error', message: e.message };
      }
    });

    // 3. Gravar em lote; se falhar, gravar uma a uma para isolar a culpada
    const toWrite = planned.filter(p => p.status === 'ok' && p.writes && p.writes.length > 0);
    if (toWrite.length > 0) {
      try {
        const batch = db.batch();
        toWrite.forEach(p => addWritesToBatch(batch, p.writes));
        await batch.commit();
        toWrite.forEach(p => p.onCommitted && p.onCommitted());
      } catch (batchError) {
        console.warn(`⚠️ Upload: commit em lote falhou (${batchError.message}), gravando individualmente...`);
        for (const p of toWrite) {
          try {
            const single = db.batch();
            addWritesToBatch(single, p.writes);
            await single.commit();
            p.onCommitted && p.onCommitted();
          } catch (e) {
            p.status = 'error';
            p.message = e.message;
          }
        }
      }
    }

    for (const p of planned) {
      const r = { id: p.id, status: p.status };
      if (p.message) r.message = p.message;
      results.push(r);
    }
  }

  return { results, timestamp };
}

module.exports = { processUploadOperations, cpfDigits, isOlder };
