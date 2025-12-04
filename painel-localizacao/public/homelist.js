let alunosData = [];
let colegios = new Set();
let alunoSelecionado = null;

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('emptyStudents').style.display = 'block';

    // Listener de pesquisa em tempo real
    document.getElementById('filterNome').addEventListener('input', filtrarLista);
    document.getElementById('filterColegio').addEventListener('change', filtrarLista);

    // Carrega nome do operador
    const user = localStorage.getItem('painel_user');
    if (user) {
        try {
            const userData = JSON.parse(user);
            document.getElementById('nomeOperador').textContent = userData.nome || 'Usuário';
        } catch(e) {}
    }
});

async function buscarAlunos() {
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
            fetch(url),
            fetch('/api/quartos')
        ]);

        const jsonEmbarques = await resEmbarques.json();
        const jsonQuartos = await resQuartos.json();

        if (jsonEmbarques.status === 'sucesso' && jsonQuartos.success) {
            const alunos = jsonEmbarques.passageiros || [];
            const quartos = jsonQuartos.data || [];

            // Cria map de quartos por CPF
            const quartosMap = new Map();
            quartos.forEach(q => {
                if (q.cpf && q.numero_quarto) {
                    quartosMap.set(q.cpf, q.numero_quarto);
                }
            });

            // Adiciona numero_quarto aos alunos
            alunosData = alunos.map(a => ({
                ...a,
                numero_quarto: quartosMap.get(a.cpf) || ''
            }));

            // Popula lista de colégios
            colegios.clear();
            alunosData.forEach(a => {
                if (a.colegio) colegios.add(a.colegio);
            });

            // Atualiza select de colégios
            const selectColegio = document.getElementById('filterColegio');
            selectColegio.innerHTML = '<option value="">Todos</option>';
            Array.from(colegios).sort().forEach(col => {
                selectColegio.innerHTML += `<option value="${col}">${col}</option>`;
            });

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
    const nomeFiltro = document.getElementById('filterNome').value.toLowerCase();

    // Aplica filtros
    let filtrados = alunosData.filter(aluno => {
        const matchColegio = !colegioFiltro || (aluno.colegio === colegioFiltro);
        const matchNome = !nomeFiltro ||
            (aluno.nome && aluno.nome.toLowerCase().includes(nomeFiltro)) ||
            (aluno.cpf && String(aluno.cpf).includes(nomeFiltro));

        return matchColegio && matchNome;
    });

    if (filtrados.length === 0 && alunosData.length === 0) {
        studentsList.innerHTML = '';
        emptyState.style.display = 'block';
        atualizarEstatisticas(0, 0, 0);
        return;
    }

    if (filtrados.length === 0) {
        studentsList.innerHTML = '<p style="text-align:center; padding:40px; color:#999;">Nenhum aluno encontrado com esses filtros.</p>';
        emptyState.style.display = 'none';
        atualizarEstatisticas(0, 0, 0);
        return;
    }

    emptyState.style.display = 'none';

    // Calcula estatísticas
    const total = filtrados.length;
    const comQuarto = filtrados.filter(a => a.numero_quarto).length;
    const semQuarto = total - comQuarto;

    atualizarEstatisticas(total, comQuarto, semQuarto);

    // Renderiza lista
    studentsList.innerHTML = '';
    filtrados.forEach(aluno => {
        const item = criarItemAluno(aluno);
        studentsList.appendChild(item);
    });
}

function atualizarEstatisticas(total, comQuarto, semQuarto) {
    document.getElementById('statTotal').textContent = total;
    document.getElementById('statComQuarto').textContent = comQuarto;
    document.getElementById('statSemQuarto').textContent = semQuarto;
}

