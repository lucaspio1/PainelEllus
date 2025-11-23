// ============================================================================
// PAINEL DE LOCALIZAÇÃO - ELLUS (VERSÃO ROBUSTA + ESCALÁVEL)
// ============================================================================

// Configurações de paginação
const ITENS_POR_PAGINA = 50; // Renderiza máximo de 50 cards por painel

// Estado da aplicação
let todasPessoas = [];
let viagensSelecionada = '';
let autoRefreshInterval = null;
let termoPesquisa = '';
let alunoSelecionado = null;
let debounceTimer = null;

// Estado de paginação para cada painel
const paginacao = {
  quarto: { paginaAtual: 1 },
  fora: { paginaAtual: 1 },
  balada: { paginaAtual: 1 }
};

// Elementos do DOM
const elements = {
  filtroViagem: document.getElementById('filtroViagem'),
  inputPesquisa: document.getElementById('inputPesquisa'),
  btnAtualizar: document.getElementById('btnAtualizar'),
  ultimaAtualizacao: document.getElementById('ultimaAtualizacao'),
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
  errorMessage: document.getElementById('errorMessage'),
  errorText: document.getElementById('errorText'),
  modalDetalhes: document.getElementById('modalDetalhes'),
  toastContainer: document.getElementById('toastContainer')
};

/**
 * Inicialização da aplicação
 */
async function init() {
  console.log('🚀 Inicializando painel robusto...');

  // Event Listeners
  elements.btnAtualizar.addEventListener('click', () => carregarDados());
  elements.filtroViagem.addEventListener('change', (e) => {
    viagensSelecionada = e.target.value;
    renderizarPainel();
  });
  elements.inputPesquisa.addEventListener('input', (e) => {
    // Debounce para performance com muitos alunos
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      termoPesquisa = e.target.value.toLowerCase().trim();
      // Reset paginação ao pesquisar
      paginacao.quarto.paginaAtual = 1;
      paginacao.fora.paginaAtual = 1;
      paginacao.balada.paginaAtual = 1;
      renderizarPainel();
    }, 300); // Aguarda 300ms após usuário parar de digitar
  });

  // Fechar modal ao clicar fora
  elements.modalDetalhes.addEventListener('click', (e) => {
    if (e.target === elements.modalDetalhes) {
      fecharModal();
    }
  });

  // Atalhos de teclado
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      fecharModal();
    }
    if (e.key === 'F5' || (e.ctrlKey && e.key === 'r')) {
      e.preventDefault();
      carregarDados();
    }
  });

  // Carregar dados iniciais
  await carregarDados();

  // Auto-refresh a cada 30 segundos
  autoRefreshInterval = setInterval(() => {
    carregarDados(true); // true = silent refresh
  }, 30000);

  console.log('✅ Painel robusto inicializado');
}

/**
 * Carregar dados da API
 */
async function carregarDados(silent = false) {
  try {
    if (!silent) {
      mostrarLoading();
    }

    console.log('📥 Buscando dados da API...');

    // Buscar pessoas
    const responsePessoas = await fetch('/api/pessoas');
    const dataPessoas = await responsePessoas.json();

    if (!dataPessoas.success) {
      throw new Error(dataPessoas.message || 'Erro ao buscar pessoas');
    }

    todasPessoas = dataPessoas.data || [];
    console.log(`✅ ${todasPessoas.length} pessoas carregadas`);

    // Buscar viagens
    const responseViagens = await fetch('/api/viagens');
    const dataViagens = await responseViagens.json();

    if (dataViagens.success) {
      const viagens = dataViagens.data || [];
      console.log(`✅ ${viagens.length} viagens carregadas`);
      atualizarFiltroViagens(viagens);
    }

    // Renderizar painel
    renderizarPainel();

    // Atualizar timestamp
    const agora = new Date();
    elements.ultimaAtualizacao.textContent = `Última atualização: ${formatarHora(agora)}`;

    if (!silent) {
      esconderLoading();
    }

  } catch (error) {
    console.error('❌ Erro ao carregar dados:', error);
    esconderLoading();
    mostrarErro('Erro ao carregar dados: ' + error.message);
  }
}

/**
 * Atualizar select de viagens
 */
