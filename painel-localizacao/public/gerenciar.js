function getAuthHeaders() {
  const token = localStorage.getItem('painel_token');
  return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
}

async function authFetch(url, options = {}) {
  options.headers = { ...getAuthHeaders(), ...(options.headers || {}) };
  const response = await fetch(url, options);
  if (response.status === 401) {
    localStorage.removeItem('painel_token');
    localStorage.removeItem('painel_user');
    window.location.href = '/login';
    throw new Error('Sessão expirada');
  }
  return response;
}

// ============================================================================
// GERENCIAR VIAGENS — listar, filtrar, editar e excluir
// ============================================================================

const esc = Ellus.esc;
let viagensTotais = [];
let viagemEmEdicao = null;
let viagemEmExclusao = null;

const filtros = Ellus.prefs.ler('viagens_filtros', { termo: '', situacao: '', tipo: '', mes: '' });

document.addEventListener('DOMContentLoaded', () => {
  if (!localStorage.getItem('painel_user')) { window.location.href = '/login'; return; }
  document.getElementById('nomeOperador').textContent = `👋 ${Ellus.usuario().nome || 'Usuário'}`;

  // Filtros (restaurados da última visita)
  const inputBusca = document.getElementById('pesquisaViagem');
  const selTipo = document.getElementById('filtroTipo');
  const inputMes = document.getElementById('filtroMes');
  inputBusca.value = filtros.termo;
  selTipo.value = filtros.tipo;
  inputMes.value = filtros.mes;
  marcarChip(filtros.situacao);

  inputBusca.addEventListener('input', () => { filtros.termo = inputBusca.value; aplicarFiltros(); });
  selTipo.addEventListener('change', () => { filtros.tipo = selTipo.value; aplicarFiltros(); });
  inputMes.addEventListener('change', () => { filtros.mes = inputMes.value; aplicarFiltros(); });
  document.querySelectorAll('#chipsSituacao .chip').forEach(chip => {
    chip.addEventListener('click', () => { filtros.situacao = chip.dataset.valor; marcarChip(filtros.situacao); aplicarFiltros(); });
  });
  document.getElementById('btnLimparFiltros').addEventListener('click', () => {
    Object.assign(filtros, { termo: '', situacao: '', tipo: '', mes: '' });
    inputBusca.value = ''; selTipo.value = ''; inputMes.value = '';
    marcarChip('');
    aplicarFiltros();
  });

  // Modais
  document.querySelectorAll('[data-fechar]').forEach(b => b.addEventListener('click', fecharModais));
  document.querySelectorAll('.modal-overlay').forEach(m => m.addEventListener('click', e => { if (e.target === m) fecharModais(); }));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') fecharModais(); });
  document.getElementById('formEditar').addEventListener('submit', salvarEdicao);
  document.getElementById('confirmaExcluir').addEventListener('input', e => {
    document.getElementById('btnConfirmarExcluir').disabled = e.target.value.trim().toUpperCase() !== 'EXCLUIR';
  });
  document.getElementById('btnConfirmarExcluir').addEventListener('click', excluirViagem);

  carregarViagens();

  if (typeof io !== 'undefined') {
    const socket = io();
    socket.on('dados_atualizados', () => carregarViagens(true));
  }
});

function marcarChip(valor) {
  document.querySelectorAll('#chipsSituacao .chip').forEach(c => c.classList.toggle('active', c.dataset.valor === valor));
}

async function carregarViagens(silencioso = false) {
  const tbody = document.getElementById('tabelaViagensBody');
  if (!silencioso) tbody.innerHTML = '<tr><td colspan="9" class="muted" style="text-align:center; padding:30px;">Carregando viagens...</td></tr>';
  try {
    const response = await authFetch(`/api/viagens-unicas?hoje=${Ellus.hojeISO()}`);
    const result = await response.json();
    if (!result.success) throw new Error(result.message || 'Erro ao carregar');
    viagensTotais = result.data || [];
    atualizarKpis();
    aplicarFiltros();
  } catch (error) {
    console.error('Erro:', error);
    if (!silencioso) tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; color:#b91c1c; padding:30px;">Falha ao carregar as viagens.</td></tr>';
  }
}

function atualizarKpis() {
  const conta = (s) => viagensTotais.filter(v => v.situacao === s).length;
  document.getElementById('kpiAndamento').textContent = conta('andamento');
  document.getElementById('kpiFuturas').textContent = conta('futura');
  document.getElementById('kpiEncerradas').textContent = conta('encerrada');
  document.getElementById('kpiAlunos').textContent = viagensTotais
    .filter(v => v.situacao === 'andamento').reduce((n, v) => n + v.qtd_alunos, 0);
}

