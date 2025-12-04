require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const os = require('os');
const admin = require('firebase-admin');
const fs = require('fs');

// [FIREBASE] Inicialização com suporte a múltiplos ambientes
if (!admin.apps.length) {
  try {
    // Método 1: Variáveis de ambiente (recomendado para GCP)
    if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY) {
      console.log('🔧 Inicializando Firebase com variáveis de ambiente...');
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
        })
      });
      console.log('✅ Firebase conectado via variáveis de ambiente');
    }
    // Método 2: Cloud Run / GCP - Application Default Credentials (automático)
    else if (process.env.K_SERVICE || process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GCP_PROJECT) {
      console.log('🔧 Inicializando Firebase com Application Default Credentials (Cloud Run/GCP)...');
      const config = {};
      if (process.env.GCP_PROJECT || process.env.FIREBASE_PROJECT_ID) {
        config.projectId = process.env.GCP_PROJECT || process.env.FIREBASE_PROJECT_ID;
      }
      admin.initializeApp(config);
      console.log('✅ Firebase conectado via ADC (GCP)');
    }
    // Método 3: Arquivo serviceAccountKey.json (desenvolvimento local)
    else if (fs.existsSync('./serviceAccountKey.json')) {
      console.log('🔧 Inicializando Firebase com serviceAccountKey.json...');
      const serviceAccount = require('./serviceAccountKey.json');
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      console.log('✅ Firebase conectado via serviceAccountKey.json');
    }
    // Método 4: Tentar ADC como último recurso (para ambientes GCP sem variáveis configuradas)
    else {
      console.log('🔧 Tentando inicializar Firebase com Application Default Credentials...');
      try {
        admin.initializeApp();
        console.log('✅ Firebase conectado via ADC padrão');
      } catch (adcError) {
        console.error('❌ ERRO: Nenhuma credencial Firebase encontrada!');
        console.error('Configure uma das seguintes opções:');
        console.error('1. Variáveis de ambiente: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY');
        console.error('2. GCP ADC: GOOGLE_APPLICATION_CREDENTIALS ou rode no GCP');
        console.error('3. Arquivo local: serviceAccountKey.json');
        console.error('Erro ADC:', adcError.message);
        process.exit(1);
      }
    }
  } catch (error) {
    console.error('❌ Erro ao inicializar Firebase:', error.message);
    process.exit(1);
  }
}

