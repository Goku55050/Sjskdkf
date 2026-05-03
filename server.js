const express = require("express");
const rateLimit = require("express-rate-limit");
const fetch = require("node-fetch");

const app = express();
app.use(express.json());

// ─── CONFIG ────────────────────────────────────────────────────────────────
const PORT          = process.env.PORT || 3000;
const FIREBASE_BASE = "https://ares-rechat-2-default-rtdb.firebaseio.com";
const FIREBASE_SECRET = process.env.FIREBASE_DB_SECRET;
const PROXY_API_KEY   = process.env.PROXY_API_KEY;

if (!FIREBASE_SECRET) { console.error("ERROR: FIREBASE_DB_SECRET env var is missing."); process.exit(1); }
if (!PROXY_API_KEY)   { console.error("ERROR: PROXY_API_KEY env var is missing.");   process.exit(1); }

// ─── ALLOWED COLLECTIONS ───────────────────────────────────────────────────
const ALLOWED_COLLECTIONS = new Set([
  "chat", "online", "unsent", "bans", "custom_titles",
  "music_server", "followers", "profiles", "trophies", "gamebot", "dms",
]);

// ─── RATE LIMITERS ─────────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 60 * 1000, max: 120,
  standardHeaders: true, legacyHeaders: false,
  message: { error: "Too many requests. Slow down." },
});
const writeLimiter = rateLimit({
  windowMs: 60 * 1000, max: 30,
  standardHeaders: true, legacyHeaders: false,
  message: { error: "Too many write requests." },
});

app.use(globalLimiter);

// ─── PING / ROOT ───────────────────────────────────────────────────────────
app.get("/ping", (_req, res) => res.json({ status: "ok", time: new Date().toISOString() }));
app.get("/",     (_req, res) => res.json({ status: "Ares Proxy running" }));