function atualizarFiltroViagens(viagens) {
  const select = elements.filtroViagem;
  const valorAtual = select.value;

  // Limpar opções (exceto a primeira)
  while (select.options.length > 1) {
    select.remove(1);
  }

  // Adicionar novas opções
  viagens.forEach(viagem => {
    const option = document.createElement('option');
    option.value = `${viagem.inicio_viagem}|${viagem.fim_viagem}`;
    const inicioFormatado = formatarData(viagem.inicio_viagem);
    const fimFormatado = formatarData(viagem.fim_viagem);
    option.textContent = `${inicioFormatado} até ${fimFormatado}`;
    select.appendChild(option);
  });

  // Restaurar valor selecionado se ainda existir
  if (valorAtual) {
    select.value = valorAtual;
  }
}

/**
 * Renderizar painel com dados filtrados
 */
function renderizarPainel() {
  console.log('🎨 Renderizando painel...');

  // Filtrar pessoas pela viagem selecionada
  let pessoasFiltradas = todasPessoas;

  if (viagensSelecionada) {
    const [inicioViagem, fimViagem] = viagensSelecionada.split('|');
    pessoasFiltradas = todasPessoas.filter(pessoa => {
      return pessoa.inicio_viagem === inicioViagem && pessoa.fim_viagem === fimViagem;
    });
    console.log(`🔍 Filtrado por viagem: ${pessoasFiltradas.length} pessoas`);
  }

  // Filtrar por termo de pesquisa
  if (termoPesquisa) {
    pessoasFiltradas = pessoasFiltradas.filter(pessoa => {
      const nome = (pessoa.nome || '').toLowerCase();
      const cpf = (pessoa.cpf || '').toLowerCase();
      return nome.includes(termoPesquisa) || cpf.includes(termoPesquisa);
    });
    console.log(`🔍 Filtrado por pesquisa: ${pessoasFiltradas.length} pessoas`);
  }

  // Categorizar pessoas por movimentação
  const categorias = categorizarPessoas(pessoasFiltradas);

  // Atualizar estatísticas
  atualizarEstatisticas(categorias, pessoasFiltradas.length);

  // Renderizar listas
  renderizarLista(elements.listaQuarto, categorias.quarto, elements.countQuarto, 'QUARTO');
  renderizarLista(elements.listaFora, categorias.fora, elements.countFora, 'FORA_DO_QUARTO');
  renderizarLista(elements.listaBalada, categorias.balada, elements.countBalada, 'BALADA');

  console.log('✅ Painel renderizado');
}

/**
 * Categorizar pessoas por movimentação
 */
function categorizarPessoas(pessoas) {
  const categorias = {
    quarto: [],
    fora: [],
    balada: []
  };

  pessoas.forEach(pessoa => {
    const movimentacao = (pessoa.movimentacao || '').toString().trim().toUpperCase();

    if (movimentacao === 'VOLTOU_AO_QUARTO' || movimentacao === 'QUARTO') {
      categorias.quarto.push(pessoa);
    } else if (movimentacao === 'SAIU_DO_QUARTO' || movimentacao === 'FORA_DO_QUARTO') {
      categorias.fora.push(pessoa);
    } else if (movimentacao === 'FOI_PARA_BALADA' || movimentacao === 'BALADA') {
      categorias.balada.push(pessoa);
    } else if (movimentacao === '') {
      categorias.quarto.push(pessoa);
    } else {
      if (movimentacao.includes('QUARTO')) {
        categorias.quarto.push(pessoa);
      } else if (movimentacao.includes('BALADA')) {
        categorias.balada.push(pessoa);
      } else {
        categorias.fora.push(pessoa);
      }
    }
  });

  return categorias;
}

/**
 * Atualizar estatísticas
 */
function atualizarEstatisticas(categorias, total) {
  elements.totalAlunos.textContent = total;
  elements.totalQuarto.textContent = categorias.quarto.length;
  elements.totalFora.textContent = categorias.fora.length;
  elements.totalBalada.textContent = categorias.balada.length;
}

/**
 * Renderizar lista de alunos COM PAGINAÇÃO
 */
