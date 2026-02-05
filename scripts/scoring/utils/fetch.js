const https = require('https');
const http = require('http');

const DEFAULT_TIMEOUT = 10000;
const DEFAULT_USER_AGENT = 'CosmoRSS-Scorer/2.0';

/**
 * Fetch URL with timeout, redirect following, and error handling
 */
function fetchUrl(url, options = {}) {
  const timeout = options.timeout || DEFAULT_TIMEOUT;
  const userAgent = options.userAgent || DEFAULT_USER_AGENT;
  const maxRedirects = options.maxRedirects || 5;
  let redirectCount = 0;

  const doFetch = (targetUrl) => {
    return new Promise((resolve, reject) => {
      if (redirectCount >= maxRedirects) {
        reject(new Error('Too many redirects'));
        return;
      }

      const protocol = targetUrl.startsWith('https') ? https : http;
      const req = protocol.get(targetUrl, {
        timeout,
        headers: { 'User-Agent': userAgent }
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          redirectCount++;
          let redirectUrl = res.headers.location;
          // Handle relative redirects
          if (!redirectUrl.startsWith('http')) {
            const urlObj = new URL(targetUrl);
            redirectUrl = `${urlObj.protocol}//${urlObj.host}${redirectUrl}`;
          }
          doFetch(redirectUrl).then(resolve).catch(reject);
          return;
        }

        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ status: res.statusCode, data, url: targetUrl }));
      });

      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    });
  };

  return doFetch(url);
}

/**
 * Fetch JSON from URL
 */
async function fetchJson(url, options = {}) {
  const { data, status } = await fetchUrl(url, options);
  if (status !== 200) {
    throw new Error(`HTTP ${status}`);
  }
  return JSON.parse(data);
}

module.exports = { fetchUrl, fetchJson };
