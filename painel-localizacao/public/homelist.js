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

let alunosData = [];
let colegios = new Set();
let alunosSelecionados = [];
let viagensLista = [];
const esc = Ellus.esc;

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('emptyStudents').style.display = 'block';

    // Listener de pesquisa em tempo real
    document.getElementById('filterNome').addEventListener('input', filtrarLista);
    document.getElementById('filterColegio').addEventListener('change', filtrarLista);
    document.getElementById('filterQuarto').addEventListener('change', filtrarLista);
    document.getElementById('roomInput').addEventListener('input', mostrarOcupacao);
    document.getElementById('roomInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') salvarQuartos(); });

    // Seletor de viagem: preenche as datas/colégio e busca direto
    document.getElementById('filterViagem').addEventListener('change', (e) => {
        const v = viagensLista.find(x => `${x.colegio}|${x.inicio}` === e.target.value);
        if (!v) return;
        document.getElementById('filterInicio').value = v.inicio;
        document.getElementById('filterFim').value = v.fim || '';
        buscarAlunos(v.colegio);
    });
    carregarViagens();

    // Carrega nome do operador
    const user = localStorage.getItem('painel_user');
    if (user) {
        try {
            const userData = JSON.parse(user);
            document.getElementById('nomeOperador').textContent = userData.nome || 'Usuário';
        } catch(e) {}
    }
});

async function carregarViagens() {
    try {
        const res = await authFetch(`/api/viagens-unicas?hoje=${Ellus.hojeISO()}`);
        const json = await res.json();
        if (!json.success) return;
        // Viagens com pernoite em andamento/próximas primeiro
        const peso = { andamento: 0, futura: 1, indefinida: 2, encerrada: 3 };
        viagensLista = (json.data || []).sort((a, b) =>
            (b.pernoite - a.pernoite) || (peso[a.situacao] - peso[b.situacao]) || String(a.inicio).localeCompare(String(b.inicio)));
        const sel = document.getElementById('filterViagem');
        sel.innerHTML = '<option value="">Escolha a viagem (ou informe as datas)</option>' + viagensLista.map(v =>
            `<option value="${esc(`${v.colegio}|${v.inicio}`)}">${v.pernoite ? '🛏️' : '🚌'} ${esc(v.colegio)} — ${esc(Ellus.formatarData(v.inicio))} a ${esc(Ellus.formatarData(v.fim))} · ${v.com_quarto}/${v.qtd_alunos} com quarto${v.situacao === 'encerrada' ? ' (encerrada)' : ''}</option>`
        ).join('');
    } catch (e) { console.warn('Não foi possível listar as viagens', e); }
}

/** Mostra quem já está no quarto digitado (evita lotar ou errar o número). */
function mostrarOcupacao() {
    const num = document.getElementById('roomInput').value.trim();
    const info = document.getElementById('ocupacaoQuarto');
    if (!num) { info.textContent = ''; return; }
    const selecionados = new Set(alunosSelecionados.map(a => String(a.cpf).replace(/\D/g, '')));
    const ocupantes = alunosData.filter(a => String(a.numero_quarto || '').trim().toLowerCase() === num.toLowerCase()
        && !selecionados.has(String(a.cpf).replace(/\D/g, '')));
    info.textContent = ocupantes.length
        ? `Quarto ${num} já tem ${ocupantes.length}: ${ocupantes.map(a => a.nome.split(' ')[0]).join(', ')}`
        : `Quarto ${num} está vazio nesta lista.`;
}

