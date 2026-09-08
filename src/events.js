const { pool } = require('./db');

async function emitRoomEvent(io, roomId, type, payload = {}) {
  await pool.query('INSERT INTO game_events(room_id, type, payload) VALUES ($1, $2, $3)', [roomId, type, payload]);
  const { rows } = await pool.query('SELECT code FROM rooms WHERE id = $1', [roomId]);
  if (rows[0]) io.to(rows[0].code).emit('room:update', { type, payload });
}

module.exports = { emitRoomEvent };
