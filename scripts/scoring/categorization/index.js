/**
 * Content-based feed categorization
 * Analyzes post titles and content to assign meaningful categories
 */

// Category definitions with weighted keywords
const CATEGORIES = {
  'Web Development': {
    high: ['frontend', 'backend', 'react', 'vue', 'angular', 'svelte', 'nextjs', 'nuxt', 'webpack', 'vite',
           'javascript', 'typescript', 'nodejs', 'deno', 'css', 'html', 'dom', 'browser', 'web api',
           'responsive', 'accessibility', 'a11y', 'pwa', 'spa', 'ssr', 'ssg'],
    medium: ['component', 'ui kit', 'tailwind', 'sass', 'less', 'npm', 'yarn', 'bundle', 'minify',
             'lighthouse', 'seo', 'web performance', 'lazy load', 'service worker']
  },
  'Backend/Infrastructure': {
    high: ['kubernetes', 'k8s', 'docker', 'container', 'devops', 'ci/cd', 'terraform', 'ansible',
           'aws', 'gcp', 'azure', 'cloud', 'microservices', 'serverless', 'lambda', 'api gateway',
           'nginx', 'apache', 'load balancer', 'database', 'postgresql', 'mysql', 'mongodb', 'redis'],
    medium: ['deploy', 'infrastructure', 'scaling', 'monitoring', 'logging', 'prometheus', 'grafana',
             'helm', 'istio', 'service mesh', 'vpc', 'cdn', 'cache', 'queue', 'kafka', 'rabbitmq']
  },
  'Security': {
    high: ['security', 'vulnerability', 'exploit', 'malware', 'ransomware', 'phishing', 'pentest',
           'penetration test', 'ctf', 'capture the flag', 'cve', 'zero day', 'authentication', 'oauth',
           'encryption', 'cryptography', 'ssl', 'tls', 'firewall', 'intrusion'],
    medium: ['hack', 'hacker', 'breach', 'attack', 'defense', 'secure', 'privacy', 'infosec',
             'cybersecurity', 'audit', 'compliance', 'gdpr', 'password', 'mfa', '2fa']
  },
  'AI/ML': {
    high: ['machine learning', 'deep learning', 'neural network', 'transformer', 'gpt', 'llm', 'chatgpt',
           'claude', 'openai', 'anthropic', 'tensorflow', 'pytorch', 'nlp', 'computer vision',
           'reinforcement learning', 'generative ai', 'diffusion', 'stable diffusion', 'midjourney'],
    medium: ['ai', 'artificial intelligence', 'model', 'training', 'inference', 'embedding', 'vector',
             'prompt', 'fine-tune', 'dataset', 'classification', 'prediction', 'automation']
  },
  'Systems/Low-Level': {
    high: ['rust', 'c++', 'c programming', 'assembly', 'kernel', 'linux kernel', 'operating system',
           'compiler', 'llvm', 'memory management', 'garbage collection', 'threading', 'concurrency',
           'embedded', 'firmware', 'rtos', 'systems programming', 'webassembly', 'wasm'],
    medium: ['binary', 'elf', 'linker', 'debugger', 'gdb', 'profiler', 'optimization', 'algorithm',
             'data structure', 'performance', 'benchmark', 'zig', 'bare metal']
  },
  'Startups/Business': {
    high: ['startup', 'founder', 'venture capital', 'vc', 'funding', 'seed round', 'series a',
           'bootstrapped', 'saas', 'b2b', 'b2c', 'product market fit', 'mvp', 'growth hacking',
           'acquisition', 'ipo', 'unicorn', 'yc', 'y combinator'],
    medium: ['entrepreneur', 'business model', 'revenue', 'pricing', 'customer', 'market',
             'competition', 'pitch', 'investor', 'valuation', 'exit', 'pivot']
  },
  'Career/Personal': {
    high: ['career', 'job search', 'interview', 'resume', 'hiring', 'recruiter', 'salary',
           'negotiation', 'promotion', 'management', 'leadership', 'mentorship', 'burnout',
           'work life balance', 'remote work', 'productivity'],
    medium: ['team', 'communication', 'soft skills', 'networking', 'personal brand', 'freelance',
             'consulting', 'contractor', 'layoff', 'developer experience']
  },
  'Science': {
    high: ['physics', 'chemistry', 'biology', 'astronomy', 'astrophysics', 'quantum', 'particle',
           'neuroscience', 'genetics', 'evolution', 'climate', 'research', 'paper', 'journal',
           'experiment', 'hypothesis', 'peer review'],
    medium: ['science', 'scientific', 'study', 'discovery', 'nature', 'universe', 'space', 'nasa',
             'spacex', 'mars', 'telescope', 'laboratory', 'scientist']
  },
  'Design': {
    high: ['ux', 'ui', 'user experience', 'user interface', 'figma', 'sketch', 'design system',
           'typography', 'color theory', 'wireframe', 'prototype', 'usability', 'interaction design',
           'visual design', 'graphic design', 'motion design'],
    medium: ['design', 'designer', 'creative', 'aesthetic', 'layout', 'grid', 'icon', 'illustration',
             'brand', 'logo', 'font', 'animation']
  },
  'Gaming': {
    high: ['game dev', 'game development', 'unity', 'unreal', 'godot', 'game engine', 'shader',
           'graphics programming', 'procedural generation', 'level design', 'game design',
           'indie game', 'steam', 'playstation', 'xbox', 'nintendo'],
    medium: ['gaming', 'video game', 'game', 'esports', 'multiplayer', 'rpg', 'fps', 'mmo',
             'roguelike', 'pixel art', 'sprite', 'gameplay']
  },
  'Open Source': {
    high: ['open source', 'oss', 'foss', 'github', 'gitlab', 'contribution', 'maintainer',
           'license', 'gpl', 'mit license', 'apache license', 'linux', 'gnu', 'free software',
           'community', 'pull request', 'issue tracker'],
    medium: ['fork', 'branch', 'merge', 'repository', 'repo', 'release', 'changelog', 'documentation',
             'contributor', 'sponsor', 'foundation']
  }
};

