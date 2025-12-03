let alunosParaImportar = [];
let gruposEncontrados = {};

// --- INICIALIZAÇÃO ---
document.addEventListener('DOMContentLoaded', () => {
    // Configura o toggle do botão facial visualmente
    const checkFacial = document.getElementById('checkFacial');
    if (checkFacial) {
        checkFacial.addEventListener('change', (e) => {
            const label = document.getElementById('labelFacial');
            if (label) label.textContent = e.target.checked ? 'SIM' : 'NÃO';
        });
    }

    // Define data de hoje no filtro
    const inputData = document.getElementById('filterDataInicio');
    if (inputData) {
        const hoje = new Date().toISOString().split('T')[0];
        inputData.value = hoje;
    }
});

// --- 1. LÓGICA DE IMPORTAÇÃO ---

const fileInput = document.getElementById('fileInput');
if (fileInput) {
    fileInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.readAsArrayBuffer(file);
        reader.onload = function(evt) {
            const data = new Uint8Array(evt.target.result);
            // Verifica se a biblioteca XLSX está carregada
            if (typeof XLSX === 'undefined') return alert('Erro: Biblioteca XLSX não carregada.');
            
            const workbook = XLSX.read(data, {type: 'array'});
            processarExcel(workbook.Sheets[workbook.SheetNames[0]]);
        };
    });
}

function processarExcel(worksheet) {
    const cellA1 = worksheet['A1'];
    const inputPasseio = document.getElementById('inputPasseio');
    if(cellA1 && cellA1.v && inputPasseio) inputPasseio.value = cellA1.v.trim();

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
        // Opcional: validar se precisa ter CPF para importar
        // if (!cpfLimpo) return; 

        alunosParaImportar.push({
            tempId: index,
            nome: String(nome).trim(),
            turma: chaveTurma ? String(linha[chaveTurma]).trim() : '',
            cpf: String(cpfRaw).trim(),
            cpf_limpo: cpfLimpo,
            contato: chaveContato ? String(linha[chaveContato]).trim() : ''
        });
    });

    const globalFields = document.getElementById('globalFields');
    if (globalFields) globalFields.classList.remove('hidden');
    renderizarTabelaPreview();
}