function criarItemAluno(aluno) {
    const div = document.createElement('div');
    div.className = `student-item ${aluno.numero_quarto ? 'has-room' : ''}`;

    const cpfFormatted = formatarCPF(aluno.cpf);

    div.innerHTML = `
        <div>
            <div class="student-name">${aluno.nome}</div>
            <div class="student-info">
                CPF: ${cpfFormatted} | ${aluno.colegio || 'Sem colégio'}${aluno.turma ? ` | ${aluno.turma}` : ''}
            </div>
        </div>
        <div>
            ${aluno.numero_quarto ?
                `<span class="room-badge"><i class="fas fa-door-open"></i> Quarto ${aluno.numero_quarto}</span>` :
                `<i class="fas fa-circle" style="color: #ef4444; font-size: 0.8rem;"></i>`
            }
        </div>
    `;

    div.onclick = () => selecionarAluno(aluno);

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

function selecionarAluno(aluno) {
    alunoSelecionado = aluno;

    // Remove seleção anterior
    document.querySelectorAll('.student-item').forEach(item => {
        item.classList.remove('selected');
    });

    // Adiciona seleção ao item clicado
    event.currentTarget.classList.add('selected');

    // Mostra painel de atribuição
    document.getElementById('panelEmpty').style.display = 'none';
    document.getElementById('panelForm').style.display = 'block';

    // Preenche informações
    document.getElementById('selectedName').textContent = aluno.nome;
    document.getElementById('selectedInfo').innerHTML = `
        CPF: ${formatarCPF(aluno.cpf)}<br>
        Colégio: ${aluno.colegio || 'Não informado'}<br>
        Turma: ${aluno.turma || 'Não informado'}<br>
        Viagem: ${aluno.inicio_viagem || '--'} até ${aluno.fim_viagem || '--'}
    `;

    // Preenche campo de quarto
    document.getElementById('roomInput').value = aluno.numero_quarto || '';

    // Mostra/esconde botão de remover
    if (aluno.numero_quarto) {
        document.getElementById('btnRemoveRoom').style.display = 'block';
    } else {
        document.getElementById('btnRemoveRoom').style.display = 'none';
    }
}

async function salvarQuarto() {
    if (!alunoSelecionado) return;

    const numeroQuarto = document.getElementById('roomInput').value.trim();

    if (!numeroQuarto) {
        return alert('⚠️ Digite o número do quarto.');
    }

    if (!confirm(`Atribuir quarto "${numeroQuarto}" para ${alunoSelecionado.nome}?`)) {
        return;
    }

    toggleLoading(true, 'Salvando quarto...');

    try {
        const res = await fetch('/api/atribuir-quarto', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                cpf: alunoSelecionado.cpf,
                numero_quarto: numeroQuarto,
                nome_hospede: alunoSelecionado.nome,
                colegio: alunoSelecionado.colegio,
                inicio_viagem: alunoSelecionado.inicio_viagem,
                fim_viagem: alunoSelecionado.fim_viagem
            })
        });

        const json = await res.json();

        if (json.success) {
            alert('✅ Quarto atribuído com sucesso!');
            // Atualiza localmente
            alunoSelecionado.numero_quarto = numeroQuarto;
            // Atualiza no array
            const index = alunosData.findIndex(a => a.cpf === alunoSelecionado.cpf);
            if (index !== -1) {
                alunosData[index].numero_quarto = numeroQuarto;
            }
            // Recarrega a lista
            renderizarLista();
            // Reseleciona o aluno para atualizar o painel
            selecionarAluno(alunoSelecionado);
        } else {
            alert('❌ Erro: ' + (json.message || 'Erro desconhecido'));
        }
    } catch (error) {
        console.error(error);
        alert('❌ Erro de conexão');
    } finally {
        toggleLoading(false);
    }
}

async function removerQuarto() {
    if (!alunoSelecionado) return;

    if (!confirm(`⚠️ Remover o quarto ${alunoSelecionado.numero_quarto} de ${alunoSelecionado.nome}?`)) {
        return;
    }

    toggleLoading(true, 'Removendo quarto...');

    try {
        const res = await fetch(`/api/remover-quarto/${alunoSelecionado.cpf}`, {
            method: 'DELETE'
        });

        const json = await res.json();

        if (json.success) {
            alert('✅ Quarto removido com sucesso!');
            // Atualiza localmente
            alunoSelecionado.numero_quarto = '';
            // Atualiza no array
            const index = alunosData.findIndex(a => a.cpf === alunoSelecionado.cpf);
            if (index !== -1) {
                alunosData[index].numero_quarto = '';
            }
            // Recarrega a lista
            renderizarLista();
            // Reseleciona o aluno para atualizar o painel
            selecionarAluno(alunoSelecionado);
        } else {
            alert('❌ Erro: ' + (json.message || 'Erro desconhecido'));
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
