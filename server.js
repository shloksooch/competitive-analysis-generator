/**
 * Simple HTTP server for the Competitive Analysis Generator.
 *
 * This server uses Node.js built‑in modules (http, fs, path) to serve
 * static files (the React‑like front‑end) and to expose two API
 * endpoints:
 *   POST /api/generate   – expects a JSON payload with an array of
 *                          competitors (name and description) and
 *                          returns a SWOT analysis and assigned A/B
 *                          variant.  It also increments simple
 *                          counters for A/B testing metrics.
 *   GET  /api/metrics    – returns the current counts of how many
 *                          times each variant has been served.
 *
 * The server stores metrics in a JSON file on disk (metrics.json) in
 * the root of the project.  This is not suitable for production but
 * suffices for a prototype.  In a real SaaS you would likely use a
 * database and proper analytics tooling.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

// File where A/B testing metrics are persisted
const metricsFile = path.join(__dirname, 'metrics.json');

// Initialize the metrics counters.  If the file does not exist or
// cannot be parsed, start with zeros.  Metrics now include both
// view counts (how many times each variant was served) and
// conversion counts (how many conversions were reported).
function initMetrics() {
  let metrics = {
    variantA: 0,
    variantB: 0,
    conversionsA: 0,
    conversionsB: 0
  };
  if (fs.existsSync(metricsFile)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(metricsFile));
      // Merge known keys from existing file to preserve counts when
      // additional fields are introduced in later versions.
      if (parsed && typeof parsed === 'object') {
        Object.keys(metrics).forEach(key => {
          if (typeof parsed[key] === 'number') metrics[key] = parsed[key];
        });
      }
    } catch (err) {
      // ignore and use defaults
    }
  } else {
    fs.writeFileSync(metricsFile, JSON.stringify(metrics));
  }
  return metrics;
}
let metrics = initMetrics();

// Keyword lists used for simple heuristic SWOT extraction
const positiveKeywords = ['fast', 'easy', 'popular', 'affordable', 'flexible', 'scalable', 'intuitive', 'efficient', 'user‑friendly'];
const negativeKeywords = ['expensive', 'slow', 'bug', 'bugs', 'complicated', 'complex', 'limited', 'difficult', 'unreliable'];

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
 * Helper to send JSON responses with proper headers.
 */
function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

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
  // Otherwise serve static files
  return serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});