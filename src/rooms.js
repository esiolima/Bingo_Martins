const crypto = require('crypto');
const { pool } = require('./db');

async function getRoomByCode(code) {
  const { rows } = await pool.query('SELECT * FROM rooms WHERE code = $1', [code]);
  return rows[0];
}

function generateRoomCode() {
  return 'BINGO-' + crypto.randomBytes(2).toString('hex').toUpperCase();
}

module.exports = { getRoomByCode, generateRoomCode };
