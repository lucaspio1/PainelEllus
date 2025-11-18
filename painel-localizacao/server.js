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
const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL || 'SUA_URL_DO_GOOGLE_APPS_SCRIPT_AQUI';

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