// Scoring weights
const HIGH_WEIGHT = 3;
const MEDIUM_WEIGHT = 1;

/**
 * Categorize a feed based on its content
 * @param {Object} feedData - Feed data with posts array
 * @param {string} feedUrl - Feed URL
 * @param {string} feedTitle - Feed title
 * @returns {Object} Category information
 */
function categorize(feedData, feedUrl, feedTitle) {
  // Combine all text for analysis
  let text = '';

  if (feedUrl) text += ' ' + feedUrl;
  if (feedTitle) text += ' ' + feedTitle;

  if (feedData && feedData.posts) {
    for (const post of feedData.posts.slice(0, 10)) {
      if (post.title) text += ' ' + post.title;
      if (post.description) text += ' ' + post.description.slice(0, 500);
    }
  }

  text = text.toLowerCase();

  // Score each category
  const scores = {};

  for (const [category, keywords] of Object.entries(CATEGORIES)) {
    let score = 0;

    for (const keyword of keywords.high) {
      if (text.includes(keyword.toLowerCase())) {
        score += HIGH_WEIGHT;
      }
    }

    for (const keyword of keywords.medium) {
      if (text.includes(keyword.toLowerCase())) {
        score += MEDIUM_WEIGHT;
      }
    }

    if (score > 0) {
      scores[category] = score;
    }
  }

  // Sort categories by score
  const sortedCategories = Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .map(([cat]) => cat);

  if (sortedCategories.length === 0) {
    return {
      categories: ['General'],
      primaryCategory: 'General',
      categoryConfidence: 0
    };
  }

  // Calculate confidence (difference between top and second)
  const topScore = scores[sortedCategories[0]];
  const secondScore = sortedCategories[1] ? scores[sortedCategories[1]] : 0;
  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);

  const confidence = totalScore > 0 ? Math.min(topScore / totalScore + (topScore - secondScore) / topScore * 0.3, 1) : 0;

  // Return top 2 categories if second is close enough
  const categories = [sortedCategories[0]];
  if (sortedCategories[1] && scores[sortedCategories[1]] >= topScore * 0.5) {
    categories.push(sortedCategories[1]);
  }

  return {
    categories,
    primaryCategory: sortedCategories[0],
    categoryConfidence: Math.round(confidence * 100) / 100,
    _scores: scores // For debugging
  };
}

/**
 * Batch categorize feeds
 * @param {Array} feeds - Array of feed objects with posts data
 * @returns {Array} Feeds with category information added
 */
function categorizeFeeds(feeds) {
  return feeds.map(feed => {
    const categoryInfo = categorize(
      { posts: feed._posts || [] },
      feed.url,
      feed.title
    );

    return {
      ...feed,
      ...categoryInfo
    };
  });
}

module.exports = { categorize, categorizeFeeds, CATEGORIES };