const db = admin.firestore();
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- ROTAS DE NAVEGAÇÃO ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/home', (req, res) => res.sendFile(path.join(__dirname, 'public', 'home.html')));
app.get('/quartos', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/embarque', (req, res) => res.sendFile(path.join(__dirname, 'public', 'embarque.html')));
app.get('/importar', (req, res) => res.sendFile(path.join(__dirname, 'public', 'importar.html')));

// --- UTILITÁRIOS ---
function formatarDataPTBR(dataISO) {
  if (!dataISO) return '';
  try {
    const data = new Date(dataISO);
    if (isNaN(data.getTime())) return dataISO;
    const dia = String(data.getUTCDate()).padStart(2, '0');
    const mes = String(data.getUTCMonth() + 1).padStart(2, '0');
    const ano = data.getUTCFullYear();
    return `${dia}/${mes}/${ano}`;
  } catch (e) { return dataISO; }
}

// Helper para converter "2025-12-01" em "01/12" (Conforme exemplo)
function formatarDataCurta(dataISO) {
    if (!dataISO) return '';
    try {
        const parts = dataISO.split('-'); // Espera YYYY-MM-DD
        if(parts.length === 3) {
            return `${parts[2]}/${parts[1]}`; // Retorna DD/MM
        }
        return dataISO;
    } catch (e) { return dataISO; }
}

function formatarCPF(v) {
  if(!v) return '';
  v = String(v).replace(/\D/g, ''); 
  return v.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

// --- API ---

// ✅ LOGIN
app.post('/api/login', async (req, res) => {
  try {
    const { cpf, senha } = req.body;
    const snapshot = await db.collection('usuarios')
      .where('cpf', '==', cpf).limit(1).get();

    if (snapshot.empty) return res.status(401).json({ success: false, message: 'Usuário não encontrado.' });

    const userData = snapshot.docs[0].data();
    if (String(userData.senha) === String(senha)) {
      res.json({ success: true, user: { nome: userData.nome, perfil: userData.perfil || 'ADMIN', cpf: userData.cpf } });
    } else {
      res.status(401).json({ success: false, message: 'Senha incorreta.' });
    }
  } catch (error) {
    console.error('Erro Login:', error);
    res.status(500).json({ success: false, message: 'Erro no servidor.' });
  }
});

// ✅ ROTA DE IMPORTAÇÃO (Salva nas tabelas 'quartos', 'embarques' e 'alunos')
app.post('/api/importar', async (req, res) => {
  try {
    const { alunos } = req.body;

    if (!alunos || !Array.isArray(alunos)) {
      return res.status(400).json({ success: false, message: 'Dados inválidos.' });
    }

    const promessas = alunos.map(async (aluno) => {
      // Limpa CPF para usar como ID
      const cpfLimpo = String(aluno.cpf_limpo || aluno.cpf).replace(/\D/g, '');

      if (!cpfLimpo) return;

      const agora = new Date();

      // Salva em 'quartos' (dados de hospedagem)
      const quartoRef = db.collection('quartos').doc(cpfLimpo);
      const dadosQuarto = {
        colegio: aluno.colegio || '',
        cpf: cpfLimpo,
        nome_hospede: aluno.nome,
        numero_quarto: aluno.quarto || aluno.numero_quarto || '',
        inicio_viagem: formatarDataCurta(aluno.inicio_viagem),
        fim_viagem: formatarDataCurta(aluno.fim_viagem),
        created_at: agora,
        updated_at: agora
      };

      // Salva em 'alunos' (para controle de movimentação)
      const alunoRef = db.collection('alunos').doc(cpfLimpo);
      const dadosAluno = {
        colegio: aluno.colegio || '',
        cpf: cpfLimpo,
        nome: aluno.nome,
        turma: aluno.turma || '',
        email: aluno.email || '',
        telefone: aluno.telefone || '',
        inicio_viagem: formatarDataCurta(aluno.inicio_viagem),
        fim_viagem: formatarDataCurta(aluno.fim_viagem),
        movimentacao: 'QUARTO', // Status inicial
        facial_cadastrada: false,
        updated_at: agora
      };

      // Salva em 'embarques' (para controle de embarque/facial)
      const embarqueRef = db.collection('embarques').doc(cpfLimpo);
      const dadosEmbarque = {
        Facial: "PENDENTE",
        facial_cadastrada: false,
        colegio: aluno.colegio || '',
        cpf: cpfLimpo,
        nome: aluno.nome,
        turma: aluno.turma || '',
        idPasseio: aluno.id_passeio || '',
        onibus: aluno.onibus || '',
        inicioViagem: formatarDataCurta(aluno.inicio_viagem),
        fimViagem: formatarDataCurta(aluno.fim_viagem),
        embarque: "",
        retorno: "",
        created_at: agora,
        updated_at: agora
      };

      return Promise.all([
        quartoRef.set(dadosQuarto, { merge: true }),
        alunoRef.set(dadosAluno, { merge: true }),
        embarqueRef.set(dadosEmbarque, { merge: true })
      ]);
    });

    await Promise.all(promessas);

    res.json({ success: true, message: `${alunos.length} registros salvos nas tabelas 'quartos', 'alunos' e 'embarques'.` });

  } catch (error) {
    console.error('Erro na importação:', error);
    res.status(500).json({ success: false, message: 'Erro ao importar dados.' });
  }
});

// ✅ EMBARQUE LISTA (Lê da tabela 'embarques') [ATUALIZADA]
// ✅ EMBARQUE LISTA (Lê da tabela 'embarques' com filtros completos)
app.get('/api/embarque-lista', async (req, res) => {
  try {
    const { inicio, fim } = req.query;
    
    let query = db.collection('embarques');

    // 1. Filtro de Início de Viagem
    if (inicio) {
        const inicioCurto = formatarDataCurta(inicio); // Converte YYYY-MM-DD -> DD/MM
        query = query.where('inicioViagem', '==', inicioCurto);
    }

    // 2. Filtro de Fim de Viagem
    if (fim) {
        const fimCurto = formatarDataCurta(fim); // Converte YYYY-MM-DD -> DD/MM
        query = query.where('fimViagem', '==', fimCurto);
    }

    const snapshot = await query.get();
    const listaEmbarque = [];

    snapshot.forEach(doc => {
        const dados = doc.data();
        listaEmbarque.push({
            // Identificação
            cpf: dados.cpf,
            nome: dados.nome,
            rg: dados.cpf, // Usando CPF como RG para compatibilidade visual
            
            // Logística
            onibus: dados.onibus || '',
            poltrona: '', // Campo não existente na importação atual, envia vazio
            emissor: '',
            
            // Controle de Grupo (ESSENCIAIS PARA O QR CODE)
            idPasseio: dados.idPasseio || '', 
            colegio: dados.colegio || '', 
            
            // Status
            status_embarque: dados.embarque ? 'EMBARCADO' : 'PENDENTE',
            
            // Facial
            facial_cadastrada: dados.facial_cadastrada || false,
            status_facial: dados.Facial || 'PENDENTE',

            // Datas (cruas para debug ou exibição)
            inicio_viagem: dados.inicioViagem,
            fim_viagem: dados.fimViagem
        });
    });

    res.json({ status: 'sucesso', data: listaEmbarque });

  } catch (error) {
    console.error('Erro API Embarque:', error.message);
    res.status(500).json({ status: 'erro', mensagem: 'Erro ao buscar dados de embarque.' });
  }
});

// ✅ MOVIMENTAR (Mantém logs e atualiza status)
app.post('/api/movimentar', async (req, res) => {
  try {
    const { cpf, novaLocalizacao, nome, nome_hospede, colegio, turma, quarto, numero_quarto, operador } = req.body;
    const timestamp = new Date().toISOString();
    const usuarioResp = operador || 'Sistema';

    const nomeAluno = nome_hospede || nome;
    const numeroQuarto = numero_quarto || quarto;

    console.log(`📍 Movimentando ${nomeAluno} -> ${novaLocalizacao}`);

    // Atualiza tabela 'alunos'
    const alunosRef = db.collection('alunos');
    const snapshot = await alunosRef.where('cpf', '==', cpf).limit(1).get();

    if (!snapshot.empty) {
        await snapshot.docs[0].ref.update({
            movimentacao: novaLocalizacao,
            updated_at: timestamp,
            ultimo_usuario: usuarioResp
        });
    }

    // Cria Log
    await db.collection('logs').add({
      cpf,
      nome: nomeAluno,
      nome_hospede: nomeAluno,
      tipo: novaLocalizacao,
      movimentacao: novaLocalizacao,
      usuario: usuarioResp,
      operador: usuarioResp,
      timestamp,
      quarto: numeroQuarto,
      numero_quarto: numeroQuarto
    });

    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false });
  }
});

