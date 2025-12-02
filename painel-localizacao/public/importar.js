let alunosParaImportar = [];
let gruposEncontrados = {};

// --- INICIALIZAÇÃO ---
document.addEventListener('DOMContentLoaded', () => {
    // Configura o toggle do botão facial visualmente
    const checkFacial = document.getElementById('checkFacial');
    checkFacial.addEventListener('change', (e) => {
        // Apenas para o label visual na tela
        document.getElementById('labelFacial').textContent = e.target.checked ? 'SIM' : 'NÃO';
    });

    // Define data de hoje no filtro
    const hoje = new Date().toISOString().split('T')[0];
    document.getElementById('filterDataInicio').value = hoje;
});

// --- 1. LÓGICA DE IMPORTAÇÃO (Permanece igual) ---

document.getElementById('fileInput').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.readAsArrayBuffer(file);
    reader.onload = function(evt) {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, {type: 'array'});
        processarExcel(workbook.Sheets[workbook.SheetNames[0]]);
    };
});

function processarExcel(worksheet) {
    const cellA1 = worksheet['A1'];
    if(cellA1 && cellA1.v) document.getElementById('inputPasseio').value = cellA1.v.trim();

    const dadosBrutos = XLSX.utils.sheet_to_json(worksheet, { range: 1, defval: "" });
    if (dadosBrutos.length === 0) return alert('Nenhum dado encontrado.');

    alunosParaImportar = [];
    dadosBrutos.forEach((linha, index) => {
        const chaves = Object.keys(linha);
        const chaveNome = chaves.find(k => /ALUNO|NOME/i.test(k));
        const chaveTurma = chaves.find(k => /TURMA/i.test(k));
        const chaveCpf = chaves.find(k => /CPF|RG/i.test(k));
        const chaveContato = chaves.find(k => /CONTATO|TEL/i.test(k));

        const nome = linha[chaveNome];
        const cpfRaw = linha[chaveCpf];
        if (!nome) return;

        const cpfLimpo = String(cpfRaw || '').replace(/\D/g, '');
        if (!cpfLimpo) return; 

        alunosParaImportar.push({
            tempId: index,
            nome: String(nome).trim(),
            turma: chaveTurma ? String(linha[chaveTurma]).trim() : '',
            cpf: String(cpfRaw).trim(),
            cpf_limpo: cpfLimpo,
            contato: chaveContato ? String(linha[chaveContato]).trim() : ''
        });
    });

    document.getElementById('globalFields').classList.remove('hidden');
    renderizarTabelaPreview();
}

