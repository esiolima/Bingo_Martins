const express = require('express');
const { pool } = require('../db');
const { requireRole } = require('../auth');
const { asyncHandler, ApiError } = require('../middleware/errors');
const { emitRoomEvent } = require('../events');

const router = express.Router();

router.post(
  '/:id/resolve',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      'SELECT b.*, r.admin_id FROM bingo_requests b JOIN rooms r ON r.id = b.room_id WHERE b.id = $1',
      [req.params.id]
    );
    const request = rows[0];
    if (!request || request.admin_id !== req.user.id) throw new ApiError(403, 'Sem permissão.');

    if (req.body.approve && request.valid) {
      await pool.query("UPDATE bingo_requests SET status = 'approved' WHERE id = $1", [request.id]);
      await pool.query("UPDATE rooms SET status = 'finished', winner_player_id = $1 WHERE id = $2", [
        request.player_id,
        request.room_id,
      ]);
      await emitRoomEvent(req.app.get('io'), request.room_id, 'bingo_approved', { playerId: request.player_id });
    } else {
      await pool.query("UPDATE bingo_requests SET status = 'rejected' WHERE id = $1", [request.id]);
      const { rows: pendingRows } = await pool.query(
        "SELECT count(*) FROM bingo_requests WHERE room_id = $1 AND status = 'pending'",
        [request.room_id]
      );
      if (!+pendingRows[0].count) await pool.query("UPDATE rooms SET status = 'in_progress' WHERE id = $1", [request.room_id]);
      await emitRoomEvent(req.app.get('io'), request.room_id, 'bingo_rejected');
    }
    res.json({ ok: true });
  })
);

module.exports = router;
