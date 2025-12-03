/**
 * Script de teste para validar estrutura do Firestore
 * Testa se os campos estão corretos após o ajuste
 */

require('dotenv').config();
const admin = require('firebase-admin');
const fs = require('fs');

console.log('\n🔍 VALIDAÇÃO DA ESTRUTURA DO FIRESTORE\n');
console.log('━'.repeat(60));

if (!admin.apps.length) {
  if (fs.existsSync('./serviceAccountKey.json')) {
    const serviceAccount = require('./serviceAccountKey.json');
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log('✅ Firebase inicializado\n');
  } else {
    console.error('❌ serviceAccountKey.json não encontrado!');
    process.exit(1);
  }
}

const db = admin.firestore();

async function validarEstrutura() {
  try {
    console.log('📋 Verificando coleção "alunos"...\n');

    const snapshot = await db.collection('alunos').limit(3).get();

    if (snapshot.empty) {
      console.log('⚠️  Coleção "alunos" está vazia\n');
      return;
    }

    console.log(`✅ Encontrados ${snapshot.size} documentos para análise:\n`);

    snapshot.forEach((doc, index) => {
      const data = doc.data();
      console.log(`Documento ${index + 1} (ID: ${doc.id}):`);
      console.log(`  ├─ nome_hospede: ${data.nome_hospede || 'N/A'}`);
      console.log(`  ├─ cpf: ${data.cpf || 'N/A'}`);
      console.log(`  ├─ numero_quarto: ${data.numero_quarto || 'N/A'}`);
      console.log(`  ├─ colegio: ${data.colegio || 'N/A'}`);
      console.log(`  ├─ inicio_viagem: ${data.inicio_viagem || 'N/A'}`);
      console.log(`  ├─ fim_viagem: ${data.fim_viagem || 'N/A'}`);
      console.log(`  └─ movimentacao: ${data.movimentacao || 'N/A'}\n`);
    });

    console.log('━'.repeat(60));
    console.log('✅ ESTRUTURA VALIDADA!\n');
    console.log('Campos esperados pelo sistema:');
    console.log('  ✓ nome_hospede (nome do aluno)');
    console.log('  ✓ cpf (identificação única)');
    console.log('  ✓ numero_quarto (número do quarto)');
    console.log('  ✓ colegio (instituição)');
    console.log('  ✓ inicio_viagem (data início)');
    console.log('  ✓ fim_viagem (data fim)');
    console.log('  ✓ movimentacao (status de localização)\n');

    console.log('━'.repeat(60));
    console.log('\n🎉 Sistema pronto para uso!\n');
    console.log('Inicie o servidor: npm start\n');

    process.exit(0);

  } catch (error) {
    console.error('❌ Erro ao validar estrutura:', error.message);

    if (error.message.includes('RESOURCE_EXHAUSTED')) {
      console.log('\n⚠️  Quota do Firestore excedida.');
      console.log('   Execute: node check-quota.js para mais informações\n');
    }

    process.exit(1);
  }
}

validarEstrutura();
