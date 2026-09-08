class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// O Express 4 não captura rejeições de Promise automaticamente: uma rota
// `async (req, res) => { throw ... }` sem isso derruba o processo sem resposta
// nenhuma para o cliente. Envolvendo com asyncHandler, o erro cai no
// errorHandler abaixo.
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function notFound(req, res) {
  res.status(404).json({ error: 'Rota não encontrada.' });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err instanceof ApiError ? err.status : 500;
  if (status === 500) console.error(err);
  res.status(status).json({ error: status === 500 ? 'Erro interno. Tente novamente.' : err.message });
}

module.exports = { ApiError, asyncHandler, notFound, errorHandler };
