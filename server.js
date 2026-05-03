const express = require("express");
const fetch   = require("node-fetch");

const app = express();
app.use(express.raw({ type: "*/*", limit: "1mb" }));

// --- CONFIGURATION ---
const PORT            = process.env.PORT || 3000;
const FIREBASE_BASE   = "https://ares-rechat-2-default-rtdb.firebaseio.com";
const FIREBASE_SECRET = process.env.FIREBASE_DB_SECRET;
const PROXY_API_KEY   = process.env.PROXY_API_KEY;

// List of folders allowed to be accessed
const ALLOWED_COLLECTIONS = new Set([
  "chat", "online", "unsent", "bans", "custom_titles",
  "music_server", "followers", "profiles", "trophies", "gamebot", "dms",
]);

// --- SECURITY CHECK ---
function requireApiKey(req, res, next) {
  const key = req.headers["x-api-key"] || req.query.api_key;
  if (!key || key !== PROXY_API_KEY) {
    return res.status(403).json({ error: "Access Denied: Invalid Proxy Key" });
  }
  next();
}

// --- CORE PROXY LOGIC ---
async function handleDatabaseRequest(req, res) {
  // 1. Clean the path (remove /db/ and .json)
  let cleanPath = req.path.replace(/^\/db/, "").replace(/\.json$/, "").replace(/^\/+/, "");
  
  // 2. Identify the collection (e.g., "chat")
  const collection = cleanPath.split("/")[0];

  if (!ALLOWED_COLLECTIONS.has(collection)) {
    return res.status(400).json({ error: `Folder "${collection}" is protected or invalid.` });
  }

  // 3. Block DELETE requests from the client (Security)
  if (req.method === "DELETE") {
    return res.status(403).json({ error: "DELETE method is disabled for safety." });
  }

  // 4. Build the Firebase URL with Auth
  const rawQS = (req.originalUrl.split("?")[1] || "");
  const filteredQS = rawQS.split("&").filter(p => p && !p.startsWith("api_key=")).join("&");
  const fbUrl = `${FIREBASE_BASE}/${cleanPath}.json?auth=${FIREBASE_SECRET}${filteredQS ? "&" + filteredQS : ""}`;

  try {
    const opts = { 
      method: req.method,
      headers: { "Content-Type": "application/json" }
    };

    if (["PUT", "POST", "PATCH"].includes(req.method) && req.body.length > 0) {
      opts.body = req.body;
    }

    const upstream = await fetch(fbUrl, opts);
    const text = await upstream.text();

    res.status(upstream.status).set("Content-Type", "application/json").send(text);
  } catch (err) {
    res.status(502).json({ error: "Firebase Connection Failed" });
  }
}

// --- ROUTES ---
app.get("/ping", (req, res) => res.json({ status: "alive" }));
app.all("/db/*", requireApiKey, handleDatabaseRequest);
// Fallback: if user forgets /db/, try to handle it anyway
app.all("/:folder", requireApiKey, handleDatabaseRequest); 

app.listen(PORT, () => console.log(`Proxy running on port ${PORT}`));
