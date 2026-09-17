/**
 * @file Middleware de Autenticação JWT para Embarque Ellus
 * @description Fornece funções para gerar, verificar e validar permissões de tokens JWT.
 */

const jwt = require('jsonwebtoken');

// Verifica se a chave secreta foi configurada no ambiente
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.warn('AVISO: A variável de ambiente JWT_SECRET não está configurada. O serviço de autenticação pode falhar.');
}

/**
 * Middleware para validar o token JWT
 * @param {import('express').Request} req - Objeto de requisição do Express
 * @param {import('express').Response} res - Objeto de resposta do Express
 * @param {import('express').NextFunction} next - Função next do Express
 */
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token ausente' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // payload contendo: cpf, perfil, nome
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
};

/**
 * Middleware para restringir o acesso apenas a usuários administradores.
 * ATENÇÃO: Deve ser utilizado APÓS o authMiddleware.
 * @param {import('express').Request} req - Objeto de requisição do Express
 * @param {import('express').Response} res - Objeto de resposta do Express
 * @param {import('express').NextFunction} next - Função next do Express
 */
const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.perfil !== 'ADMIN') {
    return res.status(403).json({ error: 'Acesso restrito a administradores' });
  }
  next();
};

/**
 * Gera um novo token JWT para o usuário.
 * @param {Object} payload - Dados do usuário (ex: cpf, perfil, nome)
 * @returns {string} Token JWT gerado e assinado
 */
const generateToken = (payload) => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '12h' });
};

module.exports = {
  authMiddleware,
  requireAdmin,
  generateToken
};