async function buscarAlunos(colegioPreSelecionado) {
    const inicio = document.getElementById('filterInicio').value;
    const fim = document.getElementById('filterFim').value;

    if (!inicio) {
        return alert('⚠️ Selecione a Data de Início da viagem.');
    }

    const loading = document.getElementById('loadingStudents');
    const emptyState = document.getElementById('emptyStudents');
    const studentsList = document.getElementById('studentsList');

    loading.classList.remove('hidden');
    emptyState.style.display = 'none';
    studentsList.innerHTML = '';

    try {
        // Busca alunos da tabela embarques
        let url = `/api/embarque-lista?inicio=${inicio}`;
        if (fim) url += `&fim=${fim}`;

        const [resEmbarques, resQuartos] = await Promise.all([
            authFetch(url),
            authFetch('/api/quartos')
        ]);

        const jsonEmbarques = await resEmbarques.json();
        const jsonQuartos = await resQuartos.json();

        if (jsonEmbarques.status === 'sucesso' && jsonQuartos.success) {
            const alunos = jsonEmbarques.passageiros || [];
            const quartos = jsonQuartos.data || [];

            console.log('Total de alunos:', alunos.length);
            console.log('Total de quartos:', quartos.length);

            // Cria map de quartos por CPF normalizado (sem máscara)
            const quartosMap = new Map();
            quartos.forEach(q => {
                // Tenta normalizar o CPF de várias formas
                let cpfNormalizado = '';
                if (q.cpf || q.CPF) {
                    cpfNormalizado = String(q.cpf || q.CPF).replace(/\D/g, '');
                }

                const numeroQuarto = q.numero_quarto || q.Quarto || q.quarto || '';

                if (cpfNormalizado && numeroQuarto) {
                    quartosMap.set(cpfNormalizado, numeroQuarto);
                }
            });

            console.log('Quartos mapeados:', quartosMap.size);
            console.log('Exemplo de CPFs no mapa:', Array.from(quartosMap.keys()).slice(0, 5));

            // Adiciona numero_quarto aos alunos
            alunosData = alunos.map(a => {
                let cpfNormalizado = '';
                if (a.cpf || a.CPF) {
                    cpfNormalizado = String(a.cpf || a.CPF).replace(/\D/g, '');
                }

                const numeroQuarto = quartosMap.get(cpfNormalizado) || '';

                return {
                    ...a,
                    numero_quarto: numeroQuarto
                };
            });

            console.log('Alunos com quarto:', alunosData.filter(a => a.numero_quarto).length);

            // Popula lista de colégios
            colegios.clear();
            alunosData.forEach(a => {
                if (a.colegio) colegios.add(a.colegio);
            });

            // Atualiza select de colégios
            const selectColegio = document.getElementById('filterColegio');
            selectColegio.innerHTML = '<option value="">Todos</option>' + Array.from(colegios).sort()
                .map(col => `<option value="${esc(col)}">${esc(col)}</option>`).join('');
            if (typeof colegioPreSelecionado === 'string' && colegios.has(colegioPreSelecionado)) {
                selectColegio.value = colegioPreSelecionado;
            }

            renderizarLista();
        } else {
            alert('Erro ao buscar alunos: ' + (jsonEmbarques.mensagem || 'Desconhecido'));
        }
    } catch (error) {
        console.error(error);
        alert('❌ Erro de conexão');
    } finally {
        loading.classList.add('hidden');
    }
}

function filtrarLista() {
    renderizarLista();
}

function renderizarLista() {
    const studentsList = document.getElementById('studentsList');
    const emptyState = document.getElementById('emptyStudents');

    const colegioFiltro = document.getElementById('filterColegio').value;
    const nomeFiltro = document.getElementById('filterNome').value.toLowerCase().trim();
    const quartoFiltro = document.getElementById('filterQuarto').value;

    // Aplica filtros
    let filtrados = alunosData.filter(aluno => {
        const matchColegio = !colegioFiltro || (aluno.colegio === colegioFiltro);
        const matchNome = !nomeFiltro ||
            (aluno.nome && aluno.nome.toLowerCase().includes(nomeFiltro)) ||
            (aluno.cpf && String(aluno.cpf).includes(nomeFiltro.replace(/\D/g, '') || nomeFiltro)) ||
            String(aluno.numero_quarto || '').toLowerCase() === nomeFiltro;
        const matchQuarto = !quartoFiltro ||
            (quartoFiltro === 'sem' ? !aluno.numero_quarto : !!aluno.numero_quarto);

        return matchColegio && matchNome && matchQuarto;
    }).sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));

    if (filtrados.length === 0 && alunosData.length === 0) {
        studentsList.innerHTML = '';
        emptyState.style.display = 'block';
        atualizarEstatisticas(0, 0, 0, 0);
        return;
    }

    if (filtrados.length === 0) {
        studentsList.innerHTML = '<p style="text-align:center; padding:40px; color:#999;">Nenhum aluno encontrado com esses filtros.</p>';
        emptyState.style.display = 'none';
        atualizarEstatisticas(0, 0, 0, 0);
        return;
    }

    emptyState.style.display = 'none';

    // Calcula estatísticas
    const total = filtrados.length;
    const comQuarto = filtrados.filter(a => a.numero_quarto).length;
    const semQuarto = total - comQuarto;
    const selecionados = alunosSelecionados.length;

    atualizarEstatisticas(total, comQuarto, semQuarto, selecionados);

    // Renderiza lista
    studentsList.innerHTML = '';
    filtrados.forEach(aluno => {
        const item = criarItemAluno(aluno);
        studentsList.appendChild(item);
    });
}

