const express = require('express');
const { pool } = require('../db');
const { asyncHandler } = require('../middleware/errors');

const router = express.Router();

router.get(
  '/rooms',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(`
      SELECT code, name, max_players, status,
        (SELECT count(*) FROM players WHERE room_id = rooms.id) AS players
      FROM rooms
      WHERE status IN ('waiting', 'in_progress')
      ORDER BY created_at DESC
    `);
    res.json(rows);
  })
);

module.exports = router;
