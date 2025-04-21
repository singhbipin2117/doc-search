const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const { RecursiveCharacterTextSplitter } = require("langchain/text_splitter");
const { OpenAIEmbeddings } = require("@langchain/openai");
const { QdrantClient } = require("@qdrant/js-client-rest");
const { QdrantVectorStore } = require("@langchain/qdrant");
const { Document } = require("@langchain/core/documents");
const { v4: uuidv4 } = require('uuid');
require('dotenv').config()

async function processDocumentation(docUrl) {
  // 1. Load web documentation
  // Launch browser if it hasn't been launched yet
  if (!global.browser) {
    global.browser = await puppeteer.launch({ headless: true });
  }
  // Create a new page
  const page = await global.browser.newPage();
    
  // Set timeout for page load
  await page.setDefaultNavigationTimeout(10000);
  
  // Navigate to the URL
  await page.goto(docUrl, { waitUntil: 'networkidle2' });
  
  // Get the page content
  const content = await page.content();
  
  // Close the page
  await page.close();
  // Parse the HTML content with cheerio
  const chunks = extractContentRecursively(content);

  // // 3. Split the document into chunks
  // const chunks = await textSplitter.splitDocuments([
  //   new Document({ pageContent: docs[0].pageContent, id: uuidv4(), metadata: { source: docUrl } }),
  // ]);

  // // 4. Add metadata to each chunk
  const processedChunks = chunks.map((chunk, i) => {
    return {
      pageContent: chunk.text.join('\n'),
      id: uuidv4(),
      metadata: {
        source: docUrl,
        index: chunk.level,
        heading: chunk.heading,
        codeBlocks: chunk.codeBlocks
      }
    };
  });

  // // 5. Create embeddings
  const embeddings = new OpenAIEmbeddings({
    openAIApiKey: process.env.OPENAI_API_KEY,
  });

  // // 6. Initialize Qdrant
  const qdrant = new QdrantClient({
    url: process.env.QDRANT_URL || 'http://localhost:6333',
  });

  const collectionName = "documentation_collection";
  const collectionExists = await checkCollectionExists(qdrant, collectionName);

  if (!collectionExists) {
    // Create collection if it doesn't exist
    await qdrant.createCollection(collectionName, {
      vectors: {
        size: 1536, // OpenAI embeddings are 1536 dimensions
        distance: "Cosine",
      },
    });
  }

  // // 7. Store document chunks in the vector database
  await QdrantVectorStore.fromDocuments(
    processedChunks,
    embeddings,
    {
      url: process.env.QDRANT_URL || 'http://localhost:6333',
      collectionName: collectionName,
    }
  );

  return {
    documentUrl: docUrl,
    chunksProcessed: processedChunks.length
  };
}

// Helper function to check if a collection exists
async function checkCollectionExists(qdrantClient, collectionName) {
  try {
    const collections = await qdrantClient.getCollections();
    return collections.collections.some(
      (collection) => collection.name === collectionName
    );
  } catch (error) {
    console.error("Error checking collection existence:", error);
    return false;
  }
}

function extractContentRecursively(root) {
  // Ensure root is properly loaded with Cheerio
  const $ = typeof root === 'string' ? cheerio.load(root) : (root.cheerio ? root : cheerio.load(root.toString()));
   // Remove undesired elements (mutates DOM)
  $('style, .hidden, script').remove();
  const sections = [];
  let currentSection = null;
  
  // Create an initial section to collect content before any headings
  currentSection = {
    heading: "Introduction",
    level: 0,
    text: [],
    codeBlocks: []
  };
  
  // Set to track processed nodes to avoid duplicate processing
  const processedNodes = new Set();
  
  function processNode(node) {
    $(node).children().each((_, child) => {
      // Skip if we've already processed this node (prevent duplication)
      const nodeId = child.attribs && child.attribs.id ? child.attribs.id : `node-${Math.random().toString(36).substr(2, 9)}`;
      if (processedNodes.has(nodeId)) return;
      processedNodes.add(nodeId);
      
      const el = $(child);
      
      // Section breaks
      if (el.is('h1, h2, h3, h4')) {
        // Save current section if it has content
        if (currentSection && (currentSection.text.length > 0 || currentSection.codeBlocks.length > 0)) {
          sections.push({...currentSection});
        }
        
        // Create new section
        currentSection = {
          heading: el.text().trim(),
          level: parseInt(child.name.substring(1)),
          text: [],
          codeBlocks: []
        };
      }
      // Code blocks
      else if (el.is('pre') || el.is('code')) {
        if (!currentSection) {
          currentSection = { 
            heading: "Untitled Section", 
            level: 0, 
            text: [], 
            codeBlocks: [] 
          };
        }
        
        const codeEl = el.is('pre, code') ? el : el.find('code');
        currentSection.codeBlocks.push({
          content: codeEl.text().trim(),
          language: detectCodeLanguage(codeEl)
        });
      }
      // Text content
      else if (el.text().trim() && !el.find('pre, code').length) {
        if (!currentSection) {
          currentSection = { 
            heading: "Untitled Section", 
            level: 0, 
            text: [], 
            codeBlocks: [] 
          };
        }
        
        // Only add the text from this element, not its children
        const ownText = el.clone().children().remove().end().text().trim();
        if (ownText) currentSection.text.push(ownText);
        
        // Only process children if they're not already processed
        processNode(el);
      }
      else {
        // Process children recursively even if this element isn't directly added
        processNode(el);
      }
    });
  }
  
  // Start processing from the root
  processNode($.root());
  
  // Make sure to add the last section if it exists and has content
  if (currentSection && (currentSection.text.length > 0 || currentSection.codeBlocks.length > 0)) {
    sections.push(currentSection);
  }
  
  return sections;
}

// Helper function to detect code language
function detectCodeLanguage(codeElement) {
  // Look for language class indicators
  const classAttr = codeElement.attr('class') || '';
  const langMatch = classAttr.match(/language-(\w+)|lang-(\w+)|(\w+)-code/i);
  
  if (langMatch) {
    return langMatch[1] || langMatch[2] || langMatch[3];
  }
  
  // Default language if none detected
  return 'text';
}


module.exports = { processDocumentation };