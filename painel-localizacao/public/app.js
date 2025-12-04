// ============================================================================
// PAINEL DE LOCALIZAÇÃO - ELLUS
// ============================================================================

const STATUS = {
  QUARTO: 'VOLTOU_AO_QUARTO',
  FORA: 'SAIU_DO_QUARTO',
  BALADA: 'FOI_PARA_BALADA'
};

const ITENS_POR_PAGINA = 50;
let todasPessoas = [];
let listaQuartosFixa = [];
let viagensSelecionada = '';
let termoPesquisa = '';
let alunoSelecionado = null;
let debounceTimer = null;
let visualizacaoAtual = 'STATUS';
let autoRefreshInterval = null;
let operadorAtual = '';

const paginacao = {
  quarto: { paginaAtual: 1 },
  fora: { paginaAtual: 1 },
  balada: { paginaAtual: 1 }
};

const elements = {
  filtroViagem: document.getElementById('filtroViagem'),
  inputPesquisa: document.getElementById('inputPesquisa'),
  btnAtualizar: document.getElementById('btnAtualizar'),
  btnToggleView: document.getElementById('btnToggleView'),
  btnOperador: document.getElementById('btnOperador'),
  nomeOperadorDisplay: document.getElementById('nomeOperadorDisplay'),
  viewStatus: document.getElementById('viewStatus'),
  viewQuartos: document.getElementById('viewQuartos'),
  totalAlunos: document.getElementById('totalAlunos'),
  totalQuarto: document.getElementById('totalQuarto'),
  totalFora: document.getElementById('totalFora'),
  totalBalada: document.getElementById('totalBalada'),
  countQuarto: document.getElementById('countQuarto'),
  countFora: document.getElementById('countFora'),
  countBalada: document.getElementById('countBalada'),
  listaQuarto: document.getElementById('listaQuarto'),
  listaFora: document.getElementById('listaFora'),
  listaBalada: document.getElementById('listaBalada'),
  loadingOverlay: document.getElementById('loadingOverlay'),
  modalDetalhes: document.getElementById('modalDetalhes'),
  toastContainer: document.getElementById('toastContainer'),
  ultimaAtualizacao: document.getElementById('ultimaAtualizacao')
};

// ✅ FUNÇÃO GLOBAL PARA MOVER NO MODAL
window.moverNoModal = async function(status) {
  if (alunoSelecionado) {
    const cpf = alunoSelecionado.cpf || alunoSelecionado.CPF;
    const nome = alunoSelecionado.nome || alunoSelecionado.Nome || 'Aluno';
    await moverAluno(cpf, nome, status);
  } else {
    mostrarToast('Erro: Nenhum aluno selecionado', 'error');
  }
};

async function init() {
  console.log('🚀 Inicializando painel...');
  
  const userSession = localStorage.getItem('painel_user');
  if (!userSession) {
    window.location.href = '/login';
    return;
  }
  
  const user = JSON.parse(userSession);
  operadorAtual = user.nome || 'Admin';
  
  if (elements.nomeOperadorDisplay) {
    elements.nomeOperadorDisplay.textContent = `👋 Olá, ${operadorAtual}`;
  }

  if(elements.btnOperador) {
    elements.btnOperador.innerHTML = '<i class="fas fa-sign-out-alt"></i> Sair';
    elements.btnOperador.title = 'Sair do Sistema';
    elements.btnOperador.className = 'btn btn-sm btn-logout'; 
    
    elements.btnOperador.onclick = () => {
      if(confirm('Deseja realmente sair do sistema?')) {
        localStorage.removeItem('painel_user');
        localStorage.removeItem('operadorEllus');
        window.location.href = '/login';
      }
    };
  }

  elements.btnAtualizar.addEventListener('click', () => carregarDados());
  elements.btnToggleView.addEventListener('click', toggleVisualizacao);

  elements.filtroViagem.addEventListener('change', (e) => {
    viagensSelecionada = e.target.value;
    renderizarPainel();
  });

  elements.inputPesquisa.addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      termoPesquisa = e.target.value.toLowerCase().trim();
      resetPaginacao();
      renderizarPainel();
    }, 300);
  });

  elements.modalDetalhes.addEventListener('click', (e) => {
    if (e.target === elements.modalDetalhes) fecharModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') fecharModal();
    if (e.key === 'F5') { e.preventDefault(); carregarDados(); }
  });

  await carregarDados();
  autoRefreshInterval = setInterval(() => carregarDados(true), 30000);
}

