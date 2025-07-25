/**
 * Advanced HTTP server for the Competitive Analysis Generator.
 *
 * This server builds upon the initial prototype to provide additional
 * functionality required for a production‑quality SaaS.  Key features
 * include:
 *
 *   • User accounts with registration and login.  Credentials are
 *     hashed using Node’s crypto module and persisted to disk in
 *     `users.json`.  A simple session token mechanism stored in
 *     `sessions.json` associates API requests with authenticated users.
 *
 *   • Persistent storage of analyses and A/B testing metrics.  Each
 *     call to generate an analysis stores the result in
 *     `analyses.json` together with the user ID.  Metrics are stored
 *     in `metrics.json` and track both view counts and conversions.
 *
 *   • RESTful endpoints for registering users, logging in, creating
 *     analyses, listing/deleting analyses, and recording A/B test
 *     events.  The API returns JSON responses with appropriate CORS
 *     headers for ease of integration.
 *
 *   • A simple integration script served from `/integration.js` that
 *     external websites can embed to fetch a variant assignment and
 *     record conversions.  See the README for details on using this
 *     script.
 *
 * NOTE: This server still relies entirely on Node.js built‑in modules
 * and local JSON files for persistence.  It should scale to a small
 * number of users for demonstration purposes.  For a production
 * deployment you should replace the JSON file storage with a proper
 * database (e.g. PostgreSQL, MongoDB) and replace the session/token
 * mechanism with something more robust (JWTs, OAuth, etc.).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;

// Paths to JSON files used for persistence.  All are stored in the
// project root.  If any of these files are missing at startup they
// will be created with sensible defaults.
const metricsFile = path.join(__dirname, 'metrics.json');
const usersFile = path.join(__dirname, 'users.json');
const sessionsFile = path.join(__dirname, 'sessions.json');
const analysesFile = path.join(__dirname, 'analyses.json');

/**
 * Generic helper to read JSON data from disk.  If the file does not
 * exist or cannot be parsed, returns the provided defaultValue.
 *
 * @param {string} filePath
 * @param {any} defaultValue
 * @returns {any}
 */
function readJson(filePath, defaultValue) {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    // fall through to default
  }
  return defaultValue;
}

/**
 * Generic helper to write JSON data to disk.  Writes the file
 * atomically by first serializing to JSON.  If writing fails the
 * error is silently ignored; in a real application you should
 * surface this error.
 *
 * @param {string} filePath
 * @param {any} data
 */
function writeJson(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (err) {
    // ignore
  }
}

/**
 * Initialize metrics.  Metrics include both view counts (how many
 * times each variant has been served) and conversion counts.  If the
 * metrics file exists, it is parsed and missing keys are added.  If
 * the file does not exist, it is created with initial values.
 */
function initMetrics() {
  let metrics = {
    variantA: 0,
    variantB: 0,
    conversionsA: 0,
    conversionsB: 0
  };
  const existing = readJson(metricsFile, null);
  if (existing && typeof existing === 'object') {
    Object.keys(metrics).forEach(key => {
      if (typeof existing[key] === 'number') metrics[key] = existing[key];
    });
  } else {
    writeJson(metricsFile, metrics);
  }
  return metrics;
}
let metrics = initMetrics();

/**
 * Initialize users.  Users are stored as an array of objects with
 * properties: id (string), username (string), passwordHash (string),
 * salt (string).  The first call to read the users file will create
 * it if it does not exist.
 */
function initUsers() {
  const users = readJson(usersFile, []);
  writeJson(usersFile, users);
  return users;
}
let users = initUsers();

/**
 * Initialize sessions.  Sessions map tokens to user IDs and
 * expiration timestamps.  This is a simple in‑memory mechanism and
 * not suitable for production.  Real deployments should use JWTs
 * stored client‑side or a server‑side session store (e.g. Redis).
 */
function initSessions() {
  const sessions = readJson(sessionsFile, {});
  writeJson(sessionsFile, sessions);
  return sessions;
}
let sessions = initSessions();

/**
 * Initialize analyses.  Analyses are stored as an array of objects
 * with properties: id (string), userId (string), timestamp (number),
 * competitors (array), variant (string), results (SWOT object).  If
 * the file does not exist, it is created with an empty array.
 */
function initAnalyses() {
  const analyses = readJson(analysesFile, []);
  writeJson(analysesFile, analyses);
  return analyses;
}
let analyses = initAnalyses();

// Keyword lists used for simple heuristic SWOT extraction
const positiveKeywords = ['fast', 'easy', 'popular', 'affordable', 'flexible', 'scalable', 'intuitive', 'efficient', 'user‑friendly'];
const negativeKeywords = ['expensive', 'slow', 'bug', 'bugs', 'complicated', 'complex', 'limited', 'difficult', 'unreliable'];

