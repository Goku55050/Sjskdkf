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
// 🔑 TOKEN SYSTEM
// =================================

const tokens = {}; // in-memory (simple)

function generateToken() {
  return crypto.randomBytes(24).toString("hex");
}

// Step 1: get token
app.post("/auth", (req, res) => {
  const key = req.headers["x-api-key"];

  if (!key || key !== API_KEY) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const token = generateToken();

  tokens[token] = {
    created: Date.now()
  };

  res.json({ token });
});

// Step 2: verify token
function verifyToken(req, res, next) {
  const token = req.headers["x-token"];

  if (!token || !tokens[token]) {
    return res.status(403).json({ error: "Invalid token" });
  }

  next();
}

// =================================
// 🧪 Health
// =================================

app.get("/", (req, res) => {
  res.send("API running with token system ✅");
});

// =================================
// 🔒 BAN SYSTEM
// =================================

app.post("/checkBan", verifyToken, async (req, res) => {
  const { userId } = req.body;
  const snap = await db.ref(`bans/${userId}`).get();
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
  const { userId, targetId } = req.body;

  if (!userId || !targetId || userId === targetId) {
    return res.status(400).json({ error: "Invalid data" });
  }

  await db.ref(`followers/${targetId}/${userId}`).set(true);
  res.json({ success: true });
});

// =================================
// 💬 CHAT
// =================================

app.post("/sendMessage", verifyToken, async (req, res) => {
  const { userId, username, message } = req.body;

  if (!userId || !message) {
    return res.status(400).json({ error: "Missing data" });
  }

  const msg = {
    userId,
    username: username || "Unknown",
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