function atualizarEstatisticas(total, comQuarto, semQuarto, selecionados) {
    document.getElementById('statTotal').textContent = total;
    document.getElementById('statComQuarto').textContent = comQuarto;
    document.getElementById('statSemQuarto').textContent = semQuarto;
    document.getElementById('statSelecionados').textContent = selecionados;
}

function criarItemAluno(aluno) {
    const div = document.createElement('div');
    const cpfNormalizado = String(aluno.cpf).replace(/\D/g, '');
    const isSelecionado = alunosSelecionados.some(a => String(a.cpf).replace(/\D/g, '') === cpfNormalizado);

    div.className = `student-item ${aluno.numero_quarto ? 'has-room' : ''} ${isSelecionado ? 'selected' : ''}`;

    const cpfFormatted = formatarCPF(aluno.cpf);

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'student-checkbox';
    checkbox.checked = isSelecionado;
    checkbox.onclick = (e) => {
        e.stopPropagation();
        toggleSelecaoAluno(aluno);
    };

    const contentDiv = document.createElement('div');
    contentDiv.className = 'student-content';
    contentDiv.onclick = () => toggleSelecaoAluno(aluno);
    contentDiv.innerHTML = `
        <div class="student-name">${esc(aluno.nome)}</div>
        <div class="student-info">
            CPF: ${esc(cpfFormatted)} | ${esc(aluno.colegio || 'Sem colégio')}${aluno.turma ? ` | ${esc(aluno.turma)}` : ''}
        </div>
    `;

    const badgeDiv = document.createElement('div');
    badgeDiv.innerHTML = `
        ${aluno.numero_quarto ?
            `<span class="room-badge"><i class="fas fa-door-open"></i> Quarto ${esc(aluno.numero_quarto)}</span>` :
            `<i class="fas fa-circle" style="color: #ef4444; font-size: 0.8rem;"></i>`
        }
    `;

    div.appendChild(checkbox);
    div.appendChild(contentDiv);
    div.appendChild(badgeDiv);

    return div;
}

function formatarCPF(cpf) {
    if (!cpf) return '';
    const cleaned = String(cpf).replace(/\D/g, '');
    if (cleaned.length === 11) {
        return cleaned.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    }
    return cpf;
}

function toggleSelecaoAluno(aluno) {
    const cpfNormalizado = String(aluno.cpf).replace(/\D/g, '');
    const index = alunosSelecionados.findIndex(a => String(a.cpf).replace(/\D/g, '') === cpfNormalizado);

    if (index !== -1) {
        // Remove da seleção
        alunosSelecionados.splice(index, 1);
    } else {
        // Adiciona à seleção
        alunosSelecionados.push(aluno);
    }

    // Atualiza a UI
    atualizarPainelAtribuicao();
    renderizarLista();
}

function limparSelecao() {
    alunosSelecionados = [];
    atualizarPainelAtribuicao();
    renderizarLista();
}

