// documentCrawler.js
const { URL } = require('url');
const axios = require("axios");
const cheerio = require("cheerio");
const { processDocumentation } = require('./process-doc')

class DocumentCrawler {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || 'https://example.com/docs';
    this.visitedUrls = new Set();
    this.queue = [];
    this.maxDepth = options.maxDepth || 3;
    this.delay = options.delay || 1000; // Delay between requests in ms
    this.userAgent = options.userAgent || 'Documentation-Indexer-Bot/1.0';
    this.urlPattern = options.urlPattern || /^https:\/\/docs\.fynd\.com\/partners\/docs\/sdk\/latest\/platform\//;
  }

   // Normalize URLs and filter out invalid ones
   normalizeUrl(url, currentUrl) {
    try {
      // Handle relative URLs
      const absoluteUrl = new URL(url, currentUrl).href;
      
      // Remove hash and query parameters if needed
      const urlObj = new URL(absoluteUrl);
      urlObj.hash = "";
      // If you want to preserve query parameters, comment out the next line
      // urlObj.search = "";
      
      return urlObj.toString();
    } catch (error) {
      return null; // Invalid URL
    }
  }

  // Check if URL should be crawled
  shouldCrawl(url) {
    // Skip already visited URLs
    if (this.visitedUrls.has(url)) return false;
    
    try {
      const urlObj = new URL(url);
      
      // Skip non-HTTP(S) protocols
      if (!urlObj.protocol.startsWith("http")) return false;

      // Check if URL matches the required pattern
      if (!this.urlPattern.test(url)) return false;
      
      // Skip certain file types
      const excludeExtensions = [
        ".pdf", ".jpg", ".jpeg", ".png", ".gif", ".svg", 
        ".mp4", ".mp3", ".zip", ".doc", ".docx", ".xls", 
        ".xlsx", ".css", ".js"
      ];
      if (excludeExtensions.some(ext => url.toLowerCase().endsWith(ext))) return false;
      
      return true;
    } catch (error) {
      return false;
    }
  }

    // Extract links from a page
    async extractLinks(url) {
    try {
      console.log(`Extracting links from ${url}`);
      const { data } = await axios.get(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; MyWebCrawler/1.0)",
          "Accept": "text/html",
        },
        timeout: 10000,
      });
      
      const $ = cheerio.load(data);
      const links = new Set();
      
      $("a").each((_, element) => {
        const href = $(element).attr("href");
        if (href) {
          const normalizedUrl = this.normalizeUrl(href, url);
          if (normalizedUrl && this.shouldCrawl(normalizedUrl)) {
            links.add(normalizedUrl);
          }
        }
      });
      
      return Array.from(links);
    } catch (error) {
      console.error(`Error extracting links from ${url}:`, error.message);
      return [];
    }
  }


  async crawl() {
    console.log(`Starting crawler at ${this.baseUrl}`);
    // Start with the base URL
    this.queue.push({ url: this.baseUrl, depth: 0 });
    
    // Process the queue
    while (this.queue.length > 0) {
      const { url, depth } = this.queue.shift();
      console.log('url', url)
      console.log('depth', depth)
      // Skip if already visited or exceeds max depth
      if (this.visitedUrls.has(url) || depth > this.maxDepth) {
        continue;
      }
      
      // Mark as visited
      this.visitedUrls.add(url);
      
      try {
        console.log(`Crawling ${url} (depth: ${depth})`);
        
        await processDocumentation(url)
        
        // Process the page
        await this.processPage(url, depth+1);
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, this.delay));
      } catch (error) {
        console.error(`Error crawling ${url}:`, error);
      }
    }
    
    console.log(`Crawling complete. Visited ${this.visitedUrls.size} pages.`);
    return Array.from(this.visitedUrls);
  }

  async processPage(url, depth) {
    // Find and queue links within the same documentation
    if (depth < this.maxDepth) {
        const links = await this.extractLinks(url);
        for (const link of links) {
          // Queue the next pages
          this.queue.push({ url: link, depth: 0 });
        }
    }
  }
}

module.exports = DocumentCrawler;

// Usage
async function main() {
  const crawler = new DocumentCrawler({
    baseUrl: 'https://chaidocs.vercel.app/youtube/getting-started/',
    maxDepth: 5,
    delay: 1,
    urlPattern: /^https:\/\/chaidocs\.vercel\.app\/youtube\//
  });
  
  await crawler.crawl();
}

if (require.main === module) {
  main().catch(console.error);
}