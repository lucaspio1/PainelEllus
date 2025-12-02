const apiURL = '/api/embarque-lista';
let dadosGlobais = [];
let autoRefreshInterval = null;

document.addEventListener('DOMContentLoaded', () => {
    // Inicia carregando dados de HOJE
    selecionarData('hoje');

    // Listener de busca
    document.getElementById('searchEmbarque').addEventListener('input', (e) => {
        renderizarListas(e.target.value);
    });

    // ✅ ATUALIZAÇÃO AUTOMÁTICA (30 segundos)
    autoRefreshInterval = setInterval(() => {
        const dataAtiva = document.getElementById('customDate').value;
        // Só atualiza se tiver uma data selecionada
        if (dataAtiva) {
            console.log('🔄 Auto-refresh Embarque...');
            carregarDados(dataAtiva, true); // true = modo silencioso (não mostra tela de carregando)
        }
    }, 30000);
});

function getFormattedDate(date) {
    const d = date.getDate().toString().padStart(2, '0');
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    return `${d}/${m}`;
}

function selecionarData(tipo) {
    const hoje = new Date();
    let dataStr = '';

    document.querySelectorAll('.btn-date').forEach(b => b.classList.remove('selected'));

    if (tipo === 'hoje') {
        dataStr = getFormattedDate(hoje);
        document.getElementById('btnHoje').classList.add('selected');
    } else if (tipo === 'amanha') {
        const amanha = new Date(hoje);
        amanha.setDate(amanha.getDate() + 1);
        dataStr = getFormattedDate(amanha);
        document.getElementById('btnAmanha').classList.add('selected');
    }
    
    document.getElementById('customDate').value = dataStr;
    carregarDados(dataStr);
}

function buscarPorDataManual() {
    const val = document.getElementById('customDate').value;
    if(val) carregarDados(val);
}

// Adicionado parâmetro 'silent' para atualização automática não travar a tela
async function carregarDados(dataDDMM, silent = false) {
    const container = document.getElementById('listaEmbarqueContainer');
    const loading = document.getElementById('loadingEmbarque');
    const totalBadge = document.getElementById('totalPassageiros');
    
    // Se NÃO for silencioso (clique manual), mostra spinner e limpa tela
    if (!silent) {
        container.innerHTML = '';
        loading.classList.remove('hidden');
        totalBadge.textContent = '...';
    }

    try {
        // CORREÇÃO: Passamos APENAS o 'inicio'
        const res = await fetch(`${apiURL}?inicio=${dataDDMM}`);
        const json = await res.json();

        if (json.status === 'sucesso') {
            dadosGlobais = json.passageiros || [];
            totalBadge.textContent = `${dadosGlobais.length} Alunos`;
            
            // Renderiza mantendo o estado (se for auto-refresh, passa 'silent' como flag de preservação)
            const termoAtual = document.getElementById('searchEmbarque').value;
            renderizarListas(termoAtual, silent);
            
        } else {
            if (!silent) container.innerHTML = `<p class="error-msg">Erro: ${json.mensagem}</p>`;
        }
    } catch (error) {
        console.error(error);
        if (!silent) container.innerHTML = `<p class="error-msg">Erro ao conectar com servidor.</p>`;
    } finally {
        if (!silent) loading.classList.add('hidden');
    }
}

function renderizarListas(filtro = '', preservarEstado = false) {
    const container = document.getElementById('listaEmbarqueContainer');
    const termo = filtro.toLowerCase();

    // 1. Captura quais escolas estão abertas ANTES de limpar (para não fechar na cara do usuário)
    let escolasAbertas = [];
    if (preservarEstado) {
        document.querySelectorAll('details.school-accordion[open]').forEach(el => {
            const nome = el.querySelector('.school-name')?.textContent;
            if (nome) escolasAbertas.push(nome);
        });
    }

    // Limpa container
    container.innerHTML = '';

    // 2. Filtrar
    let filtrados = dadosGlobais.filter(p => {
        return (p.nome && p.nome.toLowerCase().includes(termo)) ||
               (p.cpf && String(p.cpf).includes(termo)) ||
               (p.colegio && p.colegio.toLowerCase().includes(termo)) ||
               (p.onibus && String(p.onibus).includes(termo));
    });

    if (filtrados.length === 0) {
        container.innerHTML = '<div class="empty-state">Nenhum passageiro encontrado para esta data/busca.</div>';
        return;
    }

    // 3. Agrupar por Colégio
    const grupos = {};
    filtrados.forEach(p => {
        const col = p.colegio || 'SEM COLÉGIO';
        if (!grupos[col]) grupos[col] = [];
        grupos[col].push(p);
    });

    // 4. Criar HTML (Acordeão)
    Object.keys(grupos).sort().forEach(colegio => {
        const alunos = grupos[colegio];
        const embarcados = alunos.filter(a => String(a.embarque).toUpperCase() === 'SIM').length;
        const total = alunos.length;

        const details = document.createElement('details');
        details.className = 'school-accordion';
        
        // Lógica de abertura: Se tem busca OU estava aberto antes (auto-refresh)
        if (termo.length > 0 || (preservarEstado && escolasAbertas.includes(colegio))) {
            details.open = true;
        }

        const summary = document.createElement('summary');
        summary.innerHTML = `
            <div class="summary-content">
                <span class="school-name">${colegio}</span>
                <span class="school-stats">${embarcados}/${total} Embarcados</span>
            </div>
            <div class="progress-bar-mini">
                <div class="fill" style="width: ${(embarcados/total)*100}%"></div>
            </div>
        `;

        const listDiv = document.createElement('div');
        listDiv.className = 'student-list';

        alunos.forEach(aluno => {
            const row = document.createElement('div');
            const isEmbarcado = String(aluno.embarque).toUpperCase() === 'SIM';
            
            row.className = `student-row ${isEmbarcado ? 'status-ok' : 'status-pending'}`;
            
            row.innerHTML = `
                <div class="st-info">
                    <span class="st-name">${aluno.nome}</span>
                    <span class="st-meta">CPF: ${aluno.cpf} | Ônibus: ${aluno.onibus}</span>
                    ${aluno.turma ? `<span class="st-turma">${aluno.turma}</span>` : ''}
                </div>
                <div class="st-status">
                    ${isEmbarcado 
                        ? '<span class="tag tag-green"><i class="fas fa-check"></i> SIM</span>' 
                        : '<span class="tag tag-red"><i class="fas fa-times"></i> NÃO</span>'}
                </div>
            `;
            listDiv.appendChild(row);
        });

        details.appendChild(summary);
        details.appendChild(listDiv);
        container.appendChild(details);
    });
}