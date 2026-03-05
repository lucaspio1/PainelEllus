let usuariosData = [];

document.addEventListener('DOMContentLoaded', () => {
    carregarUsuarios();

    // Máscara para CPF no Modal
    document.getElementById('inputCpf').addEventListener('input', (e) => {
        let value = e.target.value.replace(/\D/g, '');
        if (value.length <= 11) {
            value = value.replace(/(\d{3})(\d)/, '$1.$2');
            value = value.replace(/(\d{3})(\d)/, '$1.$2');
            value = value.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
            e.target.value = value;
        }
    });

    // Evento de Pesquisa Dinâmica
    const inputPesquisa = document.getElementById('pesquisaUsuario');
    if (inputPesquisa) {
        inputPesquisa.addEventListener('input', renderizarUsuarios);
    }
});

async function carregarUsuarios() {
    const loading = document.getElementById('loadingUsuarios');
    const tbody = document.getElementById('usuariosBody');

    loading.classList.remove('hidden');

    try {
        const res = await fetch('/api/usuarios');
        const json = await res.json();

        if (json.success) {
            usuariosData = json.data || [];
            renderizarUsuarios();
        } else {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:red;">Erro ao carregar usuários</td></tr>';
        }
    } catch (error) {
        console.error(error);
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:red;">Erro de conexão</td></tr>';
    } finally {
        loading.classList.add('hidden');
    }
}

function renderizarUsuarios() {
    const tbody = document.getElementById('usuariosBody');
    
    // Pega o valor digitado no campo de pesquisa
    const inputPesquisa = document.getElementById('pesquisaUsuario');
    const termo = inputPesquisa ? inputPesquisa.value.toLowerCase().trim() : '';
    const termoNumerico = termo.replace(/\D/g, ''); // Facilita buscar CPF apenas digitando números

    // Filtra os usuários dinamicamente
    const filtrados = usuariosData.filter(user => {
        const matchNome = (user.nome || '').toLowerCase().includes(termo);
        const matchCpfNumerico = termoNumerico.length > 0 && (user.cpf || '').includes(termoNumerico);
        const matchCpfFormatado = formatarCPF(user.cpf).includes(termo);

        return termo === '' || matchNome || matchCpfNumerico || matchCpfFormatado;
    });

    if (filtrados.length === 0) {
        if (usuariosData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 40px;">Nenhum usuário cadastrado no sistema</td></tr>';
        } else {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 40px;">Nenhum usuário encontrado na pesquisa</td></tr>';
        }
        return;
    }

    tbody.innerHTML = '';
    filtrados.forEach(user => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${user.nome}</strong></td>
            <td>${formatarCPF(user.cpf)}</td>
            <td><span class="badge-perfil">${user.perfil || 'USER'}</span></td>
            <td><span class="${user.ativo ? 'badge-ativo' : 'badge-inativo'}">${user.ativo ? 'Ativo' : 'Inativo'}</span></td>
            <td style="text-align:center">
                <button class="btn-icon edit" onclick='editarUsuario(${JSON.stringify(user)})' title="Editar">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-icon delete" onclick="excluirUsuario('${user.cpf}')" title="Excluir">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function renderizarUsuarios() {
    const tbody = document.getElementById('usuariosBody');

    if (usuariosData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 40px;">Nenhum usuário cadastrado</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    usuariosData.forEach(user => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${user.nome}</strong></td>
            <td>${formatarCPF(user.cpf)}</td>
            <td><span class="badge-perfil">${user.perfil || 'USER'}</span></td>
            <td><span class="${user.ativo ? 'badge-ativo' : 'badge-inativo'}">${user.ativo ? 'Ativo' : 'Inativo'}</span></td>
            <td style="text-align:center">
                <button class="btn-icon edit" onclick='editarUsuario(${JSON.stringify(user)})' title="Editar">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-icon delete" onclick="excluirUsuario('${user.cpf}')" title="Excluir">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function formatarCPF(cpf) {
    if (!cpf) return '';
    const cleaned = String(cpf).replace(/\D/g, '');
    return cleaned.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

function abrirModalNovo() {
    document.getElementById('modalTitle').textContent = 'Novo Usuário';
    document.getElementById('formUsuario').reset();
    document.getElementById('usuarioId').value = '';
    document.getElementById('inputSenha').required = true;
    document.getElementById('modalUsuario').style.display = 'flex';
}

function editarUsuario(user) {
    document.getElementById('modalTitle').textContent = 'Editar Usuário';
    document.getElementById('usuarioId').value = user.cpf;
    document.getElementById('inputNome').value = user.nome;
    document.getElementById('inputCpf').value = formatarCPF(user.cpf);
    document.getElementById('inputCpf').readOnly = true; // CPF não pode ser alterado
    document.getElementById('inputSenha').value = '';
    document.getElementById('inputSenha').placeholder = 'Deixe em branco para manter a senha atual';
    document.getElementById('inputSenha').required = false;
    document.getElementById('inputPerfil').value = user.perfil || 'USER';
    document.getElementById('inputAtivo').value = String(user.ativo !== false);
    document.getElementById('modalUsuario').style.display = 'flex';
}

function fecharModal() {
    document.getElementById('modalUsuario').style.display = 'none';
    document.getElementById('inputCpf').readOnly = false;
}

async function salvarUsuario(event) {
    event.preventDefault();

    const usuarioId = document.getElementById('usuarioId').value;
    const cpfLimpo = document.getElementById('inputCpf').value.replace(/\D/g, '');
    const senha = document.getElementById('inputSenha').value;

    if (!cpfLimpo || cpfLimpo.length !== 11) {
        return alert('CPF inválido. Digite os 11 dígitos.');
    }

    // Se for novo usuário, senha é obrigatória
    if (!usuarioId && !senha) {
        return alert('A senha é obrigatória para novos usuários.');
    }

    const dados = {
        cpf: cpfLimpo,
        nome: document.getElementById('inputNome').value.trim(),
        perfil: document.getElementById('inputPerfil').value,
        ativo: document.getElementById('inputAtivo').value === 'true'
    };

    // Só adiciona senha se foi preenchida
    if (senha) {
        if (senha.length < 4) {
            return alert('A senha deve ter no mínimo 4 caracteres.');
        }
        dados.senha = senha;
    }

    toggleLoading(true, usuarioId ? 'Atualizando usuário...' : 'Criando usuário...');

    try {
        const url = usuarioId ? `/api/usuarios/${cpfLimpo}` : '/api/usuarios';
        const method = usuarioId ? 'PUT' : 'POST';

        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados)
        });

        const json = await res.json();

        if (json.success) {
            alert('✅ Usuário salvo com sucesso!');
            fecharModal();
            carregarUsuarios();
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

async function excluirUsuario(cpf) {
    if (!confirm('⚠️ Tem certeza que deseja excluir este usuário?\n\nEsta ação não pode ser desfeita.')) {
        return;
    }

    toggleLoading(true, 'Excluindo usuário...');

    try {
        const res = await fetch(`/api/usuarios/${cpf}`, {
            method: 'DELETE'
        });

        const json = await res.json();

        if (json.success) {
            alert('✅ Usuário excluído com sucesso!');
            carregarUsuarios();
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