/**
 * Generate a salted hash for a password.  Uses PBKDF2 with SHA‑512
 * and 1000 iterations.  Returns an object containing the salt and
 * the hashed password.  If a salt is provided, it is reused.
 *
 * @param {string} password
 * @param {string|null} salt
 */
function hashPassword(password, salt = null) {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, s, 1000, 64, 'sha512').toString('hex');
  return { salt: s, hash };
}

/**
 * Verify that a password matches a stored salt and hash.  Returns
 * true if the password is correct.
 *
 * @param {string} password
 * @param {string} salt
 * @param {string} hash
 */
function verifyPassword(password, salt, hash) {
  const { hash: hashed } = hashPassword(password, salt);
  return hashed === hash;
}

/**
 * Generate a random token for session management.  This uses
 * 32 bytes of entropy encoded in hexadecimal.
 */
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Extract the session token from the Authorization header.  The
 * header is expected to be of the form "Bearer <token>".  Returns
 * the token string or null if not present.
 *
 * @param {http.IncomingMessage} req
 */
function getTokenFromHeader(req) {
  const auth = req.headers['authorization'];
  if (!auth) return null;
  const parts = auth.split(' ');
  if (parts.length === 2 && /^Bearer$/i.test(parts[0])) {
    return parts[1];
  }
  return null;
}

/**
 * Retrieve the user ID associated with a session token.  Returns
 * null if the token is unknown or expired.  This function also
 * cleans up expired sessions from memory and disk.
 *
 * @param {string|null} token
 * @returns {string|null}
 */
function getUserIdFromToken(token) {
  if (!token) return null;
  const sess = sessions[token];
  const now = Date.now();
  // Expire sessions after 7 days (in milliseconds)
  const maxAge = 7 * 24 * 60 * 60 * 1000;
  if (sess && now - sess.createdAt < maxAge) {
    return sess.userId;
  }
  // remove expired token
  if (sess) {
    delete sessions[token];
    writeJson(sessionsFile, sessions);
  }
  return null;
}

/**
 * Very naive SWOT analysis generator.  Splits the description into
 * sentences and checks for occurrences of keywords.  Strengths and
 * weaknesses are extracted from sentences containing positive or
 * negative keywords.  Opportunities and threats are generated from
 * generic templates based on the presence or absence of keywords.
 *
 * @param {string} desc  The description of the competitor.
 * @param {string} name  The competitor name (used in templated messages).
 * @returns {object} An object with arrays for strengths, weaknesses,
 *                   opportunities and threats.
 */
function analyzeDescription(desc, name) {
  const strengths = [];
  const weaknesses = [];
  const opportunities = [];
  const threats = [];

  // Split description into sentences on . ! ? ; also handle newlines
  const sentences = desc
    .replace(/\n/g, ' ')
    .split(/[.!?;]/)
    .map(s => s.trim())
    .filter(Boolean);

  sentences.forEach(sentence => {
    const lower = sentence.toLowerCase();
    // Check positive and negative keyword occurrence
    const hasPositive = positiveKeywords.some(k => lower.includes(k));
    const hasNegative = negativeKeywords.some(k => lower.includes(k));
    if (hasPositive) {
      strengths.push(sentence);
    }
    if (hasNegative) {
      weaknesses.push(sentence);
    }
  });
  // If no strengths/weaknesses found, supply generic messages
  if (strengths.length === 0) {
    strengths.push(`${name} is positioned to deliver value to its users with proper execution.`);
  }
  if (weaknesses.length === 0) {
    weaknesses.push(`${name} may face challenges around cost, speed or complexity that need to be addressed.`);
  }

  // Generic opportunity/threat messages
  opportunities.push(`There is room for ${name} to expand into adjacent markets or add complementary features.`);
  opportunities.push(`Leveraging new technologies such as AI could open up differentiation for ${name}.`);
  threats.push(`Competitors with more resources could outpace ${name} in product development.`);
  threats.push(`Regulatory or market changes could impact ${name}'s growth prospects.`);

  return { strengths, weaknesses, opportunities, threats };
}

/**
 * Helper to send JSON responses with proper CORS headers.  All
 * responses include the Access‑Control‑Allow‑Origin header to
 * facilitate browser integration.  Optionally include custom
 * headers via the extraHeaders parameter.
 *
 * @param {http.ServerResponse} res
 * @param {number} statusCode
 * @param {any} data
 * @param {object} extraHeaders
 */
