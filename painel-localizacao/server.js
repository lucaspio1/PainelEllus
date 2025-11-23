require('dotenv').config();

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL;

if (!GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL.includes('SEU_DEPLOYMENT_ID')) {
  console.error('❌ ERRO CRÍTICO: Configure a URL do Google Script no arquivo .env');
}

function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

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

// --- ENDPOINTS ---

// ✅ Endpoint de Login (NOVO)
app.post('/api/login', async (req, res) => {
  try {
    const { cpf, senha } = req.body;
    
    // Repassa para o Google Apps Script que já tem a função 'login'
    const response = await axios.post(GOOGLE_SCRIPT_URL, {
      action: 'login',
      cpf: cpf,
      senha: senha
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
    });

    if (response.data && response.data.success) {
      res.json({ success: true, data: response.data }); // Retorna dados do usuário
    } else {
      res.status(401).json({ success: false, message: response.data?.message || 'Falha no login' });
    }
  } catch (error) {
    console.error('Erro no login:', error.message);
    res.status(500).json({ success: false, message: 'Erro no servidor: ' + error.message });
  }
});

app.get('/api/pessoas', async (req, res) => {
  try {
    const response = await axios.get(`${GOOGLE_SCRIPT_URL}?action=getAllPeople`, { timeout: 30000 });
    if (response.data && response.data.success) {
      res.json({ success: true, data: response.data.data || [] });
    } else {
      res.status(500).json({ success: false, message: response.data?.message });
    }
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.get('/api/quartos', async (req, res) => {
  try {
    const response = await axios.post(GOOGLE_SCRIPT_URL, {
      action: 'getQuartos'
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
    });

    if (response.data && response.data.success) {
      res.json({ success: true, data: response.data.data || [] });
    } else {
      res.json({ success: true, data: [] });
    }
  } catch (error) { 
    console.error('Erro ao buscar quartos:', error.message);
    res.status(500).json({ success: false, message: error.message }); 
  }
});

app.get('/api/viagens', async (req, res) => {
  try {
    const response = await axios.get(`${GOOGLE_SCRIPT_URL}?action=getAllPeople`, { timeout: 30000 });
    if (response.data && response.data.success) {
      const pessoas = response.data.data || [];
      const viagensMap = new Map();
      pessoas.forEach(p => {
        if (p.inicio_viagem && p.fim_viagem) {
          const k = `${p.inicio_viagem}|${p.fim_viagem}`;
          if (!viagensMap.has(k)) {
            viagensMap.set(k, { 
              inicio_viagem: p.inicio_viagem, 
              fim_viagem: p.fim_viagem, 
              label: `${formatarDataPTBR(p.inicio_viagem)} até ${formatarDataPTBR(p.fim_viagem)}` 
            });
          }
        }
      });
      res.json({ success: true, data: Array.from(viagensMap.values()) });
    } else { res.status(500).json({ success: false, message: 'Erro ao buscar viagens' }); }
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.post('/api/movimentar', async (req, res) => {
  try {
    const { cpf, novaLocalizacao, nome, colegio, turma, inicioViagem, fimViagem, quarto, operador } = req.body;
    if (!cpf || !novaLocalizacao) return res.status(400).json({ success: false, message: 'Dados incompletos' });

    const operadorFinal = operador || 'Painel Web';
    console.log(`📍 Movimentando ${nome} -> ${novaLocalizacao} [Op: ${operadorFinal}]`);

    await axios.post(GOOGLE_SCRIPT_URL, {
      action: 'addMovementLog',
      people: [{
        cpf, 
        personName: nome || 'Desconhecido',
        colegio: colegio || '',
        turma: turma || '',
        quarto: quarto || '',
        tipo: novaLocalizacao,
        movimentacao: novaLocalizacao,
        timestamp: new Date().toISOString(),
        confidence: 100,
        operador: operadorFinal,
        operadorNome: operadorFinal,
        monitor: operadorFinal,
        inicio_viagem: inicioViagem || '',
        fim_viagem: fimViagem || '',
        updated_at: new Date().toISOString()
      }]
    }, { headers: { 'Content-Type': 'application/json' }, timeout: 30000 });

    res.json({ success: true, message: 'Movimentação registrada' });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.get('/api/logs', async (req, res) => {
  try {
    const { cpf, since } = req.query;
    let url = `${GOOGLE_SCRIPT_URL}?action=getAllLogs`;
    if (since) url += `&since=${encodeURIComponent(since)}`;
    const response = await axios.get(url, { timeout: 30000 });

    if (response.data && response.data.success) {
      let logs = response.data.data || [];
      if (cpf) {
        const cpfBusca = String(cpf).replace(/\D/g, '');
        logs = logs.filter(l => String(l.cpf || '').replace(/\D/g, '') === cpfBusca);
      }
      res.json({ success: true, data: logs });
    } else { res.status(500).json({ success: false, message: 'Erro ao buscar logs' }); }
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.get('/health', (req, res) => res.json({ status: 'OK', env: !!GOOGLE_SCRIPT_URL }));

// Redireciona raiz para index.html (proteção será via JS no front)
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
// Rota específica para a página de login
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));

app.listen(PORT, '0.0.0.0', () => {
  const localIp = getLocalIpAddress();
  console.log(`\n🚀 Servidor iniciado!`);
  console.log(`💻 Local: http://localhost:${PORT}`);
  console.log(`📱 Rede: http://${localIp}:${PORT}`);
});