const express = require("express");
const admin = require("firebase-admin");
const cors = require("cors");
const crypto = require("crypto");

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY;
const ADMIN_KEY = process.env.ADMIN_KEY;

// 🔐 Firebase
const serviceAccount = JSON.parse(process.env.FIREBASE_KEY);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://ares-825e6-default-rtdb.firebaseio.com/"
});

const db = admin.database();

// =================================
// 🌐 UPTIME BOT SAFE ROUTE
// =================================

app.get("/ping", (req, res) => {
  res.send("OK");
});

// =================================
// 🔑 TOKEN SYSTEM (UPGRADED)
// =================================

const tokens = {};
const TOKEN_EXPIRY = 5 * 60 * 1000; // 5 min

function generateToken() {
  return crypto.randomBytes(24).toString("hex");
}

// 🔑 Create token
app.post("/auth", (req, res) => {
  const key = req.headers["x-api-key"];
  const { userId } = req.body;

  if (!key || key !== API_KEY) {
    return res.status(403).json({ error: "Forbidden" });
  }

  if (!userId) {
    return res.status(400).json({ error: "Missing userId" });
  }

  const token = generateToken();

  tokens[token] = {
    userId,
    created: Date.now(),
    lastRequest: 0
  };

  res.json({ token });
});

// 🔒 Verify token
function verifyToken(req, res, next) {
  const token = req.headers["x-token"];

  if (!token || !tokens[token]) {
    return res.status(403).json({ error: "Invalid token" });
  }

  const data = tokens[token];

  // ⏳ Expiry check
  if (Date.now() - data.created > TOKEN_EXPIRY) {
    delete tokens[token];
    return res.status(403).json({ error: "Token expired" });
  }

  // 🚫 Rate limit (1 req/sec)
  if (Date.now() - data.lastRequest < 1000) {
    return res.status(429).json({ error: "Too fast" });
  }

  data.lastRequest = Date.now();
  req.userId = data.userId;

  next();
}

// =================================
// 🧪 Health
// =================================

app.get("/", (req, res) => {
  res.send("API running secure ✅");
});

// =================================
// 🔒 BAN SYSTEM
// =================================

app.post("/checkBan", verifyToken, async (req, res) => {
  const snap = await db.ref(`bans/${req.userId}`).get();
  res.json({ banned: snap.exists() });
});

app.post("/banUser", verifyToken, async (req, res) => {
  const { adminKey, userId } = req.body;

  if (adminKey !== ADMIN_KEY) {
    return res.status(403).json({ error: "Not admin" });
  }

  await db.ref(`bans/${userId}`).set(true);
  res.json({ success: true });
});

// =================================
// ⭐ FOLLOW
// =================================

app.post("/addFollower", verifyToken, async (req, res) => {
  const { targetId } = req.body;

  if (!targetId || targetId === req.userId) {
    return res.status(400).json({ error: "Invalid data" });
  }

  await db.ref(`followers/${targetId}/${req.userId}`).set(true);
  res.json({ success: true });
});

// =================================
// 💬 CHAT
// =================================

app.post("/sendMessage", verifyToken, async (req, res) => {
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ error: "Missing message" });
  }

  const msg = {
    userId: req.userId,
    message,
    time: Date.now()
  };

  await db.ref("chat").push(msg);

  res.json({ success: true });
});

app.post("/getMessages", verifyToken, async (req, res) => {
  const snap = await db.ref("chat").limitToLast(20).get();

  let data = [];
  snap.forEach(child => data.push(child.val()));

  res.json({ messages: data });
});

// =================================

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