function renderizarTabelaPreview() {
    const tbody = document.getElementById('tableBody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    const totalLinhas = document.getElementById('totalLinhas');
    if (totalLinhas) totalLinhas.textContent = alunosParaImportar.length;
    
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
            buscarGrupos(); // Atualiza a lista de grupos automaticamente
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

// --- 2. LÓGICA DE GRUPOS ---

async function buscarGrupos() {
    const dataInicio = document.getElementById('filterDataInicio').value;
    if (!dataInicio) return alert('Selecione uma data.');

    toggleLoading(true, 'Buscando grupos...');
    try {
        const res = await fetch(`/api/embarque-lista?inicio=${dataInicio}`);
        const json = await res.json();
        if (json.status === 'sucesso') agruparDados(json.data);
        else alert('Erro ao buscar dados: ' + (json.message || 'Desconhecido'));
    } catch (e) { console.error(e); alert('Erro na busca.'); }
    finally { toggleLoading(false); }
}

function agruparDados(listaAlunos) {
    gruposEncontrados = {};
    listaAlunos.forEach(aluno => {
        // Normaliza dados para evitar undefined
        const idPasseioReal = aluno.idPasseio || aluno.id_passeio || 'S/ Passeio';
        const colegioReal = aluno.colegio || 'S/ Colégio';
        const onibusReal = aluno.onibus || '?';
        const dataReal = aluno.inicio_viagem || '';

        // Chave única para o grupo
        const chave = `${colegioReal}|${idPasseioReal}|${onibusReal}|${dataReal}`;
        
        if (!gruposEncontrados[chave]) {
            gruposEncontrados[chave] = {
                colegio: colegioReal,
                passeio: idPasseioReal, 
                onibus: onibusReal,
                data: dataReal,
                alunos: []
            };
        }
        gruposEncontrados[chave].alunos.push(aluno);
    });
    renderizarTabelaGrupos();
}

function renderizarTabelaGrupos() {
    const tbody = document.getElementById('listaGruposBody');
    if (!tbody) return;

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
                <td>${g.colegio}</td>
                <td>${g.passeio}</td>
                <td>${g.onibus}</td>
                <td>${g.data}</td>
                <td>${g.alunos.length}</td>
            </tr>
        `;
    });
}

function toggleSelectAll() {
    const master = document.getElementById('selectAll');
    document.querySelectorAll('.grupo-checkbox').forEach(c => c.checked = master.checked);
}

// --- 3. GERAÇÃO DE PDF COM QR CODE (CORRIGIDO E BLINDADO) ---

async function gerarPDFSelecionados() {
    const checkboxes = document.querySelectorAll('.grupo-checkbox:checked');
    if (checkboxes.length === 0) return alert('Selecione pelo menos um colégio/grupo.');

    // Status Facial
    const checkFacial = document.getElementById('checkFacial');
    const isFacialChecked = checkFacial ? checkFacial.checked : false;
    const facialVisual = isFacialChecked ? 'SIM' : 'NÃO';
    const facialQR = isFacialChecked ? 'sim' : 'não';
    
    toggleLoading(true, 'Gerando PDF...');

    if (typeof window.jspdf === 'undefined') {
        toggleLoading(false);
        return alert('Biblioteca jsPDF não carregada. Verifique sua internet ou imports.');
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    let totalPageCount = 0;

    for (const cb of checkboxes) {
        const grupo = gruposEncontrados[cb.value];
        
        if (!grupo) continue;

        // Adiciona nova página (exceto na primeira iteração)
        if (totalPageCount > 0) doc.addPage();
        totalPageCount++;
        
        const pageWidth = doc.internal.pageSize.getWidth();
        const centerX = pageWidth / 2;
        const centerY = doc.internal.pageSize.getHeight() / 2;

        // --- 1. ESCREVE O TEXTO PRIMEIRO (Para garantir que a página não fique vazia) ---
        
        // Título: Colégio
        doc.setFontSize(22);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(0); // Preto
        doc.text((grupo.colegio || 'S/ COLÉGIO').toUpperCase(), centerX, centerY - 60, { align: "center", maxWidth: 180 });
        
        // Subtítulo: Passeio
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text(grupo.passeio || 'S/ PASSEIO', centerX, centerY - 50, { align: "center", maxWidth: 180 });

        // Info Ônibus
        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.text(`ÔNIBUS: ${grupo.onibus || '-'}`, centerX, centerY + 65, { align: "center" });
        
        // Status Facial
        const txtFacialVisual = facialVisual === 'SIM' ? 'FACIAL: SIM ✅' : 'FACIAL: NÃO ❌';
        doc.setFontSize(12);
        doc.setFont("helvetica", "normal");
        doc.text(txtFacialVisual, centerX, centerY + 75, { align: "center" });

        // String para o QR Code
        const qrStringGroup = `${grupo.colegio || ''};${grupo.passeio || ''};${grupo.onibus || ''};${facialQR}`;
        
        // Texto legível abaixo da área do QR (Debug)
        doc.setFontSize(8); 
        doc.setTextColor(150); 
        doc.text(qrStringGroup, centerX, centerY + 50, { align: "center", maxWidth: 190 });

        // --- 2. TENTA GERAR E DESENHAR O QR CODE ---
        try {
            const groupQRBase64 = await gerarQRCodeBase64(qrStringGroup);
            
            if (groupQRBase64) {
                doc.addImage(groupQRBase64, 'PNG', centerX - 40, centerY - 40, 70, 80);
            } else {
                // Se retornar nulo mas sem erro
                doc.setTextColor(255, 0, 0);
                doc.text("QR Code não gerado (Timeout)", centerX, centerY, { align: "center" });
            }

        } catch (error) {
            console.error(`Erro QR no grupo ${grupo.colegio}:`, error);
            // Desenha aviso de erro no PDF para você saber o que houve
            doc.setTextColor(255, 0, 0); // Vermelho
            doc.setFontSize(10);
            doc.text("Erro ao gerar QR Code", centerX, centerY, { align: "center" });
        }
    }

    doc.save(`QRCodes_Onibus_Ellus_${new Date().toISOString().slice(0,10)}.pdf`);
    toggleLoading(false);
}

function gerarQRCodeBase64(text) {
    return new Promise((resolve, reject) => {
        // Cria elemento temporário
        const div = document.createElement('div');
        // Não use display:none, pois o canvas precisa ser renderizado
        div.style.position = 'absolute';
        div.style.left = '-9999px';
        div.style.top = '0px'; 
        document.body.appendChild(div);

        try {
            // Limpa caracteres problemáticos (acentos) para o gerador
            const safeText = unescape(encodeURIComponent(text));

            const qr = new QRCode(div, {
                text: safeText,
                width: 300,
                height: 300,
                correctLevel: QRCode.CorrectLevel.M
            });
            
            // Aumentei o tempo para 300ms para garantir que o navegador desenhe o canvas
            setTimeout(() => {
                let dataUrl = '';
                // Tenta pegar o canvas gerado pela lib
                const canvas = div.querySelector('canvas');
                
                if (canvas) {
                    dataUrl = canvas.toDataURL("image/png");
                    cleanup(div);
                    resolve(dataUrl);
                } else {
                    // Fallback para img
                    const img = div.querySelector('img');
                    if (img && img.src) {
                        dataUrl = img.src;
                        cleanup(div);
                        resolve(dataUrl);
                    } else {
                        cleanup(div);
                        console.warn('QRCode.js não criou o canvas a tempo.');
                        resolve(null); // Resolve com null em vez de travar
                    }
                }
            }, 10000);

        } catch (e) {
            cleanup(div);
            console.error(e);
            resolve(null); // Resolve com null para não quebrar o PDF
        }
    });
}

function cleanup(element) {
    if (document.body.contains(element)) {
        document.body.removeChild(element);
    }
}

function cleanup(element) {
    if (document.body.contains(element)) {
        document.body.removeChild(element);
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