function renderizarLista(container, pessoas, countElement, categoria) {
  container.innerHTML = '';
  countElement.textContent = pessoas.length;

  if (pessoas.length === 0) {
    container.innerHTML = '<p class="empty-message">Nenhum aluno nesta categoria</p>';
    return;
  }

  // Determinar chave de paginação
  const chavePaginacao = categoria === 'QUARTO' ? 'quarto' :
                         categoria === 'FORA_DO_QUARTO' ? 'fora' : 'balada';

  const paginaAtual = paginacao[chavePaginacao].paginaAtual;
  const totalPaginas = Math.ceil(pessoas.length / ITENS_POR_PAGINA);

  // Calcular índices para paginação
  const indiceInicio = (paginaAtual - 1) * ITENS_POR_PAGINA;
  const indiceFim = Math.min(indiceInicio + ITENS_POR_PAGINA, pessoas.length);
  const pessoasPaginadas = pessoas.slice(indiceInicio, indiceFim);

  console.log(`📄 [${categoria}] Renderizando página ${paginaAtual}/${totalPaginas} (${pessoasPaginadas.length} de ${pessoas.length} alunos)`);

  // Renderizar cards da página atual
  pessoasPaginadas.forEach(pessoa => {
    const card = criarCardAluno(pessoa, categoria);
    container.appendChild(card);
  });

  // Adicionar controles de paginação se necessário
  if (totalPaginas > 1) {
    const paginacaoControls = criarControlesPaginacao(
      chavePaginacao,
      paginaAtual,
      totalPaginas,
      pessoas.length,
      indiceInicio,
      indiceFim
    );
    container.appendChild(paginacaoControls);
  }

  // Configurar drag & drop
  configurarDragAndDrop(container);
}

/**
 * Criar controles de paginação
 */
function criarControlesPaginacao(chavePaginacao, paginaAtual, totalPaginas, totalItens, inicio, fim) {
  const controls = document.createElement('div');
  controls.className = 'paginacao-controls';

  // Informação da página
  const info = document.createElement('div');
  info.className = 'paginacao-info';
  info.textContent = `Exibindo ${inicio + 1}-${fim} de ${totalItens} alunos`;

  // Botões de navegação
  const btnContainer = document.createElement('div');
  btnContainer.className = 'paginacao-btns';

  // Botão Anterior
  const btnAnterior = document.createElement('button');
  btnAnterior.className = 'btn-paginacao';
  btnAnterior.textContent = '← Anterior';
  btnAnterior.disabled = paginaAtual === 1;
  btnAnterior.onclick = (e) => {
    e.stopPropagation();
    if (paginaAtual > 1) {
      paginacao[chavePaginacao].paginaAtual--;
      renderizarPainel();
    }
  };

  // Indicador de página
  const indicador = document.createElement('span');
  indicador.className = 'paginacao-indicador';
  indicador.textContent = `${paginaAtual} / ${totalPaginas}`;

  // Botão Próxima
  const btnProxima = document.createElement('button');
  btnProxima.className = 'btn-paginacao';
  btnProxima.textContent = 'Próxima →';
  btnProxima.disabled = paginaAtual === totalPaginas;
  btnProxima.onclick = (e) => {
    e.stopPropagation();
    if (paginaAtual < totalPaginas) {
      paginacao[chavePaginacao].paginaAtual++;
      renderizarPainel();
    }
  };

  btnContainer.appendChild(btnAnterior);
  btnContainer.appendChild(indicador);
  btnContainer.appendChild(btnProxima);

  controls.appendChild(info);
  controls.appendChild(btnContainer);

  return controls;
}

/**
 * Criar card de aluno com informações completas
 */
