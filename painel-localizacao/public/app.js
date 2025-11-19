// Estado da aplicação
let todasPessoas = [];
let viagensSelecionada = '';
let autoRefreshInterval = null;

// Elementos do DOM
const elements = {
  filtroViagem: document.getElementById('filtroViagem'),
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
  errorText: document.getElementById('errorText')
};

/**
 * Inicialização da aplicação
 */
async function init() {
  console.log('🚀 Inicializando painel...');

  // Event Listeners
  elements.btnAtualizar.addEventListener('click', () => carregarDados());
  elements.filtroViagem.addEventListener('change', (e) => {
    viagensSelecionada = e.target.value;
    renderizarPainel();
  });

  // Carregar dados iniciais
  await carregarDados();

  // Auto-refresh a cada 30 segundos
  autoRefreshInterval = setInterval(() => {
    carregarDados(true); // true = silent refresh
  }, 30000);

  console.log('✅ Painel inicializado');
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
    // Formatar as datas para português
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
    console.log(`🔍 Filtrado: ${pessoasFiltradas.length} pessoas para viagem ${inicioViagem} - ${fimViagem}`);
  }

  // Categorizar pessoas por movimentação
  const categorias = categorizarPessoas(pessoasFiltradas);

  // Atualizar estatísticas
  atualizarEstatisticas(categorias, pessoasFiltradas.length);

  // Renderizar listas
  renderizarLista(elements.listaQuarto, categorias.quarto, elements.countQuarto);
  renderizarLista(elements.listaFora, categorias.fora, elements.countFora);
  renderizarLista(elements.listaBalada, categorias.balada, elements.countBalada);

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

    console.log(`👤 ${pessoa.nome} - Movimentação: "${movimentacao}"`);

    if (movimentacao === 'VOLTOU_AO_QUARTO' || movimentacao === 'QUARTO') {
      categorias.quarto.push(pessoa);
    } else if (movimentacao === 'SAIU_DO_QUARTO' || movimentacao === 'FORA_DO_QUARTO') {
      categorias.fora.push(pessoa);
    } else if (movimentacao === 'FOI_PARA_BALADA' || movimentacao === 'BALADA') {
      categorias.balada.push(pessoa);
    } else if (movimentacao === '') {
      // Se não tem movimentação, assume que está no quarto
      categorias.quarto.push(pessoa);
    } else {
      // Outros status - tentar categorizar baseado em palavras-chave
      if (movimentacao.includes('QUARTO')) {
        categorias.quarto.push(pessoa);
      } else if (movimentacao.includes('BALADA')) {
        categorias.balada.push(pessoa);
      } else {
        categorias.fora.push(pessoa);
      }
    }
  });

  console.log('📊 Categorização:', {
    quarto: categorias.quarto.length,
    fora: categorias.fora.length,
    balada: categorias.balada.length
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
 * Renderizar lista de alunos
 */
function renderizarLista(container, pessoas, countElement) {
  // Limpar container
  container.innerHTML = '';

  // Atualizar contador
  countElement.textContent = pessoas.length;

  // Se não há pessoas, mostrar mensagem
  if (pessoas.length === 0) {
    container.innerHTML = '<p class="empty-message">Nenhum aluno nesta categoria</p>';
    return;
  }

  // Renderizar cada pessoa
  pessoas.forEach(pessoa => {
    const card = criarCardAluno(pessoa);
    container.appendChild(card);
  });
}

/**
 * Criar card de aluno
 */
function criarCardAluno(pessoa) {
  const card = document.createElement('div');
  card.className = 'aluno-card';

  const nome = document.createElement('div');
  nome.className = 'aluno-nome';
  nome.textContent = pessoa.nome || 'Nome não informado';

  const info = document.createElement('div');
  info.className = 'aluno-info';

  // CPF
  if (pessoa.cpf) {
    const cpfItem = document.createElement('div');
    cpfItem.className = 'aluno-info-item';
    cpfItem.innerHTML = `
      <span class="aluno-info-label">CPF:</span>
      <span>${formatarCPF(pessoa.cpf)}</span>
    `;
    info.appendChild(cpfItem);
  }

  // Telefone
  if (pessoa.telefone) {
    const telefoneItem = document.createElement('div');
    telefoneItem.className = 'aluno-info-item';
    telefoneItem.innerHTML = `
      <span class="aluno-info-label">Telefone:</span>
      <span>${pessoa.telefone}</span>
    `;
    info.appendChild(telefoneItem);
  }

  // Turma
  if (pessoa.turma) {
    const turmaItem = document.createElement('div');
    turmaItem.className = 'aluno-info-item';
    turmaItem.innerHTML = `
      <span class="aluno-info-label">Turma:</span>
      <span>${pessoa.turma}</span>
    `;
    info.appendChild(turmaItem);
  }

  // Viagem
  if (pessoa.inicio_viagem && pessoa.fim_viagem) {
    const viagemItem = document.createElement('div');
    viagemItem.className = 'aluno-info-item';
    const inicioFormatado = formatarData(pessoa.inicio_viagem);
    const fimFormatado = formatarData(pessoa.fim_viagem);
    viagemItem.innerHTML = `
      <span class="aluno-info-label">Viagem:</span>
      <span>${inicioFormatado} até ${fimFormatado}</span>
    `;
    info.appendChild(viagemItem);
  }

  card.appendChild(nome);
  card.appendChild(info);

  return card;
}

/**
 * Formatar data ISO para formato brasileiro
 */
function formatarData(dataISO) {
  if (!dataISO) return '';

  try {
    // Tenta criar objeto Date a partir da string ISO
    const data = new Date(dataISO);

    // Verifica se a data é válida
    if (isNaN(data.getTime())) {
      return dataISO; // Retorna original se não conseguir converter
    }

    // Formata para dd/mm/aaaa em português
    return data.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  } catch (error) {
    console.error('Erro ao formatar data:', error);
    return dataISO;
  }
}

/**
 * Formatar CPF
 */
function formatarCPF(cpf) {
  if (!cpf) return '';
  const cleaned = cpf.replace(/\D/g, '');
  if (cleaned.length === 11) {
    return cleaned.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }
  return cpf;
}

/**
 * Formatar hora
 */
function formatarHora(data) {
  return data.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

/**
 * Mostrar loading
 */
function mostrarLoading() {
  elements.loadingOverlay.classList.remove('hidden');
}

/**
 * Esconder loading
 */
function esconderLoading() {
  elements.loadingOverlay.classList.add('hidden');
}

/**
 * Mostrar erro
 */
function mostrarErro(mensagem) {
  elements.errorText.textContent = mensagem;
  elements.errorMessage.style.display = 'block';
}

/**
 * Fechar erro
 */
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