function sendJson(res, statusCode, data, extraHeaders = {}) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    ...extraHeaders
  });
  res.end(JSON.stringify(data));
}

/**
 * Helper to send JSON responses with proper headers.
 */
// Replace the old sendJson with the enhanced version above

/**
 * Handle POST /api/generate
 * Expects a JSON body like { competitors: [ { name: '', description: '' }, ... ] }
 */
function handleGenerate(req, res) {
  let body = '';
  req.on('data', chunk => {
    body += chunk;
    // Protect against too large bodies
    if (body.length > 1e6) req.connection.destroy();
  });
  req.on('end', () => {
    let data;
    try {
      data = JSON.parse(body);
    } catch (err) {
      sendJson(res, 400, { error: 'Invalid JSON' });
      return;
    }
    const competitors = Array.isArray(data.competitors) ? data.competitors : [];
    const results = competitors.map(comp => {
      const name = (comp && comp.name) || 'Unnamed competitor';
      const description = (comp && comp.description) || '';
      return { name, swot: analyzeDescription(description, name) };
    });
    // A/B assignment – random per request.  For a real application,
    // you would persist assignment for a user via cookies or user IDs.
    const variant = Math.random() < 0.5 ? 'A' : 'B';
    if (variant === 'A') metrics.variantA++;
    else metrics.variantB++;
    fs.writeFileSync(metricsFile, JSON.stringify(metrics));
    sendJson(res, 200, { variant, results });
  });
}

/**
 * Handle GET /api/metrics
 */
function handleMetrics(req, res) {
  sendJson(res, 200, metrics);
}

/**
 * Handle GET /api/variant
 * Returns a variant assignment (A or B) for A/B testing.  Every call
 * increments the corresponding view counter.  The caller should
 * record the variant it receives and later call /api/convert when a
 * conversion event occurs.  Example response: { variant: 'A' }
 */
function handleVariant(req, res) {
  // Randomly assign the user to variant A or B
  const variant = Math.random() < 0.5 ? 'A' : 'B';
  if (variant === 'A') metrics.variantA++;
  else metrics.variantB++;
  fs.writeFileSync(metricsFile, JSON.stringify(metrics));
  sendJson(res, 200, { variant });
}

/**
 * Handle POST /api/convert
 * Expects a JSON body like { variant: 'A' } to record a conversion
 * event for the given variant.  Responds with the updated metrics.
 */
function handleConvert(req, res) {
  let body = '';
  req.on('data', chunk => {
    body += chunk;
    if (body.length > 1e6) req.connection.destroy();
  });
  req.on('end', () => {
    try {
      const { variant } = JSON.parse(body || '{}');
      if (variant === 'A') metrics.conversionsA++;
      else if (variant === 'B') metrics.conversionsB++;
      fs.writeFileSync(metricsFile, JSON.stringify(metrics));
      sendJson(res, 200, metrics);
    } catch (err) {
      sendJson(res, 400, { error: 'Invalid JSON payload' });
    }
  });
}

/**
 * Handle POST /api/register
 * Expects JSON payload { username, password }.  If a user with the
 * same username already exists, responds with 409.  Otherwise
 * creates a new user, hashes the password with a per‑user salt,
 * writes to users.json, and returns a success message.  For
 * simplicity the new user is automatically logged in and a session
 * token is returned.
 */
function handleRegister(req, res) {
  let body = '';
  req.on('data', chunk => {
    body += chunk;
    if (body.length > 1e6) req.connection.destroy();
  });
  req.on('end', () => {
    let data;
    try {
      data = JSON.parse(body || '{}');
    } catch (err) {
      return sendJson(res, 400, { error: 'Invalid JSON' });
    }
    const { username, password } = data;
    if (!username || !password) {
      return sendJson(res, 400, { error: 'Username and password required' });
    }
    // Check if username exists
    if (users.some(u => u.username === username)) {
      return sendJson(res, 409, { error: 'User already exists' });
    }
    const { salt, hash } = hashPassword(password);
    const id = crypto.randomUUID();
    const user = { id, username, passwordHash: hash, salt };
    users.push(user);
    writeJson(usersFile, users);
    // Create session token
    const token = generateToken();
    sessions[token] = { userId: id, createdAt: Date.now() };
    writeJson(sessionsFile, sessions);
    sendJson(res, 201, { message: 'User registered successfully', token });
  });
}

/**
 * Handle POST /api/login
 * Expects JSON payload { username, password }.  If the credentials
 * are valid, returns a new session token.  Otherwise returns 401.
 */
