/**
 * Simple scraper service for generating daily digests of competitor updates.
 *
 * In a production environment this module would fetch data from websites,
 * news feeds, reviews and social channels.  For this MVP we generate
 * placeholder summaries for each analysis using the competitor names and the
 * current date.  The digests are written to a JSON file so they persist across
 * server restarts and can be retrieved via the API.
 */
const fs = require('fs');
const path = require('path');

// Path to the digest file stored in the project root.  If the file does not
// exist it will be created on first write.
const digestFile = path.join(__dirname, '..', 'digest.json');

/**
 * Write the given digest array to disk.
 * @param {Array} digests List of digest objects
 */
function saveDigest(digests) {
  fs.writeFileSync(digestFile, JSON.stringify(digests, null, 2));
}

/**
 * Load the current digest from disk.  If no digest exists returns an empty array.
 * @returns {Array}
 */
function loadDigest() {
  try {
    const raw = fs.readFileSync(digestFile, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return [];
  }
}

/**
 * Generate a digest for all analyses.  The digest contains a summary for each
 * analysis using the competitor names.  In a real implementation you would
 * fetch the latest changes from competitor websites and feeds and use an LLM to
 * summarise them.
 *
 * @param {Array} analyses List of analysis objects (from analyses.json)
 * @returns {Array} The generated digest
 */
function generateDigest(analyses) {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US');
  const digests = analyses.map((analysis) => {
    const names = Array.isArray(analysis.competitors)
      ? analysis.competitors.map((c) => c.name).filter(Boolean).join(', ')
      : 'Unknown';
    return {
      analysisId: analysis.id,
      summary: `Daily digest for ${names} on ${dateStr}.`,
      timestamp: now.getTime(),
    };
  });
  saveDigest(digests);
  return digests;
}

module.exports = {
  generateDigest,
  loadDigest,
};
