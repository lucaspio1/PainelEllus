const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// URL do Google Apps Script (CONFIGURAR AQUI!)
const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL || 'https://script.google.com/macros/s/AKfycbyQKez698YWjpgswCTj_o0hIDJDYoqT-MfI-4KsBYASaQXNxsPeIa2ZjW5LXT4Lto55gA/exec';

/**
 * Endpoint para buscar todas as pessoas
 * Faz uma chamada ao Google Apps Script
 */
app.get('/api/pessoas', async (req, res) => {
  try {
    console.log('📥 Buscando pessoas do Google Sheets...');

    // Chamar o Google Apps Script
    const response = await axios.get(`${GOOGLE_SCRIPT_URL}?action=getAllPeople`, {
      timeout: 30000 // 30 segundos de timeout
    });

    console.log('✅ Resposta recebida do Google Sheets');

    if (response.data && response.data.success) {
      const pessoas = response.data.data || [];
      console.log(`📊 Total de pessoas: ${pessoas.length}`);

      res.json({
        success: true,
        data: pessoas,
        timestamp: new Date().toISOString()
      });
    } else {
      console.error('❌ Resposta com erro do Google Sheets:', response.data);
      res.status(500).json({
        success: false,
        message: response.data?.message || 'Erro ao buscar dados'
      });
    }
  } catch (error) {
    console.error('❌ Erro ao buscar pessoas:', error.message);
    res.status(500).json({
      success: false,
      message: 'Erro ao conectar com Google Sheets: ' + error.message
    });
  }
});

/**
 * Endpoint para buscar viagens únicas
 * Extrai as combinações únicas de INICIO_VIAGEM + FIM_VIAGEM
 */
app.get('/api/viagens', async (req, res) => {
  try {
    console.log('📥 Buscando viagens disponíveis...');

    // Chamar o Google Apps Script
    const response = await axios.get(`${GOOGLE_SCRIPT_URL}?action=getAllPeople`, {
      timeout: 30000
    });

    if (response.data && response.data.success) {
      const pessoas = response.data.data || [];

      // Extrair viagens únicas
      const viagensMap = new Map();

      pessoas.forEach(pessoa => {
        if (pessoa.inicio_viagem && pessoa.fim_viagem) {
          const chave = `${pessoa.inicio_viagem}|${pessoa.fim_viagem}`;
          if (!viagensMap.has(chave)) {
            viagensMap.set(chave, {
              inicio_viagem: pessoa.inicio_viagem,
              fim_viagem: pessoa.fim_viagem,
              label: `${pessoa.inicio_viagem} até ${pessoa.fim_viagem}`
            });
          }
        }
      });

      const viagens = Array.from(viagensMap.values());
      console.log(`✅ ${viagens.length} viagem(ns) encontrada(s)`);

      res.json({
        success: true,
        data: viagens
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Erro ao buscar viagens'
      });
    }
  } catch (error) {
    console.error('❌ Erro ao buscar viagens:', error.message);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar viagens: ' + error.message
    });
  }
});

/**
 * Endpoint para movimentar aluno entre locais
 */
app.post('/api/movimentar', async (req, res) => {
  try {
    const { cpf, novaLocalizacao, nome, colegio, turma, inicioViagem, fimViagem } = req.body;

    if (!cpf || !novaLocalizacao) {
      return res.status(400).json({
        success: false,
        message: 'CPF e nova localização são obrigatórios'
      });
    }

    console.log(`📍 Movimentando ${nome || cpf} para ${novaLocalizacao}...`);
    console.log(`📅 Viagem: ${inicioViagem} até ${fimViagem}`);

    // Registrar log de movimentação no Google Sheets
    const logResponse = await axios.post(GOOGLE_SCRIPT_URL, {
      action: 'addMovementLog',
      people: [{
        cpf: cpf,
        personName: nome || 'Desconhecido',
        colegio: colegio || '',
        turma: turma || '',
        tipo: novaLocalizacao,
        movimentacao: novaLocalizacao,
        timestamp: new Date().toISOString(),
        confidence: 100,
        operadorNome: 'Painel Web',
        inicio_viagem: inicioViagem || '',
        inicioViagem: inicioViagem || '',
        fim_viagem: fimViagem || '',
        fimViagem: fimViagem || '',
        updated_at: new Date().toISOString()
      }]
    }, {
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' }
    });

    console.log('✅ Movimentação registrada:', logResponse.data);

    res.json({
      success: true,
      message: `${nome || 'Aluno'} movido para ${novaLocalizacao}`,
      data: {
        cpf,
        novaLocalizacao,
        inicioViagem,
        fimViagem,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Erro ao movimentar aluno:', error.message);
    res.status(500).json({
      success: false,
      message: 'Erro ao movimentar aluno: ' + error.message
    });
  }
});

/**
 * Endpoint para buscar logs de movimentação
 */
app.get('/api/logs', async (req, res) => {
  try {
    const { cpf, since } = req.query;
    console.log('📥 Buscando logs de movimentação...');

    let url = `${GOOGLE_SCRIPT_URL}?action=getAllLogs`;
    if (since) {
      url += `&since=${encodeURIComponent(since)}`;
    }

    const response = await axios.get(url, { timeout: 30000 });

    if (response.data && response.data.success) {
      let logs = response.data.data || [];

      // Filtrar por CPF se fornecido
      if (cpf) {
        logs = logs.filter(log => log.cpf === cpf);
      }

      console.log(`✅ ${logs.length} log(s) encontrado(s)`);

      res.json({
        success: true,
        data: logs
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Erro ao buscar logs'
      });
    }
  } catch (error) {
    console.error('❌ Erro ao buscar logs:', error.message);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar logs: ' + error.message
    });
  }
});

/**
 * Health check
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    googleScriptUrl: GOOGLE_SCRIPT_URL !== 'SUA_URL_DO_GOOGLE_APPS_SCRIPT_AQUI' ? 'Configurado' : 'NÃO CONFIGURADO'
  });
});

/**
 * Servir o frontend
 */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log('🚀 Servidor iniciado!');
  console.log(`📍 Acesse: http://localhost:${PORT}`);
  console.log(`📊 API Pessoas: http://localhost:${PORT}/api/pessoas`);
  console.log(`🗓️  API Viagens: http://localhost:${PORT}/api/viagens`);

  if (GOOGLE_SCRIPT_URL === 'SUA_URL_DO_GOOGLE_APPS_SCRIPT_AQUI') {
    console.warn('⚠️  ATENÇÃO: Configure a URL do Google Apps Script no arquivo .env ou na variável GOOGLE_SCRIPT_URL');
  }
});
