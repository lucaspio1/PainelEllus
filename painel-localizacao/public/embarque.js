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
// CONTROLE DE EMBARQUE
// Antes a lista era filtrada só pela DATA DE INÍCIO: no dia do retorno
// "Hoje" vinha vazio. Agora trabalha por viagem: "Acontecendo hoje" pega
// todas as viagens entre o início e o fim.
// ============================================================================

const esc = Ellus.esc;
const sim = (v) => String(v || '').trim().toUpperCase() === 'SIM';

const estado = Ellus.prefs.ler('embarque_filtros', { periodo: 'hoje', viagem: '', status: '', termo: '' });
let viagens = [];
let passageiros = [];
let viagensSelecionadas = [];
const abertos = new Set(); // acordeões abertos (sobrevivem ao auto-refresh)

const el = (id) => document.getElementById(id);

document.addEventListener('DOMContentLoaded', () => {
  if (!localStorage.getItem('painel_user')) { window.location.href = '/login'; return; }
  el('nomeOperador').textContent = `👋 ${(Ellus.usuario().nome || 'Usuário').split(' ')[0]}`;

  // Link vindo do Gerenciar Viagens: /embarque?colegio=X&inicio=AAAA-MM-DD
  const params = new URLSearchParams(window.location.search);
  if (params.get('colegio') && params.get('inicio')) {
    estado.periodo = 'escolher';
    estado.viagem = `${params.get('colegio').trim().toUpperCase()}|${params.get('inicio')}`;
  }

  el('searchEmbarque').value = estado.termo || '';
  el('searchEmbarque').addEventListener('input', (e) => { estado.termo = e.target.value; renderizar(); });
  document.querySelectorAll('[data-periodo]').forEach(b => b.addEventListener('click', () => {
    estado.periodo = b.dataset.periodo;
    carregar();
  }));
  el('selViagem').addEventListener('change', (e) => { estado.viagem = e.target.value; carregar(); });
  document.querySelectorAll('#chipsStatus .chip').forEach(c => c.addEventListener('click', () => {
    estado.status = c.dataset.valor;
    renderizar();
  }));
  el('btnAtualizar').addEventListener('click', () => carregar());
  el('btnExportar').addEventListener('click', exportar);

  carregar();

  if (typeof io !== 'undefined') {
    const socket = io();
    socket.on('dados_atualizados', (d) => {
      if (!d || ['embarques', 'importacao', 'viagens', 'exclusao_lote'].includes(d.tipo)) carregar(true);
    });
  }
  // Rede de segurança caso o socket caia
  setInterval(() => carregar(true), 60000);
});

function chaveViagem(v) { return `${String(v.colegio).trim().toUpperCase()}|${v.inicio}`; }

function viagensDoPeriodo() {
  const hoje = Ellus.hojeISO();
  const amanha = Ellus.hojeISO(1);
  if (estado.periodo === 'amanha') return viagens.filter(v => v.inicio === amanha);
  if (estado.periodo === 'escolher') return viagens.filter(v => chaveViagem(v) === estado.viagem);
  return viagens.filter(v => v.inicio <= hoje && (!v.fim || hoje <= v.fim));
}

