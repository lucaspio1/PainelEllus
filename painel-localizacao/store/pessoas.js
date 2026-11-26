/**
 * Monta a lista de alunos exibida no Controle de Quartos (GET /api/pessoas).
 *
 * Regras:
 * - Inclui apenas registros de `quartos` com `facial === true`.
 * - Exclui qualquer CPF que pertença a um monitor/usuário cadastrado em `usuarios`.
 */

function cpfSomenteDigitos(valor) {
  return String(valor || '').replace(/\D/g, '');
}

/**
 * Retorna um Set com os CPFs (somente dígitos) de todos os usuários/monitores.
 * @param {Array<Object>} usuarios
 * @returns {Set<string>}
 */
function obterCpfsMonitores(usuarios = []) {
  const cpfs = new Set();
  for (const u of usuarios) {
    if (!u) continue;
    const cpfCampo = cpfSomenteDigitos(u.cpf);
    if (cpfCampo) {
      cpfs.add(cpfCampo);
    } else if (/^\d{11}$/.test(String(u.id || ''))) {
      cpfs.add(String(u.id));
    }
  }
  return cpfs;
}

/**
 * Monta a lista de pessoas para o Controle de Quartos, removendo monitores.
 * @param {{ quartos: Array<Object>, alunos: Array<Object>, usuarios: Array<Object> }} params
 * @returns {Array<Object>}
 */
function listarPessoasControleQuartos({ quartos = [], alunos = [], usuarios = [] }) {
  const cpfsMonitores = obterCpfsMonitores(usuarios);

  const alunosPorCpf = new Map();
  for (const a of alunos) {
    if (a && a.facial === true) {
      const cpfLimpo = cpfSomenteDigitos(a.cpf || a.id);
      if (cpfLimpo) alunosPorCpf.set(cpfLimpo, a);
    }
  }

  return quartos
    .filter(q => {
      if (!q || q.facial !== true) return false;
      const cpfLimpo = cpfSomenteDigitos(q.cpf || q.id);
      if (cpfLimpo && cpfsMonitores.has(cpfLimpo)) return false;
      return true;
    })
    .map(quarto => {
      const cpfLimpo = cpfSomenteDigitos(quarto.cpf || quarto.id);
      const aluno = alunosPorCpf.get(cpfLimpo) || {};
      const movimentacao = aluno.movimentacao || 'QUARTO';
      return {
        id: quarto.id,
        cpf: quarto.cpf,
        nome: quarto.nome_hospede,
        nome_hospede: quarto.nome_hospede,
        colegio: quarto.colegio,
        turma: quarto.turma || '',
        quarto: quarto.numero_quarto,
        numero_quarto: quarto.numero_quarto,
        inicio_viagem: quarto.inicio_viagem,
        fim_viagem: quarto.fim_viagem,
        movimentacao,
        // Quando mudou de lugar (app novo grava o horário real da leitura)
        movimentacao_at: aluno.movimentacao_at || null,
        ultimo_usuario: aluno.ultimo_usuario || '',
        facial_cadastrada: aluno.facial_cadastrada === true,
        turma_aluno: aluno.turma || '',
        created_at: quarto.created_at,
        updated_at: quarto.updated_at
      };
    });
}

/**
 * Planeja a movimentação em lote de uma lista de alunos (ex.: mandar todos para a balada).
 * Ignora alunos que já estão na mesma localização para evitar escritas e logs redundantes.
 *
 * @param {Array<{ cpf: string, nome?: string, nome_hospede?: string, quarto?: string, numero_quarto?: string, colegio?: string, turma?: string }>} alunos
 * @param {string} novaLocalizacao
 * @param {{ operador: string, timestamp?: string, dataStore?: Object }} ctx
 * @returns {{ erro?: string, escritasAlunos: Array<{ id: string, data: Object }>, logs: Array<Object>, movidos: Array<string>, jaEstavam: number }}
 */
function planejarMovimentacaoLote(alunos, novaLocalizacao, { operador = 'Sistema', timestamp = new Date().toISOString(), dataStore } = {}) {
  const destino = String(novaLocalizacao || '').trim();
  if (!destino) return { erro: 'Nova localização é obrigatória.' };
  if (!Array.isArray(alunos) || alunos.length === 0) return { erro: 'Nenhum aluno informado para movimentação.' };

  const escritasAlunos = [];
  const logs = [];
  const movidos = [];
  let jaEstavam = 0;
  const vistos = new Set();

  for (const item of alunos) {
    if (!item) continue;
    const cpfLimpo = cpfSomenteDigitos(item.cpf);
    if (!cpfLimpo || vistos.has(cpfLimpo)) continue;
    vistos.add(cpfLimpo);

    const alunoCache = dataStore && dataStore.alunos instanceof Map ? dataStore.alunos.get(cpfLimpo) : null;
    if (alunoCache && String(alunoCache.movimentacao || '').trim().toUpperCase() === destino.toUpperCase()) {
      jaEstavam++;
      continue;
    }

    const docId = (alunoCache && alunoCache.id) || cpfLimpo;
    const nomeAluno = item.nome_hospede || item.nome || (alunoCache && alunoCache.nome) || 'Aluno';
    const numeroQuarto = item.numero_quarto !== undefined ? item.numero_quarto : (item.quarto || '');

    const updateAluno = {
      movimentacao: destino,
      movimentacao_at: timestamp,
      updated_at: timestamp,
      ultimo_usuario: operador
    };

    escritasAlunos.push({ id: docId, cpf: cpfLimpo, data: updateAluno });
    logs.push({
      cpf: cpfLimpo,
      nome: nomeAluno,
      nome_hospede: nomeAluno,
      tipo: destino,
      movimentacao: destino,
      usuario: operador,
      operador,
      timestamp,
      quarto: numeroQuarto,
      numero_quarto: numeroQuarto
    });
    movidos.push(cpfLimpo);
  }

  return { escritasAlunos, logs, movidos, jaEstavam, timestamp };
}

module.exports = { listarPessoasControleQuartos, obterCpfsMonitores, cpfSomenteDigitos, planejarMovimentacaoLote };
