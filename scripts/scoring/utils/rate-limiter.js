/**
 * Simple rate limiter for API calls
 */
class RateLimiter {
  constructor(requestsPerSecond = 1) {
    this.minInterval = 1000 / requestsPerSecond;
    this.lastRequest = 0;
    this.queue = [];
    this.processing = false;
  }

  async wait() {
    return new Promise((resolve) => {
      this.queue.push(resolve);
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequest;

      if (timeSinceLastRequest < this.minInterval) {
        await sleep(this.minInterval - timeSinceLastRequest);
      }

      this.lastRequest = Date.now();
      const resolve = this.queue.shift();
      resolve();
    }

    this.processing = false;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Pre-configured rate limiters for different APIs
const limiters = {
  hn: new RateLimiter(5),        // 5 req/sec for HN Algolia
  lobsters: new RateLimiter(1),  // 1 req/sec for Lobsters (conservative)
  reddit: new RateLimiter(1),    // 1 req/sec for Reddit
  feed: new RateLimiter(10)      // 10 req/sec for feed fetching
};

module.exports = { RateLimiter, limiters, sleep };