function atualizarPainelAtribuicao() {
    const panelEmpty = document.getElementById('panelEmpty');
    const panelForm = document.getElementById('panelForm');
    const btnLimparSelecao = document.getElementById('btnLimparSelecao');
    const selectedStudentsList = document.getElementById('selectedStudentsList');
    const btnRemoveRoom = document.getElementById('btnRemoveRoom');
    const btnSalvarTexto = document.getElementById('btnSalvarTexto');
    const btnRemoverTexto = document.getElementById('btnRemoverTexto');

    if (alunosSelecionados.length === 0) {
        panelEmpty.style.display = 'block';
        panelForm.style.display = 'none';
        btnLimparSelecao.style.display = 'none';
        return;
    }

    panelEmpty.style.display = 'none';
    panelForm.style.display = 'block';
    btnLimparSelecao.style.display = 'inline-block';

    // Atualiza texto dos botões
    if (alunosSelecionados.length === 1) {
        btnSalvarTexto.textContent = 'Salvar Quarto';
        btnRemoverTexto.textContent = 'Remover Quarto';
    } else {
        btnSalvarTexto.textContent = `Salvar Quartos (${alunosSelecionados.length})`;
        btnRemoverTexto.textContent = `Remover Quartos (${alunosSelecionados.length})`;
    }

    // Monta lista de alunos selecionados
    selectedStudentsList.innerHTML = '';
    alunosSelecionados.forEach((aluno, idx) => {
        const card = document.createElement('div');
        card.style.cssText = 'padding: 10px; margin-bottom: 8px; background: #f9fafb; border-radius: 6px; border: 1px solid #e5e7eb;';
        card.innerHTML = `
            <div style="font-weight: 600; font-size: 0.95rem; margin-bottom: 4px;">${idx + 1}. ${esc(aluno.nome)}</div>
            <div style="font-size: 0.85rem; color: #666;">
                CPF: ${esc(formatarCPF(aluno.cpf))} | ${esc(aluno.colegio || 'N/A')}
                ${aluno.numero_quarto ? `<br><strong>Quarto Atual: ${esc(aluno.numero_quarto)}</strong>` : ''}
            </div>
        `;
        selectedStudentsList.appendChild(card);
    });

    // Define valor do campo de quarto
    if (alunosSelecionados.length === 1) {
        document.getElementById('roomInput').value = alunosSelecionados[0].numero_quarto || '';
    } else {
        document.getElementById('roomInput').value = '';
        document.getElementById('roomInput').placeholder = `Digite o quarto para ${alunosSelecionados.length} alunos`;
    }

    mostrarOcupacao();

    // Mostra/esconde botão de remover
    const todosTemQuarto = alunosSelecionados.every(a => a.numero_quarto);
    btnRemoveRoom.style.display = todosTemQuarto ? 'block' : 'none';
}

async function salvarQuartos() {
    if (alunosSelecionados.length === 0) return;

    const numeroQuarto = document.getElementById('roomInput').value.trim();

    if (!numeroQuarto) {
        return alert('⚠️ Digite o número do quarto.');
    }

    const qtd = alunosSelecionados.length;
    const nomes = qtd === 1 ? alunosSelecionados[0].nome : `${qtd} alunos`;

    if (!confirm(`Atribuir quarto "${numeroQuarto}" para ${nomes}?`)) {
        return;
    }

    toggleLoading(true, `Salvando quarto${qtd > 1 ? 's' : ''}...`);

    try {
        const payloadAlunos = alunosSelecionados.map(aluno => ({
            cpf: aluno.cpf,
            numero_quarto: numeroQuarto,
            nome_hospede: aluno.nome,
            colegio: aluno.colegio,
            inicio_viagem: aluno.inicio_viagem,
            fim_viagem: aluno.fim_viagem
        }));

        let sucessos = 0;
        let erros = 0;

        try {
            const res = await authFetch('/api/atribuir-quartos-batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ alunos: payloadAlunos })
            });

            const json = await res.json();

            if (json.success) {
                sucessos = alunosSelecionados.length;
                alunosSelecionados.forEach(aluno => {
                    aluno.numero_quarto = numeroQuarto;
                    const cpfNormalizado = String(aluno.cpf).replace(/\D/g, '');
                    const index = alunosData.findIndex(a => String(a.cpf).replace(/\D/g, '') === cpfNormalizado);
                    if (index !== -1) {
                        alunosData[index].numero_quarto = numeroQuarto;
                    }
                });
            } else {
                erros = alunosSelecionados.length;
            }
        } catch (err) {
            console.error(err);
            erros = alunosSelecionados.length;
        }

        if (sucessos > 0) {
            alert(`✅ ${sucessos} quarto${sucessos > 1 ? 's atribuídos' : ' atribuído'} com sucesso!${erros > 0 ? `\n⚠️ ${erros} erro${erros > 1 ? 's' : ''}.` : ''}`);
            // Limpa seleção e recarrega
            limparSelecao();
        } else {
            alert('❌ Erro ao atribuir quartos.');
        }
    } catch (error) {
        console.error(error);
        alert('❌ Erro de conexão');
    } finally {
        toggleLoading(false);
    }
}