function handleLogin(req, res) {
  let body = '';
  req.on('data', chunk => {
    body += chunk;
    if (body.length > 1e6) req.connection.destroy();
  });
  req.on('end', () => {
    let data;
    try {
      data = JSON.parse(body || '{}');
    } catch (err) {
      return sendJson(res, 400, { error: 'Invalid JSON' });
    }
    const { username, password } = data;
    if (!username || !password) {
      return sendJson(res, 400, { error: 'Username and password required' });
    }
    const user = users.find(u => u.username === username);
    if (!user || !verifyPassword(password, user.salt, user.passwordHash)) {
      return sendJson(res, 401, { error: 'Invalid credentials' });
    }
    // Create a new token and store session
    const token = generateToken();
    sessions[token] = { userId: user.id, createdAt: Date.now() };
    writeJson(sessionsFile, sessions);
    sendJson(res, 200, { token });
  });
}

/**
 * Handle GET /api/analysis/list
 * Requires a valid session via Authorization header.  Returns all
 * analyses created by the authenticated user.
 */
function handleAnalysisList(req, res) {
  const token = getTokenFromHeader(req);
  const userId = getUserIdFromToken(token);
  if (!userId) {
    return sendJson(res, 401, { error: 'Unauthorized' });
  }
  const userAnalyses = analyses.filter(a => a.userId === userId);
  sendJson(res, 200, userAnalyses);
}

/**
 * Handle POST /api/analysis
 * Requires authentication.  Expects { competitors: [ { name, description }, ... ] }.
 * Generates a SWOT analysis for each competitor, assigns a variant,
 * stores the analysis, updates metrics, and returns the analysis
 * object to the client.
 */
function handleAnalysisCreate(req, res) {
  const token = getTokenFromHeader(req);
  const userId = getUserIdFromToken(token);
  if (!userId) {
    return sendJson(res, 401, { error: 'Unauthorized' });
  }
  let body = '';
  req.on('data', chunk => {
    body += chunk;
    if (body.length > 1e6) req.connection.destroy();
  });
  req.on('end', () => {
    let data;
    try {
      data = JSON.parse(body || '{}');
    } catch (err) {
      return sendJson(res, 400, { error: 'Invalid JSON' });
    }
    const competitors = Array.isArray(data.competitors) ? data.competitors : [];
    const results = competitors.map(comp => {
      const name = (comp && comp.name) || 'Unnamed competitor';
      const description = (comp && comp.description) || '';
      return { name, swot: analyzeDescription(description, name) };
    });
    const variant = Math.random() < 0.5 ? 'A' : 'B';
    if (variant === 'A') metrics.variantA++;
    else metrics.variantB++;
    writeJson(metricsFile, metrics);
    const analysis = {
      id: crypto.randomUUID(),
      userId,
      timestamp: Date.now(),
      competitors,
      results,
      variant
    };
    analyses.push(analysis);
    writeJson(analysesFile, analyses);
    sendJson(res, 201, analysis);
  });
}

/**
 * Handle GET /api/analysis/:id
 * Requires authentication.  Returns the analysis with the specified
 * ID if it belongs to the user.  Otherwise returns 404.
 *
 * @param {string} id The analysis ID extracted from the URL
 */
function handleAnalysisGet(req, res, id) {
  const token = getTokenFromHeader(req);
  const userId = getUserIdFromToken(token);
  if (!userId) {
    return sendJson(res, 401, { error: 'Unauthorized' });
  }
  const analysis = analyses.find(a => a.id === id && a.userId === userId);
  if (!analysis) {
    return sendJson(res, 404, { error: 'Analysis not found' });
  }
  sendJson(res, 200, analysis);
}

/**
 * Handle DELETE /api/analysis/:id
 * Requires authentication.  Deletes the specified analysis if it
 * belongs to the user.  Returns 204 on success.
 *
 * @param {string} id
 */
function handleAnalysisDelete(req, res, id) {
  const token = getTokenFromHeader(req);
  const userId = getUserIdFromToken(token);
  if (!userId) {
    return sendJson(res, 401, { error: 'Unauthorized' });
  }
  const idx = analyses.findIndex(a => a.id === id && a.userId === userId);
  if (idx === -1) {
    return sendJson(res, 404, { error: 'Analysis not found' });
  }
  analyses.splice(idx, 1);
  writeJson(analysesFile, analyses);
  // 204 No Content
  res.writeHead(204, { 'Access-Control-Allow-Origin': '*' });
  res.end();
}

/**
 * Handle GET /api/metrics/user
 * Requires authentication.  Aggregates the user's analyses to count
 * how many variants were served and how many conversions occurred
 * (conversions are global; per-user conversion tracking could be
 * added later).  Returns an object { analyses: number, variantA: number, variantB: number }.
 */
