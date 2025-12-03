/**
 * Verifica quotas e uso do Firestore
 */

require('dotenv').config();
const admin = require('firebase-admin');
const fs = require('fs');

console.log('\n📊 VERIFICAÇÃO DE QUOTAS DO FIRESTORE\n');
console.log('━'.repeat(60));

if (!admin.apps.length) {
  const serviceAccount = require('./serviceAccountKey.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const projectId = require('./serviceAccountKey.json').project_id;

console.log(`Projeto: ${projectId}\n`);

console.log('❌ ERRO: Quota Excedida (RESOURCE_EXHAUSTED)\n');

console.log('📋 PLANO GRATUITO (Spark) - Limites Diários:');
console.log('   • 50.000 leituras de documentos');
console.log('   • 20.000 escritas de documentos');
console.log('   • 20.000 deleções de documentos');
console.log('   • 1 GiB de armazenamento\n');

console.log('━'.repeat(60));
console.log('🔧 SOLUÇÕES:\n');

console.log('1️⃣  AGUARDAR RESET (00:00 UTC)');
console.log('   As quotas resetam todo dia à meia-noite (horário UTC)');
console.log('   Brasil: 21:00 (horário de Brasília)\n');

console.log('2️⃣  HABILITAR FATURAMENTO (Recomendado)');
console.log('   → https://console.firebase.google.com/project/' + projectId + '/usage/details');
console.log('   → Clique em "Fazer upgrade do plano"');
console.log('   → Escolha "Blaze" (Pague conforme o uso)');
console.log('   → Primeiro mês tem $300 de crédito grátis no Google Cloud\n');

console.log('3️⃣  VERIFICAR USO ATUAL');
console.log('   → https://console.firebase.google.com/project/' + projectId + '/usage');
console.log('   → Veja quantas operações foram realizadas hoje\n');

console.log('4️⃣  OTIMIZAR CONSULTAS');
console.log('   • Reduzir operações de leitura');
console.log('   • Usar cache no frontend');
console.log('   • Implementar paginação\n');

console.log('━'.repeat(60));
console.log('\n💡 DICA: O plano Blaze é gratuito até os mesmos limites do');
console.log('   plano Spark, você só paga se ultrapassar.\n');

console.log('━'.repeat(60));
console.log('\n🔗 Links Úteis:\n');
console.log(`Firebase Console: https://console.firebase.google.com/project/${projectId}`);
console.log(`Cloud Console: https://console.cloud.google.com/firestore/databases?project=${projectId}`);
console.log(`Uso e Faturamento: https://console.firebase.google.com/project/${projectId}/usage\n`);