async function carregar(silencioso = false) {
  Ellus.prefs.gravar('embarque_filtros', estado);
  document.querySelectorAll('[data-periodo]').forEach(b => b.classList.toggle('selected', b.dataset.periodo === estado.periodo));
  el('campoViagem').classList.toggle('hidden', estado.periodo !== 'escolher');
  if (!silencioso) {
    el('loadingEmbarque').classList.remove('hidden');
    el('listaEmbarqueContainer').innerHTML = '';
  }

  try {
    const resViagens = await authFetch(`/api/viagens-unicas?hoje=${Ellus.hojeISO()}`);
    const jsonViagens = await resViagens.json();
    if (!jsonViagens.success) throw new Error(jsonViagens.message || 'Erro ao listar viagens');
    viagens = jsonViagens.data || [];
    preencherSelectViagens();

    viagensSelecionadas = viagensDoPeriodo();
    const respostas = await Promise.all(viagensSelecionadas.map(v =>
      authFetch(`/api/embarque-lista?inicio=${encodeURIComponent(v.inicio)}&colegio=${encodeURIComponent(v.colegio)}`)
        .then(r => r.json())
        .then(j => (j.passageiros || []).map(p => ({ ...p, _viagem: v })))
    ));
    passageiros = respostas.flat();
    el('ultimaAtualizacao').textContent = `Atualizado às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    renderizar();
  } catch (error) {
    console.error(error);
    if (!silencioso) el('listaEmbarqueContainer').innerHTML = `<div class="empty-state">❌ ${esc(error.message || 'Erro ao conectar com o servidor.')}</div>`;
  } finally {
    el('loadingEmbarque').classList.add('hidden');
  }
}

function preencherSelectViagens() {
  const sel = el('selViagem');
  const hoje = Ellus.hojeISO();
  const ordenadas = viagens.slice().sort((a, b) => {
    const aAtiva = a.inicio <= hoje && hoje <= a.fim;
    const bAtiva = b.inicio <= hoje && hoje <= b.fim;
    if (aAtiva !== bAtiva) return aAtiva ? -1 : 1;
    return String(b.inicio).localeCompare(String(a.inicio));
  });
  sel.innerHTML = '<option value="">Selecione a viagem...</option>' + ordenadas.map(v => {
    const ativa = v.inicio <= hoje && hoje <= v.fim;
    return `<option value="${esc(chaveViagem(v))}">${ativa ? '🟢 ' : ''}${esc(v.colegio)} — ${esc(Ellus.formatarData(v.inicio))} a ${esc(Ellus.formatarData(v.fim))} (${v.qtd_alunos})</option>`;
  }).join('');
  sel.value = estado.viagem || '';
}

function correspondeBusca(p) {
  const termo = (estado.termo || '').toLowerCase().trim();
  if (!termo) return true;
  const digitos = Ellus.soDigitos(termo);
  return (p.nome || '').toLowerCase().includes(termo) ||
    (digitos.length >= 3 && String(p.cpf || '').includes(digitos)) ||
    (p.turma || '').toLowerCase().includes(termo) ||
    String(p.onibus || '').toLowerCase() === termo.replace(/^ônibus\s*|^onibus\s*/i, '') ||
    (p.colegio || '').toLowerCase().includes(termo);
}

function passaStatus(p) {
  switch (estado.status) {
    case 'falta_embarcar': return !sim(p.embarque);
    case 'embarcados': return sim(p.embarque);
    case 'falta_retornar': return sim(p.embarque) && !sim(p.retorno);
    case 'retornados': return sim(p.retorno);
    default: return true;
  }
}

function renderizar() {
  Ellus.prefs.gravar('embarque_filtros', estado);
  document.querySelectorAll('#chipsStatus .chip').forEach(c => c.classList.toggle('active', c.dataset.valor === (estado.status || '')));

  const base = passageiros.filter(correspondeBusca);
  const embarcados = base.filter(p => sim(p.embarque)).length;
  const retornados = base.filter(p => sim(p.retorno)).length;
  el('cntTodos').textContent = base.length;
  el('cntFaltaEmb').textContent = base.length - embarcados;
  el('cntEmb').textContent = embarcados;
  el('cntFaltaRet').textContent = base.filter(p => sim(p.embarque) && !sim(p.retorno)).length;
  el('cntRet').textContent = retornados;

  el('kpiTotal').textContent = base.length;
  el('kpiEmb').textContent = embarcados;
  el('kpiFaltaEmb').textContent = base.length - embarcados;
  el('kpiRet').textContent = retornados;
  el('barEmb').style.width = base.length ? `${(embarcados / base.length) * 100}%` : '0';
  el('barRet').style.width = base.length ? `${(retornados / base.length) * 100}%` : '0';
  el('kpiViagens').textContent = viagensSelecionadas.length === 1
    ? `${viagensSelecionadas[0].colegio}`
    : `${viagensSelecionadas.length} viagem(ns)`;

  const container = el('listaEmbarqueContainer');
  container.innerHTML = '';

  if (viagensSelecionadas.length === 0) {
    const msg = {
      hoje: 'Nenhuma viagem acontecendo hoje.',
      amanha: 'Nenhuma viagem saindo amanhã.',
      escolher: 'Selecione uma viagem acima.'
    }[estado.periodo];
    container.innerHTML = `<div class="empty-state">${msg}<br><button class="btn btn-outline btn-sm" style="margin-top:12px" onclick="document.querySelector('[data-periodo=escolher]').click()">Ver todas as viagens</button></div>`;
    return;
  }

  const filtrados = base.filter(passaStatus);
  if (filtrados.length === 0) {
    container.innerHTML = '<div class="empty-state">Nenhum aluno com esses filtros. 🎉</div>';
    return;
  }

  // Agrupa por viagem/colégio e depois por ônibus
  const variasViagens = viagensSelecionadas.length > 1;
  const grupos = {};
  filtrados.forEach(p => {
    const g = `${p.colegio || 'SEM COLÉGIO'}${variasViagens ? ` · ${Ellus.formatarData(p._viagem.inicio)}` : ''}`;
    const onibus = p.onibus || 'sem ônibus';
    ((grupos[g] = grupos[g] || {})[onibus] = grupos[g][onibus] || []).push(p);
  });
  const abrirTudo = !!estado.termo || !!estado.status || Object.keys(grupos).length === 1;

  Object.keys(grupos).sort((a, b) => a.localeCompare(b, 'pt-BR')).forEach(nomeGrupo => {
    const porOnibus = grupos[nomeGrupo];
    const todos = Object.values(porOnibus).flat();
    const emb = todos.filter(a => sim(a.embarque)).length;
    const ret = todos.filter(a => sim(a.retorno)).length;

    const det = document.createElement('details');
    det.className = 'school-accordion';
    det.open = abrirTudo || abertos.has(nomeGrupo);
    det.addEventListener('toggle', () => det.open ? abertos.add(nomeGrupo) : abertos.delete(nomeGrupo));
    det.innerHTML = `
      <summary>
        <div class="summary-content">
          <span class="school-name">${esc(nomeGrupo)}</span>
          <span class="school-stats"><i class="fas fa-arrow-right"></i> ${emb}/${todos.length} embarcados · <i class="fas fa-arrow-left"></i> ${ret}/${todos.length} retornaram</span>
        </div>
        <div class="progress-bar-mini"><div class="fill" style="width:${todos.length ? (emb / todos.length) * 100 : 0}%"></div></div>
      </summary>
      <div class="onibus-container"></div>`;
    const cont = det.querySelector('.onibus-container');

    Object.keys(porOnibus).sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true })).forEach(onibus => {
      const alunos = porOnibus[onibus].sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
      const e = alunos.filter(a => sim(a.embarque)).length;
      const r = alunos.filter(a => sim(a.retorno)).length;
      const chaveOnibus = `${nomeGrupo}|${onibus}`;
      const detOn = document.createElement('details');
      detOn.className = 'bus-accordion';
      detOn.open = abrirTudo || abertos.has(chaveOnibus);
      detOn.addEventListener('toggle', () => detOn.open ? abertos.add(chaveOnibus) : abertos.delete(chaveOnibus));
      detOn.innerHTML = `
        <summary class="bus-summary">
          <div class="summary-content">
            <span class="bus-name"><i class="fas fa-bus"></i> Ônibus ${esc(onibus)}</span>
            <span class="bus-stats">
              <span class="stat-embarque"><i class="fas fa-arrow-right"></i> ${e}/${alunos.length}</span>
              <span class="stat-retorno"><i class="fas fa-arrow-left"></i> ${r}/${alunos.length}</span>
            </span>
          </div>
        </summary>
        <div class="student-list"></div>`;
      const lista = detOn.querySelector('.student-list');
      alunos.forEach(a => lista.appendChild(criarLinha(a)));
      cont.appendChild(detOn);
    });
    container.appendChild(det);
  });
}

function tag(tipo, aluno) {
  const ok = sim(aluno[tipo]);
  const quando = Ellus.formatarHora(aluno[`${tipo}_at`]);
  const por = aluno[`${tipo}_por`];
  const titulo = tipo === 'embarque' ? (ok ? 'Embarcou' : 'Não embarcou') : (ok ? 'Retornou' : 'Não retornou');
  const cls = ok ? (tipo === 'embarque' ? 'tag-green' : 'tag-blue') : 'tag-gray';
  const detalhe = ok && (quando || por) ? ` <small>${esc(quando)}${por ? ` · ${esc(por)}` : ''}</small>` : '';
  return `<span class="tag ${cls}" title="${esc(por ? `Registrado por ${por}` : '')}">${ok ? '✓' : '✗'} ${titulo}${detalhe}</span>`;
}

function criarLinha(aluno) {
  const row = document.createElement('div');
  const emb = sim(aluno.embarque);
  const ret = sim(aluno.retorno);
  row.className = `student-row ${emb ? 'status-ok' : 'status-pending'}`;
  row.innerHTML = `
    <div class="st-info">
      <span class="st-name">${esc(aluno.nome)}</span>
      <span class="st-meta">CPF: ${esc(Ellus.formatarCPF(aluno.cpf))}${aluno.turma ? ` · Turma: ${esc(aluno.turma)}` : ''}${aluno.idPasseio ? ` · ${esc(aluno.idPasseio)}` : ''}</span>
    </div>
    <div class="st-status">
      ${tag('embarque', aluno)}
      ${tag('retorno', aluno)}
    </div>
    <div class="acoes-linha">
      <button class="btn btn-sm ${emb ? 'btn-ghost' : 'btn-outline'}" data-campo="embarque" title="${emb ? 'Desfazer embarque' : 'Marcar embarque pelo painel'}">${emb ? '↩︎ Embarque' : '✓ Embarcou'}</button>
      <button class="btn btn-sm ${ret ? 'btn-ghost' : 'btn-outline'}" data-campo="retorno" title="${ret ? 'Desfazer retorno' : 'Marcar retorno pelo painel'}">${ret ? '↩︎ Retorno' : '✓ Retornou'}</button>
    </div>`;
  row.querySelectorAll('[data-campo]').forEach(b => b.addEventListener('click', () => marcar(aluno, b.dataset.campo)));
  return row;
}

async function marcar(aluno, campo) {
  const atual = sim(aluno[campo]);
  const novoValor = atual ? 'NÃO' : 'SIM';
  const acao = `${atual ? 'Desfazer' : 'Marcar'} ${campo} de ${aluno.nome}?`;
  if (!confirm(`${acao}\n\nUse só para corrigir: o normal é o monitor marcar no app.`)) return;
  try {
    const res = await authFetch('/api/embarque/marcar', {
      method: 'POST',
      body: JSON.stringify({ cpf: aluno.cpf, campo, valor: novoValor })
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message || 'Erro ao salvar');
    Object.assign(aluno, json.data);
    Ellus.toast(`✅ ${aluno.nome}: ${campo} ${novoValor === 'SIM' ? 'marcado' : 'desfeito'}`, 'success');
    renderizar();
  } catch (e) {
    Ellus.toast(`❌ ${e.message}`, 'error');
  }
}

function exportar() {
  const lista = passageiros.filter(correspondeBusca).filter(passaStatus);
  if (lista.length === 0) return Ellus.toast('Nada para exportar.', 'info');
  const linhas = lista
    .slice()
    .sort((a, b) => String(a.colegio).localeCompare(String(b.colegio), 'pt-BR') ||
      String(a.onibus).localeCompare(String(b.onibus), 'pt-BR', { numeric: true }) ||
      String(a.nome).localeCompare(String(b.nome), 'pt-BR'))
    .map(p => [p.colegio, Ellus.formatarData(p._viagem.inicio), p.onibus, p.nome, Ellus.formatarCPF(p.cpf), p.turma,
      sim(p.embarque) ? 'Sim' : 'Não', Ellus.formatarHora(p.embarque_at), p.embarque_por || '',
      sim(p.retorno) ? 'Sim' : 'Não', Ellus.formatarHora(p.retorno_at), p.retorno_por || '']);
  Ellus.baixarCSV(`embarque_${Ellus.hojeISO()}.csv`,
    ['Colégio', 'Início', 'Ônibus', 'Nome', 'CPF', 'Turma', 'Embarcou', 'Hora embarque', 'Marcado por', 'Retornou', 'Hora retorno', 'Marcado por'], linhas);
}
