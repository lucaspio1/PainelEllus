/**
 * Script de teste para verificar a conexão com o Firebase
 *
 * Uso:
 *   node test-firebase.js
 *
 * Este script testa:
 * 1. Carregamento das credenciais
 * 2. Inicialização do Firebase Admin
 * 3. Conexão com o Firestore
 * 4. Listagem de coleções disponíveis
 */

require('dotenv').config();
const admin = require('firebase-admin');
const fs = require('fs');

console.log('\n🔍 Testando Configuração do Firebase...\n');
console.log('━'.repeat(60));

// Verificar qual método de autenticação está disponível
let metodo = '';

if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY) {
  metodo = 'VARIÁVEIS DE AMBIENTE';
  console.log('✅ Variáveis de ambiente detectadas:');
  console.log(`   - FIREBASE_PROJECT_ID: ${process.env.FIREBASE_PROJECT_ID}`);
  console.log(`   - FIREBASE_CLIENT_EMAIL: ${process.env.FIREBASE_CLIENT_EMAIL ? '✓' : '✗'}`);
  console.log(`   - FIREBASE_PRIVATE_KEY: ${process.env.FIREBASE_PRIVATE_KEY ? '✓ (presente)' : '✗'}`);
} else if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GCP_PROJECT) {
  metodo = 'APPLICATION DEFAULT CREDENTIALS (ADC)';
  console.log('✅ ADC detectado:');
  console.log(`   - GCP_PROJECT: ${process.env.GCP_PROJECT || 'N/A'}`);
  console.log(`   - GOOGLE_APPLICATION_CREDENTIALS: ${process.env.GOOGLE_APPLICATION_CREDENTIALS || 'N/A'}`);
} else if (fs.existsSync('./serviceAccountKey.json')) {
  metodo = 'ARQUIVO serviceAccountKey.json';
  console.log('✅ Arquivo serviceAccountKey.json encontrado');
} else {
  console.log('❌ ERRO: Nenhuma credencial encontrada!');
  console.log('\nConfigure uma das seguintes opções:');
  console.log('1. Variáveis de ambiente no arquivo .env');
  console.log('2. Arquivo serviceAccountKey.json na raiz do projeto');
  console.log('3. Application Default Credentials (se rodando no GCP)');
  process.exit(1);
}

console.log('━'.repeat(60));
console.log(`\n🔧 Método de autenticação: ${metodo}\n`);

// Tentar inicializar o Firebase
try {
  if (!admin.apps.length) {
    if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
        })
      });
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GCP_PROJECT) {
      admin.initializeApp({
        projectId: process.env.GCP_PROJECT || process.env.FIREBASE_PROJECT_ID
      });
    } else if (fs.existsSync('./serviceAccountKey.json')) {
      const serviceAccount = require('./serviceAccountKey.json');
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    }
  }

  console.log('✅ Firebase Admin SDK inicializado com sucesso!\n');

  // Testar conexão com Firestore
  const db = admin.firestore();
  console.log('🔗 Testando conexão com Firestore...\n');

  // Listar coleções disponíveis
  db.listCollections()
    .then(collections => {
      console.log('✅ Conexão com Firestore estabelecida!\n');
      console.log('📊 Coleções disponíveis:');

      if (collections.length === 0) {
        console.log('   (nenhuma coleção encontrada - database vazio)');
      } else {
        collections.forEach(collection => {
          console.log(`   - ${collection.id}`);
        });
      }

      console.log('\n━'.repeat(60));
      console.log('🎉 Teste concluído com SUCESSO!');
      console.log('━'.repeat(60));
      console.log('\nO servidor está pronto para ser iniciado.');
      console.log('Execute: npm start\n');

      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Erro ao conectar com Firestore:');
      console.error(`   ${error.message}\n`);

      if (error.code === 'PERMISSION_DENIED') {
        console.log('💡 Dica: Verifique se o service account tem permissões no Firestore.');
        console.log('   Role necessária: Cloud Datastore User\n');
      }

      process.exit(1);
    });

} catch (error) {
  console.error('❌ Erro ao inicializar Firebase:');
  console.error(`   ${error.message}\n`);

  if (error.message.includes('private_key')) {
    console.log('💡 Dica: A chave privada pode estar mal formatada.');
    console.log('   Certifique-se de que as quebras de linha (\\n) estão corretas.\n');
  }

  process.exit(1);
}
