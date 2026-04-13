let viagensTotais = [];

document.addEventListener('DOMContentLoaded', () => {
    carregarViagens();
});

async function carregarViagens() {
    const tbody = document.getElementById('tabelaViagensBody');
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Carregando viagens...</td></tr>';

    try {
        const response = await fetch('/api/viagens-unicas');
        const result = await response.json();

        if (result.success) {
            viagensTotais = result.data;
            // Ordenar da mais recente para a mais antiga
            viagensTotais.sort((a, b) => new Date(b.inicio) - new Date(a.inicio));
            renderizarTabela(viagensTotais);
        } else {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color: var(--danger-color);">Erro ao carregar dados.</td></tr>';
        }
    } catch (error) {
        console.error('Erro:', error);
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color: var(--danger-color);">Falha na conexão com o servidor.</td></tr>';
    }
}

function renderizarTabela(viagens) {
    const tbody = document.getElementById('tabelaViagensBody');
    tbody.innerHTML = '';

    document.getElementById('totalViagensTexto').innerText = `${viagens.length} viagem(ns) encontrada(s)`;

    if (viagens.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Nenhuma viagem encontrada.</td></tr>';
        return;
    }

    viagens.forEach(v => {
        const tr = document.createElement('tr');
        
        // Formatar datas para o padrão BR
        const dataInicioFormatada = formatarData(v.inicio);
        const dataFimFormatada = formatarData(v.fim);

        tr.innerHTML = `
            <td><strong>${v.colegio}</strong></td>
            <td>${dataInicioFormatada}</td>
            <td>${dataFimFormatada}</td>
            <td><span class="badge" style="background: rgba(255,255,255,0.1); color: white;">${v.qtd_alunos} Alunos</span></td>
            <td style="text-align: right;">
                <button class="btn-excluir" onclick="confirmarExclusao('${v.colegio}', '${v.inicio}')">
                    <i class="fas fa-trash"></i> Excluir
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function filtrarViagens() {
    const termo = document.getElementById('pesquisaViagem').value.toLowerCase();
    const dataFiltro = document.getElementById('filtroData').value; // Formato YYYY-MM

    const filtradas = viagensTotais.filter(v => {
        const textoMatch = v.colegio.toLowerCase().includes(termo);
        
        let dataMatch = true;
        if (dataFiltro) {
            // O valor de v.inicio geralmente é YYYY-MM-DD
            dataMatch = v.inicio.startsWith(dataFiltro);
        }

        return textoMatch && dataMatch;
    });

    renderizarTabela(filtradas);
}

function confirmarExclusao(colegio, dataInicio) {
    const confirmacao = confirm(`⚠️ ATENÇÃO!\n\nVocê está prestes a excluir TODOS os alunos e quartos da viagem:\nColégio: ${colegio}\nData: ${formatarData(dataInicio)}\n\nEsta ação é IRREVERSÍVEL. Deseja continuar?`);
    
    if (confirmacao) {
        excluirViagem(colegio, dataInicio);
    }
}

async function excluirViagem(colegio, dataInicio) {
    try {
        // Obter usuário logado do localStorage (ou colocar 'Admin' se não houver)
        const userLogadoStr = localStorage.getItem('usuarioLogado');
        let usuarioNome = 'Sistema';
        if (userLogadoStr) {
            const userLogado = JSON.parse(userLogadoStr);
            usuarioNome = userLogado.nome || 'Sistema';
        }

        const response = await fetch('/api/viagens/excluir', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                colegio: colegio, 
                inicio_viagem: dataInicio,
                operador: usuarioNome
            })
        });

        const result = await response.json();

        if (result.success) {
            alert('✅ Viagem e alunos excluídos com sucesso!');
            carregarViagens(); // Recarrega a lista
        } else {
            alert('❌ Erro ao excluir: ' + result.message);
        }
    } catch (error) {
        console.error('Erro na exclusão:', error);
        alert('❌ Erro de conexão ao tentar excluir.');
    }
}

function formatarData(dataISO) {
    if (!dataISO) return '--';
    try {
        // Previne erro de fuso horário criando data sem hora
        const partes = dataISO.split('-'); 
        if(partes.length === 3) {
            return `${partes[2]}/${partes[1]}/${partes[0]}`;
        }
        return dataISO;
    } catch (e) {
        return dataISO;
    }
}