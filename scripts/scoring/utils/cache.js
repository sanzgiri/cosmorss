const fs = require('fs');
const path = require('path');

const CACHE_DIR = path.join(__dirname, '../../.cache');

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

/**
 * Get cached value if not expired
 */
function get(key, maxAgeMs) {
  const filePath = path.join(CACHE_DIR, `${sanitizeKey(key)}.json`);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const cached = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const age = Date.now() - cached.timestamp;

    if (age > maxAgeMs) {
      return null;
    }

    return cached.data;
  } catch {
    return null;
  }
}

/**
 * Set cache value
 */
function set(key, data) {
  const filePath = path.join(CACHE_DIR, `${sanitizeKey(key)}.json`);

  const cacheData = {
    timestamp: Date.now(),
    data
  };

  fs.writeFileSync(filePath, JSON.stringify(cacheData));
}

/**
 * Clear expired cache entries
 */
function clearExpired(maxAgeMs) {
  if (!fs.existsSync(CACHE_DIR)) return;

  const files = fs.readdirSync(CACHE_DIR);
  const now = Date.now();

  for (const file of files) {
    if (!file.endsWith('.json')) continue;

    const filePath = path.join(CACHE_DIR, file);
    try {
      const cached = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      if (now - cached.timestamp > maxAgeMs) {
        fs.unlinkSync(filePath);
      }
    } catch {
      // Remove corrupt cache files
      fs.unlinkSync(filePath);
    }
  }
}

/**
 * Sanitize key for filesystem
 */
function sanitizeKey(key) {
  return key.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 200);
}

module.exports = { get, set, clearExpired };
