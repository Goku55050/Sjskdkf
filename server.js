const express = require("express");
const admin = require("firebase-admin");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY;
const ADMIN_KEY = process.env.ADMIN_KEY;

// 🔐 Firebase from ENV
const serviceAccount = JSON.parse(process.env.FIREBASE_KEY);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://ares-825e6-default-rtdb.firebaseio.com/"
});

const db = admin.database();

// 🔒 Protect API
app.use((req, res, next) => {
  const key = req.headers["x-api-key"];
  if (!key || key !== API_KEY) {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
});

// ✅ Health check
app.get("/", (req, res) => {
  res.send("API is running ✅");
});

// ✅ Add follower
app.post("/addFollower", async (req, res) => {
  try {
    const { userId, targetId } = req.body;

    if (!userId || !targetId) {
      return res.status(400).json({ error: "Missing data" });
    }

    if (userId === targetId) {
      return res.status(400).json({ error: "Invalid action" });
    }

    await db.ref(`followers/${targetId}/${userId}`).set(true);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Ban user (admin only)
app.post("/banUser", async (req, res) => {
  try {
    const { adminKey, userId } = req.body;

    if (adminKey !== ADMIN_KEY) {
      return res.status(403).json({ error: "Not admin" });
    }

    await db.ref(`bans/${userId}`).set(true);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Check ban
app.post("/checkBan", async (req, res) => {
  try {
    const { userId } = req.body;

    const snap = await db.ref(`bans/${userId}`).get();

    res.json({ banned: snap.exists() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
