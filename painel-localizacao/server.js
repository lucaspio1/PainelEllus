require('dotenv').config();

const http = require('http');
const { Server } = require("socket.io");
const express = require('express');
const cors = require('cors');
const path = require('path');
const os = require('os');
const admin = require('firebase-admin');
const fs = require('fs');
const bcrypt = require('bcryptjs');

// Módulos internos (novos)
const { dataStore, getAll, getById, getByFilter, getChangedSince, stats, addLog, clearCollection } = require('./store/dataStore');
const { authMiddleware, requireAdmin, generateToken } = require('./middleware/auth');
const { setupFirestoreListeners } = require('./store/firestoreListeners');

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
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

// Log de diagnóstico para debug
console.log('🔍 Diagnóstico de Ambiente:');
console.log('- PORT:', PORT);
console.log('- NODE_ENV:', process.env.NODE_ENV);
console.log('- K_SERVICE:', process.env.K_SERVICE || 'não definido (não está no Cloud Run)');
console.log('- GCP_PROJECT:', process.env.GCP_PROJECT || 'não definido');
console.log('- FIREBASE_PROJECT_ID:', process.env.FIREBASE_PROJECT_ID || 'não definido');
console.log('- Firebase App inicializado:', admin.apps.length > 0 ? 'SIM' : 'NÃO');
console.log('- JWT_SECRET:', process.env.JWT_SECRET ? 'CONFIGURADO ✓' : '⚠️ NÃO DEFINIDO');

app.use(cors());
app.use(express.json({ limit: '10mb' })); // Aumento do limite para batch uploads
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================================
// INICIALIZAR CACHE — Listeners do Firestore → RAM
// ==========================================================
setupFirestoreListeners(db, io);

