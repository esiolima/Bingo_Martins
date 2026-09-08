const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { pool } = require('../db');
const { signToken, requireRole } = require('../auth');
const { validateBody } = require('../validate');
const { authLimiter } = require('../rateLimit');
const { asyncHandler, ApiError } = require('../middleware/errors');
const { generateCard } = require('../game');
const { getRoomByCode, generateRoomCode } = require('../rooms');
const { emitRoomEvent } = require('../events');

const router = express.Router();

const createRoomSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome da sala.'),
  maxPlayers: z.coerce.number().int().min(1).max(200).default(20),
  cards: z.coerce.number().int().min(1).max(4).default(1),
  win: z.enum(['one_line', 'two_lines', 'full_card']).default('one_line'),
  adminPlays: z.coerce.boolean().default(false),
});

const joinRoomSchema = z.object({
  name: z.string().trim().min(2, 'Informe seu nome (mínimo 2 caracteres).'),
  email: z.string().trim().email('Informe um e-mail válido.'),
  password: z.string().min(6, 'Use uma senha de no mínimo 6 caracteres.'),
});

const loginRoomSchema = z.object({
  email: z.string().trim().email('Informe um e-mail válido.'),
  password: z.string().min(1, 'Informe sua senha.'),
});

// GET /api/rooms — salas do administrador autenticado
router.get(
  '/',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT code, name, max_players, cards_per_player, win_condition, status, admin_plays, created_at,
        (SELECT count(*) FROM players WHERE room_id = rooms.id) AS players
       FROM rooms WHERE admin_id = $1 ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  })
);