function limparCPF(cpf) {
  if (!cpf) return '';
  return String(cpf).replace(/\D/g, '');
}

function formatarDataHora(isoString) {
  if (!isoString) return '--';
  try {
    let data;
    // Handle Firestore Timestamp objects (have _seconds and _nanoseconds or seconds and nanoseconds)
    if (typeof isoString === 'object' && (isoString._seconds || isoString.seconds)) {
      const seconds = isoString._seconds || isoString.seconds;
      data = new Date(seconds * 1000);
    } else {
      data = new Date(isoString);
    }

    if (isNaN(data.getTime())) return String(isoString);
    const dia = String(data.getDate()).padStart(2, '0');
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    const ano = data.getFullYear();
    const horas = String(data.getHours()).padStart(2, '0');
    const minutos = String(data.getMinutes()).padStart(2, '0');
    return `${dia}/${mes}/${ano} às ${horas}:${minutos}`;
  } catch (e) { return String(isoString); }
}

function toggleVisualizacao() {
  if (visualizacaoAtual === 'STATUS') {
    visualizacaoAtual = 'QUARTOS';
    elements.btnToggleView.innerHTML = '<i class="fas fa-columns"></i> 📋 Visualizar Colunas';
    elements.viewStatus.classList.add('hidden');
    elements.viewQuartos.classList.remove('hidden');
  } else {
    visualizacaoAtual = 'STATUS';
    elements.btnToggleView.innerHTML = '<i class="fas fa-th"></i> 🏨 Visualizar Quartos';
    elements.viewStatus.classList.remove('hidden');
    elements.viewQuartos.classList.add('hidden');
  }
  renderizarPainel();
}

async function carregarDados(silent = false) {
  try {
    if (!silent) mostrarLoading();
    
    const resPessoas = await fetch('/api/pessoas');
    const dataPessoas = await resPessoas.json();
    if (dataPessoas.success) todasPessoas = dataPessoas.data || [];

    if (!silent || listaQuartosFixa.length === 0) {
      try {
        const resQuartos = await fetch('/api/quartos');
        const dataQuartos = await resQuartos.json();
        if (dataQuartos.success) {
            listaQuartosFixa = dataQuartos.data || [];
        }
      } catch (e) { console.warn('Erro ao buscar quartos:', e); }

      const resViagens = await fetch('/api/viagens');
      const dataViagens = await resViagens.json();
      if (dataViagens.success) atualizarFiltroViagens(dataViagens.data);
    }

    renderizarPainel();
    elements.ultimaAtualizacao.textContent = `📅 Última atualização: ${new Date().toLocaleTimeString()}`;
    if (!silent) esconderLoading();
  } catch (error) {
    console.error(error);
    if (!silent) {
        esconderLoading();
        mostrarToast('❌ Erro ao carregar: ' + error.message, 'error');
    }
  }
}

function atualizarFiltroViagens(viagens) {
  const select = elements.filtroViagem;
  const val = select.value;
  while (select.options.length > 1) select.remove(1);
  viagens.forEach(v => {
    const opt = document.createElement('option');
    opt.value = `${v.inicio_viagem}|${v.fim_viagem}`;
    opt.textContent = v.label;
    select.appendChild(opt);
  });
  if (val) select.value = val;
}

