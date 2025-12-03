/**
 * Script de diagnóstico detalhado do Firestore
 * Testa operações básicas com timeout para identificar problemas
 */

require('dotenv').config();
const admin = require('firebase-admin');
const fs = require('fs');

console.log('\n🔍 DIAGNÓSTICO COMPLETO DO FIRESTORE\n');
console.log('━'.repeat(60));

// Inicializar Firebase
if (!admin.apps.length) {
  try {
    if (fs.existsSync('./serviceAccountKey.json')) {
      const serviceAccount = require('./serviceAccountKey.json');
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      console.log('✅ Firebase Admin SDK inicializado');
      console.log(`   Projeto: ${serviceAccount.project_id}`);
      console.log(`   Email: ${serviceAccount.client_email}\n`);
    } else {
      console.error('❌ serviceAccountKey.json não encontrado!');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Erro ao inicializar Firebase:', error.message);
    process.exit(1);
  }
}

const db = admin.firestore();

// Função auxiliar com timeout
function withTimeout(promise, timeoutMs, operationName) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout: ${operationName} demorou mais de ${timeoutMs/1000}s`)), timeoutMs)
    )
  ]);
}

// Teste 1: Listar Coleções
async function testeListarColecoes() {
  console.log('━'.repeat(60));
  console.log('📋 TESTE 1: Listar Coleções\n');

  try {
    const collections = await withTimeout(
      db.listCollections(),
      10000,
      'listCollections'
    );

    console.log('✅ Sucesso ao listar coleções!');

    if (collections.length === 0) {
      console.log('⚠️  Database vazio (nenhuma coleção encontrada)');
      console.log('\n💡 AÇÃO NECESSÁRIA:');
      console.log('   1. Acesse http://localhost:3000/importar');
      console.log('   2. Importe dados de alunos para popular o banco\n');
      return [];
    } else {
      console.log(`   Total: ${collections.length} coleções`);
      collections.forEach(col => console.log(`   - ${col.id}`));
      console.log('');
      return collections;
    }
  } catch (error) {
    console.error('❌ FALHA ao listar coleções!');
    console.error(`   ${error.message}\n`);

    if (error.message.includes('Timeout')) {
      console.log('⚠️  O Firestore não está respondendo. Possíveis causas:\n');
      console.log('1️⃣  FIRESTORE NÃO INICIALIZADO');
      console.log('   → Vá para: https://console.firebase.google.com/');
      console.log('   → Selecione o projeto "embarqueellus"');
      console.log('   → Clique em "Firestore Database" no menu lateral');
      console.log('   → Se aparecer "Começar", clique e escolha:');
      console.log('      • Modo de Produção (para produção)');
      console.log('      • Modo de Teste (para desenvolvimento)');
      console.log('   → Escolha a localização (ex: southamerica-east1)\n');

      console.log('2️⃣  API NÃO HABILITADA');
      console.log('   → Vá para: https://console.cloud.google.com/apis/library');
      console.log('   → Busque "Cloud Firestore API"');
      console.log('   → Clique em "Ativar"\n');
    } else if (error.code === 7 || error.message.includes('PERMISSION_DENIED')) {
      console.log('⚠️  Permissões insuficientes. Configure IAM:\n');
      console.log('   → Vá para: https://console.cloud.google.com/iam-admin/iam');
      console.log('   → Encontre: firebase-adminsdk-fbsvc@embarqueellus.iam.gserviceaccount.com');
      console.log('   → Adicione papel: "Cloud Datastore User" ou "Firebase Admin"\n');
    }

    return null;
  }
}

// Teste 2: Ler documento
async function testeLerDocumento(collections) {
  console.log('━'.repeat(60));
  console.log('📖 TESTE 2: Ler Documento\n');

  if (!collections || collections.length === 0) {
    console.log('⏭️  Pulado (nenhuma coleção disponível)\n');
    return;
  }

  try {
    const primeiraColecao = collections[0].id;
    const snapshot = await withTimeout(
      db.collection(primeiraColecao).limit(1).get(),
      10000,
      'get documento'
    );

    if (snapshot.empty) {
      console.log(`⚠️  Coleção '${primeiraColecao}' está vazia`);
    } else {
      console.log(`✅ Sucesso ao ler da coleção '${primeiraColecao}'`);
      const doc = snapshot.docs[0];
      console.log(`   Documento ID: ${doc.id}`);
      console.log(`   Campos: ${Object.keys(doc.data()).join(', ')}`);
    }
    console.log('');
  } catch (error) {
    console.error('❌ FALHA ao ler documento');
    console.error(`   ${error.message}\n`);
  }
}

// Teste 3: Escrever documento de teste
async function testeEscreverDocumento() {
  console.log('━'.repeat(60));
  console.log('✏️  TESTE 3: Escrever Documento de Teste\n');

  try {
    const testeRef = db.collection('_diagnostico').doc('teste');
    await withTimeout(
      testeRef.set({
        timestamp: new Date(),
        mensagem: 'Teste de escrita bem-sucedido',
        versao: '1.0'
      }),
      10000,
      'set documento'
    );

    console.log('✅ Sucesso ao escrever documento de teste!');
    console.log('   Coleção: _diagnostico/teste');

    // Deletar o documento de teste
    await testeRef.delete();
    console.log('✅ Documento de teste removido\n');

  } catch (error) {
    console.error('❌ FALHA ao escrever documento');
    console.error(`   ${error.message}\n`);
  }
}

// Teste 4: Verificar estrutura esperada
async function testeEstrutura() {
  console.log('━'.repeat(60));
  console.log('🏗️  TESTE 4: Verificar Estrutura do Banco\n');

  const colecoesEsperadas = ['embarques', 'alunos', 'usuarios', 'logs'];

  for (const colecao of colecoesEsperadas) {
    try {
      const snapshot = await withTimeout(
        db.collection(colecao).limit(1).get(),
        5000,
        `verificar ${colecao}`
      );

      if (snapshot.empty) {
        console.log(`⚠️  '${colecao}': vazia`);
      } else {
        console.log(`✅ '${colecao}': ${snapshot.size} doc(s) encontrado(s)`);
      }
    } catch (error) {
      console.log(`❌ '${colecao}': erro ao acessar`);
    }
  }
  console.log('');
}

// Executar todos os testes
async function executarDiagnostico() {
  try {
    const collections = await testeListarColecoes();

    if (collections === null) {
      console.log('━'.repeat(60));
      console.log('❌ DIAGNÓSTICO INTERROMPIDO');
      console.log('   Configure o Firestore seguindo as instruções acima.\n');
      process.exit(1);
    }

    await testeLerDocumento(collections);
    await testeEscreverDocumento();
    await testeEstrutura();

    console.log('━'.repeat(60));
    console.log('✅ DIAGNÓSTICO CONCLUÍDO!\n');

    if (collections.length === 0) {
      console.log('📋 PRÓXIMOS PASSOS:');
      console.log('   1. Inicie o servidor: npm start');
      console.log('   2. Acesse: http://localhost:3000/importar');
      console.log('   3. Importe seus dados de alunos\n');
    } else {
      console.log('🎉 Tudo pronto! O sistema está funcionando corretamente.\n');
    }

    process.exit(0);

  } catch (error) {
    console.error('\n❌ Erro fatal no diagnóstico:', error);
    process.exit(1);
  }
}

// Executar
executarDiagnostico();