async function removerQuartos() {
    if (alunosSelecionados.length === 0) return;

    const qtd = alunosSelecionados.length;
    const nomes = qtd === 1 ? alunosSelecionados[0].nome : `${qtd} alunos`;

    if (!confirm(`Tirar o quarto de ${nomes}?\n\nO aluno continua na viagem, só fica sem número de quarto.`)) {
        return;
    }

    toggleLoading(true, `Removendo quarto${qtd > 1 ? 's' : ''}...`);

    try {
        const cpfs = alunosSelecionados.map(aluno => String(aluno.cpf).replace(/\D/g, ''));
        let sucessos = 0;
        let erros = 0;

        try {
            const res = await authFetch('/api/remover-quartos-batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cpfs: cpfs })
            });

            const json = await res.json();

            if (json.success) {
                sucessos = alunosSelecionados.length;
                alunosSelecionados.forEach(aluno => {
                    aluno.numero_quarto = '';
                    const cpfNormalizado = String(aluno.cpf).replace(/\D/g, '');
                    const index = alunosData.findIndex(a => String(a.cpf).replace(/\D/g, '') === cpfNormalizado);
                    if (index !== -1) {
                        alunosData[index].numero_quarto = '';
                    }
                });
            } else {
                erros = alunosSelecionados.length;
            }
        } catch (err) {
            console.error(err);
            erros = alunosSelecionados.length;
        }

        if (sucessos > 0) {
            alert(`✅ ${sucessos} quarto${sucessos > 1 ? 's removidos' : ' removido'} com sucesso!${erros > 0 ? `\n⚠️ ${erros} erro${erros > 1 ? 's' : ''}.` : ''}`);
            // Limpa seleção e recarrega
            limparSelecao();
        } else {
            alert('❌ Erro ao remover quartos.');
        }
    } catch (error) {
        console.error(error);
        alert('❌ Erro de conexão');
    } finally {
        toggleLoading(false);
    }
}

function toggleLoading(show, text = 'Processando...') {
    const el = document.getElementById('loadingOverlay');
    const txt = document.getElementById('loadingText');
    if (el) {
        if (show) {
            if (txt) txt.textContent = text;
            el.classList.remove('hidden');
        } else {
            el.classList.add('hidden');
        }
    }
}

// =========================================================================
// IMPORTADOR DE MAPA DE CAMAS (CSV)
// =========================================================================
let mapaResultados = [];
let mapaAlunosPorBloco = {};

function abrirModalMapaCamas() {
    document.getElementById('modalMapaCamas').style.display = 'flex';
}

function fecharModalMapaCamas() {
    document.getElementById('modalMapaCamas').style.display = 'none';
}

function carregarArquivoMapaCsv(input) {
    const arq = input.files && input.files[0];
    if (!arq) return;
    const ehExcel = /\.(xlsx|xls)$/i.test(arq.name);
    const reader = new FileReader();
    reader.onload = () => {
        if (ehExcel) {
            if (typeof XLSX === 'undefined') {
                return alert('❌ Biblioteca Excel não carregou. Recarregue a página ou cole os dados da planilha na caixa abaixo.');
            }
            const wb = XLSX.read(reader.result, { type: 'array' });
            const csvs = wb.SheetNames.map(nome => XLSX.utils.sheet_to_csv(wb.Sheets[nome]));
            document.getElementById('mapaCsvTexto').value = csvs.join('\n');
        } else {
            document.getElementById('mapaCsvTexto').value = reader.result || '';
        }
    };
    if (ehExcel) reader.readAsArrayBuffer(arq);
    else reader.readAsText(arq, 'UTF-8');
}

