/**
 * Importação de alunos (planilha) → alunos, quartos e embarques.
 *
 * Correções em relação à versão anterior:
 * - Reimportar a MESMA viagem (ex.: para incluir alunos que faltaram) não zera
 *   mais embarque/retorno, movimentação, status da facial nem o quarto já
 *   atribuído dos alunos que já estavam lá.
 * - Aluno vindo de OUTRA viagem (o documento é o mesmo, pois o ID é o CPF)
 *   começa do zero, como antes.
 * - Linhas sem CPF e CPFs repetidos na planilha são informados, em vez de
 *   sumirem em silêncio.
 * - `embarques` passa a guardar `facial` (viagem com pernoite), usado pelo
 *   gerenciamento de viagens e pelo QR Code.
 */
const { normalizarDataISO, mesmaData } = require('./datas');

const limpar = (s) => (s ? String(s).trim().replace(/\s+/g, ' ') : '');
const dataViagem = (v) => normalizarDataISO(v) || (v ? String(v) : '');

function mesmaViagem(doc, campoInicio, colegio, inicio) {
  return !!doc &&
    limpar(doc.colegio).toUpperCase() === limpar(colegio).toUpperCase() &&
    mesmaData(doc[campoInicio], inicio);
}

/**
 * @returns {{ escritas: Array<{col, id, data}>, ignorados: Array<{linha, nome, motivo}>,
 *             novos: number, atualizados: number }}
 */
function planejarImportacao(alunos, dataStore, { agora = new Date() } = {}) {
  const timestamp = agora.toISOString();
  const escritas = [];
  const ignorados = [];
  const vistos = new Set();
  let novos = 0;
  let atualizados = 0;

  alunos.forEach((aluno, idx) => {
    const nome = limpar(aluno.nome);
    const cpf = String(aluno.cpf_limpo || aluno.cpf || '').replace(/\D/g, '');
    if (!cpf) {
      ignorados.push({ linha: idx + 1, nome, motivo: 'sem CPF' });
      return;
    }
    if (vistos.has(cpf)) {
      ignorados.push({ linha: idx + 1, nome, motivo: 'CPF repetido na planilha' });
      return;
    }
    vistos.add(cpf);

    const colegio = limpar(aluno.colegio);
    const inicio = dataViagem(aluno.inicio_viagem);
    const fim = dataViagem(aluno.fim_viagem);
    const pernoite = aluno.facial === true || String(aluno.facial || '').toLowerCase() === 'sim';
    const quartoPlanilha = limpar(aluno.quarto || aluno.numero_quarto);

    const alunoExistente = dataStore.alunos && dataStore.alunos.get(cpf);
    const quartoExistente = dataStore.quartos && dataStore.quartos.get(cpf);
    const embarqueExistente = dataStore.embarques && dataStore.embarques.get(cpf);

    const jaNaViagem = mesmaViagem(embarqueExistente, 'inicioViagem', colegio, inicio) ||
      mesmaViagem(alunoExistente, 'inicio_viagem', colegio, inicio);
    if (jaNaViagem) atualizados++; else novos++;

    // QUARTOS
    const dadosQuarto = {
      colegio,
      cpf,
      nome_hospede: nome,
      inicio_viagem: inicio,
      fim_viagem: fim,
      facial: pernoite,
      updated_at: timestamp
    };
    if (quartoPlanilha) dadosQuarto.numero_quarto = quartoPlanilha;
    else if (!mesmaViagem(quartoExistente, 'inicio_viagem', colegio, inicio)) dadosQuarto.numero_quarto = '';
    if (!quartoExistente) dadosQuarto.created_at = timestamp;
    escritas.push({ col: 'quartos', id: cpf, data: dadosQuarto });

    // ALUNOS
    const dadosAluno = {
      colegio,
      cpf,
      nome,
      turma: limpar(aluno.turma),
      inicio_viagem: inicio,
      fim_viagem: fim,
      facial: pernoite,
      updated_at: timestamp
    };
    if (!jaNaViagem) dadosAluno.movimentacao = 'QUARTO';
    escritas.push({ col: 'alunos', id: cpf, data: dadosAluno });

    // EMBARQUES
    const dadosEmbarque = {
      colegio,
      cpf,
      nome,
      turma: limpar(aluno.turma),
      idPasseio: limpar(aluno.id_passeio),
      onibus: limpar(aluno.onibus),
      inicioViagem: inicio,
      fimViagem: fim,
      facial: pernoite,
      updated_at: timestamp
    };
    if (!jaNaViagem) {
      Object.assign(dadosEmbarque, {
        embarque: '',
        retorno: '',
        embarque_at: null,
        retorno_at: null,
        Facial: alunoExistente && alunoExistente.facial_cadastrada === true ? 'CADASTRADA' : 'PENDENTE',
        facial_cadastrada: !!(alunoExistente && alunoExistente.facial_cadastrada === true)
      });
    }
    if (!embarqueExistente) dadosEmbarque.created_at = timestamp;
    escritas.push({ col: 'embarques', id: cpf, data: dadosEmbarque });
  });

  return { escritas, ignorados, novos, atualizados };
}

module.exports = { planejarImportacao };
