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

// Define a saudação no cabeçalho com o primeiro nome em maiúsculo
try {
    const userData = JSON.parse(localStorage.getItem('painel_user') || '{}');
    const nomeEl = document.getElementById('nomeOperador');
    if (nomeEl && userData.nome) {
        const primeiroNome = userData.nome.split(' ')[0].toUpperCase();
        nomeEl.innerHTML = `👋 Olá, ${primeiroNome}`;
    }
} catch(e) { console.error("Erro ao carregar nome:", e); }

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

    // 3. Agrupar por Colégio e depois por Ônibus
    const gruposColegio = {};
    filtrados.forEach(p => {
        const col = p.colegio || 'SEM COLÉGIO';
        if (!gruposColegio[col]) gruposColegio[col] = {};

        const onibus = p.onibus || 'SEM ÔNIBUS';
        if (!gruposColegio[col][onibus]) gruposColegio[col][onibus] = [];
        gruposColegio[col][onibus].push(p);
    });

    // 4. Criar HTML (Acordeão duplo: Colégio > Ônibus)
    Object.keys(gruposColegio).sort().forEach(colegio => {
        const onibusGrupo = gruposColegio[colegio];

        // Calcular totais do colégio
        let totalColegio = 0;
        let embarcadosColegio = 0;
        let retornadosColegio = 0;

        Object.keys(onibusGrupo).forEach(onibus => {
            const alunos = onibusGrupo[onibus];
            totalColegio += alunos.length;
            embarcadosColegio += alunos.filter(a => String(a.embarque).toUpperCase() === 'SIM').length;
            retornadosColegio += alunos.filter(a => String(a.retorno).toUpperCase() === 'SIM').length;
        });

        const detailsColegio = document.createElement('details');
        detailsColegio.className = 'school-accordion';

        // Lógica de abertura: Se tem busca OU estava aberto antes (auto-refresh)
        if (termo.length > 0 || (preservarEstado && escolasAbertas.includes(colegio))) {
            detailsColegio.open = true;
        }

        const summaryColegio = document.createElement('summary');
        summaryColegio.innerHTML = `
            <div class="summary-content">
                <span class="school-name">${colegio}</span>
                <span class="school-stats">
                    <i class="fas fa-bus"></i> ${embarcadosColegio}/${totalColegio} Embarcados |
                    <i class="fas fa-home"></i> ${retornadosColegio}/${totalColegio} Retornados
                </span>
            </div>
            <div class="progress-bar-mini">
                <div class="fill" style="width: ${(embarcadosColegio/totalColegio)*100}%"></div>
            </div>
        `;

        const onibusContainer = document.createElement('div');
        onibusContainer.className = 'onibus-container';

        // Para cada ônibus do colégio
        Object.keys(onibusGrupo).sort().forEach(onibus => {
            const alunos = onibusGrupo[onibus];
            const embarcados = alunos.filter(a => String(a.embarque).toUpperCase() === 'SIM').length;
            const retornados = alunos.filter(a => String(a.retorno).toUpperCase() === 'SIM').length;
            const total = alunos.length;

            const detailsOnibus = document.createElement('details');
            detailsOnibus.className = 'bus-accordion';
            if (termo.length > 0) {
                detailsOnibus.open = true;
            }

            const summaryOnibus = document.createElement('summary');
            summaryOnibus.className = 'bus-summary';
            summaryOnibus.innerHTML = `
                <div class="summary-content">
                    <span class="bus-name"><i class="fas fa-bus"></i> Ônibus ${onibus}</span>
                    <span class="bus-stats">
                        <span class="stat-embarque"><i class="fas fa-arrow-right"></i> ${embarcados}/${total}</span>
                        <span class="stat-retorno"><i class="fas fa-arrow-left"></i> ${retornados}/${total}</span>
                    </span>
                </div>
            `;

            const listDiv = document.createElement('div');
            listDiv.className = 'student-list';

            alunos.forEach(aluno => {
                const row = document.createElement('div');
                const isEmbarcado = String(aluno.embarque).toUpperCase() === 'SIM';
                const isRetornado = String(aluno.retorno).toUpperCase() === 'SIM';

                row.className = `student-row ${isEmbarcado ? 'status-ok' : 'status-pending'}`;

                row.innerHTML = `
                    <div class="st-info">
                        <span class="st-name">${aluno.nome}</span>
                        <span class="st-meta">CPF: ${aluno.cpf}${aluno.turma ? ` | Turma: ${aluno.turma}` : ''}</span>
                    </div>
                    <div class="st-status">
                        <span class="tag ${isEmbarcado ? 'tag-green' : 'tag-gray'}">
                            <i class="fas ${isEmbarcado ? 'fa-check' : 'fa-times'}"></i>
                            Embarque: ${isEmbarcado ? 'SIM' : 'NÃO'}
                        </span>
                        <span class="tag ${isRetornado ? 'tag-blue' : 'tag-gray'}">
                            <i class="fas ${isRetornado ? 'fa-check' : 'fa-times'}"></i>
                            Retorno: ${isRetornado ? 'SIM' : 'NÃO'}
                        </span>
                    </div>
                `;
                listDiv.appendChild(row);
            });

            detailsOnibus.appendChild(summaryOnibus);
            detailsOnibus.appendChild(listDiv);
            onibusContainer.appendChild(detailsOnibus);
        });

        detailsColegio.appendChild(summaryColegio);
        detailsColegio.appendChild(onibusContainer);
        container.appendChild(detailsColegio);
    });
}