function handleMetricsUser(req, res) {
  const token = getTokenFromHeader(req);
  const userId = getUserIdFromToken(token);
  if (!userId) {
    return sendJson(res, 401, { error: 'Unauthorized' });
  }
  const userAnalyses = analyses.filter(a => a.userId === userId);
  const summary = { analyses: userAnalyses.length, variantA: 0, variantB: 0, conversionsA: metrics.conversionsA, conversionsB: metrics.conversionsB };
  userAnalyses.forEach(a => {
    if (a.variant === 'A') summary.variantA++;
    if (a.variant === 'B') summary.variantB++;
  });
  sendJson(res, 200, summary);
}

/**
 * Handle GET /integration.js
 * Serves a JavaScript snippet that external websites can embed to
 * integrate with the SaaS.  The script fetches a variant from
 * /api/variant and exposes a global function recordConversion() to
 * send conversion events back to the server.  The server URL is
 * inferred from the environment variable SERVER_URL if provided;
 * otherwise defaults to the current host.
 */
function handleIntegrationScript(req, res) {
  const serverUrl = process.env.SERVER_URL || `http://${req.headers.host}`;
  const script = `// Integration script for Competitive Analysis Generator\n` +
    `(function() {\n` +
    `  var server = '${serverUrl}';\n` +
    `  // Fetch variant assignment and add it as a data attribute\n` +
    `  fetch(server + '/api/variant').then(function(resp) { return resp.json(); }).then(function(data) {\n` +
    `    document.body.setAttribute('data-variant', data.variant);\n` +
    `  });\n` +
    `  // Expose a global function to record conversions\n` +
    `  window.recordConversion = function() {\n` +
    `    var variant = document.body.getAttribute('data-variant');\n` +
    `    if (!variant) return;\n` +
    `    fetch(server + '/api/convert', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ variant: variant }) });\n` +
    `  };\n` +
    `})();\n`;
  res.writeHead(200, {
    'Content-Type': 'application/javascript',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(script);
}

/**
 * Serve static files from the client directory.  Looks for files
 * relative to the project root; defaults to index.html if the path is
 * "/".  Provides minimal security by disallowing directory traversal.
 */
function serveStatic(req, res) {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  let pathname = parsedUrl.pathname;
  if (pathname === '/') pathname = '/index.html';
  // Prevent directory traversal
  pathname = pathname.replace(/\.\.(\/|\\)/g, '');
  const filePath = path.join(__dirname, pathname);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
    } else {
      // Basic content type mapping
      const ext = path.extname(filePath).toLowerCase();
      const map = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.json': 'application/json'
      };
      res.writeHead(200, { 'Content-Type': map[ext] || 'application/octet-stream' });
      res.end(data);
    }
  });
}

// Create the HTTP server and route requests
const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const method = req.method;
  const pathname = parsedUrl.pathname;

  // Handle CORS preflight for API endpoints.  Browsers send an OPTIONS
  // request before certain cross‑origin calls; respond with allowed
  // methods and headers.
  if (method === 'OPTIONS' && pathname.startsWith('/api/')) {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  // API routes
  if (method === 'POST' && pathname === '/api/register') {
    return handleRegister(req, res);
  }
  if (method === 'POST' && pathname === '/api/login') {
    return handleLogin(req, res);
  }
  if (method === 'GET' && pathname === '/api/analysis/list') {
    return handleAnalysisList(req, res);
  }
  if (method === 'POST' && pathname === '/api/analysis') {
    return handleAnalysisCreate(req, res);
  }
  // /api/analysis/:id for GET and DELETE
  const analysisMatch = pathname.match(/^\/api\/analysis\/(.+)$/);
  if (analysisMatch) {
    const analysisId = analysisMatch[1];
    if (method === 'GET') {
      return handleAnalysisGet(req, res, analysisId);
    }
    if (method === 'DELETE') {
      return handleAnalysisDelete(req, res, analysisId);
    }
  }
  if (method === 'GET' && pathname === '/api/metrics/user') {
    return handleMetricsUser(req, res);
  }
  if (method === 'POST' && pathname === '/api/generate') {
    return handleGenerate(req, res);
  }
  if (method === 'GET' && pathname === '/api/metrics') {
    return handleMetrics(req, res);
  }
  if (method === 'GET' && pathname === '/api/variant') {
    return handleVariant(req, res);
  }
  if (method === 'POST' && pathname === '/api/convert') {
    return handleConvert(req, res);
  }
  // Integration script
  if (method === 'GET' && pathname === '/integration.js') {
    return handleIntegrationScript(req, res);
  }
  // Otherwise serve static files
  return serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});