function aplicarFiltros() {
  Ellus.prefs.gravar('viagens_filtros', filtros);
  const termo = filtros.termo.toLowerCase().trim();
  const filtradas = viagensTotais.filter(v => {
    if (filtros.situacao && v.situacao !== filtros.situacao) return false;
    if (filtros.tipo === 'pernoite' && !v.pernoite) return false;
    if (filtros.tipo === 'comum' && v.pernoite) return false;
    if (filtros.mes && !String(v.inicio).startsWith(filtros.mes)) return false;
    if (termo) {
      const alvo = [v.colegio, ...(v.passeios || []), ...(v.onibus || []).map(o => `onibus ${o}`)].join(' ').toLowerCase();
      if (!alvo.includes(termo)) return false;
    }
    return true;
  });
  renderizarTabela(filtradas);
}

function badgeSituacao(s) {
  const cls = { andamento: 'badge-ok', futura: 'badge-info', encerrada: 'badge-off', indefinida: 'badge-warn' }[s] || 'badge-off';
  return `<span class="badge ${cls}">${Ellus.situacaoLabel[s] || s}</span>`;
}

function barra(valor, total, classe = '') {
  if (!total) return '<span class="muted">—</span>';
  const pct = Math.round((valor / total) * 100);
  return `<div style="min-width:90px"><span class="muted"><strong style="color:#1f2937">${valor}</strong>/${total}</span><div class="bar ${classe}"><span style="width:${pct}%"></span></div></div>`;
}