function renderizarTabelaPreview() {
    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = '';
    document.getElementById('totalLinhas').textContent = alunosParaImportar.length;
    
    if (alunosParaImportar.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center">Nenhum aluno na lista.</td></tr>';
        return;
    }

    alunosParaImportar.forEach((aluno, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${aluno.nome}</td>
            <td>${aluno.cpf}</td>
            <td>${aluno.turma}</td>
            <td style="text-align:center;">
                <button class="btn-delete" onclick="removerLinha(${index})"><i class="fas fa-trash-alt"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function removerLinha(index) {
    if(!confirm('Remover este aluno da lista de importação?')) return;
    alunosParaImportar.splice(index, 1);
    renderizarTabelaPreview();
}

async function enviarDados() {
    if (alunosParaImportar.length === 0) return alert('A lista está vazia.');

    const inputs = {
        passeio: document.getElementById('inputPasseio').value.trim(),
        colegio: document.getElementById('inputColegio').value.trim(),
        onibus: document.getElementById('inputOnibus').value.trim(),
        inicio: document.getElementById('inputInicio').value,
        fim: document.getElementById('inputFim').value
    };

    if (!inputs.passeio || !inputs.inicio || !inputs.fim) return alert('Preencha Passeio, Início e Fim.');
    
    if (!confirm(`Confirmar importação de ${alunosParaImportar.length} alunos?\nEsta ação salvará os dados no sistema.`)) return;

    toggleLoading(true, 'Salvando dados...');

    const payload = alunosParaImportar.map(aluno => ({
        ...aluno,
        id_passeio: inputs.passeio,
        colegio: inputs.colegio,
        onibus: inputs.onibus,
        inicio_viagem: inputs.inicio,
        fim_viagem: inputs.fim
    }));

    try {
        const res = await fetch('/api/importar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ alunos: payload })
        });
        const data = await res.json();
        if (data.success) {
            alert('✅ Importado com sucesso!');
            document.getElementById('filterDataInicio').value = inputs.inicio;
            limparImportacao();
            buscarGrupos();
        } else {
            alert('Erro: ' + data.message);
        }
    } catch (e) { alert('Erro de conexão'); }
    finally { toggleLoading(false); }
}

function limparImportacao() {
    alunosParaImportar = [];
    document.getElementById('globalFields').classList.add('hidden');
    document.getElementById('fileInput').value = '';
    document.getElementById('tableBody').innerHTML = '';
}

// --- 2. LÓGICA DE GRUPOS (Permanece igual) ---

async function buscarGrupos() {
    const dataInicio = document.getElementById('filterDataInicio').value;
    toggleLoading(true, 'Buscando grupos...');
    try {
        const res = await fetch(`/api/embarque-lista?inicio=${dataInicio}`);
        const json = await res.json();
        if (json.status === 'sucesso') agruparDados(json.data);
        else alert('Erro ao buscar dados.');
    } catch (e) { console.error(e); alert('Erro na busca.'); }
    finally { toggleLoading(false); }
}

function agruparDados(listaAlunos) {
    gruposEncontrados = {};
    listaAlunos.forEach(aluno => {
        const idPasseioReal = aluno.idPasseio || aluno.id_passeio || 'S/ Passeio';
        const chave = `${aluno.colegio || 'S/ Colégio'}|${idPasseioReal}|${aluno.onibus || '?'}|${aluno.inicio_viagem}`;
        
        if (!gruposEncontrados[chave]) {
            gruposEncontrados[chave] = {
                colegio: aluno.colegio,
                passeio: idPasseioReal, 
                onibus: aluno.onibus,
                data: aluno.inicio_viagem,
                alunos: []
            };
        }
        gruposEncontrados[chave].alunos.push(aluno);
    });
    renderizarTabelaGrupos();
}

function renderizarTabelaGrupos() {
    const tbody = document.getElementById('listaGruposBody');
    tbody.innerHTML = '';
    const chaves = Object.keys(gruposEncontrados);
    if (chaves.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center">Nenhum registro encontrado nesta data.</td></tr>';
        return;
    }
    chaves.forEach(chave => {
        const g = gruposEncontrados[chave];
        tbody.innerHTML += `
            <tr>
                <td><input type="checkbox" class="grupo-checkbox" value="${chave}"></td>
                <td>${g.colegio || '-'}</td>
                <td>${g.passeio || '-'}</td>
                <td>${g.onibus || '-'}</td>
                <td>${g.data || '-'}</td>
                <td>${g.alunos.length}</td>
            </tr>
        `;
    });
}

function toggleSelectAll() {
    const master = document.getElementById('selectAll');
    document.querySelectorAll('.grupo-checkbox').forEach(c => c.checked = master.checked);
}

// --- 3. GERAÇÃO DE PDF COM QR CODE (CORRIGIDO: 1 QR POR ÔNIBUS) ---

async function gerarPDFSelecionados() {
    const checkboxes = document.querySelectorAll('.grupo-checkbox:checked');
    if (checkboxes.length === 0) return alert('Selecione pelo menos um colégio/grupo.');

    // Status Facial
    const isFacialChecked = document.getElementById('checkFacial').checked;
    const facialVisual = isFacialChecked ? 'SIM' : 'NÃO';
    const facialQR = isFacialChecked ? 'sim' : 'não';
    
    toggleLoading(true, 'Gerando PDF...');

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    let totalPageCount = 0;

    // Loop APENAS pelos grupos/ônibus selecionados (NÃO itera alunos)
    for (const cb of checkboxes) {
        const grupo = gruposEncontrados[cb.value];
        
        if (totalPageCount > 0) doc.addPage();
        
        const pageWidth = doc.internal.pageSize.getWidth();
        const centerX = pageWidth / 2;
        const centerY = doc.internal.pageSize.getHeight() / 2;

        // String QR Mestra: COLEGIO;ID_PASSEIO;ONIBUS;sim
        const qrStringGroup = `${grupo.colegio || 'S/ Colégio'};${grupo.passeio || 'S/ Passeio'};${grupo.onibus || 'S/ Ônibus'};${facialQR}`;
        
        // Gera o QR Code
        const groupQRBase64 = await gerarQRCodeBase64(qrStringGroup);
        
        // --- LAYOUT DO QR CODE DE ÔNIBUS ---
        
        // Título: Colégio
        doc.setFontSize(22);
        doc.setFont("helvetica", "bold");
        doc.text((grupo.colegio || '').toUpperCase(), centerX, centerY - 60, { align: "center", maxWidth: 180 });
        
        // Subtítulo: Passeio
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text(grupo.passeio || '', centerX, centerY - 50, { align: "center", maxWidth: 180 });

        // IMAGEM DO QR CODE
        doc.addImage(groupQRBase64, 'PNG', centerX - 40, centerY - 40, 70, 80);
        
        // Texto cru do QR Code (Fonte Pequena)
        doc.setFontSize(10); 
        doc.setTextColor(150); 
        doc.text(qrStringGroup, centerX, centerY + 50, { align: "center", maxWidth: 190 });
        
        // Info Ônibus
        doc.setFontSize(16);
        doc.setTextColor(0); 
        doc.text(`ÔNIBUS: ${grupo.onibus || '-'}`, centerX, centerY + 65, { align: "center" });
        
        // Status Facial Visual
        const txtFacialVisual = facialVisual === 'SIM' ? 'FACIAL: SIM ✅' : 'FACIAL: NÃO ❌';
        doc.text(txtFacialVisual, centerX, centerY + 75, { align: "center" });

        totalPageCount++;
    }

    doc.save(`QRCodes_Onibus_Ellus_${new Date().toISOString().slice(0,10)}.pdf`);
    toggleLoading(false);
}

function gerarQRCodeBase64(text) {
    return new Promise((resolve) => {
        const div = document.createElement('div');
        div.style.position = 'absolute';
        div.style.left = '-9999px';
        document.body.appendChild(div);

        const qr = new QRCode(div, {
            text: text,
            width: 300,
            height: 300,
            correctLevel: QRCode.CorrectLevel.M
        });
        
        setTimeout(() => {
            let dataUrl = '';
            const canvas = div.querySelector('canvas');
            if (canvas) {
                dataUrl = canvas.toDataURL("image/png");
            } else {
                const img = div.querySelector('img');
                if (img) dataUrl = img.src;
            }
            document.body.removeChild(div);
            resolve(dataUrl);
        }, 150);
    });
}

function toggleLoading(show, text = 'Processando...') {
    const el = document.getElementById('loadingOverlay');
    if (show) {
        document.getElementById('loadingText').textContent = text;
        el.classList.remove('hidden');
    } else {
        el.classList.add('hidden');
    }
}