// ─── BROWSER TEST PAGE ─────────────────────────────────────────────────────
app.get("/test", (_req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Ares Proxy Tester</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', sans-serif; background: #0f0f1a; color: #e0e0f0; min-height: 100vh; padding: 24px; }
  h1 { color: #a78bfa; font-size: 1.6rem; margin-bottom: 4px; }
  .subtitle { color: #6b7280; font-size: 0.9rem; margin-bottom: 24px; }
  .card { background: #1a1a2e; border: 1px solid #2d2d4e; border-radius: 12px; padding: 20px; margin-bottom: 20px; }
  label { display: block; font-size: 0.8rem; color: #9ca3af; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.05em; }
  input, select { width: 100%; padding: 10px 14px; background: #0f0f1a; border: 1px solid #3b3b6b; border-radius: 8px; color: #e0e0f0; font-size: 0.95rem; outline: none; }
  input:focus, select:focus { border-color: #7c3aed; }
  .row { display: flex; gap: 10px; margin-bottom: 14px; }
  .row > * { flex: 1; }
  button { background: #7c3aed; color: #fff; border: none; padding: 11px 22px; border-radius: 8px; cursor: pointer; font-size: 0.95rem; font-weight: 600; transition: background 0.2s; }
  button:hover { background: #6d28d9; }
  button.sec { background: #1e3a5f; }
  button.sec:hover { background: #1e40af; }
  .status { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 0.8rem; font-weight: 700; margin-bottom: 10px; }
  .s200 { background: #14532d; color: #86efac; }
  .s4xx { background: #7f1d1d; color: #fca5a5; }
  .s5xx { background: #451a03; color: #fdba74; }
  pre { background: #0a0a15; border: 1px solid #2d2d4e; border-radius: 8px; padding: 14px; font-size: 0.82rem; overflow-x: auto; white-space: pre-wrap; word-break: break-all; max-height: 320px; overflow-y: auto; color: #93c5fd; }
  .tests { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; }
  .test-btn { background: #1a1a2e; border: 1px solid #3b3b6b; color: #c4b5fd; padding: 10px 14px; border-radius: 8px; cursor: pointer; font-size: 0.85rem; text-align: left; transition: border-color 0.2s; }
  .test-btn:hover { border-color: #7c3aed; background: #1f1f3a; }
  .test-btn .method { font-size: 0.7rem; font-weight: 700; padding: 1px 6px; border-radius: 4px; margin-right: 6px; }
  .GET  { background: #164e63; color: #67e8f9; }
  .DEL  { background: #7f1d1d; color: #fca5a5; }
  #spinner { display: none; color: #a78bfa; margin-left: 10px; font-size: 0.9rem; }
</style>
</head>
<body>
<h1>&#128737; Ares Proxy Tester</h1>
<p class="subtitle">Test your Render.com proxy before using it in Roblox</p>

<div class="card">
  <div class="row">
    <div>
      <label>Proxy Base URL</label>
      <input id="baseUrl" value="${process.env.RENDER_EXTERNAL_URL || 'https://sjskdkf.onrender.com'}" />
    </div>
    <div>
      <label>Your PROXY_API_KEY</label>
      <input id="apiKey" type="password" placeholder="Paste your PROXY_API_KEY here" />
    </div>
  </div>
</div>

<div class="card">
  <label style="margin-bottom:12px">Quick Tests</label>
  <div class="tests">
    <button class="test-btn" onclick="quickTest('GET','/ping',false)">
      <span class="method GET">GET</span>/ping &nbsp;(no key needed)
    </button>
    <button class="test-btn" onclick="quickTest('GET','/',false)">
      <span class="method GET">GET</span>/ &nbsp;(no key needed)
    </button>
    <button class="test-btn" onclick="quickTest('GET','/db/chat',false)">
      <span class="method GET">GET</span>/db/chat &nbsp;(should → 403)
    </button>
    <button class="test-btn" onclick="quickTest('GET','/db/chat',true)">
      <span class="method GET">GET</span>/db/chat &nbsp;(with key)
    </button>
    <button class="test-btn" onclick="quickTest('GET','/db/bans',true)">
      <span class="method GET">GET</span>/db/bans
    </button>
    <button class="test-btn" onclick="quickTest('GET','/db/custom_titles',true)">
      <span class="method GET">GET</span>/db/custom_titles
    </button>
    <button class="test-btn" onclick="quickTest('GET','/db/followers',true)">
      <span class="method GET">GET</span>/db/followers
    </button>
    <button class="test-btn" onclick="quickTest('GET','/db/profiles',true)">
      <span class="method GET">GET</span>/db/profiles
    </button>
    <button class="test-btn" onclick="quickTest('GET','/db/trophies',true)">
      <span class="method GET">GET</span>/db/trophies
    </button>
    <button class="test-btn" onclick="quickTest('GET','/db/online',true)">
      <span class="method GET">GET</span>/db/online
    </button>
    <button class="test-btn" onclick="quickTest('GET','/db/dms',true)">
      <span class="method GET">GET</span>/db/dms
    </button>
    <button class="test-btn" onclick="quickTest('GET','/db/hacked',true)">
      <span class="method GET">GET</span>/db/hacked &nbsp;(should → 400)
    </button>
  </div>
</div>

<div class="card">
  <label style="margin-bottom:12px">Custom Request</label>
  <div class="row">
    <div style="flex:0 0 110px">
      <label>Method</label>
      <select id="method">
        <option>GET</option><option>PUT</option><option>POST</option>
        <option>DELETE</option><option>PATCH</option>
      </select>
    </div>
    <div>
      <label>Path (e.g. /db/chat or /db/followers/12345)</label>
      <input id="path" value="/db/chat" />
    </div>
  </div>
  <div style="margin-bottom:14px">
    <label>Body JSON (for PUT/POST/PATCH — leave blank for GET/DELETE)</label>
    <input id="body" placeholder='e.g. {"name":"test"}' />
  </div>
  <button onclick="sendRequest()" id="sendBtn">Send Request</button>
  <span id="spinner">&#9696; Sending...</span>
</div>

<div class="card" id="resultCard" style="display:none">
  <label style="margin-bottom:10px">Response</label>
  <div id="statusBadge" class="status"></div>
  <pre id="result"></pre>
</div>

<script>
async function sendRequest(overridePath, overrideMethod, useKey) {
  const base   = document.getElementById('baseUrl').value.replace(/\\/+$/, '');
  const key    = document.getElementById('apiKey').value.trim();
  const method = overrideMethod || document.getElementById('method').value;
  const path   = overridePath  || document.getElementById('path').value;
  const bodyRaw = document.getElementById('body') ? document.getElementById('body').value.trim() : '';
  const withKey = useKey !== undefined ? useKey : true;

  document.getElementById('spinner').style.display = 'inline';
  document.getElementById('sendBtn') && (document.getElementById('sendBtn').disabled = true);

  const headers = { 'Content-Type': 'application/json' };
  if (withKey && key) headers['x-api-key'] = key;

  const opts = { method, headers };
  if (['PUT','POST','PATCH'].includes(method) && bodyRaw) {
    try { opts.body = JSON.stringify(JSON.parse(bodyRaw)); }
    catch { opts.body = bodyRaw; }
  }

  try {
    const res  = await fetch(base + path, opts);
    const text = await res.text();
    let pretty = text;
    try { pretty = JSON.stringify(JSON.parse(text), null, 2); } catch {}

    const badge = document.getElementById('statusBadge');
    badge.textContent = res.status + ' ' + res.statusText;
    badge.className = 'status ' + (res.status < 300 ? 's200' : res.status < 500 ? 's4xx' : 's5xx');

    document.getElementById('result').textContent = pretty;
    document.getElementById('resultCard').style.display = 'block';
  } catch (e) {
    document.getElementById('result').textContent = 'Fetch error: ' + e.message;
    document.getElementById('resultCard').style.display = 'block';
  }

  document.getElementById('spinner').style.display = 'none';
  document.getElementById('sendBtn') && (document.getElementById('sendBtn').disabled = false);
}

function quickTest(method, path, useKey) {
  document.getElementById('method').value = method;
  document.getElementById('path').value   = path;
  sendRequest(path, method, useKey);
}
</script>
</body>
</html>`);
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
function buildFirebaseUrl(collection, subPath, extraQuery) {
  // subPath may contain dots (e.g. "123_456") — allow alphanumeric, _, -, /
  const safe    = (subPath || "").replace(/[^a-zA-Z0-9_\-/]/g, "");
  const trimmed = safe.replace(/^\/+|\/+$/g, "");
  const path    = trimmed ? `${collection}/${trimmed}` : collection;

  let url = `${FIREBASE_BASE}/${path}.json?auth=${FIREBASE_SECRET}`;

  // Forward safe Firebase query params (orderBy, limitToLast, startAt, endAt, equalTo)
  const SAFE_PARAMS = ["orderBy", "limitToLast", "limitToFirst", "startAt", "endAt", "equalTo", "shallow"];
  for (const param of SAFE_PARAMS) {
    if (extraQuery[param] !== undefined) {
      url += `&${param}=${encodeURIComponent(extraQuery[param])}`;
    }
  }

  return url;
}

// ─── PROXY HANDLER ─────────────────────────────────────────────────────────
async function proxyToFirebase(req, res) {
  // Strip .json suffix that Lua script appends (e.g. /chat.json → /chat)
  const rawPath = req.path.replace(/\.json$/, "").replace(/^\/+/, "");

  const slashIdx  = rawPath.indexOf("/");
  const collection = slashIdx === -1 ? rawPath : rawPath.slice(0, slashIdx);
  const subPath    = slashIdx === -1 ? ""      : rawPath.slice(slashIdx + 1);

  if (!collection || !ALLOWED_COLLECTIONS.has(collection)) {
    return res.status(400).json({ error: `Unknown collection: "${collection}"` });
  }

  const url    = buildFirebaseUrl(collection, subPath, req.query);
  const method = req.method;

  try {
    const opts = { method };
    if (["PUT", "POST", "PATCH"].includes(method) && req.body) {
      opts.body    = JSON.stringify(req.body);
      opts.headers = { "Content-Type": "application/json" };
    }

    const upstream = await fetch(url, opts);
    const text     = await upstream.text();

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

dbRouter.use(requireApiKey);

dbRouter.use((req, res, next) => {
  if (["PUT", "POST", "PATCH", "DELETE"].includes(req.method)) {
    return writeLimiter(req, res, next);
  }
  next();
});

dbRouter.all("*", proxyToFirebase);
app.use("/db", dbRouter);

// ─── 404 FALLBACK ──────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: "Not found." }));

// ─── START ─────────────────────────────────────────────────────────────────
app.listen(PORT, () => console.log(`Ares Proxy running on port ${PORT}`));
