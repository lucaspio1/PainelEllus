/**
 * Migra datas de viagem gravadas como "DD/MM" (sem ano) para "AAAA-MM-DD".
 *
 * Coleções: alunos e quartos (inicio_viagem/fim_viagem) e embarques
 * (inicioViagem/fimViagem). O ano é deduzido de created_at/updated_at do
 * documento (momento da importação); ver deduzirDataISO em store/datas.js.
 *
 * Também atualiza `updated_at`, para que os celulares recebam as datas
 * corrigidas no próximo delta sync.
 *
 * Uso (na pasta painel-localizacao, com as mesmas credenciais do servidor):
 *   node scripts/migrar-datas-viagem.js            → simulação, não grava nada
 *   node scripts/migrar-datas-viagem.js --aplicar  → grava no Firestore
 */
const { normalizarDataISO, deduzirDataISO } = require('../store/datas');

const CAMPOS = {
  alunos: ['inicio_viagem', 'fim_viagem'],
  quartos: ['inicio_viagem', 'fim_viagem'],
  embarques: ['inicioViagem', 'fimViagem']
};

/**
 * Decide o que fazer com um documento.
 * @returns {{update: object} | {pendente: string} | null} null = nada a fazer
 */
function planejarDoc(colecao, data, agoraISO) {
  const [campoInicio, campoFim] = CAMPOS[colecao];
  const referencia = data.created_at || data.updated_at;
  const update = {};

  const inicioOriginal = data[campoInicio];
  const fimOriginal = data[campoFim];
  let inicioISO = null;

  if (inicioOriginal && !normalizarDataISO(inicioOriginal)) {
    inicioISO = deduzirDataISO(inicioOriginal, referencia);
    if (!inicioISO) return { pendente: `${campoInicio}="${inicioOriginal}" sem data de referência` };
    update[campoInicio] = inicioISO;
  } else {
    inicioISO = normalizarDataISO(inicioOriginal);
  }

  if (fimOriginal && !normalizarDataISO(fimOriginal)) {
    // Fim deduzido a partir do início (ou da referência); se cair antes do
    // início, a viagem virou o ano.
    let fimISO = deduzirDataISO(fimOriginal, inicioISO || referencia);
    if (!fimISO) return { pendente: `${campoFim}="${fimOriginal}" sem data de referência` };
    if (inicioISO && fimISO < inicioISO) {
      fimISO = `${Number(fimISO.slice(0, 4)) + 1}${fimISO.slice(4)}`;
    }
    update[campoFim] = fimISO;
  }

  if (Object.keys(update).length === 0) return null;
  update.updated_at = agoraISO;
  return { update };
}

async function main() {
  require('dotenv').config();
  const aplicar = process.argv.includes('--aplicar');
  const admin = require('firebase-admin');
  if (!admin.apps.length) {
    const fs = require('fs');
    if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
        })
      });
    } else if (fs.existsSync('./serviceAccountKey.json')) {
      admin.initializeApp({ credential: admin.credential.cert(require('../serviceAccountKey.json')) });
    } else {
      admin.initializeApp(); // Application Default Credentials
    }
  }
  const db = admin.firestore();
  const agoraISO = new Date().toISOString();

  console.log(aplicar ? '✍️  MODO APLICAR — gravando no Firestore\n' : '🔎 SIMULAÇÃO — nada será gravado (use --aplicar)\n');

  for (const colecao of Object.keys(CAMPOS)) {
    const snap = await db.collection(colecao).get();
    const mudancas = [];
    const pendentes = [];
    snap.forEach(doc => {
      const plano = planejarDoc(colecao, doc.data(), agoraISO);
      if (!plano) return;
      if (plano.pendente) pendentes.push(`${doc.id}: ${plano.pendente}`);
      else mudancas.push({ ref: doc.ref, id: doc.id, antes: doc.data(), update: plano.update });
    });

    console.log(`📁 ${colecao}: ${snap.size} docs, ${mudancas.length} para corrigir, ${pendentes.length} sem como deduzir`);
    mudancas.slice(0, 5).forEach(m => {
      const [ci, cf] = CAMPOS[colecao];
      console.log(`   ${m.id}: ${m.antes[ci]} → ${m.update[ci] || m.antes[ci]} | ${m.antes[cf]} → ${m.update[cf] || m.antes[cf]}`);
    });
    if (mudancas.length > 5) console.log(`   ... e mais ${mudancas.length - 5}`);
    pendentes.slice(0, 10).forEach(p => console.log(`   ⚠️ ${p}`));

    if (aplicar) {
      for (let i = 0; i < mudancas.length; i += 400) {
        const batch = db.batch();
        mudancas.slice(i, i + 400).forEach(m => batch.update(m.ref, m.update));
        await batch.commit();
      }
      console.log(`   ✅ ${mudancas.length} gravados`);
    }
  }
  console.log('\nConcluído.');
}

if (require.main === module) {
  main().catch(e => { console.error('❌', e); process.exit(1); });
}

module.exports = { planejarDoc };
