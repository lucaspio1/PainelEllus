let alunosData = [];
let colegios = new Set();

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('emptyState').style.display = 'block';

    // Adiciona listeners de pesquisa em tempo real
    document.getElementById('filterNome').addEventListener('input', filtrarAlunos);
});

function limparFiltros() {
    document.getElementById('filterInicio').value = '';
    document.getElementById('filterFim').value = '';
    document.getElementById('filterColegio').value = '';
    document.getElementById('filterNome').value = '';
    alunosData = [];
    renderizarAlunos();
    document.getElementById('statsContainer').style.display = 'none';
    document.getElementById('emptyState').style.display = 'block';
}

async function buscarAlunos() {
    const inicio = document.getElementById('filterInicio').value;
    const fim = document.getElementById('filterFim').value;

    if (!inicio && !fim) {
        return alert('⚠️ Selecione pelo menos a Data de Início ou Fim da viagem.');
    }

    const loading = document.getElementById('loadingHomelist');
    const emptyState = document.getElementById('emptyState');

    loading.classList.remove('hidden');
    emptyState.style.display = 'none';

    try {
        let url = '/api/embarque-lista?';
        if (inicio) url += `inicio=${inicio}&`;
        if (fim) url += `fim=${fim}`;

        const res = await fetch(url);
        const json = await res.json();

        if (json.status === 'sucesso') {
            alunosData = json.passageiros || [];

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

            renderizarAlunos();
        } else {
            alert('Erro ao buscar alunos: ' + (json.mensagem || 'Desconhecido'));
        }
    } catch (error) {
        console.error(error);
        alert('❌ Erro de conexão');
    } finally {
        loading.classList.add('hidden');
    }
}

function filtrarAlunos() {
    renderizarAlunos();
}

function renderizarAlunos() {
    const grid = document.getElementById('studentsGrid');
    const emptyState = document.getElementById('emptyState');
    const statsContainer = document.getElementById('statsContainer');

    const colegioFiltro = document.getElementById('filterColegio').value.toLowerCase();
    const nomeFiltro = document.getElementById('filterNome').value.toLowerCase();

    // Aplica filtros
    let filtrados = alunosData.filter(aluno => {
        const matchColegio = !colegioFiltro || (aluno.colegio && aluno.colegio.toLowerCase() === colegioFiltro);
        const matchNome = !nomeFiltro ||
            (aluno.nome && aluno.nome.toLowerCase().includes(nomeFiltro)) ||
            (aluno.cpf && String(aluno.cpf).includes(nomeFiltro));

        return matchColegio && matchNome;
    });

    if (filtrados.length === 0 && alunosData.length > 0) {
        grid.innerHTML = '<p style="text-align:center; padding:40px; color:#999; grid-column: 1/-1;">Nenhum aluno encontrado com esses filtros.</p>';
        statsContainer.style.display = 'none';
        return;
    }

    if (filtrados.length === 0) {
        grid.innerHTML = '';
        emptyState.style.display = 'block';
        statsContainer.style.display = 'none';
        return;
    }

    emptyState.style.display = 'none';
    statsContainer.style.display = 'grid';

    // Calcula estatísticas
    const total = filtrados.length;
    const comQuarto = filtrados.filter(a => a.numero_quarto).length;
    const semQuarto = total - comQuarto;

    document.getElementById('statTotal').textContent = total;
    document.getElementById('statComQuarto').textContent = comQuarto;
    document.getElementById('statSemQuarto').textContent = semQuarto;

    // Renderiza cards
    grid.innerHTML = '';
    filtrados.forEach(aluno => {
        const card = criarCardAluno(aluno);
        grid.appendChild(card);
    });
}

function criarCardAluno(aluno) {
    const div = document.createElement('div');
    div.className = `student-card ${aluno.numero_quarto ? 'with-room' : ''}`;

    const cpfFormatted = formatarCPF(aluno.cpf);

    div.innerHTML = `
        <div class="student-header">
            <div>
                <div class="student-name">${aluno.nome}</div>
                <div class="student-info">CPF: ${cpfFormatted}</div>
            </div>
            ${aluno.numero_quarto ? `<i class="fas fa-check-circle" style="color: #22c55e; font-size: 1.5rem;"></i>` : ''}
        </div>
        <div class="student-info">
            <i class="fas fa-school"></i> ${aluno.colegio || 'Sem colégio'}
            ${aluno.turma ? ` | Turma: ${aluno.turma}` : ''}
        </div>
        <div class="student-info">
            <i class="fas fa-calendar"></i> ${aluno.inicio_viagem || '--'} até ${aluno.fim_viagem || '--'}
        </div>

        ${aluno.numero_quarto ? `
            <div class="room-display">
                <i class="fas fa-door-open"></i> Quarto ${aluno.numero_quarto}
                <button class="btn-remove-room" onclick="removerQuarto('${aluno.cpf}')" style="margin-left: 10px;">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        ` : `
            <div class="room-input-group">
                <input type="text"
                       class="room-input"
                       id="room-${aluno.cpf}"
                       placeholder="Número do quarto"
                       maxlength="10">
                <button class="btn-save-room" onclick="atribuirQuarto('${aluno.cpf}')">
                    <i class="fas fa-save"></i>
                </button>
            </div>
        `}
    `;

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

async function atribuirQuarto(cpf) {
    const inputId = `room-${cpf}`;
    const input = document.getElementById(inputId);
    const numeroQuarto = input ? input.value.trim() : '';

    if (!numeroQuarto) {
        return alert('⚠️ Digite o número do quarto.');
    }

    if (!confirm(`Atribuir quarto "${numeroQuarto}" para este aluno?`)) {
        return;
    }

    toggleLoading(true, 'Salvando quarto...');

    try {
        const aluno = alunosData.find(a => a.cpf === cpf);
        if (!aluno) {
            return alert('Erro: Aluno não encontrado');
        }

        const res = await fetch('/api/atribuir-quarto', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                cpf: cpf,
                numero_quarto: numeroQuarto,
                nome_hospede: aluno.nome,
                colegio: aluno.colegio,
                inicio_viagem: aluno.inicio_viagem,
                fim_viagem: aluno.fim_viagem
            })
        });

        const json = await res.json();

        if (json.success) {
            alert('✅ Quarto atribuído com sucesso!');
            // Atualiza o aluno localmente
            aluno.numero_quarto = numeroQuarto;
            renderizarAlunos();
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

async function removerQuarto(cpf) {
    if (!confirm('⚠️ Remover a atribuição de quarto deste aluno?')) {
        return;
    }

    toggleLoading(true, 'Removendo quarto...');

    try {
        const res = await fetch(`/api/remover-quarto/${cpf}`, {
            method: 'DELETE'
        });

        const json = await res.json();

        if (json.success) {
            alert('✅ Quarto removido com sucesso!');
            // Atualiza o aluno localmente
            const aluno = alunosData.find(a => a.cpf === cpf);
            if (aluno) {
                aluno.numero_quarto = '';
            }
            renderizarAlunos();
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
