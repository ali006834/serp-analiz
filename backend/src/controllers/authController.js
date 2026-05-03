const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function signToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d"
  });
}

async function register(req, res) {
  const { email, password, name } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email ve şifre zorunludur." });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: "Şifre en az 6 karakter olmalıdır." });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ error: "Bu email zaten kayıtlı." });
  }

  const hashed = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { email, password: hashed, name: name || null }
  });

  const token = signToken(user.id);
  return res.status(201).json({
    token,
    user: { id: user.id, email: user.email, name: user.name }
  });
}

async function login(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email ve şifre zorunludur." });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return res.status(401).json({ error: "Email veya şifre hatalı." });
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return res.status(401).json({ error: "Email veya şifre hatalı." });
  }

  const token = signToken(user.id);
  return res.json({
    token,
    user: { id: user.id, email: user.email, name: user.name }
  });
}

async function me(req, res) {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { id: true, email: true, name: true, createdAt: true }
  });

  if (!user) {
    return res.status(404).json({ error: "Kullanıcı bulunamadı." });
  }

  return res.json({ user });
}

module.exports = { register, login, me };