async function analisarMapaCamas() {
    const texto = document.getElementById('mapaCsvTexto').value.trim();
    if (!texto) return alert('⚠️ Cole o conteúdo CSV ou escolha um arquivo.');

    const { blocos, itens } = HomelistMapa.parsearMapaCamasCSV(texto);
    if (itens.length === 0) {
        return alert('⚠️ Nenhum quarto/hóspede reconhecido no CSV.');
    }

    // Se o CSV não tiver cabeçalho de datas, usa os filtros da tela
    const inicioTela = document.getElementById('filterInicio').value;
    const fimTela = document.getElementById('filterFim').value;
    for (const b of blocos) {
        if (b.key === 'padrao') {
            if (!inicioTela) return alert('⚠️ O CSV não tem linha de datas e a Data Início da tela está vazia.');
            b.inicio = inicioTela;
            b.fim = fimTela;
        }
    }

    toggleLoading(true, 'Buscando alunos das viagens e cruzando nomes...');
    try {
        mapaAlunosPorBloco = {};
        await Promise.all(blocos.map(async (b) => {
            let url = `/api/embarque-lista?inicio=${encodeURIComponent(b.inicio)}`;
            if (b.fim) url += `&fim=${encodeURIComponent(b.fim)}`;
            const res = await authFetch(url);
            const json = await res.json();
            mapaAlunosPorBloco[b.key] = (json.status === 'sucesso' && Array.isArray(json.passageiros))
                ? json.passageiros
                : [];
        }));

        mapaResultados = HomelistMapa.cruzarMapaComAlunos(itens, mapaAlunosPorBloco);
        renderizarPreviewMapa();
    } catch (e) {
        console.error('Erro ao analisar mapa:', e);
        alert('❌ Erro ao buscar alunos para cruzar.');
    } finally {
        toggleLoading(false);
    }
}

function renderizarPreviewMapa() {
    const tbody = document.getElementById('mapaTabelaBody');
    const wrap = document.getElementById('mapaPreviewWrap');
    wrap.style.display = 'block';

    const badges = {
        exato: '<span style="background:#dcfce7;color:#166534;padding:2px 8px;border-radius:10px;font-weight:600;">✅ Exato</span>',
        aproximado: '<span style="background:#fef9c3;color:#854d0e;padding:2px 8px;border-radius:10px;font-weight:600;">🟡 Parecido</span>',
        por_quarto: '<span style="background:#dbeafe;color:#1e40af;padding:2px 8px;border-radius:10px;font-weight:600;">🏠 Pelo quarto</span>',
        ambiguo: '<span style="background:#ffedd5;color:#9a3412;padding:2px 8px;border-radius:10px;font-weight:600;">⚠️ Escolher</span>',
        nao_encontrado: '<span style="background:#fee2e2;color:#991b1b;padding:2px 8px;border-radius:10px;font-weight:600;">❌ Não achou</span>',
        ignorado: '<span style="background:#f3f4f6;color:#4b5563;padding:2px 8px;border-radius:10px;font-weight:600;">⏭️ Ignorar</span>'
    };

    tbody.innerHTML = mapaResultados.map((r, idx) => {
        const blocoAlunos = (mapaAlunosPorBloco[r.blocoKey] || [])
            .slice()
            .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || '')));

        const vistos = new Set();
        const opcoes = ['<option value="">-- Ignorar esta linha --</option>'];
        const adicionarOpcao = (a, prefixo = '') => {
            const cpf = String(a.cpf || '').replace(/\D/g, '');
            if (!cpf || vistos.has(cpf)) return;
            vistos.add(cpf);
            const sel = r.aluno && String(r.aluno.cpf).replace(/\D/g, '') === cpf ? 'selected' : '';
            opcoes.push(`<option value="${esc(cpf)}" ${sel}>${esc(prefixo + (a.nome || a.nome_hospede || cpf))} · ${esc(a.colegio || '')}</option>`);
        };
        if (r.aluno) adicionarOpcao(r.aluno);
        (r.candidatos || []).forEach(c => adicionarOpcao(c, '★ '));
        blocoAlunos.forEach(a => adicionarOpcao(a));

        const periodoTxt = r.inicio ? `${r.inicio.slice(8, 10)}/${r.inicio.slice(5, 7)}` : '-';
        return `
          <tr style="border-bottom:1px solid #f3f4f6;">
            <td style="padding:6px 8px;font-weight:700;">${esc(r.quarto)}</td>
            <td style="padding:6px 8px;color:#666;">${esc(periodoTxt)}</td>
            <td style="padding:6px 8px;">${esc(r.nome)}</td>
            <td style="padding:6px 8px;">
              <select onchange="alterarAlunoMapa(${idx}, this.value)" style="width:100%;max-width:360px;padding:4px 6px;border:1px solid #d1d5db;border-radius:4px;">
                ${opcoes.join('')}
              </select>
            </td>
            <td style="padding:6px 8px;">${badges[r.status] || ''}<div style="font-size:0.75rem;color:#666;">${esc(r.motivo || '')}</div></td>
          </tr>`;
    }).join('');

    atualizarResumoMapa();
}

