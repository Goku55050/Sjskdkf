const express = require("express");
const rateLimit = require("express-rate-limit");
const fetch = require("node-fetch");

const app = express();
app.use(express.json());

// ─── CONFIG ────────────────────────────────────────────────────────────────
const PORT             = process.env.PORT || 3000;
const FIREBASE_BASE    = "https://ares-rechat-2-default-rtdb.firebaseio.com";
const FIREBASE_SECRET  = process.env.FIREBASE_DB_SECRET;
const PROXY_API_KEY    = process.env.PROXY_API_KEY;

if (!FIREBASE_SECRET) {
  console.error("ERROR: FIREBASE_DB_SECRET env var is missing.");
  process.exit(1);
}
if (!PROXY_API_KEY) {
  console.error("ERROR: PROXY_API_KEY env var is missing.");
  process.exit(1);
}

// ─── ALLOWED COLLECTIONS ───────────────────────────────────────────────────
// Only these Firebase paths can be accessed through this proxy.
// Hackers cannot reach any other path even if they find this server.
const ALLOWED_COLLECTIONS = new Set([
  "chat",
  "online",
  "unsent",
  "bans",
  "custom_titles",
  "music_server",
  "followers",
  "profiles",
  "trophies",
  "gamebot",
  "dms",
]);

// ─── RATE LIMITERS ─────────────────────────────────────────────────────────
// Global: 120 requests per minute per IP
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Slow down." },
});

// Write operations: max 30 per minute per IP
const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many write requests." },
});

app.use(globalLimiter);

// ─── UPTIME BOT PING ENDPOINT ──────────────────────────────────────────────
// Point your UptimeRobot / BetterUptime monitor at: GET /ping
app.get("/ping", (_req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

app.get("/", (_req, res) => {
  res.json({ status: "Ares Proxy running" });
});

// ─── API KEY MIDDLEWARE ────────────────────────────────────────────────────
function requireApiKey(req, res, next) {
  const key = req.headers["x-api-key"] || req.query.api_key;
  if (!key || key !== PROXY_API_KEY) {
    return res.status(403).json({ error: "Forbidden: invalid or missing API key." });
  }
  next();
}

// ─── FIREBASE URL BUILDER ──────────────────────────────────────────────────
function buildFirebaseUrl(collection, subPath) {
  // Strip any characters that are not safe for Firebase paths
  const safe = (subPath || "").replace(/[^a-zA-Z0-9_\-/]/g, "");
  const trimmed = safe.replace(/^\/+|\/+$/g, "");
  const path = trimmed ? `${collection}/${trimmed}` : collection;
  return `${FIREBASE_BASE}/${path}.json?auth=${FIREBASE_SECRET}`;
}

// ─── PROXY HANDLER ─────────────────────────────────────────────────────────
async function proxyToFirebase(req, res) {
  // req.path inside /db router is like /chat, /followers/12345, etc.
  const cleaned = req.path.replace(/^\/+/, "");
  const slashIdx = cleaned.indexOf("/");
  const collection = slashIdx === -1 ? cleaned : cleaned.slice(0, slashIdx);
  const subPath    = slashIdx === -1 ? ""       : cleaned.slice(slashIdx + 1);

  if (!collection || !ALLOWED_COLLECTIONS.has(collection)) {
    return res.status(400).json({ error: `Unknown collection: "${collection}"` });
  }

  const url = buildFirebaseUrl(collection, subPath);
  const method = req.method;

  try {
    const opts = { method };
    if (["PUT", "POST", "PATCH"].includes(method) && req.body) {
      opts.body = JSON.stringify(req.body);
      opts.headers = { "Content-Type": "application/json" };
    }

    const upstream = await fetch(url, opts);
    const text = await upstream.text();

    return res.status(upstream.status)
              .set("Content-Type", "application/json")
              .send(text);
  } catch (err) {
    console.error("Firebase fetch error:", err.message);
    return res.status(502).json({ error: "Upstream Firebase request failed." });
  }
}

// ─── ROUTES ────────────────────────────────────────────────────────────────
const dbRouter = express.Router();

// All /db routes require a valid API key
dbRouter.use(requireApiKey);

// Apply write limiter to mutating methods
dbRouter.use((req, res, next) => {
  const writeMethods = ["PUT", "POST", "PATCH", "DELETE"];
  if (writeMethods.includes(req.method)) {
    return writeLimiter(req, res, next);
  }
  next();
});

// Catch-all: proxy everything under /db to Firebase
dbRouter.all("*", proxyToFirebase);

app.use("/db", dbRouter);

// ─── 404 FALLBACK ──────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: "Not found." });
});

// ─── START ─────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Ares Proxy running on port ${PORT}`);
});