function renderizarPainel() {
  let filtrados = todasPessoas;
  
  if (viagensSelecionada) {
    const [ini, fim] = viagensSelecionada.split('|');
    filtrados = filtrados.filter(p => p.inicio_viagem === ini && p.fim_viagem === fim);
  }
  if (termoPesquisa) {
    const termo = termoPesquisa.toLowerCase();
    filtrados = filtrados.filter(p => {
      return (p.nome || '').toLowerCase().includes(termo) || 
             (p.cpf || '').toLowerCase().includes(termo) || 
             (p.quarto || '').toString().toLowerCase().includes(termo);
    });
  }

  const categorias = categorizarPessoas(filtrados);
  atualizarEstatisticas(categorias, filtrados.length);

  if (visualizacaoAtual === 'STATUS') renderizarColunasStatus(categorias);
  else renderizarGridQuartos(); 
}

function categorizarPessoas(pessoas) {
  const cats = { quarto: [], fora: [], balada: [] };
  pessoas.forEach(p => {
    const status = (p.movimentacao || '').trim().toUpperCase();
    if (status.includes('SAIU') || status.includes('FORA')) cats.fora.push(p);
    else if (status.includes('BALADA')) cats.balada.push(p);
    else cats.quarto.push(p); 
  });
  return cats;
}

function atualizarEstatisticas(cats, total) {
  elements.totalAlunos.textContent = total;
  elements.totalQuarto.textContent = cats.quarto.length;
  elements.totalFora.textContent = cats.fora.length;
  elements.totalBalada.textContent = cats.balada.length;
}

function renderizarColunasStatus(cats) {
  renderizarLista(elements.listaQuarto, cats.quarto, elements.countQuarto, STATUS.QUARTO, 'quarto');
  renderizarLista(elements.listaFora, cats.fora, elements.countFora, STATUS.FORA, 'fora');
  renderizarLista(elements.listaBalada, cats.balada, elements.countBalada, STATUS.BALADA, 'balada');
}

function renderizarLista(container, pessoas, countElem, statusDestino, keyPag) {
  container.innerHTML = '';
  countElem.textContent = pessoas.length;
  if (pessoas.length === 0) {
    container.innerHTML = '<p class="empty-message">📭 Vazio</p>';
    return;
  }
  const page = paginacao[keyPag].paginaAtual;
  const start = (page - 1) * ITENS_POR_PAGINA;
  const pageItems = pessoas.slice(start, start + ITENS_POR_PAGINA);
  pageItems.forEach(p => container.appendChild(criarCardAluno(p, statusDestino)));
  if (pessoas.length > start + ITENS_POR_PAGINA) {
    const btn = document.createElement('button');
    btn.className = 'btn-load-more';
    btn.textContent = '🔽 Carregar mais...';
    btn.onclick = () => {
      paginacao[keyPag].paginaAtual++;
      renderizarPainel();
    };
    container.appendChild(btn);
  }
  configurarDropZone(container, statusDestino);
}

function renderizarGridQuartos() {
  const container = elements.viewQuartos;
  container.innerHTML = '';

  if (listaQuartosFixa.length === 0) {
    container.innerHTML = '<p class="empty-message">⚠️ Nenhum quarto configurado na HOMELIST.</p>';
    return;
  }

  const quartosMap = {};
  
  listaQuartosFixa.forEach(item => {
    let numQuarto = String(item['Quarto'] || item['quarto'] || 'Sem Nº').trim();
    if (!quartosMap[numQuarto]) quartosMap[numQuarto] = [];

    const nomeHospede = item['Nome do Hóspede'] || item['Nome'] || item['nome'] || 'Sem Nome';
    const escola = item['Escola'] || item['escola'] || '';
    const cpfRaw = item['CPF'] || item['cpf'] || '';

    let statusFinal = 'VOLTOU_AO_QUARTO'; 
    
    if (cpfRaw) {
      const cpfLimpo = limparCPF(cpfRaw);
      const pessoaEncontrada = todasPessoas.find(p => limparCPF(p.cpf) === cpfLimpo);
      
      if (pessoaEncontrada && pessoaEncontrada.movimentacao) {
        statusFinal = pessoaEncontrada.movimentacao;
      }
    }

    quartosMap[numQuarto].push({
      nome: nomeHospede,
      escola: escola,
      cpf: cpfRaw,
      movimentacao: statusFinal,
      quarto: numQuarto
    });
  });

  const chaves = Object.keys(quartosMap).sort((a, b) => {
    const na = parseInt(a.replace(/\D/g,''));
    const nb = parseInt(b.replace(/\D/g,''));
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.localeCompare(b);
  });

  chaves.forEach(num => {
    const alunosNoQuarto = quartosMap[num];
    if (termoPesquisa) {
      const termo = termoPesquisa.toLowerCase();
      const matches = alunosNoQuarto.some(a => 
        String(a.nome).toLowerCase().includes(termo) || 
        String(a.cpf).includes(termo) || 
        num.toLowerCase().includes(termo)
      );
      if (!matches) return;
    }
    container.appendChild(criarCardQuarto(num, alunosNoQuarto));
  });
}