// ✅ OUTRAS ROTAS (Quartos, Viagens, Logs, Pessoas) MANTIDAS
app.get('/api/pessoas', async (req, res) => {
  try {
    // Busca dados das duas coleções em paralelo (otimizado)
    const [quartosSnapshot, alunosSnapshot] = await Promise.all([
      db.collection('quartos').get(),
      db.collection('alunos').get()
    ]);

    // Cria um mapa de movimentações por CPF para lookup rápido
    const movimentacoesPorCpf = new Map();
    alunosSnapshot.forEach(doc => {
      const data = doc.data();
      movimentacoesPorCpf.set(data.cpf, data.movimentacao || 'QUARTO');
    });

    // Combina dados de quartos com movimentação
    const pessoas = [];
    quartosSnapshot.forEach(doc => {
      const quarto = doc.data();
      const movimentacao = movimentacoesPorCpf.get(quarto.cpf) || 'QUARTO';

      pessoas.push({
        id: doc.id,
        cpf: quarto.cpf,
        nome: quarto.nome_hospede,
        nome_hospede: quarto.nome_hospede,
        colegio: quarto.colegio,
        turma: quarto.turma || '',
        quarto: quarto.numero_quarto,
        numero_quarto: quarto.numero_quarto,
        inicio_viagem: quarto.inicio_viagem,
        fim_viagem: quarto.fim_viagem,
        movimentacao: movimentacao,
        created_at: quarto.created_at,
        updated_at: quarto.updated_at
      });
    });

    res.json({ success: true, data: pessoas });
  } catch (e) {
    console.error('Erro em /api/pessoas:', e);
    res.status(500).json({ success: false, message: e.message });
  }
});

