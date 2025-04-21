# AI-Powered Documentation Search

A powerful documentation indexing and search tool that crawls documentation websites, processes the content, and provides intelligent search capabilities using LLM (Large Language Model) technology.

## Overview

This project consists of two main components:

1. **Document Crawler**: Indexes documentation websites by crawling pages and extracting content
2. **Search API Server**: Provides a REST API to search through the indexed documentation using LLM-powered semantic search

## Features

- Web crawler that respects rate limits and follows documentation site structure
- Configurable crawling depth and URL patterns
- AI-powered search capabilities through LLM integration
- Simple REST API for querying the documentation
- Integration with vector database (Qdrant) for efficient similarity searches

## Prerequisites

- Node.js (v14+)
- MongoDB (optional, depends on your storage implementation)
- Qdrant vector database
- API keys for your chosen LLM provider

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/ai-doc-search.git
cd ai-doc-search

# Install dependencies
npm install
```

## Configuration

Create a `.env` file in the root directory with the following variables:

```
LLM_API_KEY=your_llm_api_key
QDRANT_URL=your_qdrant_url
QDRANT_API_KEY=your_qdrant_api_key
```

## Usage

### Indexing Documentation

To crawl and index a documentation website, use the `DocumentCrawler` class:

```javascript
const DocumentCrawler = require('./documentCrawler');

async function indexDocumentation() {
  const crawler = new DocumentCrawler({
    baseUrl: 'https://your-docs-site.com/docs/',
    maxDepth: 3,
    delay: 1000, // 1 second delay between requests
    urlPattern: /^https:\/\/your-docs-site\.com\/docs\//
  });
  
  await crawler.crawl();
}

indexDocumentation().catch(console.error);
```

### Starting the Search API Server

To start the search API server:

```bash
node server.js
```

The server will be available at `http://localhost:3000`.

### Using the Search API

Make a POST request to the `/api/docs/search` endpoint:

```bash
curl -X POST http://localhost:3000/api/docs/search \
  -H "Content-Type: application/json" \
  -d '{"query": "How to authenticate API requests?"}'
```

Example response:

```json
{
  "results": [
    {
      "content": "Authentication in our API requires you to include an API key in the request header...",
      "url": "https://your-docs-site.com/docs/authentication",
      "title": "API Authentication",
      "relevanceScore": 0.92
    },
    {
      "content": "For secure API requests, always use HTTPS and include your API key...",
      "url": "https://your-docs-site.com/docs/security-best-practices",
      "title": "Security Best Practices",
      "relevanceScore": 0.78
    }
  ]
}
```

## Architecture

### DocumentCrawler

The `DocumentCrawler` class is responsible for:

1. Starting at a base URL and following links that match a specified pattern
2. Extracting content from pages
3. Processing documentation text
4. Storing processed documentation for later search

Key features:
- Rate limiting to avoid overwhelming target servers
- URL normalization and filtering
- Configurable crawling depth

### LLM Service

The LLM service integrates with a vector database (Qdrant) to:

1. Convert documentation text to vector embeddings
2. Store these embeddings for semantic search
3. Process user queries into the same vector space
4. Return the most relevant documentation based on semantic similarity

### API Server

The Express.js server provides:
- A simple REST API for querying documentation
- Error handling and validation
- JSON responses with relevant documentation matches

## Extension Points

This project can be extended in various ways:

1. Add authentication to the API
2. Implement caching for frequent queries
3. Add monitoring and logging
4. Support for multiple documentation sources
5. Web UI for searching and browsing results

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- [Cheerio](https://github.com/cheeriojs/cheerio) for HTML parsing
- [Axios](https://github.com/axios/axios) for HTTP requests
- [Express](https://expressjs.com/) for the API server
- [Qdrant](https://qdrant.tech/) for vector similarity search