function criarCardQuarto(numero, alunos) {
  const temAlguemFora = alunos.some(a => {
    const st = (a.movimentacao || '').toUpperCase();
    return st.includes('SAIU') || st.includes('FORA') || st.includes('BALADA');
  });

  const div = document.createElement('div');
  div.className = `room-card ${temAlguemFora ? 'room-warning' : ''}`;
  
  const header = document.createElement('div');
  header.className = 'room-header';
  header.innerHTML = `
    <div class="room-title">
        <i class="fas fa-door-closed"></i> Quarto ${numero}
    </div>
    <span class="room-count">👥 ${alunos.length}</span>`;
  
  const lista = document.createElement('div');
  lista.className = 'room-list';
  
  alunos.forEach(p => {
    const item = document.createElement('div');
    item.className = 'room-student';
    
    const st = (p.movimentacao || '').toUpperCase();
    const isOut = st.includes('SAIU') || st.includes('FORA') || st.includes('BALADA');
    const nameClass = isOut ? 'text-red' : 'text-green';
    
    let emojiStatus = '🛌';
    if (st.includes('SAIU') || st.includes('FORA')) emojiStatus = '🚶';
    if (st.includes('BALADA')) emojiStatus = '🎉';

    const cpfSafe = p.cpf ? p.cpf.toString().replace(/'/g, "\\'") : '';

    item.innerHTML = `
      <div class="status-emoji" title="${formatarStatus(st)}">${emojiStatus}</div>
      <div class="student-info">
          <span class="student-name-small ${nameClass}" title="${p.nome}">${p.nome}</span>
          ${p.escola ? `<span class="student-school">🎓 ${p.escola}</span>` : ''}
      </div>
      <button class="btn-icon-small" onclick="abrirModalCPF('${cpfSafe}')">ℹ️</button>
    `;
    lista.appendChild(item);
  });
  
  div.appendChild(header);
  div.appendChild(lista);
  return div;
}

function criarCardAluno(p, currentStatus) {
  const el = document.createElement('div');
  el.className = 'aluno-card';
  el.draggable = true;
  el.dataset.cpf = p.cpf;
  
  const cpfSafe = p.cpf ? p.cpf.toString().replace(/'/g, "\\'") : '';
  const nomeSafe = p.nome ? p.nome.toString().replace(/'/g, "\\'") : '';

  el.innerHTML = `
    <div class="card-header">
      <span class="nome">${p.nome}</span>
      ${p.quarto ? `<span class="badge-quarto">🚪 ${p.quarto}</span>` : ''}
    </div>
    <div class="card-body">
      <p>🆔 CPF: ${formatarCPF(p.cpf)}</p>
      <p>🏫 ${p.turma || ''} - ${p.colegio || ''}</p>
    </div>
    <div class="card-actions">
      <button class="btn-action btn-details" onclick="abrirModalCPF('${cpfSafe}')">👁️ Detalhes</button>
      <button class="btn-action btn-move-action" onclick="mostrarMenuMover(this, '${cpfSafe}', '${nomeSafe}')">🔄 Mover</button>
    </div>
  `;
  el.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ cpf: p.cpf, nome: p.nome }));
    el.classList.add('dragging');
  });
  el.addEventListener('dragend', () => el.classList.remove('dragging'));
  return el;
}

