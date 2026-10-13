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
// CONTROLE DE QUARTOS - ELLUS
// ============================================================================

const STATUS = {
  QUARTO: 'VOLTOU_AO_QUARTO',
  FORA: 'SAIU_DO_QUARTO',
  BALADA: 'FOI_PARA_BALADA'
};

const esc = Ellus.esc;
const ITENS_POR_PAGINA = 50;
let todasPessoas = [];
let alunoSelecionado = null;
let debounceTimer = null;
let operadorAtual = '';

// Filtros (lembrados entre visitas; ?viagem= na URL tem prioridade)
const filtros = Ellus.prefs.ler('quartos_filtros', { viagem: '', colegio: '', termo: '', status: '', limite: 30, visao: 'STATUS' });

const paginacao = { quarto: 1, fora: 1, balada: 1 };

const el = (id) => document.getElementById(id);

window.moverNoModal = async function (status) {
  if (!alunoSelecionado) return Ellus.toast('Nenhum aluno selecionado', 'error');
  await moverAluno(alunoSelecionado.cpf, alunoSelecionado.nome || 'Aluno', status);
};

async function init() {
  const userSession = localStorage.getItem('painel_user');
  if (!userSession) { window.location.href = '/login'; return; }
  operadorAtual = Ellus.usuario().nome || 'Painel';
  el('nomeOperadorDisplay').textContent = `👋 ${operadorAtual}`;

  const params = new URLSearchParams(window.location.search);
  if (params.get('viagem')) filtros.viagem = params.get('viagem');

  el('inputPesquisa').value = filtros.termo || '';
  el('limiteMin').value = String(filtros.limite || 30);
  marcarChip(filtros.status);
  aplicarVisao();

  el('btnAtualizar').addEventListener('click', () => carregarDados());
  el('btnExportar').addEventListener('click', exportar);
  el('btnToggleView').addEventListener('click', () => {
    filtros.visao = filtros.visao === 'STATUS' ? 'QUARTOS' : 'STATUS';
    aplicarVisao();
    renderizarPainel();
  });
  el('filtroViagem').addEventListener('change', (e) => { filtros.viagem = e.target.value; preencherColegios(); resetPaginacao(); renderizarPainel(); });
  el('filtroColegio').addEventListener('change', (e) => { filtros.colegio = e.target.value; resetPaginacao(); renderizarPainel(); });
  el('limiteMin').addEventListener('change', (e) => { filtros.limite = Number(e.target.value); renderizarPainel(); });
  el('inputPesquisa').addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => { filtros.termo = e.target.value.trim(); resetPaginacao(); renderizarPainel(); }, 250);
  });
  document.querySelectorAll('#chipsStatus .chip').forEach(chip => chip.addEventListener('click', () => {
    filtros.status = chip.dataset.valor;
    marcarChip(filtros.status);
    resetPaginacao();
    renderizarPainel();
  }));

  el('modalDetalhes').addEventListener('click', (e) => { if (e.target === el('modalDetalhes')) fecharModal(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') fecharModal();
    if (e.key === 'F5') { e.preventDefault(); carregarDados(); }
  });

  await carregarDados();

  // Tempo "fora há X min" avança sozinho
  setInterval(() => renderizarPainel(), 60000);

  if (typeof io !== 'undefined') {
    const socket = io();
    socket.on('dados_atualizados', () => carregarDados(true));
  }
}

function marcarChip(valor) {
  document.querySelectorAll('#chipsStatus .chip').forEach(c => c.classList.toggle('active', c.dataset.valor === (valor || '')));
}

function aplicarVisao() {
  const porQuarto = filtros.visao === 'QUARTOS';
  el('viewStatus').classList.toggle('hidden', porQuarto);
  el('viewQuartos').classList.toggle('hidden', !porQuarto);
  el('btnToggleView').innerHTML = porQuarto
    ? '<i class="fas fa-columns"></i> Ver por situação'
    : '<i class="fas fa-th"></i> Ver por quarto';
}