// POST /api/rooms — cria sala e, opcionalmente, o player do próprio admin
// numa única transação: se a criação do player falhar, a sala não fica órfã.
router.post(
  '/',
  requireRole('admin'),
  validateBody(createRoomSchema),
  asyncHandler(async (req, res) => {
    const { name, maxPlayers, cards, win, adminPlays } = req.body;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const code = generateRoomCode();
      const { rows: roomRows } = await client.query(
        `INSERT INTO rooms(code, name, admin_id, max_players, cards_per_player, win_condition, admin_plays)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [code, name, req.user.id, maxPlayers, cards, win, adminPlays]
      );
      const room = roomRows[0];

      let adminPlayer = null;
      let adminPlayerToken = null;
      if (adminPlays) {
        const { rows: adminRows } = await client.query('SELECT name, email FROM admins WHERE id = $1', [req.user.id]);
        const admin = adminRows[0];
        const cardsData = Array.from({ length: room.cards_per_player }, generateCard);
        // Bug corrigido: a versão anterior salvava a string literal "ADMIN" em
        // password_hash (não um hash de verdade). Aqui geramos uma senha
        // aleatória e a hasheamos de verdade — ela nunca é usada para login
        // porque o admin acessa via adminPlayerToken, mas o campo passa a ser
        // um hash bcrypt válido em vez de um valor em texto puro no banco.
        const randomPassword = crypto.randomBytes(24).toString('hex');
        const passwordHash = await bcrypt.hash(randomPassword, 12);
        const { rows: playerRows } = await client.query(
          `INSERT INTO players(room_id, name, email, password_hash, cards, is_admin)
           VALUES ($1, $2, $3, $4, $5, true) RETURNING *`,
          [room.id, admin.name, admin.email, passwordHash, JSON.stringify(cardsData)]
        );
        adminPlayer = playerRows[0];
        adminPlayerToken = signToken({ role: 'player', id: adminPlayer.id, room: room.id });
      }

      await client.query('COMMIT');
      await emitRoomEvent(req.app.get('io'), room.id, 'room_created');
      res.json({ ...room, adminPlayer, adminPlayerToken });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  })
);

router.delete(
  '/:code',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const room = await getRoomByCode(req.params.code);
    if (!room || room.admin_id !== req.user.id) throw new ApiError(403, 'Sem permissão.');
    await pool.query('DELETE FROM rooms WHERE id = $1', [room.id]);
    res.json({ ok: true });
  })
);

// GET /api/rooms/:code — dados públicos (sem info sensível de outros jogadores)
router.get(
  '/:code',
  asyncHandler(async (req, res) => {
    const room = await getRoomByCode(req.params.code);
    if (!room) throw new ApiError(404, 'Sala não encontrada.');
    res.json({
      code: room.code,
      name: room.name,
      status: room.status,
      maxPlayers: room.max_players,
      cards: room.cards_per_player,
      win: room.win_condition,
      drawn: room.drawn,
    });
  })
);

router.get(
  '/:code/players',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const room = await getRoomByCode(req.params.code);
    if (!room || room.admin_id !== req.user.id) throw new ApiError(403, 'Sem permissão.');
    const { rows } = await pool.query('SELECT id, name, is_admin, created_at FROM players WHERE room_id = $1 ORDER BY created_at', [
      room.id,
    ]);
    res.json(rows);
  })
);

router.get(
  '/:code/my-player',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const room = await getRoomByCode(req.params.code);
    if (!room || room.admin_id !== req.user.id) throw new ApiError(403, 'Sem permissão.');
    const { rows } = await pool.query('SELECT id, name, cards, marked FROM players WHERE room_id = $1 AND is_admin = true', [room.id]);
    const player = rows[0];
    if (!player) return res.json(null);
    res.json({ player, token: signToken({ role: 'player', id: player.id, room: room.id }) });
  })
);

router.post(
  '/:code/join',
  authLimiter,
  validateBody(joinRoomSchema),
  asyncHandler(async (req, res) => {
    const room = await getRoomByCode(req.params.code);
    if (!room) throw new ApiError(404, 'Sala não encontrada.');
    if (room.status !== 'waiting') throw new ApiError(400, 'A partida já começou.');

    const { rows: countRows } = await pool.query('SELECT count(*) FROM players WHERE room_id = $1', [room.id]);
    if (+countRows[0].count >= room.max_players) throw new ApiError(400, 'A sala já atingiu o limite de participantes.');

    const { name, email, password } = req.body;
    const cards = Array.from({ length: room.cards_per_player }, generateCard);
    let player;
    try {
      const { rows } = await pool.query(
        'INSERT INTO players(room_id, name, email, password_hash, cards) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, cards, marked',
        [room.id, name, email.toLowerCase(), await bcrypt.hash(password, 12), JSON.stringify(cards)]
      );
      player = rows[0];
    } catch (e) {
      throw new ApiError(400, 'Nome ou e-mail já está em uso nesta sala.');
    }
    await emitRoomEvent(req.app.get('io'), room.id, 'player_joined', { name: player.name });
    res.json({
      token: signToken({ role: 'player', id: player.id, room: room.id }),
      player,
      room: { code: room.code, name: room.name, status: room.status, drawn: room.drawn, win: room.win_condition },
    });
  })
);

router.post(
  '/:code/login',
  authLimiter,
  validateBody(loginRoomSchema),
  asyncHandler(async (req, res) => {
    const room = await getRoomByCode(req.params.code);
    const { email, password } = req.body;
    const { rows } = room
      ? await pool.query('SELECT id, name, cards, marked, password_hash FROM players WHERE room_id = $1 AND email = $2', [
          room.id,
          email.toLowerCase(),
        ])
      : { rows: [] };
    const player = rows[0];
    if (!player || !(await bcrypt.compare(password, player.password_hash))) throw new ApiError(401, 'E-mail ou senha incorretos.');
    res.json({
      token: signToken({ role: 'player', id: player.id, room: room.id }),
      player,
      room: { code: room.code, name: room.name, status: room.status, drawn: room.drawn, win: room.win_condition },
    });
  })
);

router.post(
  '/:code/start',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const room = await getRoomByCode(req.params.code);
    if (!room || room.admin_id !== req.user.id) throw new ApiError(403, 'Sem permissão.');
    if (room.status !== 'waiting') throw new ApiError(400, 'A partida já foi iniciada.');
    await pool.query("UPDATE rooms SET status = 'in_progress' WHERE id = $1", [room.id]);
    await emitRoomEvent(req.app.get('io'), room.id, 'started');
    res.json({ ok: true });
  })
);

router.post(
  '/:code/draw',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const room = await getRoomByCode(req.params.code);
    if (!room || room.admin_id !== req.user.id) throw new ApiError(403, 'Sem permissão.');
    if (room.status !== 'in_progress') throw new ApiError(400, 'A partida não está em andamento.');
    const remaining = Array.from({ length: 75 }, (_, i) => i + 1).filter((n) => !room.drawn.includes(n));
    if (!remaining.length) throw new ApiError(400, 'Não há mais pedras.');
    const number = remaining[Math.floor(Math.random() * remaining.length)];
    const drawn = [...room.drawn, number];
    await pool.query('UPDATE rooms SET drawn = $1 WHERE id = $2', [JSON.stringify(drawn), room.id]);
    await emitRoomEvent(req.app.get('io'), room.id, 'number_drawn', { number, drawn });
    res.json({ number, drawn });
  })
);

router.get(
  '/:code/requests',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const room = await getRoomByCode(req.params.code);
    if (!room || room.admin_id !== req.user.id) throw new ApiError(403, 'Sem permissão.');
    const { rows } = await pool.query(
      `SELECT b.id, b.valid, b.created_at, p.name, p.cards, p.marked
       FROM bingo_requests b JOIN players p ON p.id = b.player_id
       WHERE b.room_id = $1 AND b.status = 'pending' ORDER BY b.created_at`,
      [room.id]
    );
    res.json(rows);
  })
);

router.post(
  '/:code/restart',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const room = await getRoomByCode(req.params.code);
    if (!room || room.admin_id !== req.user.id) throw new ApiError(403, 'Sem permissão.');
    const { rows: players } = await pool.query('SELECT id FROM players WHERE room_id = $1', [room.id]);
    for (const player of players) {
      await pool.query('UPDATE players SET cards = $1, marked = $2 WHERE id = $3', [
        JSON.stringify(Array.from({ length: room.cards_per_player }, generateCard)),
        JSON.stringify([]),
        player.id,
      ]);
    }
    await pool.query("UPDATE rooms SET status = 'waiting', drawn = '[]', winner_player_id = NULL WHERE id = $1", [room.id]);
    await emitRoomEvent(req.app.get('io'), room.id, 'restarted');
    res.json({ ok: true });
  })
);

module.exports = router;