async function moverAluno(cpf, nome, novoStatus) {
  mostrarToast(`🔄 Movendo ${nome}...`, 'info');
  try {
    const cpfLimpo = limparCPF(cpf);
    let pessoa = todasPessoas.find(p => limparCPF(p.cpf) === cpfLimpo);
    
    if (!pessoa) {
       const itemFixa = listaQuartosFixa.find(x => limparCPF(x.CPF || x.cpf) === cpfLimpo);
       if (itemFixa) {
           pessoa = {
               cpf: cpf,
               quarto: itemFixa['Quarto'] || '',
               colegio: itemFixa['Escola'] || '',
           };
       }
    }

    const body = {
      cpf,
      nome,
      novaLocalizacao: novoStatus,
      operador: operadorAtual,
      quarto: pessoa?.quarto || '',
      colegio: pessoa?.colegio || '',
      turma: pessoa?.turma || '',
      inicioViagem: pessoa?.inicio_viagem || '',
      fimViagem: pessoa?.fim_viagem || ''
    };

    const res = await fetch('/api/movimentar', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (data.success) {
      mostrarToast('✅ Movimentação registrada!', 'success');
      
      const pIndex = todasPessoas.findIndex(p => limparCPF(p.cpf) === cpfLimpo);
      if (pIndex >= 0) {
        todasPessoas[pIndex].movimentacao = novoStatus;
      } else {
        todasPessoas.push({
            cpf: cpf,
            nome: nome,
            movimentacao: novoStatus,
            quarto: pessoa?.quarto
        });
      }
      renderizarPainel();
      if (alunoSelecionado && limparCPF(alunoSelecionado.cpf) === cpfLimpo) {
        alunoSelecionado.movimentacao = novoStatus;
        abrirModalDetalhes(alunoSelecionado);
      }
    } else {
      throw new Error(data.message);
    }
  } catch (e) {
    mostrarToast('❌ ' + e.message, 'error');
  }
}

// CORREÇÃO: Função para exibir o menu com estilos aplicados
function mostrarMenuMover(btn, cpf, nome) {
  // Remove menus existentes
  document.querySelectorAll('.context-menu').forEach(m => m.remove());
  
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  
  const items = [
    { l: '<i class="fas fa-bed"></i> Voltou pro Quarto', v: STATUS.QUARTO },
    { l: '<i class="fas fa-walking"></i> Saiu do Quarto', v: STATUS.FORA },
    { l: '<i class="fas fa-music"></i> Foi pra Balada', v: STATUS.BALADA }
  ];
  
  items.forEach(it => {
    const b = document.createElement('button');
    b.innerHTML = it.l;
    b.onclick = () => { 
      menu.remove(); 
      moverAluno(cpf, nome, it.v); 
    };
    menu.appendChild(b);
  });

  // Posicionamento
  const rect = btn.getBoundingClientRect();
  menu.style.top = (rect.bottom + 5) + 'px';
  menu.style.left = rect.left + 'px';
  
  document.body.appendChild(menu);

  // Fechar ao clicar fora
  setTimeout(() => {
    document.addEventListener('click', function f(e) {
      if (!menu.contains(e.target) && e.target !== btn) {
        menu.remove();
        document.removeEventListener('click', f);
      }
    });
  }, 10);
}

function configurarDropZone(el, statusDestino) {
  el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('drag-over'); });
  el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
  el.addEventListener('drop', e => {
    e.preventDefault();
    el.classList.remove('drag-over');
    try {
      const data = JSON.parse(e.dataTransfer.getData('text/plain'));
      if (data.cpf && data.nome) moverAluno(data.cpf, data.nome, statusDestino);
    } catch (err) { console.error(err); }
  });
}

