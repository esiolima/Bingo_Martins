const { getRoomByCode } = require('./rooms');

// A versão original deixava qualquer cliente entrar em qualquer `code` sem
// checagem, o que permite escutar eventos (inclusive nomes de quem pediu
// Bingo) de salas alheias só adivinhando o código. Aqui pelo menos
// confirmamos que a sala existe antes de inscrever o socket nela — não é uma
// autenticação completa (o código já é público via link de convite), mas
// evita registrar salas inexistentes e serve de ponto único para endurecer
// isso no futuro (ex.: exigir o token do jogador/admin no join).
function attachSockets(io) {
  io.on('connection', (socket) => {
    socket.on('room:join', async (code) => {
      if (typeof code !== 'string' || !code) return;
      const room = await getRoomByCode(code);
      if (!room) return;
      socket.join(code);
    });
  });
}

module.exports = { attachSockets };
