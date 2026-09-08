const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { pool } = require('../db');
const { signToken } = require('../auth');
const { validateBody } = require('../validate');
const { authLimiter } = require('../rateLimit');
const { asyncHandler, ApiError } = require('../middleware/errors');

const router = express.Router();

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Informe seu nome.'),
  email: z.string().trim().email('Informe um e-mail válido.'),
  password: z.string().min(6, 'A senha deve ter pelo menos 6 caracteres.'),
});

const loginSchema = z.object({
  email: z.string().trim().email('Informe um e-mail válido.'),
  password: z.string().min(1, 'Informe sua senha.'),
});

router.post(
  '/register',
  authLimiter,
  validateBody(registerSchema),
  asyncHandler(async (req, res) => {
    const { name, email, password } = req.body;
    const passwordHash = await bcrypt.hash(password, 12);
    let admin;
    try {
      const { rows } = await pool.query(
        'INSERT INTO admins(name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email',
        [name, email.toLowerCase(), passwordHash]
      );
      admin = rows[0];
    } catch (e) {
      throw new ApiError(400, 'Este e-mail já está cadastrado.');
    }
    res.json({ token: signToken({ role: 'admin', id: admin.id }), admin });
  })
);

router.post(
  '/login',
  authLimiter,
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const { rows } = await pool.query('SELECT * FROM admins WHERE email = $1', [email.toLowerCase()]);
    const admin = rows[0];
    if (!admin || !(await bcrypt.compare(password, admin.password_hash))) {
      throw new ApiError(401, 'E-mail ou senha incorretos.');
    }
    res.json({
      token: signToken({ role: 'admin', id: admin.id }),
      admin: { id: admin.id, name: admin.name, email: admin.email },
    });
  })
);

module.exports = router;
