/**
 * Script para inspecionar a estrutura REAL completa dos documentos
 */

require('dotenv').config();
const admin = require('firebase-admin');
const fs = require('fs');

console.log('\n🔍 INSPEÇÃO COMPLETA DA ESTRUTURA DO FIRESTORE\n');
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

async function inspecionarEstrutura() {
  try {
    console.log('📋 Inspecionando coleção "alunos"...\n');

    const snapshot = await db.collection('alunos').limit(3).get();

    if (snapshot.empty) {
      console.log('⚠️  Coleção "alunos" está vazia\n');
      return;
    }

    console.log(`✅ Encontrados ${snapshot.size} documentos:\n`);

    snapshot.forEach((doc, index) => {
      const data = doc.data();
      console.log(`━━━ Documento ${index + 1} (ID: ${doc.id}) ━━━`);
      console.log('TODOS OS CAMPOS:');

      // Mostra TODOS os campos do documento
      Object.keys(data).sort().forEach(key => {
        let value = data[key];

        // Formata valores especiais
        if (value && typeof value.toDate === 'function') {
          value = `[Timestamp: ${value.toDate().toISOString()}]`;
        } else if (typeof value === 'string') {
          value = `"${value}"`;
        } else if (value === null || value === undefined) {
          value = 'null';
        }

        console.log(`  ${key}: ${value}`);
      });
      console.log('');
    });

    console.log('━'.repeat(60));
    console.log('\n💡 ANÁLISE:\n');

    // Análise de quais campos estão presentes
    const primeiroDoc = snapshot.docs[0].data();
    const camposPresentes = Object.keys(primeiroDoc);

    console.log('Campos detectados no primeiro documento:');
    camposPresentes.forEach(campo => console.log(`  ✓ ${campo}`));

    console.log('\n❓ Campos que o sistema espera:');
    const camposEsperados = ['nome_hospede', 'numero_quarto', 'cpf', 'colegio',
                             'inicio_viagem', 'fim_viagem', 'movimentacao'];

    camposEsperados.forEach(campo => {
      if (camposPresentes.includes(campo)) {
        console.log(`  ✅ ${campo} - PRESENTE`);
      } else {
        console.log(`  ❌ ${campo} - AUSENTE`);
      }
    });

    process.exit(0);

  } catch (error) {
    console.error('❌ Erro ao inspecionar estrutura:', error.message);
    process.exit(1);
  }
}

inspecionarEstrutura();