async function carregarDados(silent = false) {
  try {
    if (!silent) mostrarLoading();
    const [resPessoas, resViagens] = await Promise.all([authFetch('/api/pessoas'), authFetch('/api/viagens')]);
    const dataPessoas = await resPessoas.json();
    const dataViagens = await resViagens.json();
    if (dataPessoas.success) todasPessoas = (dataPessoas.data || []).map(p => ({ ...p, cpf: Ellus.soDigitos(p.cpf) || p.cpf }));
    if (dataViagens.success) atualizarFiltroViagens(dataViagens.data || []);
    preencherColegios();
    renderizarPainel();
    el('ultimaAtualizacao').textContent = `Atualizado às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  } catch (error) {
    console.error(error);
    if (!silent) Ellus.toast('❌ Erro ao carregar: ' + error.message, 'error');
  } finally {
    if (!silent) esconderLoading();
  }
}

function atualizarFiltroViagens(viagens) {
  const select = el('filtroViagem');
  const hoje = Ellus.hojeISO();
  // Viagens em andamento primeiro, depois as mais recentes
  viagens.sort((a, b) => {
    const aAtiva = a.inicio_viagem <= hoje && hoje <= a.fim_viagem;
    const bAtiva = b.inicio_viagem <= hoje && hoje <= b.fim_viagem;
    if (aAtiva !== bAtiva) return aAtiva ? -1 : 1;
    return String(b.inicio_viagem).localeCompare(String(a.inicio_viagem));
  });
  select.innerHTML = '<option value="">Todas as viagens</option>';
  viagens.forEach(v => {
    const opt = document.createElement('option');
    opt.value = `${v.inicio_viagem}|${v.fim_viagem}`;
    const ativa = v.inicio_viagem <= hoje && hoje <= v.fim_viagem;
    opt.textContent = `${ativa ? '🟢 ' : ''}${v.label}`;
    select.appendChild(opt);
  });
  const valores = viagens.map(v => `${v.inicio_viagem}|${v.fim_viagem}`);
  if (filtros.viagem && !valores.includes(filtros.viagem)) filtros.viagem = '';
  // Primeira visita: se houver exatamente uma viagem em andamento, já seleciona
  if (!filtros.viagem && !Ellus.prefs.ler('quartos_filtros', null)) {
    const ativas = viagens.filter(v => v.inicio_viagem <= hoje && hoje <= v.fim_viagem);
    if (ativas.length === 1) filtros.viagem = `${ativas[0].inicio_viagem}|${ativas[0].fim_viagem}`;
  }
  select.value = filtros.viagem;
}

function pessoasDaViagem() {
  if (!filtros.viagem) return todasPessoas;
  const [ini, fim] = filtros.viagem.split('|');
  return todasPessoas.filter(p => p.inicio_viagem === ini && p.fim_viagem === fim);
}

function preencherColegios() {
  const select = el('filtroColegio');
  const colegios = [...new Set(pessoasDaViagem().map(p => p.colegio).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  select.innerHTML = '<option value="">Todos os colégios</option>' +
    colegios.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  if (filtros.colegio && !colegios.includes(filtros.colegio)) filtros.colegio = '';
  select.value = filtros.colegio;
}

function categoria(p) {
  const s = String(p.movimentacao || '').trim().toUpperCase();
  if (s.includes('BALADA')) return 'balada';
  if (s.includes('SAIU') || s.includes('FORA')) return 'fora';
  return 'quarto';
}

function emAlerta(p) {
  if (categoria(p) === 'quarto') return false;
  const min = Ellus.minutosDesde(p.movimentacao_at);
  return min !== null && min >= (filtros.limite || 30);
}

function correspondeBusca(p) {
  const termo = (filtros.termo || '').toLowerCase();
  if (!termo) return true;
  const digitos = Ellus.soDigitos(termo);
  return (p.nome || '').toLowerCase().includes(termo) ||
    (digitos.length >= 3 && String(p.cpf || '').includes(digitos)) ||
    String(p.quarto || '').toLowerCase() === termo ||
    String(p.quarto || '').toLowerCase().includes(termo);
}

/** Aplica viagem, colégio e busca (sem o filtro de status, usado nas contagens). */
function filtrarBase() {
  return pessoasDaViagem().filter(p =>
    (!filtros.colegio || p.colegio === filtros.colegio) && correspondeBusca(p));
}

function passaStatus(p) {
  if (!filtros.status) return true;
  if (filtros.status === 'alerta') return emAlerta(p);
  return categoria(p) === filtros.status;
}

function renderizarPainel() {
  Ellus.prefs.gravar('quartos_filtros', filtros);
  const base = filtrarBase();

  // Contagens nos chips refletem viagem + colégio + busca
  el('cntTodos').textContent = base.length;
  el('cntQuarto').textContent = base.filter(p => categoria(p) === 'quarto').length;
  el('cntFora').textContent = base.filter(p => categoria(p) === 'fora').length;
  el('cntBalada').textContent = base.filter(p => categoria(p) === 'balada').length;
  el('cntAlerta').textContent = base.filter(emAlerta).length;

  const filtrados = base.filter(passaStatus);
  if (filtros.visao === 'STATUS') renderizarColunasStatus(filtrados);
  else renderizarGridQuartos(filtrados);
}

function ordenarPorTempo(lista) {
  // Quem está fora há mais tempo aparece primeiro
  return lista.slice().sort((a, b) => (Ellus.minutosDesde(b.movimentacao_at) || 0) - (Ellus.minutosDesde(a.movimentacao_at) || 0));
}

function renderizarColunasStatus(pessoas) {
  const cats = { quarto: [], fora: [], balada: [] };
  pessoas.forEach(p => cats[categoria(p)].push(p));
  cats.quarto.sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  renderizarLista(el('listaQuarto'), cats.quarto, el('countQuarto'), STATUS.QUARTO, 'quarto');
  renderizarLista(el('listaFora'), ordenarPorTempo(cats.fora), el('countFora'), STATUS.FORA, 'fora');
  renderizarLista(el('listaBalada'), ordenarPorTempo(cats.balada), el('countBalada'), STATUS.BALADA, 'balada');
}

function renderizarLista(container, pessoas, countElem, statusDestino, chave) {
  container.innerHTML = '';
  countElem.textContent = pessoas.length;
  if (pessoas.length === 0) {
    container.innerHTML = '<p class="empty-message muted" style="text-align:center;padding:20px">📭 Ninguém aqui</p>';
  } else {
    const fim = paginacao[chave] * ITENS_POR_PAGINA;
    pessoas.slice(0, fim).forEach(p => container.appendChild(criarCardAluno(p)));
    if (pessoas.length > fim) {
      const btn = document.createElement('button');
      btn.className = 'btn btn-outline btn-sm';
      btn.style.width = '100%';
      btn.textContent = `Mostrar mais (${pessoas.length - fim})`;
      btn.onclick = () => { paginacao[chave]++; renderizarPainel(); };
      container.appendChild(btn);
    }
  }
  configurarDropZone(container, statusDestino);
}

function textoTempo(p) {
  if (categoria(p) === 'quarto') return '';
  const t = Ellus.tempoDesde(p.movimentacao_at);
  return t ? `<span class="tempo-fora ${emAlerta(p) ? 'alerta-tempo' : ''}">⏱ ${t}</span>` : '';
}

function criarCardAluno(p) {
  const card = document.createElement('div');
  card.className = `aluno-card ${emAlerta(p) ? 'alerta-tempo' : ''}`;
  card.draggable = true;
  card.innerHTML = `
    <div class="card-header">
      <span class="nome">${esc(p.nome)}</span>
      ${p.quarto ? `<span class="badge-quarto">🚪 ${esc(p.quarto)}</span>` : '<span class="badge badge-warn">sem quarto</span>'}
    </div>
    <div class="card-body">
      <p class="muted">${esc(p.colegio || '')}${p.turma ? ` · ${esc(p.turma)}` : ''}</p>
      ${textoTempo(p)}
    </div>
    <div class="card-actions">
      <button class="btn-action btn-details" data-acao="detalhes">👁️ Detalhes</button>
      <button class="btn-action btn-move-action" data-acao="mover">🔄 Mover</button>
    </div>`;
  card.querySelector('[data-acao="detalhes"]').addEventListener('click', () => abrirModalDetalhes(p));
  card.querySelector('[data-acao="mover"]').addEventListener('click', (e) => mostrarMenuMover(e.currentTarget, p));
  card.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ cpf: p.cpf, nome: p.nome }));
    card.classList.add('dragging');
  });
  card.addEventListener('dragend', () => card.classList.remove('dragging'));
  return card;
}

function renderizarGridQuartos(pessoas) {
  const container = el('viewQuartos');
  container.innerHTML = '';
  if (pessoas.length === 0) {
    container.innerHTML = '<div class="empty-state">Nenhum aluno com esses filtros.</div>';
    return;
  }

  // Quarto mostra TODOS os ocupantes da viagem/colégio, mesmo que só um
  // corresponda ao filtro (ex.: "Fora" mostra o quarto inteiro).
  const quartosVisiveis = new Set(pessoas.map(p => String(p.quarto || '').trim()));
  const ocupantes = {};
  pessoasDaViagem()
    .filter(p => !filtros.colegio || p.colegio === filtros.colegio)
    .forEach(p => {
      const q = String(p.quarto || '').trim();
      if (!quartosVisiveis.has(q)) return;
      (ocupantes[q] = ocupantes[q] || []).push(p);
    });

  const chaves = Object.keys(ocupantes).sort((a, b) => {
    if (!a) return 1; if (!b) return -1; // "sem quarto" por último
    return a.localeCompare(b, 'pt-BR', { numeric: true });
  });
  chaves.forEach(num => container.appendChild(criarCardQuarto(num, ocupantes[num])));
}

function criarCardQuarto(numero, alunos) {
  const foraCount = alunos.filter(a => categoria(a) !== 'quarto').length;
  const div = document.createElement('div');
  div.className = `room-card ${foraCount ? 'room-warning' : ''} ${numero ? '' : 'room-sem-numero'}`;
  div.innerHTML = `
    <div class="room-header">
      <div class="room-title"><i class="fas fa-door-closed"></i> ${numero ? `Quarto ${esc(numero)}` : 'Sem quarto atribuído'}</div>
      <span class="room-count">${foraCount ? `${foraCount} fora · ` : ''}👥 ${alunos.length}</span>
    </div>
    <div class="room-list"></div>`;
  const lista = div.querySelector('.room-list');
  alunos.sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR')).forEach(p => {
    const cat = categoria(p);
    const emoji = { quarto: '🛌', fora: '🚶', balada: '🎉' }[cat];
    const item = document.createElement('div');
    item.className = 'room-student';
    item.innerHTML = `
      <div class="status-emoji" title="${esc(formatarStatus(p.movimentacao))}">${emoji}</div>
      <div class="student-info" style="flex:1; min-width:0">
        <span class="student-name-small ${cat === 'quarto' ? 'text-green' : 'text-red'}">${esc(p.nome)}</span>
        <div>${textoTempo(p)}</div>
      </div>
      <button class="btn-icon-small btn btn-ghost btn-sm" title="Detalhes">ℹ️</button>`;
    item.querySelector('button').addEventListener('click', () => abrirModalDetalhes(p));
    lista.appendChild(item);
  });
  return div;
}

async function moverAluno(cpf, nome, novoStatus) {
  const cpfLimpo = Ellus.soDigitos(cpf);
  const pessoa = todasPessoas.find(p => Ellus.soDigitos(p.cpf) === cpfLimpo) || {};
  try {
    const res = await authFetch('/api/movimentar', {
      method: 'POST',
      body: JSON.stringify({
        cpf: cpfLimpo,
        nome,
        novaLocalizacao: novoStatus,
        operador: operadorAtual,
        quarto: pessoa.quarto || '',
        colegio: pessoa.colegio || '',
        turma: pessoa.turma || ''
      })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Erro ao mover');
    Object.assign(pessoa, { movimentacao: novoStatus, movimentacao_at: new Date().toISOString(), ultimo_usuario: operadorAtual });
    Ellus.toast(`✅ ${nome}: ${formatarStatus(novoStatus)}`, 'success');
    renderizarPainel();
    if (alunoSelecionado && Ellus.soDigitos(alunoSelecionado.cpf) === cpfLimpo) abrirModalDetalhes(pessoa);
  } catch (e) {
    Ellus.toast('❌ ' + e.message, 'error');
  }
}

function mostrarMenuMover(btn, p) {
  document.querySelectorAll('.context-menu').forEach(m => m.remove());
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  [
    { l: '<i class="fas fa-bed"></i> Voltou pro Quarto', v: STATUS.QUARTO },
    { l: '<i class="fas fa-walking"></i> Saiu do Quarto', v: STATUS.FORA },
    { l: '<i class="fas fa-music"></i> Foi pra Balada', v: STATUS.BALADA }
  ].forEach(it => {
    const b = document.createElement('button');
    b.innerHTML = it.l;
    b.onclick = () => { menu.remove(); moverAluno(p.cpf, p.nome, it.v); };
    menu.appendChild(b);
  });
  const rect = btn.getBoundingClientRect();
  menu.style.top = `${rect.bottom + 5}px`;
  menu.style.left = `${Math.min(rect.left, window.innerWidth - 180)}px`;
  document.body.appendChild(menu);
  setTimeout(() => {
    document.addEventListener('click', function fechar(e) {
      if (!menu.contains(e.target) && e.target !== btn) { menu.remove(); document.removeEventListener('click', fechar); }
    });
  }, 10);
}

function configurarDropZone(zona, statusDestino) {
  if (zona.dataset.dropPronto) return; // evita registrar o mesmo listener a cada render
  zona.dataset.dropPronto = '1';
  zona.addEventListener('dragover', e => { e.preventDefault(); zona.classList.add('drag-over'); });
  zona.addEventListener('dragleave', () => zona.classList.remove('drag-over'));
  zona.addEventListener('drop', e => {
    e.preventDefault();
    zona.classList.remove('drag-over');
    try {
      const data = JSON.parse(e.dataTransfer.getData('text/plain'));
      if (data.cpf) moverAluno(data.cpf, data.nome, statusDestino);
    } catch (err) { console.error(err); }
  });
}

async function abrirModalDetalhes(p) {
  alunoSelecionado = p;
  el('detalheNome').textContent = p.nome || '--';
  el('detalheQuarto').textContent = p.quarto || 'sem quarto';
  el('detalheCpf').textContent = Ellus.formatarCPF(p.cpf);
  el('detalheInfo').textContent = `${p.colegio || ''}${p.turma ? ` - ${p.turma}` : ''}`;
  el('detalheFacial').textContent = p.facial_cadastrada ? '✅ cadastrada' : '⚠️ não cadastrada';
  const badge = el('detalheStatus');
  badge.textContent = formatarStatus(p.movimentacao);
  badge.className = `badge ${getClassByStatus(p.movimentacao)}`;
  const tempo = Ellus.tempoDesde(p.movimentacao_at);
  el('detalheTempo').textContent = tempo ? `${tempo}${p.ultimo_usuario ? ` · por ${p.ultimo_usuario}` : ''}` : '';
  el('modalDetalhes').style.display = 'flex';

  const listaHist = el('listaHistorico');
  listaHist.innerHTML = '<p class="muted">⏳ Carregando histórico...</p>';
  try {
    const res = await authFetch(`/api/logs?cpf=${Ellus.soDigitos(p.cpf)}`);
    const json = await res.json();
    if (!json.success) throw new Error();
    const logs = (json.data || []).filter(l => l.tipo || l.movimentacao);
    if (logs.length === 0) { listaHist.innerHTML = '<p class="muted">📭 Sem histórico registrado.</p>'; return; }
    logs.sort((a, b) => (Ellus.paraDate(b.timestamp) || 0) - (Ellus.paraDate(a.timestamp) || 0));
    listaHist.innerHTML = '';
    logs.slice(0, 100).forEach(log => {
      // App grava 'operador_nome'; painel grava 'operador'
      const operador = log.operador_nome || log.operador || log.usuario || log.Operador || 'Sistema';
      const row = document.createElement('div');
      row.className = 'hist-row';
      row.innerHTML = `
        <div class="hist-time">${esc(formatarDataHora(log.timestamp))}</div>
        <div class="hist-action"><strong>${esc(formatarStatus(log.tipo || log.movimentacao))}</strong></div>
        <div class="hist-op" title="${esc(operador)}"><i class="fas fa-user"></i> ${esc(operador)}</div>`;
      listaHist.appendChild(row);
    });
  } catch (e) {
    listaHist.innerHTML = '<p class="error">❌ Erro ao carregar histórico.</p>';
  }
}

function fecharModal() {
  el('modalDetalhes').style.display = 'none';
  alunoSelecionado = null;
}

function exportar() {
  const base = filtrarBase().filter(passaStatus);
  if (base.length === 0) return Ellus.toast('Nada para exportar com esses filtros.', 'info');
  const linhas = base
    .slice()
    .sort((a, b) => String(a.quarto).localeCompare(String(b.quarto), 'pt-BR', { numeric: true }) || String(a.nome).localeCompare(String(b.nome), 'pt-BR'))
    .map(p => [p.quarto || '', p.nome, Ellus.formatarCPF(p.cpf), p.colegio || '', formatarStatus(p.movimentacao).replace(/[^\p{L}\p{N} ]/gu, '').trim(),
      Ellus.formatarHora(p.movimentacao_at), p.ultimo_usuario || '', p.facial_cadastrada ? 'Sim' : 'Não']);
  Ellus.baixarCSV(`quartos_${Ellus.hojeISO()}.csv`,
    ['Quarto', 'Nome', 'CPF', 'Colégio', 'Situação', 'Desde', 'Registrado por', 'Facial'], linhas);
}

function resetPaginacao() { paginacao.quarto = 1; paginacao.fora = 1; paginacao.balada = 1; }

function formatarDataHora(v) {
  const d = Ellus.paraDate(v);
  if (!d) return '--';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatarStatus(s) {
  const v = String(s || '').toUpperCase();
  if (!v || v === 'QUARTO' || v === STATUS.QUARTO || v.includes('VOLTOU')) return 'No Quarto 🛌';
  if (v.includes('SAIU') || v.includes('FORA')) return 'Fora do Quarto 🚶';
  if (v.includes('BALADA')) return 'Na Balada 🎉';
  return s;
}

function getClassByStatus(s) {
  const v = String(s || '').toUpperCase();
  if (v.includes('BALADA')) return 'badge-balada';
  if (v.includes('SAIU') || v.includes('FORA')) return 'badge-fora';
  return 'badge-ok';
}

function mostrarLoading() { el('loadingOverlay').classList.remove('hidden'); }
function esconderLoading() { el('loadingOverlay').classList.add('hidden'); }

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