function alterarAlunoMapa(idx, cpf) {
    const r = mapaResultados[idx];
    if (!r) return;
    if (!cpf) {
        r.aluno = null;
        r.status = 'ignorado';
        r.motivo = 'Ignorado manualmente';
    } else {
        const lista = mapaAlunosPorBloco[r.blocoKey] || [];
        r.aluno = lista.find(a => String(a.cpf).replace(/\D/g, '') === cpf) || null;
        r.status = 'exato';
        r.motivo = 'Selecionado manualmente';
    }
    atualizarResumoMapa();
}

function atualizarResumoMapa() {
    const confirmados = mapaResultados.filter(r => r.aluno && r.aluno.cpf).length;
    const pendentes = mapaResultados.filter(r => !r.aluno && r.status !== 'ignorado').length;
    const ignorados = mapaResultados.filter(r => r.status === 'ignorado').length;
    document.getElementById('mapaResumo').textContent =
        `✅ ${confirmados} pronto(s) para gravar · ⚠️ ${pendentes} não encontrado(s)/ambíguo(s) · ⏭️ ${ignorados} ignorado(s)`;
    document.getElementById('btnGravarMapa').disabled = confirmados === 0;
}

async function gravarMapaCamas() {
    const lista = mapaResultados
        .filter(r => r.aluno && r.aluno.cpf)
        .map(r => ({
            cpf: String(r.aluno.cpf).replace(/\D/g, ''),
            numero_quarto: String(r.quarto).trim(),
            nome_hospede: r.aluno.nome || r.aluno.nome_hospede || '',
            colegio: r.aluno.colegio || '',
            inicio_viagem: r.aluno.inicioViagem || r.aluno.inicio_viagem || r.inicio || '',
            fim_viagem: r.aluno.fimViagem || r.aluno.fim_viagem || r.fim || ''
        }));

    if (lista.length === 0) return;

    toggleLoading(true, `Gravando ${lista.length} quarto(s)...`);
    try {
        for (let i = 0; i < lista.length; i += 400) {
            const lote = lista.slice(i, i + 400);
            const res = await authFetch('/api/atribuir-quartos-batch', {
                method: 'POST',
                body: JSON.stringify({ alunos: lote })
            });
            const json = await res.json();
            if (!json.success) {
                throw new Error(json.message || 'Falha ao gravar lote');
            }
        }
        alert(`✅ ${lista.length} quarto(s) gravado(s) com sucesso!`);
        fecharModalMapaCamas();
        if (document.getElementById('filterInicio').value) {
            buscarAlunos();
        }
    } catch (e) {
        console.error('Erro ao gravar mapa:', e);
        alert('❌ Erro ao gravar quartos: ' + e.message);
    } finally {
        toggleLoading(false);
    }
}