app.get('/api/quartos', async (req, res) => {
    try {
      // Busca dados das duas coleções em paralelo
      const [quartosSnapshot, alunosSnapshot] = await Promise.all([
        db.collection('quartos').get(),
        db.collection('alunos').get()
      ]);

      // Cria mapa de movimentações por CPF
      const movimentacoesPorCpf = new Map();
      alunosSnapshot.forEach(doc => {
        const data = doc.data();
        movimentacoesPorCpf.set(data.cpf, data.movimentacao || 'VOLTOU_AO_QUARTO');
      });

      // Retorna todos os dados dos alunos por quarto
      const todosQuartos = [];
      quartosSnapshot.forEach(doc => {
        const quarto = doc.data();
        const movimentacao = movimentacoesPorCpf.get(quarto.cpf) || 'VOLTOU_AO_QUARTO';

        todosQuartos.push({
          'Quarto': quarto.numero_quarto || '',
          'quarto': quarto.numero_quarto || '',
          'Nome do Hóspede': quarto.nome_hospede || '',
          'Nome': quarto.nome_hospede || '',
          'nome': quarto.nome_hospede || '',
          'Escola': quarto.colegio || '',
          'escola': quarto.colegio || '',
          'CPF': quarto.cpf || '',
          'cpf': quarto.cpf || '',
          'movimentacao': movimentacao,
          'inicio_viagem': quarto.inicio_viagem || '',
          'fim_viagem': quarto.fim_viagem || ''
        });
      });

      res.json({ success: true, data: todosQuartos });
    } catch (e) {
      console.error('Erro ao buscar quartos:', e);
      res.json({ success: true, data: [] });
    }
});

app.get('/api/logs', async (req, res) => {
    try {
      const { cpf } = req.query;
      let query = db.collection('logs').orderBy('timestamp', 'desc');
      if (cpf) {
        const cpfRaw = String(cpf);
        const cpfLimpo = cpfRaw.replace(/\D/g, '');
        const cpfFormatado = formatarCPF(cpfLimpo);
        const termosBusca = [...new Set([cpfRaw, cpfLimpo, cpfFormatado])].filter(t => t.length > 0);
        query = query.where('cpf', 'in', termosBusca);
      } else {
        query = query.limit(100);
      }
      const snapshot = await query.get();
      const logs = [];
      snapshot.forEach(doc => logs.push(doc.data()));
      res.json({ success: true, data: logs });
    } catch (error) { res.status(500).json({ success: false }); }
});

app.get('/api/viagens', async (req, res) => {
    // Lê de 'quartos' para pegar as viagens cadastradas
    try {
      const snapshot = await db.collection('quartos').get();
      const viagensMap = new Map();

      snapshot.forEach(doc => {
        const q = doc.data();
        const inicio = q.inicio_viagem;
        const fim = q.fim_viagem;

        if (inicio && fim) {
          const key = `${inicio}|${fim}`;
          if (!viagensMap.has(key)) {
            viagensMap.set(key, {
                inicio_viagem: inicio,
                fim_viagem: fim,
                label: `${inicio} até ${fim}`
            });
          }
        }
      });

      res.json({ success: true, data: Array.from(viagensMap.values()) });
    } catch (error) {
      console.error('Erro ao buscar viagens:', error);
      res.status(500).json({ success: false });
    }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Servidor (Firebase) rodando em http://localhost:${PORT}`);
});