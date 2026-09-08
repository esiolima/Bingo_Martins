require('dotenv').config();

const path = require('path');
const http = require('http');
const express = require('express');
const helmet = require('helmet');
const { Server } = require('socket.io');

const { boot } = require('./src/db');
const { attachSockets } = require('./src/sockets');
const { notFound, errorHandler } = require('./src/middleware/errors');

const adminRoutes = require('./src/routes/admin');
const publicRoutes = require('./src/routes/public');
const roomRoutes = require('./src/routes/rooms');
const playerRoutes = require('./src/routes/player');
const requestRoutes = require('./src/routes/requests');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Disponibiliza a instância do Socket.IO para as rotas via req.app.get('io'),
// evitando um singleton global implícito.
app.set('io', io);

// CSP desligado por enquanto porque public/index.html usa <script> inline;
// migrar esse script para um arquivo .js separado permite reativar a CSP
// padrão do Helmet com uma política restrita (ver README).
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/admin', adminRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/player', playerRoutes);
app.use('/api/requests', requestRoutes);

app.use(express.static(path.join(__dirname, 'public')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

attachSockets(io);

app.use('/api', notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

boot()
  .then(() => {
    server.listen(PORT, () => console.log(`Bingo online em :${PORT}`));
  })
  .catch((e) => {
    console.error('Falha ao iniciar (boot do banco):', e);
    process.exit(1);
  });