window.abrirModalCPF = (cpf) => {
  const cpfLimpo = limparCPF(cpf);
  let p = todasPessoas.find(x => limparCPF(x.cpf) === cpfLimpo);
  if (!p) {
    const daListaFixa = listaQuartosFixa.find(x => limparCPF(x.CPF || x.cpf) === cpfLimpo);
    if (daListaFixa) {
        p = { 
            nome: daListaFixa['Nome do Hóspede'] || daListaFixa.Nome || daListaFixa.nome || 'Aluno',
            cpf: daListaFixa.CPF || daListaFixa.cpf, 
            quarto: daListaFixa.Quarto || daListaFixa.quarto, 
            movimentacao: 'VOLTOU_AO_QUARTO',
            escola: daListaFixa['Escola'] || daListaFixa.escola
        };
    }
  }
  if (p) abrirModalDetalhes(p);
};

async function abrirModalDetalhes(p) {
  alunoSelecionado = p;
  document.getElementById('detalheNome').textContent = p.nome;
  document.getElementById('detalheQuarto').textContent = p.quarto || '-';
  document.getElementById('detalheCpf').textContent = formatarCPF(p.cpf);
  document.getElementById('detalheInfo').textContent = `${p.colegio || p.escola || ''} - ${p.turma || ''}`;
  
  const badge = document.getElementById('detalheStatus');
  badge.textContent = formatarStatus(p.movimentacao);
  badge.className = `badge ${getClassByStatus(p.movimentacao)}`;

  elements.modalDetalhes.style.display = 'flex';
  
  const listaHist = document.getElementById('listaHistorico');
  listaHist.innerHTML = '<p class="text-center">⏳ Carregando histórico...</p>';
  
  try {
    const res = await fetch(`/api/logs?cpf=${limparCPF(p.cpf)}`);
    const json = await res.json();
    if (json.success) {
      const logs = json.data || [];
      listaHist.innerHTML = '';
      if (logs.length === 0) {
        listaHist.innerHTML = '<p class="text-muted">📭 Sem histórico registrado.</p>';
      } else {
        logs.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
        logs.forEach(log => {
          const operadorNome = log.operador || log.Operador || log.monitor || log.operadorNome || 'Sistema';
          const row = document.createElement('div');
          row.className = 'hist-row';
          row.innerHTML = `
            <div class="hist-time">${formatarDataHora(log.timestamp)}</div>
            <div class="hist-action"><strong>${formatarStatus(log.tipo || log.movimentacao)}</strong></div>
            <div class="hist-op" title="${operadorNome}"><i class="fas fa-user"></i> ${operadorNome}</div>
          `;
          listaHist.appendChild(row);
        });
      }
    }
  } catch (e) {
    listaHist.innerHTML = '<p class="error">❌ Erro ao carregar histórico.</p>';
  }
}

function fecharModal() {
  elements.modalDetalhes.style.display = 'none';
  alunoSelecionado = null;
}

function resetPaginacao() {
  paginacao.quarto.paginaAtual = 1;
  paginacao.fora.paginaAtual = 1;
  paginacao.balada.paginaAtual = 1;
}

function formatarCPF(v) {
  if (!v) return '';
  let s = v.toString().replace(/\D/g, '');
  if(s.length === 11) return s.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  return v;
}

function formatarStatus(s) {
  if (!s) return 'Quarto';
  if (s === STATUS.QUARTO) return 'No Quarto 🛌';
  if (s === STATUS.FORA) return 'Fora do Quarto 🚶';
  if (s === STATUS.BALADA) return 'Na Balada 🎉';
  return s;
}

function getClassByStatus(s) {
  if (s === STATUS.FORA) return 'badge-fora';
  if (s === STATUS.BALADA) return 'badge-balada';
  return 'badge-quarto';
}

function mostrarToast(msg, type) {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  elements.toastContainer.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

function mostrarLoading() { elements.loadingOverlay.classList.remove('hidden'); }
function esconderLoading() { elements.loadingOverlay.classList.add('hidden'); }

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();