// ==========================================================
// HEALTH CHECK (sem autenticação)
// ==========================================================
app.get('/health', async (req, res) => {
  try {
    const storeStats = stats();
    res.json({
      status: 'healthy',
      firebase: 'connected',
      cache: storeStats,
      timestamp: new Date().toISOString(),
      environment: {
        port: PORT,
        k_service: process.env.K_SERVICE || 'local',
        gcp_project: process.env.GCP_PROJECT || 'not set',
        firebase_project: process.env.FIREBASE_PROJECT_ID || 'not set'
      }
    });
  } catch (error) {
    console.error('❌ Health check falhou:', error);
    res.status(503).json({
      status: 'unhealthy',
      firebase: 'disconnected',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ==========================================================
// ROTAS DE NAVEGAÇÃO (sem autenticação — servem HTML)
// ==========================================================
app.get('/', (req, res) => res.redirect('/login'));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/home', (req, res) => res.sendFile(path.join(__dirname, 'public', 'home.html')));
app.get('/quartos', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/embarque', (req, res) => res.sendFile(path.join(__dirname, 'public', 'embarque.html')));
app.get('/importar', (req, res) => res.sendFile(path.join(__dirname, 'public', 'importar.html')));
app.get('/usuarios', (req, res) => res.sendFile(path.join(__dirname, 'public', 'usuarios.html')));
app.get('/homelist', (req, res) => res.sendFile(path.join(__dirname, 'public', 'homelist.html')));

// ==========================================================
// UTILITÁRIOS
// ==========================================================
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

/**
 * Migração gradual de senha texto puro → bcrypt.
 * Se a senha armazenada não começa com '$2a$' ou '$2b$', é texto puro.
 */
async function verificarSenha(senhaDigitada, senhaArmazenada) {
  // Se já é hash bcrypt
  if (senhaArmazenada && (senhaArmazenada.startsWith('$2a$') || senhaArmazenada.startsWith('$2b$'))) {
    return bcrypt.compare(senhaDigitada, senhaArmazenada);
  }
  // Texto puro — comparação direta
  return String(senhaDigitada) === String(senhaArmazenada);
}

/**
 * Migra senha de texto puro para bcrypt no Firestore (chamado após login bem-sucedido).
 */
async function migrarSenhaParaBcrypt(cpf, senhaTextoPlano) {
  try {
    const hash = await bcrypt.hash(senhaTextoPlano, 10);
    await db.collection('usuarios').doc(cpf).update({ senha: hash });
    // Atualiza o cache em memória também
    const usuario = dataStore.usuarios.get(cpf);
    if (usuario) {
      usuario.senha = hash;
      usuario.updated_at = new Date().toISOString();
      dataStore.usuarios.set(cpf, usuario);
    }
    console.log(`🔒 Senha migrada para bcrypt: ${cpf}`);
  } catch (error) {
    console.error(`⚠️ Erro ao migrar senha para bcrypt (${cpf}):`, error.message);
  }
}

// ==========================================================
// API — LOGIN (sem authMiddleware — é o ponto de entrada)
// ==========================================================

// ✅ LOGIN do Painel Web
app.post('/api/login', async (req, res) => {
  try {
    const { cpf, senha } = req.body;
    
    // Busca primeiro no cache RAM
    let userData = null;
    let cpfLimpo = String(cpf).replace(/\D/g, '');
    
    // Tentar buscar direto pelo CPF como ID
    userData = dataStore.usuarios.get(cpfLimpo);
    
    // Se não encontrou, buscar pelo campo cpf
    if (!userData) {
      const found = getByFilter('usuarios', u => u.cpf === cpfLimpo || u.cpf === cpf);
      if (found.length > 0) userData = found[0];
    }

    // Se cache está vazio (servidor acabou de iniciar), buscar no Firestore
    if (!userData) {
      const snapshot = await db.collection('usuarios')
        .where('cpf', '==', cpfLimpo).limit(1).get();
      if (!snapshot.empty) {
        userData = snapshot.docs[0].data();
        cpfLimpo = snapshot.docs[0].id;
      }
    }

    if (!userData) {
      return res.status(401).json({ success: false, message: 'Usuário não encontrado.' });
    }

    const senhaCorreta = await verificarSenha(senha, userData.senha);
    if (!senhaCorreta) {
      return res.status(401).json({ success: false, message: 'Senha incorreta.' });
    }

    // Migrar senha para bcrypt se ainda estiver em texto puro
    if (userData.senha && !userData.senha.startsWith('$2a$') && !userData.senha.startsWith('$2b$')) {
      migrarSenhaParaBcrypt(cpfLimpo, senha); // fire-and-forget
    }

    // Gerar JWT
    const token = generateToken({ 
      cpf: userData.cpf || cpfLimpo, 
      perfil: userData.perfil || 'ADMIN', 
      nome: userData.nome 
    });

    res.json({ 
      success: true, 
      token,
      user: { 
        nome: userData.nome, 
        perfil: userData.perfil || 'ADMIN', 
        cpf: userData.cpf || cpfLimpo 
      } 
    });
  } catch (error) {
    console.error('Erro Login:', error);
    res.status(500).json({ success: false, message: 'Erro no servidor.' });
  }
});

// ==========================================================
// API — MOBILE AUTH (sem authMiddleware — é o ponto de entrada)
// ==========================================================

// ✅ LOGIN do App Mobile
app.post('/api/mobile/auth', async (req, res) => {
  try {
    const { cpf, senha } = req.body;
    const cpfLimpo = String(cpf).replace(/\D/g, '');
    
    // Buscar no cache
    let userData = dataStore.usuarios.get(cpfLimpo);
    if (!userData) {
      const found = getByFilter('usuarios', u => u.cpf === cpfLimpo);
      if (found.length > 0) userData = found[0];
    }

    // Fallback Firestore (cache vazio)
    if (!userData) {
      const snapshot = await db.collection('usuarios')
        .where('cpf', '==', cpfLimpo).limit(1).get();
      if (!snapshot.empty) userData = snapshot.docs[0].data();
    }

    if (!userData) {
      return res.status(401).json({ success: false, message: 'Usuário não encontrado.' });
    }

    const senhaCorreta = await verificarSenha(senha, userData.senha);
    if (!senhaCorreta) {
      return res.status(401).json({ success: false, message: 'Senha incorreta.' });
    }

    // Migrar senha para bcrypt se necessário
    if (userData.senha && !userData.senha.startsWith('$2a$') && !userData.senha.startsWith('$2b$')) {
      migrarSenhaParaBcrypt(cpfLimpo, senha);
    }

    const token = generateToken({ 
      cpf: userData.cpf || cpfLimpo, 
      perfil: userData.perfil || 'USER', 
      nome: userData.nome 
    });

    res.json({ 
      success: true, 
      token,
      user: { 
        nome: userData.nome, 
        perfil: userData.perfil || 'USER', 
        cpf: userData.cpf || cpfLimpo
      }
    });
  } catch (error) {
    console.error('Erro Login Mobile:', error);
    res.status(500).json({ success: false, message: 'Erro no servidor.' });
  }
});

// ==========================================================
// API — MOBILE SYNC (protegidas por authMiddleware)
// ==========================================================

// ✅ SYNC DELTA — App baixa apenas o que mudou desde a última sync
app.get('/api/mobile/sync', authMiddleware, (req, res) => {
  try {
    const since = req.query.since || '1970-01-01T00:00:00.000Z';
    const delta = {};
    
    ['alunos', 'quartos', 'embarques', 'eventos'].forEach(col => {
      const changed = getChangedSince(col, since);
      if (changed.length > 0) {
        // Para usuarios, remover campo senha antes de enviar
        if (col === 'usuarios') {
          delta[col] = changed.map(u => {
            const { senha, ...safe } = u;
            return safe;
          });
        } else {
          delta[col] = changed;
        }
      }
    });

    const storeStats = stats();
    console.log(`📡 Delta sync: ${Object.values(delta).reduce((acc, arr) => acc + arr.length, 0)} docs alterados enviados para [${req.user.cpf}]`);

    res.json({ 
      success: true, 
      serverTime: new Date().toISOString(), 
      delta,
      stats: storeStats
    });
  } catch (error) {
    console.error('Erro sync delta:', error);
    res.status(500).json({ success: false, message: 'Erro na sincronização.' });
  }
});

// ✅ UPLOAD BATCH — App envia operações offline acumuladas
app.post('/api/mobile/sync/upload', authMiddleware, async (req, res) => {
  try {
    const { operations } = req.body;
    
    if (!operations || !Array.isArray(operations)) {
      return res.status(400).json({ success: false, message: 'Campo operations é obrigatório (array).' });
    }

    const results = [];
    const timestamp = new Date().toISOString();
    
    // Processar em batches do Firestore (max 500 ops por commit)
    const batchSize = 500;
    for (let i = 0; i < operations.length; i += batchSize) {
      const chunk = operations.slice(i, i + batchSize);
      const batch = db.batch();
      
      for (const op of chunk) {
        try {
          switch (op.type) {
            case 'log': {
              const logRef = db.collection('logs').doc();
              const logData = {
                ...op.data,
                timestamp: op.data.timestamp || timestamp,
                synced_from: 'mobile',
                synced_by: req.user.cpf
              };
              batch.set(logRef, logData);
              addLog({ id: logRef.id, ...logData }); // Atualiza cache RAM
              results.push({ id: op.id, status: 'ok' });
              break;
            }
            case 'movimentacao': {
              const cpf = String(op.data.cpf).replace(/\D/g, '');
              const alunoRef = db.collection('alunos').doc(cpf);
              const updateData = {
                movimentacao: op.data.movimentacao || op.data.novaLocalizacao,
                updated_at: timestamp,
                ultimo_usuario: op.data.operador || req.user.nome
              };
              batch.update(alunoRef, updateData);
              
              // Atualiza cache RAM
              const aluno = dataStore.alunos.get(cpf);
              if (aluno) {
                Object.assign(aluno, updateData);
                dataStore.alunos.set(cpf, aluno);
              }
              
              // ✅ CORREÇÃO: Removido log duplicado de movimentação.
              // O mobile já envia uma operação 'log' separada para cada evento.
              // Criar outro log aqui duplicava as escritas no Firestore e
              // disparava os onSnapshot listeners desnecessariamente.
              
              results.push({ id: op.id, status: 'ok' });
              break;
            }
            case 'embedding': {
              const cpf = String(op.data.cpf).replace(/\D/g, '');
              const alunoRef = db.collection('alunos').doc(cpf);
              const embData = {
                embedding: op.data.embedding,
                facial_cadastrada: true,
                updated_at: timestamp
              };
              batch.set(alunoRef, embData, { merge: true });
              
              // Atualiza cache RAM
              const aluno = dataStore.alunos.get(cpf);
              if (aluno) {
                Object.assign(aluno, embData);
                dataStore.alunos.set(cpf, aluno);
              }
              
              // Atualizar embarque também
              const embRef = db.collection('embarques').doc(cpf);
              batch.set(embRef, { 
                Facial: 'CADASTRADA', 
                facial_cadastrada: true,
                updated_at: timestamp
              }, { merge: true });
              
              const embarque = dataStore.embarques.get(cpf);
              if (embarque) {
                embarque.Facial = 'CADASTRADA';
                embarque.facial_cadastrada = true;
                embarque.updated_at = timestamp;
                dataStore.embarques.set(cpf, embarque);
              }
              
              results.push({ id: op.id, status: 'ok' });
              break;
            }
            case 'embarque': {
              const cpf = String(op.data.cpf).replace(/\D/g, '');
              const embRef = db.collection('embarques').doc(cpf);
              const embData = { 
                ...op.data, 
                updated_at: timestamp 
              };
              delete embData.cpf; // CPF já é o ID do doc
              batch.set(embRef, embData, { merge: true });
              
              const embarque = dataStore.embarques.get(cpf);
              if (embarque) {
                Object.assign(embarque, embData);
                dataStore.embarques.set(cpf, embarque);
              }
              
              results.push({ id: op.id, status: 'ok' });
              break;
            }
            default:
              results.push({ id: op.id, status: 'error', message: `Tipo desconhecido: ${op.type}` });
          }
        } catch (opError) {
          results.push({ id: op.id, status: 'error', message: opError.message });
        }
      }
      
      await batch.commit();
    }

    // ✅ CORREÇÃO: Removido `dataStore.lastUpdate.alunos/embarques = timestamp`
    // O onSnapshot dos listeners já atualiza o lastUpdate naturalmente quando
    // o Firestore confirma as escritas. Atualizar aqui incondicionalmente fazia
    // com que TODA chamada de delta sync retornasse a coleção INTEIRA como "alterada",
    // gerando centenas de milhares de leituras desnecessárias por dia.

    console.log(`📥 Upload batch: ${operations.length} operações processadas de [${req.user.cpf}]`);
    res.json({ success: true, results, serverTime: timestamp });
  } catch (error) {
    console.error('Erro upload batch:', error);
    res.status(500).json({ success: false, message: 'Erro ao processar operações.' });
  }
});

// ✅ ALUNOS POR VIAGEM (para o app mobile)
app.get('/api/mobile/alunos', authMiddleware, (req, res) => {
  try {
    const { colegio, inicio } = req.query;
    let result = getAll('alunos');
    
    if (colegio) {
      result = result.filter(a => a.colegio === colegio);
    }
    if (inicio) {
      result = result.filter(a => a.inicio_viagem === inicio);
    }

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ✅ EMBARQUES POR VIAGEM (para o app mobile)
app.get('/api/mobile/embarques', authMiddleware, (req, res) => {
  try {
    const { colegio, inicio, idPasseio, onibus } = req.query;
    let result = getAll('embarques');
    
    if (colegio) result = result.filter(e => e.colegio === colegio);
    if (inicio) result = result.filter(e => e.inicioViagem === inicio);
    if (idPasseio) result = result.filter(e => e.idPasseio === idPasseio);
    if (onibus) result = result.filter(e => e.onibus === onibus);

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================================
// API — PAINEL WEB (protegidas por authMiddleware)
// ==========================================================

// ✅ ROTA DE IMPORTAÇÃO (Salva nas tabelas 'quartos', 'embarques' e 'alunos')
app.post('/api/importar', authMiddleware, async (req, res) => {
  try {
    const { alunos } = req.body;

    if (!alunos || !Array.isArray(alunos)) {
      return res.status(400).json({ success: false, message: 'Dados inválidos.' });
    }

    const promessas = alunos.map(async (aluno) => {
      const cpfLimpo = String(aluno.cpf_limpo || aluno.cpf).replace(/\D/g, '');
      if (!cpfLimpo) return;

      const agora = new Date();
      const timestamp = agora.toISOString();

      // Verifica se o campo 'facial' na planilha é true ou o texto "sim"
      const isFacial = aluno.facial === true || 
                       (aluno.facial && String(aluno.facial).toLowerCase() === 'sim');

      // Salva em 'quartos'
      const quartoRef = db.collection('quartos').doc(cpfLimpo);
      const dadosQuarto = {
        colegio: aluno.colegio || '',
        cpf: cpfLimpo,
        nome_hospede: aluno.nome,
        numero_quarto: aluno.quarto || aluno.numero_quarto || '',
        inicio_viagem: formatarDataCurta(aluno.inicio_viagem),
        fim_viagem: formatarDataCurta(aluno.fim_viagem),
        facial: isFacial,
        created_at: agora,
        updated_at: timestamp
      };

      // Salva em 'alunos'
      const alunoRef = db.collection('alunos').doc(cpfLimpo);
      const dadosAluno = {
        colegio: aluno.colegio || '',
        cpf: cpfLimpo,
        nome: aluno.nome,
        turma: aluno.turma || '',
        inicio_viagem: formatarDataCurta(aluno.inicio_viagem),
        fim_viagem: formatarDataCurta(aluno.fim_viagem),
        movimentacao: 'QUARTO',
        facial: isFacial,
        updated_at: timestamp
      };

      const embarqueRef = db.collection('embarques').doc(cpfLimpo);
      const cleanString = (str) => str ? String(str).trim().replace(/\s+/g, ' ') : '';

      const dadosEmbarque = {
        Facial: "PENDENTE",
        facial_cadastrada: false,
        colegio: cleanString(aluno.colegio),
        cpf: cpfLimpo,
        nome: cleanString(aluno.nome),
        turma: cleanString(aluno.turma),
        idPasseio: cleanString(aluno.id_passeio),
        onibus: cleanString(aluno.onibus),
        inicioViagem: formatarDataCurta(aluno.inicio_viagem),
        fimViagem: formatarDataCurta(aluno.fim_viagem),
        embarque: "",
        retorno: "",
        created_at: agora,
        updated_at: timestamp
      };

      // Atualiza cache RAM imediatamente
      dataStore.quartos.set(cpfLimpo, { id: cpfLimpo, ...dadosQuarto });
      dataStore.alunos.set(cpfLimpo, { id: cpfLimpo, ...dadosAluno });
      dataStore.embarques.set(cpfLimpo, { id: cpfLimpo, ...dadosEmbarque });

      return Promise.all([
        quartoRef.set(dadosQuarto, { merge: true }),
        alunoRef.set(dadosAluno, { merge: true }),
        embarqueRef.set(dadosEmbarque, { merge: true })
      ]);
    });

    await Promise.all(promessas);
    
    const ts = new Date().toISOString();
    dataStore.lastUpdate.quartos = ts;
    dataStore.lastUpdate.alunos = ts;
    dataStore.lastUpdate.embarques = ts;

    res.json({ success: true, message: `${alunos.length} registros processados.` });

  } catch (error) {
    console.error('Erro na importação:', error);
    res.status(500).json({ success: false, message: 'Erro ao importar dados.' });
  }
});

// ✅ EMBARQUE LISTA (Lê do cache RAM)
app.get('/api/embarque-lista', authMiddleware, async (req, res) => {
  try {
    const { inicio, fim } = req.query;
    
    let embarques = getAll('embarques');

    // Filtros
    if (inicio) {
      const inicioCurto = formatarDataCurta(inicio);
      embarques = embarques.filter(e => e.inicioViagem === inicioCurto);
    }
    if (fim) {
      const fimCurto = formatarDataCurta(fim);
      embarques = embarques.filter(e => e.fimViagem === fimCurto);
    }

    const listaEmbarque = embarques.map(dados => ({
      cpf: dados.cpf,
      nome: dados.nome,
      rg: dados.cpf,
      turma: dados.turma || '',
      onibus: dados.onibus || '',
      poltrona: '',
      emissor: '',
      idPasseio: dados.idPasseio || '',
      colegio: dados.colegio || '',
      embarque: dados.embarque || '',
      retorno: dados.retorno || '',
      status_embarque: dados.embarque ? 'EMBARCADO' : 'PENDENTE',
      facial_cadastrada: dados.facial_cadastrada || false,
      status_facial: dados.Facial || 'PENDENTE',
      inicio_viagem: dados.inicioViagem,
      fim_viagem: dados.fimViagem
    }));

    res.json({ status: 'sucesso', passageiros: listaEmbarque });

  } catch (error) {
    console.error('Erro API Embarque:', error.message);
    res.status(500).json({ status: 'erro', mensagem: 'Erro ao buscar dados de embarque.' });
  }
});

// ✅ MOVIMENTAR (Mantém logs e atualiza status)
app.post('/api/movimentar', authMiddleware, async (req, res) => {
  try {
    const { cpf, novaLocalizacao, nome, nome_hospede, colegio, turma, quarto, numero_quarto, operador } = req.body;
    const timestamp = new Date().toISOString();
    const usuarioResp = operador || req.user.nome || 'Sistema';

    const nomeAluno = nome_hospede || nome;
    const numeroQuarto = numero_quarto || quarto;

    console.log(`📍 Movimentando ${nomeAluno} -> ${novaLocalizacao}`);

    // Atualiza tabela 'alunos' no Firestore
    const cpfLimpo = String(cpf).replace(/\D/g, '');
    const alunosRef = db.collection('alunos');
    const snapshot = await alunosRef.where('cpf', '==', cpfLimpo).limit(1).get();

    if (!snapshot.empty) {
        await snapshot.docs[0].ref.update({
            movimentacao: novaLocalizacao,
            updated_at: timestamp,
            ultimo_usuario: usuarioResp
        });
    }

    // Atualiza cache RAM
    const alunoCache = dataStore.alunos.get(cpfLimpo);
    if (alunoCache) {
      alunoCache.movimentacao = novaLocalizacao;
      alunoCache.updated_at = timestamp;
      alunoCache.ultimo_usuario = usuarioResp;
      dataStore.alunos.set(cpfLimpo, alunoCache);
    }

    // Cria Log
    const logData = {
      cpf: cpfLimpo,
      nome: nomeAluno,
      nome_hospede: nomeAluno,
      tipo: novaLocalizacao,
      movimentacao: novaLocalizacao,
      usuario: usuarioResp,
      operador: usuarioResp,
      timestamp,
      quarto: numeroQuarto,
      numero_quarto: numeroQuarto
    };
    const logRef = await db.collection('logs').add(logData);
    addLog({ id: logRef.id, ...logData });

    dataStore.lastUpdate.alunos = timestamp;

    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false });
  }
});

// ✅ PESSOAS (Lê do cache RAM)
app.get('/api/pessoas', authMiddleware, (req, res) => {
  try {
    console.log('⚡ Retornando /api/pessoas do CACHE em memória');
    
    // Filtra apenas alunos com facial === true
    const quartosComFacial = getByFilter('quartos', q => q.facial === true);
    const alunosComFacial = getByFilter('alunos', a => a.facial === true);

    // Cria mapa de movimentações
    const movimentacoesPorCpf = new Map();
    alunosComFacial.forEach(a => {
      movimentacoesPorCpf.set(a.cpf, a.movimentacao || 'QUARTO');
    });

    const pessoas = quartosComFacial.map(quarto => {
      const movimentacao = movimentacoesPorCpf.get(quarto.cpf) || 'QUARTO';
      return {
        id: quarto.id,
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
      };
    });

    res.json({ success: true, data: pessoas });
  } catch (e) {
    console.error('Erro em /api/pessoas:', e);
    res.status(500).json({ success: false, message: e.message });
  }
});

// ✅ QUARTOS (Lê do cache RAM)
app.get('/api/quartos', authMiddleware, (req, res) => {
    try {
      const quartosComFacial = getByFilter('quartos', q => q.facial === true);
      const alunosComFacial = getByFilter('alunos', a => a.facial === true);

      const movimentacoesPorCpf = new Map();
      alunosComFacial.forEach(a => {
        movimentacoesPorCpf.set(a.cpf, a.movimentacao || 'VOLTOU_AO_QUARTO');
      });

      const todosQuartos = quartosComFacial.map(quarto => {
        const movimentacao = movimentacoesPorCpf.get(quarto.cpf) || 'VOLTOU_AO_QUARTO';
        return {
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
        };
      });

      res.json({ success: true, data: todosQuartos });
    } catch (e) {
      console.error('Erro ao buscar quartos:', e);
      res.json({ success: true, data: [] });
    }
});

// ✅ LOGS (Lê do cache RAM, com filtro por CPF)
app.get('/api/logs', authMiddleware, (req, res) => {
    try {
      const { cpf } = req.query;
      let logsResult;

      if (cpf) {
        const cpfRaw = String(cpf);
        const cpfLimpo = cpfRaw.replace(/\D/g, '');
        const cpfFormatado = formatarCPF(cpfLimpo);
        const termosBusca = [...new Set([cpfRaw, cpfLimpo, cpfFormatado])].filter(t => t.length > 0);
        
        logsResult = getByFilter('logs', log => 
          termosBusca.some(t => String(log.cpf) === t)
        );
      } else {
        logsResult = getAll('logs').slice(0, 100);
      }

      // Ordenar por timestamp desc
      logsResult.sort((a, b) => {
        const tA = new Date(a.timestamp || 0).getTime();
        const tB = new Date(b.timestamp || 0).getTime();
        return tB - tA;
      });

      res.json({ success: true, data: logsResult });
    } catch (error) { 
      console.error('Erro em /api/logs:', error);
      res.status(500).json({ success: false }); 
    }
});

// ✅ VIAGENS (Lê do cache RAM)
app.get('/api/viagens', authMiddleware, (req, res) => {
    try {
      const quartos = getAll('quartos');
      const viagensMap = new Map();

      quartos.forEach(q => {
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

// ==========================================================
// API DE USUÁRIOS (protegidas por authMiddleware + requireAdmin)
// ==========================================================

// Listar todos os usuários
app.get('/api/usuarios', authMiddleware, requireAdmin, (req, res) => {
  try {
    const usuarios = getAll('usuarios').map(u => {
      // Nunca enviar senhas para o frontend
      const { senha, ...safe } = u;
      return safe;
    });
    res.json({ success: true, data: usuarios });
  } catch (error) {
    console.error('Erro ao buscar usuários:', error);
    res.status(500).json({ success: false, message: 'Erro ao buscar usuários.' });
  }
});

// Criar novo usuário
app.post('/api/usuarios', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { cpf, nome, senha, perfil, ativo } = req.body;

    if (!cpf || !nome || !senha) {
      return res.status(400).json({ success: false, message: 'CPF, nome e senha são obrigatórios.' });
    }

    const cpfLimpo = String(cpf).replace(/\D/g, '');

    // Verifica se já existe (no cache)
    if (dataStore.usuarios.has(cpfLimpo)) {
      return res.status(400).json({ success: false, message: 'Usuário com este CPF já existe.' });
    }

    // Hash da senha com bcrypt
    const senhaHash = await bcrypt.hash(senha, 10);

    const userData = {
      cpf: cpfLimpo,
      nome: nome.trim(),
      senha: senhaHash,
      perfil: perfil || 'USER',
      ativo: ativo !== false
    };

    await db.collection('usuarios').doc(cpfLimpo).set(userData);
    
    // Atualiza cache RAM
    dataStore.usuarios.set(cpfLimpo, { id: cpfLimpo, ...userData, updated_at: new Date().toISOString() });

    res.json({ success: true, message: 'Usuário criado com sucesso!' });
  } catch (error) {
    console.error('Erro ao criar usuário:', error);
    res.status(500).json({ success: false, message: 'Erro ao criar usuário.' });
  }
});

// Atualizar usuário
app.put('/api/usuarios/:cpf', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { cpf } = req.params;
    const { nome, senha, perfil, ativo } = req.body;

    const cpfLimpo = String(cpf).replace(/\D/g, '');
    
    if (!dataStore.usuarios.has(cpfLimpo)) {
      return res.status(404).json({ success: false, message: 'Usuário não encontrado.' });
    }

    const updateData = {
      nome: nome.trim(),
      perfil: perfil || 'USER',
      ativo: ativo !== false,
      updated_at: new Date().toISOString()
    };

    // Só atualiza senha se foi fornecida — sempre com bcrypt
    if (senha) {
      updateData.senha = await bcrypt.hash(senha, 10);
    }

    await db.collection('usuarios').doc(cpfLimpo).update(updateData);
    
    // Atualiza cache RAM
    const existing = dataStore.usuarios.get(cpfLimpo);
    if (existing) {
      Object.assign(existing, updateData);
      dataStore.usuarios.set(cpfLimpo, existing);
    }

    res.json({ success: true, message: 'Usuário atualizado com sucesso!' });
  } catch (error) {
    console.error('Erro ao atualizar usuário:', error);
    res.status(500).json({ success: false, message: 'Erro ao atualizar usuário.' });
  }
});

// Excluir usuário
app.delete('/api/usuarios/:cpf', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { cpf } = req.params;
    const cpfLimpo = String(cpf).replace(/\D/g, '');

    await db.collection('usuarios').doc(cpfLimpo).delete();
    
    // Remove do cache RAM
    dataStore.usuarios.delete(cpfLimpo);

    res.json({ success: true, message: 'Usuário excluído com sucesso!' });
  } catch (error) {
    console.error('Erro ao excluir usuário:', error);
    res.status(500).json({ success: false, message: 'Erro ao excluir usuário.' });
  }
});

// ==========================================================
// API DE QUARTOS
// ==========================================================

// ✅ ATRIBUIR QUARTO (individual)
app.post('/api/atribuir-quarto', authMiddleware, async (req, res) => {
  try {
    const { cpf, numero_quarto, nome_hospede, colegio, inicio_viagem, fim_viagem } = req.body;

    if (!cpf || !numero_quarto) {
      return res.status(400).json({ success: false, message: 'CPF e número do quarto são obrigatórios.' });
    }

    const cpfLimpo = String(cpf).replace(/\D/g, '');

    // Remove documentos existentes com este CPF
    const querySnapshot = await db.collection('quartos').where('cpf', '==', cpfLimpo).get();
    const deletePromises = [];
    querySnapshot.forEach(doc => {
      deletePromises.push(doc.ref.delete());
      dataStore.quartos.delete(doc.id);
    });
    if (deletePromises.length > 0) await Promise.all(deletePromises);

    // Cria novo documento
    const quartoRef = db.collection('quartos').doc(cpfLimpo);
    const dadosQuarto = {
      cpf: cpfLimpo,
      numero_quarto: numero_quarto.trim(),
      nome_hospede: nome_hospede || '',
      colegio: colegio || '',
      inicio_viagem: inicio_viagem || '',
      fim_viagem: fim_viagem || '',
      facial: true,
      created_at: new Date(),
      updated_at: new Date().toISOString()
    };

    await quartoRef.set(dadosQuarto);
    
    // Atualiza cache RAM
    dataStore.quartos.set(cpfLimpo, { id: cpfLimpo, ...dadosQuarto });
    dataStore.lastUpdate.quartos = new Date().toISOString();

    res.json({ success: true, message: 'Quarto atribuído com sucesso!' });
  } catch (error) {
    console.error('Erro ao atribuir quarto:', error);
    res.status(500).json({ success: false, message: 'Erro ao atribuir quarto.' });
  }
});

// ✅ ATRIBUIR QUARTOS EM BATCH (NOVO — resolve o N+1 do homelist.js)
app.post('/api/atribuir-quartos-batch', authMiddleware, async (req, res) => {
  try {
    const { alunos } = req.body;

    if (!alunos || !Array.isArray(alunos) || alunos.length === 0) {
      return res.status(400).json({ success: false, message: 'Array de alunos é obrigatório.' });
    }

    const timestamp = new Date().toISOString();
    const batch = db.batch();

    for (const aluno of alunos) {
      const cpfLimpo = String(aluno.cpf).replace(/\D/g, '');
      if (!cpfLimpo || !aluno.numero_quarto) continue;

      const quartoRef = db.collection('quartos').doc(cpfLimpo);
      const dadosQuarto = {
        cpf: cpfLimpo,
        numero_quarto: String(aluno.numero_quarto).trim(),
        nome_hospede: aluno.nome_hospede || aluno.nome || '',
        colegio: aluno.colegio || '',
        inicio_viagem: aluno.inicio_viagem || '',
        fim_viagem: aluno.fim_viagem || '',
        facial: true,
        created_at: new Date(),
        updated_at: timestamp
      };

      batch.set(quartoRef, dadosQuarto, { merge: true });
      
      // Atualiza cache RAM
      dataStore.quartos.set(cpfLimpo, { id: cpfLimpo, ...dadosQuarto });
    }

    await batch.commit();
    dataStore.lastUpdate.quartos = timestamp;

    res.json({ success: true, message: `${alunos.length} quartos atribuídos com sucesso!` });
  } catch (error) {
    console.error('Erro ao atribuir quartos em batch:', error);
    res.status(500).json({ success: false, message: 'Erro ao atribuir quartos.' });
  }
});

// ✅ REMOVER QUARTO
app.delete('/api/remover-quarto/:cpf', authMiddleware, async (req, res) => {
  try {
    const { cpf } = req.params;
    const cpfLimpo = String(cpf).replace(/\D/g, '');

    const querySnapshot = await db.collection('quartos').where('cpf', '==', cpfLimpo).get();
    const deletePromises = [];

    querySnapshot.forEach(doc => {
      deletePromises.push(doc.ref.delete());
      dataStore.quartos.delete(doc.id);
    });

    if (deletePromises.length > 0) await Promise.all(deletePromises);
    
    dataStore.lastUpdate.quartos = new Date().toISOString();

    res.json({ success: true, message: 'Quarto removido com sucesso!' });
  } catch (error) {
    console.error('Erro ao remover quarto:', error);
    res.status(500).json({ success: false, message: 'Erro ao remover quarto.' });
  }
});

// ✅ REMOVER QUARTOS EM BATCH (NOVO — resolve o N+1 do homelist.js)
app.post('/api/remover-quartos-batch', authMiddleware, async (req, res) => {
  try {
    const { cpfs } = req.body;

    if (!cpfs || !Array.isArray(cpfs) || cpfs.length === 0) {
      return res.status(400).json({ success: false, message: 'Array de CPFs é obrigatório.' });
    }

    const batch = db.batch();
    let removidos = 0;

    for (const cpf of cpfs) {
      const cpfLimpo = String(cpf).replace(/\D/g, '');
      const quartoRef = db.collection('quartos').doc(cpfLimpo);
      batch.delete(quartoRef);
      dataStore.quartos.delete(cpfLimpo);
      removidos++;
    }

    await batch.commit();
    dataStore.lastUpdate.quartos = new Date().toISOString();

    res.json({ success: true, message: `${removidos} quartos removidos com sucesso!` });
  } catch (error) {
    console.error('Erro ao remover quartos em batch:', error);
    res.status(500).json({ success: false, message: 'Erro ao remover quartos.' });
  }
});

// ==========================================================
// ROTAS DE GERENCIAMENTO DE VIAGENS
// ==========================================================

app.get('/api/viagens-unicas', authMiddleware, (req, res) => {
  try {
    const alunos = getAll('alunos');
    const viagensMap = new Map();

    alunos.forEach(d => {
      const colegio = d.colegio || 'Sem Colégio';
      const inicio = d.inicio_viagem || '0000-00-00';
      const fim = d.fim_viagem || '0000-00-00';
      const chave = `${colegio}_${inicio}`;

      if (viagensMap.has(chave)) {
        viagensMap.get(chave).qtd_alunos += 1;
      } else {
        viagensMap.set(chave, {
          colegio: colegio,
          inicio: inicio,
          fim: fim,
          qtd_alunos: 1
        });
      }
    });

    res.json({ success: true, data: Array.from(viagensMap.values()) });
  } catch (e) {
    console.error('Erro ao listar viagens únicas:', e);
    res.status(500).json({ success: false, message: e.message });
  }
});

app.delete('/api/viagens/excluir', authMiddleware, async (req, res) => {
  try {
    const { colegio, inicio_viagem, operador } = req.body;
    
    // Busca alunos dessa viagem
    const alunosSnapshot = await db.collection('alunos')
      .where('colegio', '==', colegio)
      .where('inicio_viagem', '==', inicio_viagem)
      .get();
      
    // Busca quartos dessa viagem
    const quartosSnapshot = await db.collection('quartos')
      .where('colegio', '==', colegio)
      .where('inicio_viagem', '==', inicio_viagem)
      .get();

    const batch = db.batch();
    let deletados = 0;

    alunosSnapshot.forEach(doc => {
      batch.delete(doc.ref);
      dataStore.alunos.delete(doc.id);
      deletados++;
    });

    quartosSnapshot.forEach(doc => {
      batch.delete(doc.ref);
      dataStore.quartos.delete(doc.id);
      deletados++;
    });

    // Registra Log de Auditoria
    const timestamp = new Date().toISOString();
    const logRef = db.collection('logs').doc();
    const logData = {
      tipo: 'EXCLUSAO_VIAGEM',
      colegio: colegio,
      inicio_viagem: inicio_viagem,
      documentos_removidos: deletados,
      operador: operador || req.user.nome || 'Sistema',
      timestamp: timestamp
    };
    batch.set(logRef, logData);
    addLog({ id: logRef.id, ...logData });

    if (deletados > 0) {
      await batch.commit();
    }

    console.log(`🗑️ Viagem excluída: ${colegio} (${deletados} docs) por ${operador || req.user.nome}`);

    dataStore.lastUpdate.alunos = timestamp;
    dataStore.lastUpdate.quartos = timestamp;

    // Avisa os painéis via Socket para atualizarem
    io.emit('dados_atualizados', { tipo: 'exclusao_lote' });

    res.json({ success: true });
  } catch (e) {
    console.error('Erro ao excluir viagem:', e);
    res.status(500).json({ success: false, message: e.message });
  }
});

// ==========================================================
// INICIAR SERVIDOR
// ==========================================================
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Servidor com WebSockets rodando em http://localhost:${PORT}`);
  console.log(`🔐 Autenticação JWT: ${process.env.JWT_SECRET ? 'ATIVADA' : '⚠️ DESATIVADA (JWT_SECRET não definido)'}`);
});