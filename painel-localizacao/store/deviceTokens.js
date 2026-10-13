/**
 * Token de dispositivo (refresh token) para o app mobile.
 *
 * Por quê: os celulares passam horas/dias sem internet. O JWT de acesso dura
 * 12h; sem um jeito de renová-lo sem digitar senha, a fila offline nunca subia.
 *
 * Como funciona:
 * - No login online o app recebe, além do JWT, um `refresh_token` aleatório.
 * - O servidor guarda apenas o SHA-256 dele em `dispositivos/{hash}`.
 * - POST /api/mobile/auth/refresh troca o refresh_token por um novo JWT.
 * - Validade deslizante: cada uso válido estende o prazo (padrão 30 dias).
 *   Não há rotação de propósito: se a resposta se perder numa conexão ruim,
 *   o celular continua com um token válido.
 * - É recusado se revogado, vencido, ou se o usuário foi excluído/desativado.
 */
const crypto = require('crypto');

const COLLECTION = 'dispositivos';
const VALIDADE_DIAS = Number(process.env.DEVICE_TOKEN_DAYS || 30);

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/** Cria um token de dispositivo para o usuário. Retorna o token em texto (só nesta resposta). */
async function emitirTokenDispositivo(db, user, { userAgent = '', now = new Date() } = {}) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = addDays(now, VALIDADE_DIAS);
  await db.collection(COLLECTION).doc(hashToken(token)).set({
    cpf: user.cpf,
    nome: user.nome || '',
    perfil: user.perfil || 'USER',
    user_agent: String(userAgent).slice(0, 200),
    created_at: now.toISOString(),
    last_used_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    revoked: false
  });
  return { refresh_token: token, refresh_expires_at: expiresAt.toISOString() };
}

/**
 * Valida o refresh token. Retorna { ok: true, user } ou { ok: false, motivo }.
 * `buscarUsuario(cpf)` deve devolver o usuário atual (ou null).
 */
async function validarTokenDispositivo(db, token, buscarUsuario, { now = new Date() } = {}) {
  if (!token || typeof token !== 'string' || token.length < 32) {
    return { ok: false, motivo: 'Token de dispositivo ausente ou inválido' };
  }
  const ref = db.collection(COLLECTION).doc(hashToken(token));
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, motivo: 'Dispositivo não reconhecido' };

  const disp = snap.data();
  if (disp.revoked) return { ok: false, motivo: 'Dispositivo revogado' };
  if (disp.expires_at && Date.parse(disp.expires_at) < now.getTime()) {
    return { ok: false, motivo: 'Token de dispositivo vencido' };
  }

  const usuario = await buscarUsuario(disp.cpf);
  if (!usuario || usuario.ativo === false) {
    return { ok: false, motivo: 'Usuário inexistente ou desativado' };
  }

  // Validade deslizante
  await ref.update({
    last_used_at: now.toISOString(),
    expires_at: addDays(now, VALIDADE_DIAS).toISOString()
  });

  return {
    ok: true,
    user: {
      cpf: usuario.cpf || disp.cpf,
      nome: usuario.nome || disp.nome,
      perfil: usuario.perfil || disp.perfil || 'USER'
    }
  };
}

/** Revoga todos os dispositivos de um CPF (ex.: usuário excluído ou celular perdido). */
async function revogarDispositivosDoUsuario(db, cpf) {
  const snap = await db.collection(COLLECTION).where('cpf', '==', cpf).get();
  const batch = db.batch();
  let total = 0;
  snap.forEach(doc => {
    batch.update(doc.ref, { revoked: true, revoked_at: new Date().toISOString() });
    total++;
  });
  if (total > 0) await batch.commit();
  return total;
}

module.exports = {
  emitirTokenDispositivo,
  validarTokenDispositivo,
  revogarDispositivosDoUsuario,
  hashToken,
  VALIDADE_DIAS
};
