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
    // Método 2: Application Default Credentials (automático no GCP)
    else if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GCP_PROJECT) {
      console.log('🔧 Inicializando Firebase com Application Default Credentials...');
      admin.initializeApp({
        projectId: process.env.GCP_PROJECT || process.env.FIREBASE_PROJECT_ID
      });
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
    // Erro: nenhuma credencial encontrada
    else {
      console.error('❌ ERRO: Nenhuma credencial Firebase encontrada!');
      console.error('Configure uma das seguintes opções:');
      console.error('1. Variáveis de ambiente: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY');
      console.error('2. GCP ADC: GOOGLE_APPLICATION_CREDENTIALS ou rode no GCP');
      console.error('3. Arquivo local: serviceAccountKey.json');
      process.exit(1);
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

// ✅ ROTA DE IMPORTAÇÃO (Salva na tabela 'embarques') [ATUALIZADA]
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

      // Referência à coleção 'embarques'
      const docRef = db.collection('embarques').doc(cpfLimpo);

      const agora = new Date();

      // Monta o objeto EXATAMENTE conforme a estrutura solicitada
      const dadosEmbarque = {
        Facial: "PENDENTE", // Default inicial
        facial_cadastrada: false, // Boolean
        
        colegio: aluno.colegio || '',
        cpf: cpfLimpo,
        
        nome: aluno.nome,
        turma: aluno.turma || '',
        
        idPasseio: aluno.id_passeio || '',
        onibus: aluno.onibus || '',
        
        // Formata datas para "DD/MM" se vierem no padrão ISO, ou salva como vier
        inicioViagem: formatarDataCurta(aluno.inicio_viagem),
        fimViagem: formatarDataCurta(aluno.fim_viagem),
        
        embarque: "", // String vazia
        retorno: "", // String vazia
        
        created_at: agora, // Timestamp
        updated_at: agora  // Timestamp
      };

      // Usa 'set' com merge para salvar
      return docRef.set(dadosEmbarque, { merge: true });
    });

    await Promise.all(promessas);

    res.json({ success: true, message: `${alunos.length} registros salvos na tabela 'embarques'.` });

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

// ✅ MOVIMENTAR (Mantém logs e atualiza status - Opcional: Atualizar 'embarques' também?)
app.post('/api/movimentar', async (req, res) => {
  // ... (código existente de movimentação mantido para lógica de quartos/logs) ...
  // Se a movimentação de embarque também for feita por aqui, avise para ajustarmos.
  try {
    const { cpf, novaLocalizacao, nome, colegio, turma, quarto, operador } = req.body;
    const timestamp = new Date().toISOString();
    const usuarioResp = operador || 'Sistema';

    console.log(`📍 Movimentando ${nome} -> ${novaLocalizacao}`);

    // Atualiza tabela 'alunos' (legado/quartos)
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
      cpf, nome, tipo: novaLocalizacao, movimentacao: novaLocalizacao,
      usuario: usuarioResp, operador: usuarioResp, timestamp, quarto
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
    const snapshot = await db.collection('alunos').get(); // Mantém leitura de alunos para quartos
    const pessoas = [];
    snapshot.forEach(doc => pessoas.push({ id: doc.id, ...doc.data() }));
    res.json({ success: true, data: pessoas });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

app.get('/api/quartos', async (req, res) => {
    try {
      const snapshot = await db.collection('quartos').get();
      const quartos = [];
      snapshot.forEach(doc => quartos.push(doc.data()));
      res.json({ success: true, data: quartos });
    } catch (e) { res.json({ success: true, data: [] }); }
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
    // Pode ler de 'embarques' agora para ser mais preciso sobre as viagens cadastradas
    try {
      const snapshot = await db.collection('embarques').get();
      const viagensMap = new Map();
      snapshot.forEach(doc => {
        const p = doc.data();
        if (p.inicioViagem && p.fimViagem) {
          const key = `${p.inicioViagem}|${p.fimViagem}`;
          if (!viagensMap.has(key)) {
            viagensMap.set(key, { 
                inicio_viagem: p.inicioViagem, 
                fim_viagem: p.fimViagem, 
                label: `${p.inicioViagem} até ${p.fimViagem}` 
            });
          }
        }
      });
      res.json({ success: true, data: Array.from(viagensMap.values()) });
    } catch (error) { res.status(500).json({ success: false }); }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Servidor (Firebase) rodando em http://localhost:${PORT}`);
});