function criarCardAluno(pessoa, categoria) {
  const card = document.createElement('div');
  card.className = 'aluno-card';
  card.draggable = true;
  card.dataset.cpf = pessoa.cpf;
  card.dataset.nome = pessoa.nome;
  card.dataset.categoria = categoria;

  // Nome
  const nome = document.createElement('div');
  nome.className = 'aluno-nome';
  nome.textContent = pessoa.nome || 'Nome não informado';

  // Informações adicionais
  const info = document.createElement('div');
  info.className = 'aluno-info';

  const infoCpf = document.createElement('div');
  infoCpf.className = 'aluno-info-item';
  infoCpf.innerHTML = `<span class="aluno-info-label">CPF:</span> ${formatarCPF(pessoa.cpf)}`;

  const infoColegio = document.createElement('div');
  infoColegio.className = 'aluno-info-item';
  infoColegio.innerHTML = `<span class="aluno-info-label">Colégio:</span> ${pessoa.colegio || 'N/A'}`;

  const infoTurma = document.createElement('div');
  infoTurma.className = 'aluno-info-item';
  infoTurma.innerHTML = `<span class="aluno-info-label">Turma:</span> ${pessoa.turma || 'N/A'}`;

  info.appendChild(infoCpf);
  info.appendChild(infoColegio);
  info.appendChild(infoTurma);

  // Botões de ação rápida
  const acoes = document.createElement('div');
  acoes.className = 'card-acoes';

  const btnDetalhes = document.createElement('button');
  btnDetalhes.className = 'btn-card-acao';
  btnDetalhes.textContent = '👁️ Detalhes';
  btnDetalhes.onclick = (e) => {
    e.stopPropagation();
    abrirModalDetalhes(pessoa);
  };

  const btnMover = document.createElement('button');
  btnMover.className = 'btn-card-acao btn-mover';
  btnMover.textContent = '🔄 Mover';
  btnMover.onclick = (e) => {
    e.stopPropagation();
    mostrarOpcoesMovimento(pessoa, btnMover);
  };

  acoes.appendChild(btnDetalhes);
  acoes.appendChild(btnMover);

  card.appendChild(nome);
  card.appendChild(info);
  card.appendChild(acoes);

  return card;
}

/**
 * Configurar drag and drop para os cards
 */
function configurarDragAndDrop(container) {
  const cards = container.querySelectorAll('.aluno-card');

  cards.forEach(card => {
    card.addEventListener('dragstart', (e) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/html', card.innerHTML);
      e.dataTransfer.setData('cpf', card.dataset.cpf);
      e.dataTransfer.setData('nome', card.dataset.nome);
      e.dataTransfer.setData('categoriaOrigem', card.dataset.categoria);
      card.classList.add('dragging');
    });

    card.addEventListener('dragend', (e) => {
      card.classList.remove('dragging');
    });
  });

  // Configurar drop zones
  const panels = document.querySelectorAll('.panel-content');
  panels.forEach(panel => {
    panel.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      panel.classList.add('drag-over');
    });

    panel.addEventListener('dragleave', (e) => {
      panel.classList.remove('drag-over');
    });

    panel.addEventListener('drop', async (e) => {
      e.preventDefault();
      panel.classList.remove('drag-over');

      const cpf = e.dataTransfer.getData('cpf');
      const nome = e.dataTransfer.getData('nome');
      const categoriaOrigem = e.dataTransfer.getData('categoriaOrigem');

      // Determinar categoria de destino
      let categoriaDestino = '';
      if (panel === elements.listaQuarto) {
        categoriaDestino = 'QUARTO';
      } else if (panel === elements.listaFora) {
        categoriaDestino = 'FORA_DO_QUARTO';
      } else if (panel === elements.listaBalada) {
        categoriaDestino = 'BALADA';
      }

      if (categoriaOrigem === categoriaDestino) {
        console.log('⚠️ Aluno já está nesta categoria');
        return;
      }

      console.log(`🔄 Movendo ${nome} de ${categoriaOrigem} para ${categoriaDestino}`);
      await moverAluno(cpf, nome, categoriaDestino);
    });
  });
}

/**
 * Mostrar menu de opções de movimento
 */
function mostrarOpcoesMovimento(pessoa, botao) {
  // Remover menus existentes
  document.querySelectorAll('.menu-movimento').forEach(menu => menu.remove());

  const menu = document.createElement('div');
  menu.className = 'menu-movimento';

  const opcoes = [
    { label: '🛏️ Quarto', valor: 'QUARTO' },
    { label: '🚶 Fora do Quarto', valor: 'FORA_DO_QUARTO' },
    { label: '🎉 Balada', valor: 'BALADA' }
  ];

  opcoes.forEach(opcao => {
    const btn = document.createElement('button');
    btn.className = 'menu-movimento-item';
    btn.textContent = opcao.label;
    btn.onclick = async () => {
      menu.remove();
      await moverAluno(pessoa.cpf, pessoa.nome, opcao.valor);
    };
    menu.appendChild(btn);
  });

  // Posicionar menu próximo ao botão
  const rect = botao.getBoundingClientRect();
  menu.style.position = 'fixed';
  menu.style.top = `${rect.bottom + 5}px`;
  menu.style.left = `${rect.left}px`;

  document.body.appendChild(menu);

  // Fechar ao clicar fora
  setTimeout(() => {
    document.addEventListener('click', function fecharMenu(e) {
      if (!menu.contains(e.target) && e.target !== botao) {
        menu.remove();
        document.removeEventListener('click', fecharMenu);
      }
    });
  }, 100);
}