function renderizarTabela(viagens) {
  const tbody = document.getElementById('tabelaViagensBody');
  const admin = Ellus.ehAdmin();
  document.getElementById('totalViagensTexto').textContent =
    `${viagens.length} de ${viagensTotais.length} viagem(ns)` + (admin ? '' : ' · editar e excluir exigem perfil ADMIN');

  if (viagens.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="muted" style="text-align:center; padding:30px;">Nenhuma viagem com esses filtros.</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  viagens.forEach(v => {
    const tr = document.createElement('tr');
    const passeios = (v.passeios || []).join(', ');
    const onibus = (v.onibus || []).length ? `Ônibus ${(v.onibus || []).join(', ')}` : '';
    const linkEmbarque = `/embarque?colegio=${encodeURIComponent(v.colegio)}&inicio=${encodeURIComponent(v.inicio)}`;
    const linkQuartos = `/quartos?viagem=${encodeURIComponent(`${v.inicio}|${v.fim}`)}`;
    tr.innerHTML = `
      <td><strong>${esc(v.colegio)}</strong><div class="muted">${esc(passeios)}${passeios && onibus ? ' · ' : ''}${esc(onibus)}</div></td>
      <td>${esc(Ellus.formatarData(v.inicio))} → ${esc(Ellus.formatarData(v.fim))}<div style="margin-top:3px">${badgeSituacao(v.situacao)}</div></td>
      <td>${v.pernoite ? '<span class="badge badge-info"><i class="fas fa-bed"></i> Pernoite</span>' : '<span class="badge badge-off"><i class="fas fa-bus"></i> Sem pernoite</span>'}</td>
      <td class="num"><strong>${v.qtd_alunos}</strong></td>
      <td>${barra(v.embarcados, v.qtd_alunos)}</td>
      <td>${barra(v.retornados, v.qtd_alunos, 'blue')}</td>
      <td>${v.pernoite ? barra(v.faciais_cadastradas, v.qtd_alunos) : '<span class="muted">—</span>'}</td>
      <td>${v.pernoite ? barra(v.com_quarto, v.qtd_alunos) : '<span class="muted">—</span>'}</td>
      <td class="acoes">
        <a class="btn btn-sm btn-outline" href="${linkEmbarque}" title="Abrir no Controle de Embarque"><i class="fas fa-bus-alt"></i> Embarque</a>
        ${v.pernoite ? `<a class="btn btn-sm btn-outline" href="${linkQuartos}" title="Abrir no Controle de Quartos"><i class="fas fa-bed"></i> Quartos</a>` : ''}
        ${admin ? `<button class="btn btn-sm btn-outline" data-acao="editar" title="Editar"><i class="fas fa-pen"></i> Editar</button>
        <button class="btn btn-sm btn-danger" data-acao="excluir" title="Excluir"><i class="fas fa-trash"></i> Excluir</button>` : ''}
      </td>`;
    const bEditar = tr.querySelector('[data-acao="editar"]');
    const bExcluir = tr.querySelector('[data-acao="excluir"]');
    if (bEditar) bEditar.addEventListener('click', () => abrirEdicao(v));
    if (bExcluir) bExcluir.addEventListener('click', () => abrirExclusao(v));
    tbody.appendChild(tr);
  });
}

// ----------------------------------------------------------------------------
// Edição
// ----------------------------------------------------------------------------
function dataParaInput(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : '';
}

function abrirEdicao(v) {
  viagemEmEdicao = v;
  document.getElementById('editColegio').value = v.colegio;
  document.getElementById('editInicio').value = dataParaInput(v.inicio);
  document.getElementById('editFim').value = dataParaInput(v.fim);
  const passeios = v.passeios || [];
  document.getElementById('editPasseio').value = passeios.length === 1 ? passeios[0] : '';
  document.getElementById('editPasseio').placeholder = passeios.length > 1 ? 'Deixe em branco para manter' : '';
  document.getElementById('editPasseioInfo').textContent = passeios.length > 1
    ? `Esta viagem tem ${passeios.length} IDs (${passeios.join(', ')}). Preencher troca todos por um só.`
    : 'Usado no QR Code do ônibus. Se mudar, gere os QR Codes de novo.';
  document.getElementById('editPernoite').value = String(!!v.pernoite);
  document.getElementById('avisoEdicao').textContent =
    `As alterações valem para os ${v.qtd_alunos} alunos desta viagem (embarque, quartos e celulares dos monitores).`;
  document.getElementById('modalEditar').style.display = 'flex';
  document.getElementById('editColegio').focus();
}

async function salvarEdicao(e) {
  e.preventDefault();
  const v = viagemEmEdicao;
  if (!v) return;

  const novo = {};
  const colegio = document.getElementById('editColegio').value.trim().replace(/\s+/g, ' ');
  const inicio = document.getElementById('editInicio').value;
  const fim = document.getElementById('editFim').value;
  const passeio = document.getElementById('editPasseio').value.trim();
  const pernoite = document.getElementById('editPernoite').value === 'true';

  if (fim && inicio && fim < inicio) return Ellus.toast('A data de fim não pode ser antes do início.', 'error');
  if (colegio && colegio !== v.colegio) novo.colegio = colegio;
  if (inicio && inicio !== v.inicio) novo.inicio = inicio;
  if (fim && fim !== v.fim) novo.fim = fim;
  if (passeio && !((v.passeios || []).length === 1 && v.passeios[0] === passeio)) novo.idPasseio = passeio;
  if (pernoite !== !!v.pernoite) novo.pernoite = pernoite;

  if (Object.keys(novo).length === 0) { fecharModais(); return Ellus.toast('Nada foi alterado.', 'info'); }

  if (novo.pernoite === false && !confirm('Esta viagem deixará de aparecer no Controle de Quartos. Continuar?')) return;

  toggleLoading(true, 'Salvando viagem...');
  try {
    const res = await authFetch('/api/viagens/editar', {
      method: 'PUT',
      body: JSON.stringify({ colegio: v.colegio, inicio_viagem: v.inicio, novo, operador: Ellus.usuario().nome })
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message || json.error || 'Erro ao salvar');
    fecharModais();
    Ellus.toast(`✅ ${json.message}`, 'success');
    await carregarViagens(true);
  } catch (err) {
    Ellus.toast(`❌ ${err.message}`, 'error');
  } finally {
    toggleLoading(false);
  }
}

// ----------------------------------------------------------------------------
// Exclusão
// ----------------------------------------------------------------------------
function abrirExclusao(v) {
  viagemEmExclusao = v;
  document.getElementById('textoExcluir').innerHTML =
    `<strong>${esc(v.colegio)}</strong><br>${esc(Ellus.formatarData(v.inicio))} → ${esc(Ellus.formatarData(v.fim))} · ${v.qtd_alunos} aluno(s)`;
  document.getElementById('confirmaExcluir').value = '';
  document.getElementById('btnConfirmarExcluir').disabled = true;
  document.getElementById('modalExcluir').style.display = 'flex';
  document.getElementById('confirmaExcluir').focus();
}

async function excluirViagem() {
  const v = viagemEmExclusao;
  if (!v) return;
  toggleLoading(true, 'Excluindo viagem...');
  try {
    const response = await authFetch('/api/viagens/excluir', {
      method: 'DELETE',
      body: JSON.stringify({ colegio: v.colegio, inicio_viagem: v.inicio, operador: Ellus.usuario().nome })
    });
    const result = await response.json();
    if (!result.success) throw new Error(result.message || result.error || 'Erro ao excluir');
    const r = result.removidos || {};
    fecharModais();
    Ellus.toast(`✅ Viagem excluída (${r.alunos || 0} alunos, ${r.quartos || 0} quartos, ${r.embarques || 0} embarques).`, 'success');
    await carregarViagens(true);
  } catch (error) {
    Ellus.toast(`❌ ${error.message}`, 'error');
  } finally {
    toggleLoading(false);
  }
}

function fecharModais() {
  document.querySelectorAll('.modal-overlay').forEach(m => { m.style.display = 'none'; });
  viagemEmEdicao = null;
  viagemEmExclusao = null;
}

function toggleLoading(show, text = 'Processando...') {
  const el = document.getElementById('loadingOverlay');
  document.getElementById('loadingText').textContent = text;
  el.classList.toggle('hidden', !show);
}
