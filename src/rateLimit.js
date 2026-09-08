const rateLimit = require('express-rate-limit');

// Login/registro/entrada em sala: até 20 tentativas a cada 15 min por IP.
// Suficiente para uso normal (erros de digitação) e curto o bastante para
// inviabilizar força bruta de senha.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' },
});

module.exports = { authLimiter };
