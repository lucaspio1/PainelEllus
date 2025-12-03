/**
 * Lista todas as coleções disponíveis no Firestore
 */

require('dotenv').config();
const admin = require('firebase-admin');
const fs = require('fs');

console.log('\n📚 LISTANDO TODAS AS COLEÇÕES DO FIRESTORE\n');
console.log('━'.repeat(60));

if (!admin.apps.length) {
  if (fs.existsSync('./serviceAccountKey.json')) {
    const serviceAccount = require('./serviceAccountKey.json');
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  } else {
    console.error('❌ serviceAccountKey.json não encontrado!');
    process.exit(1);
  }
}

const db = admin.firestore();

async function listarColecoes() {
  try {
    const collections = await db.listCollections();

    if (collections.length === 0) {
      console.log('⚠️  Nenhuma coleção encontrada no database\n');
      return;
    }

    console.log(`✅ Encontradas ${collections.length} coleções:\n`);

    for (const collection of collections) {
      const snapshot = await collection.limit(1).get();
      const count = snapshot.size;

      console.log(`📁 ${collection.id}`);
      console.log(`   └─ Documentos: ${count > 0 ? 'Tem dados' : 'Vazia'}`);

      if (count > 0) {
        const doc = snapshot.docs[0];
        const campos = Object.keys(doc.data());
        console.log(`   └─ Campos: ${campos.join(', ')}`);
      }
      console.log('');
    }

    console.log('━'.repeat(60));

    process.exit(0);

  } catch (error) {
    console.error('❌ Erro:', error.message);
    process.exit(1);
  }
}

listarColecoes();