/**
 * Mover aluno para nova localização
 */
async function moverAluno(cpf, nome, novaLocalizacao) {
  try {
    console.log(`📍 Movendo ${nome} para ${novaLocalizacao}...`);
    mostrarToast('Movimentando aluno...', 'info');

    // Buscar dados completos do aluno
    const pessoa = todasPessoas.find(p => p.cpf === cpf);

    const payload = {
      cpf: cpf,
      nome: nome,
      novaLocalizacao: novaLocalizacao,
      colegio: pessoa?.colegio || '',
      turma: pessoa?.turma || '',
      inicioViagem: pessoa?.inicio_viagem || '',
      fimViagem: pessoa?.fim_viagem || ''
    };

    console.log('📦 Enviando payload:', payload);

    const response = await fetch('/api/movimentar', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (data.success) {
      console.log('✅ Aluno movido com sucesso');
      mostrarToast(`${nome} movido para ${formatarLocalizacao(novaLocalizacao)}`, 'success');

      // Atualizar dados localmente
      if (pessoa) {
        pessoa.movimentacao = novaLocalizacao;
      }

      // Re-renderizar painel
      renderizarPainel();

      // Atualizar modal se estiver aberto
      if (alunoSelecionado && alunoSelecionado.cpf === cpf) {
        alunoSelecionado.movimentacao = novaLocalizacao;
        atualizarModalDetalhes();
      }

    } else {
      throw new Error(data.message || 'Erro ao mover aluno');
    }

  } catch (error) {
    console.error('❌ Erro ao mover aluno:', error);
    mostrarToast('Erro ao mover aluno: ' + error.message, 'error');
  }
}

/**
 * Abrir modal de detalhes do aluno
 */
async function abrirModalDetalhes(pessoa) {
  alunoSelecionado = pessoa;

  document.getElementById('detalheNome').textContent = pessoa.nome || 'N/A';
  document.getElementById('detalheCpf').textContent = formatarCPF(pessoa.cpf);
  document.getElementById('detalheColegio').textContent = pessoa.colegio || 'N/A';
  document.getElementById('detalheTurma').textContent = pessoa.turma || 'N/A';

  const localizacao = formatarLocalizacao(pessoa.movimentacao);
  const badgeLocalizacao = document.getElementById('detalheLocalizacao');
  badgeLocalizacao.textContent = localizacao;
  badgeLocalizacao.className = 'badge badge-' + getBadgeClass(pessoa.movimentacao);

  elements.modalDetalhes.style.display = 'flex';

  // Carregar histórico
  await carregarHistorico(pessoa.cpf);
}

/**
 * Atualizar informações do modal (após movimentação)
 */
function atualizarModalDetalhes() {
  if (!alunoSelecionado) return;

  const localizacao = formatarLocalizacao(alunoSelecionado.movimentacao);
  const badgeLocalizacao = document.getElementById('detalheLocalizacao');
  badgeLocalizacao.textContent = localizacao;
  badgeLocalizacao.className = 'badge badge-' + getBadgeClass(alunoSelecionado.movimentacao);

  // Recarregar histórico
  carregarHistorico(alunoSelecionado.cpf);
}

/**
 * Fechar modal
 */
function fecharModal() {
  elements.modalDetalhes.style.display = 'none';
  alunoSelecionado = null;
}

/**
 * Mover aluno a partir do modal
 */
async function moverAlunoModal(novaLocalizacao) {
  if (!alunoSelecionado) return;
  await moverAluno(alunoSelecionado.cpf, alunoSelecionado.nome, novaLocalizacao);
}

/**
 * Carregar histórico de movimentações
 */
async function carregarHistorico(cpf) {
  const listaHistorico = document.getElementById('listaHistorico');
  listaHistorico.innerHTML = '<p class="loading-historico">Carregando histórico...</p>';

  try {
    const response = await fetch(`/api/logs?cpf=${cpf}`);
    const data = await response.json();

    if (data.success) {
      const logs = data.data || [];

      if (logs.length === 0) {
        listaHistorico.innerHTML = '<p class="empty-message">Nenhuma movimentação registrada</p>';
        return;
      }

      // Ordenar logs por timestamp (mais recente primeiro)
      logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      listaHistorico.innerHTML = '';

      logs.forEach(log => {
        const item = document.createElement('div');
        item.className = 'historico-item';

        const timestamp = document.createElement('div');
        timestamp.className = 'historico-timestamp';
        timestamp.textContent = formatarDataHora(log.timestamp);

        const tipo = document.createElement('div');
        tipo.className = 'historico-tipo badge badge-' + getBadgeClass(log.tipo);
        tipo.textContent = formatarLocalizacao(log.tipo);

        const operador = document.createElement('div');
        operador.className = 'historico-operador';
        operador.textContent = `Por: ${log.operador || 'Sistema'}`;

        item.appendChild(timestamp);
        item.appendChild(tipo);
        item.appendChild(operador);

        listaHistorico.appendChild(item);
      });

    } else {
      throw new Error(data.message || 'Erro ao carregar histórico');
    }

  } catch (error) {
    console.error('❌ Erro ao carregar histórico:', error);
    listaHistorico.innerHTML = '<p class="error-message">Erro ao carregar histórico</p>';
  }
}

/**
 * Mostrar notificação toast
 */
function mostrarToast(mensagem, tipo = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${tipo}`;

  const icon = tipo === 'success' ? '✅' : tipo === 'error' ? '❌' : 'ℹ️';
  toast.innerHTML = `<span class="toast-icon">${icon}</span><span class="toast-message">${mensagem}</span>`;

  elements.toastContainer.appendChild(toast);

  // Animar entrada
  setTimeout(() => toast.classList.add('show'), 10);

  // Remover após 3 segundos
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/**
 * Formatações
 */
function formatarLocalizacao(mov) {
  const movUpper = (mov || '').toString().toUpperCase();
  if (movUpper === 'QUARTO' || movUpper === 'VOLTOU_AO_QUARTO') return 'Quarto';
  if (movUpper === 'FORA_DO_QUARTO' || movUpper === 'SAIU_DO_QUARTO') return 'Fora do Quarto';
  if (movUpper === 'BALADA' || movUpper === 'FOI_PARA_BALADA') return 'Balada';
  return mov || 'Não definido';
}

function getBadgeClass(mov) {
  const movUpper = (mov || '').toString().toUpperCase();
  if (movUpper.includes('QUARTO')) return 'quarto';
  if (movUpper.includes('BALADA')) return 'balada';
  return 'fora';
}

function formatarData(dataISO) {
  if (!dataISO) return '';
  try {
    const data = new Date(dataISO);
    if (isNaN(data.getTime())) return dataISO;
    return data.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  } catch (error) {
    return dataISO;
  }
}

function formatarDataHora(dataISO) {
  if (!dataISO) return '';
  try {
    const data = new Date(dataISO);
    if (isNaN(data.getTime())) return dataISO;
    return data.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  } catch (error) {
    return dataISO;
  }
}

function formatarCPF(cpf) {
  if (!cpf) return '';
  const cleaned = cpf.replace(/\D/g, '');
  if (cleaned.length === 11) {
    return cleaned.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }
  return cpf;
}

function formatarHora(data) {
  return data.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

/**
 * Loading e Erros
 */
function mostrarLoading() {
  elements.loadingOverlay.classList.remove('hidden');
}

function esconderLoading() {
  elements.loadingOverlay.classList.add('hidden');
}

function mostrarErro(mensagem) {
  elements.errorText.textContent = mensagem;
  elements.errorMessage.style.display = 'block';
}

function fecharErro() {
  elements.errorMessage.style.display = 'none';
}

// Inicializar quando o DOM estiver pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Cleanup ao sair da página
window.addEventListener('beforeunload', () => {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
  }
});
