const jwt = require('jsonwebtoken');

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET não definido. Configure a variável de ambiente antes de iniciar o servidor.');
}

const SECRET = process.env.JWT_SECRET;

function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: '14d' });
}

function verifyToken(rawToken) {
  return jwt.verify(rawToken, SECRET);
}

// Middleware de fábrica: garante que o token é válido E pertence ao papel esperado
// ('admin' ou 'player'). Sem isso, um token de jogador poderia ser usado em rotas
// de administrador e vice-versa.
function requireRole(role) {
  return (req, res, next) => {
    const header = req.headers.authorization || '';
    const rawToken = header.startsWith('Bearer ') ? header.slice(7) : '';
    try {
      const payload = verifyToken(rawToken);
      if (payload.role !== role) throw new Error('role mismatch');
      req.user = payload;
      next();
    } catch (e) {
      res.status(401).json({ error: 'Sessão inválida. Entre novamente.' });
    }
  };
}

module.exports = { signToken, verifyToken, requireRole };
