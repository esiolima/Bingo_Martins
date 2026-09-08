const express = require('express');
const { z } = require('zod');
const { pool } = require('../db');
const { requireRole } = require('../auth');
const { validateBody } = require('../validate');
const { asyncHandler, ApiError } = require('../middleware/errors');
const { checkWinCondition } = require('../game');
const { emitRoomEvent } = require('../events');

const router = express.Router();

const markSchema = z.object({
  number: z.coerce.number().int().min(1).max(75),
});

router.post(
  '/mark',
  requireRole('player'),
  validateBody(markSchema),
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      'SELECT rooms.*, players.cards, players.marked FROM rooms JOIN players ON players.room_id = rooms.id WHERE rooms.id = $1 AND players.id = $2',
      [req.user.room, req.user.id]
    );
    const state = rows[0];
    const { number } = req.body;
    if (!state || !state.drawn.includes(number) || !state.cards.flat().includes(number)) {
      throw new ApiError(400, 'Só é possível marcar uma pedra sorteada da sua cartela.');
    }
    const marked = state.marked.includes(number) ? state.marked.filter((n) => n !== number) : [...state.marked, number];
    await pool.query('UPDATE players SET marked = $1 WHERE id = $2', [JSON.stringify(marked), req.user.id]);
    res.json({ marked });
  })
);

router.post(
  '/bingo',
  requireRole('player'),
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT rooms.*, players.cards, players.marked, players.name AS player_name
       FROM rooms JOIN players ON players.room_id = rooms.id
       WHERE rooms.id = $1 AND players.id = $2`,
      [req.user.room, req.user.id]
    );
    const state = rows[0];
    if (!state || state.status !== 'in_progress') throw new ApiError(400, 'Não é possível pedir Bingo agora.');

    const valid = checkWinCondition(state.win_condition, state.cards, state.marked);
    const { rows: requestRows } = await pool.query(
      'INSERT INTO bingo_requests(room_id, player_id, valid) VALUES ($1, $2, $3) RETURNING id',
      [state.id, req.user.id, valid]
    );
    await pool.query("UPDATE rooms SET status = 'reviewing' WHERE id = $1", [state.id]);
    await emitRoomEvent(req.app.get('io'), state.id, 'bingo_requested', { id: requestRows[0].id, name: state.player_name, valid });
    res.json({ valid });
  })
);

module.exports = router;
