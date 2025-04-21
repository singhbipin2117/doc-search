// LLM Service Example (using OpenAI and Qdrant for vector search)
require('dotenv').config(); // Load environment variables from .env file
const { QdrantClient } = require("@qdrant/js-client-rest");
const { QdrantVectorStore } = require("@langchain/qdrant");
const { OpenAIEmbeddings } = require("@langchain/openai");
const OpenAI = require("openai");

class LLMService {
  constructor(config) {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    this.model = process.env.MODEL || 'gpt-4o';
    this.maxTokens = parseInt(process.env.MAX_TOKENS);
    
    // Initialize Qdrant client
    this.qdrantClient = new QdrantClient({
      url: process.env.QUADRANT_API_URL,
    });
    
    // Initialize embeddings model
    this.embeddings = new OpenAIEmbeddings({
      openAIApiKey: process.env.OPENAI_API_KEY,
    });
    
    // Collection name for documentation vectors
    this.collectionName = process.env.COLLECTION_NAME;
  }
  
  /**
   * Generate a response to a user query using relevant documentation context
   * 
   * @param {string} query - The user's question
   * @param {Array} contextData - Relevant documentation context from Qdrant
   * @returns {Promise<Object>} - Object containing answer, sources, and confidence
   */
  async generateResponse(query, contextData) {
    // Format context for LLM
    const formattedContext = this.formatContextForLLM(contextData);
    
    // Build prompt
    const prompt = this.buildPrompt(query, formattedContext);
    
    // Call LLM
    const completion = await this.openai.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: "system",
          content: process.env.SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: this.maxTokens,
      temperature: 0.2,
    });
    console.log(JSON.parse(completion.choices[0].message.content))
    return {
      ...JSON.parse(completion.choices[0].message.content),
      // sources: this.extractSourcesFromContext(contextData),
      confidence: this.calculateConfidence(query, contextData, completion)
    };
  }
  
  /**
   * Format Qdrant search results into context format for LLM
   * This method handles the specific structure of your Qdrant documents
   * 
   * @param {Array} contextData - Results from Qdrant vector search
   * @returns {String} - Formatted context string
   */
  formatContextForLLM(contextData) {
    if (!contextData || contextData.length === 0) {
      return "No relevant documentation found.";
    }
    
    return contextData.map(item => {
      // Handle both standard format and LangChain QdrantVectorStore results
      const content = item.pageContent;
      if (!content) {
        console.warn("Warning: Document missing content", item);
        return "";
      }
      
      // Extract metadata (handle both direct and LangChain formats)
      
      const metadata = item.metadata || {};
      const source = metadata?.source || item.source || "Unknown source";
      const heading = metadata?.heading || '';
      // Build the formatted message content
      const formattedContent = metadata?.codeBlocks
      .map(block => `\`\`\`${block.language}\n${block.content}\n\`\`\``)
      .join('\n\n');
      
      // Construct the user message with conditional code block section
      let userMessage = `### Context\n${heading ? `**Heading:** ${heading}\n` : ''}**Source:** ${source}\n\n${content}`;

      if (formattedContent) {
        userMessage += `\n\n### Code Blocks\n${formattedContent}`;
      }

      userMessage += `\n\nPlease analyze the above content for correctness, identify redundant steps or errors, and suggest improvements.`;


      // Format content based on whether it contains code
      return userMessage
    }).filter(Boolean).join('\n\n---\n\n');
  }
  
  buildPrompt(query, context) {
    return `${context}\n\n### User Question\n${query}\n\nBased on the above, provide a helpful, accurate, and concise response.`;
  }
  
  /**
   * Extract sources from Qdrant results
   * Formats sources based on the structure of your Qdrant documents
   * 
   * @param {Array} contextData - The context data used for the response
   * @returns {Array} - Array of source objects
   */
  extractSourcesFromContext(contextData) {
    if (!contextData || contextData.length === 0) {
      return [];
    }
    
    // Extract unique sources with metadata
    const sources = contextData.map(item => {
      const metadata = item.metadata || {};
      return {
        source: metadata.source || item.source || "Unknown source",
        title: metadata.heading || item.title || 'Documentation',
        relevance: item.score || item.relevanceScore || 1.0,
        url: metadata.source || item.url || null,
        location: metadata.loc ? 
          `Lines ${metadata.loc.lines?.from || '?'}-${metadata.loc.lines?.to || '?'}` : null,
        index: metadata.index || null
      };
    });
    
    // Filter out duplicate sources based on URL
    const uniqueSources = sources.filter((source, index, self) => 
      index === self.findIndex(s => s.url === source.url && s.location === source.location)
    );
    
    // Sort sources by relevance in descending order
    return uniqueSources.sort((a, b) => b.relevance - a.relevance);
  }
  
  /**
   * Calculate confidence score for the response
   * 
   * @param {string} query - The user's question
   * @param {Array} contextData - The context data used for the response
   * @param {Object} completion - The LLM completion result
   * @returns {number} - Confidence score between 0 and 1
   */
  calculateConfidence(query, contextData, completion) {
    if (!contextData || contextData.length === 0) {
      return 0.0; // No context, no confidence
    }
    
    // Calculate average relevance score from context
    const avgRelevance = contextData.reduce((sum, item) => 
      sum + (item.score || item.relevanceScore || 0), 0) / contextData.length;
    
    // Check if the response contains low-confidence indicators
    const lowConfidenceIndicators = [
      "I don't have information",
      "not specified in the documentation",
      "cannot find",
      "no information about",
      "unclear from the context"
    ];
    
    const response = completion.choices[0].message.content.toLowerCase();
    const hasLowConfidenceIndicators = lowConfidenceIndicators.some(indicator => 
      response.includes(indicator.toLowerCase())
    );
    
    // Check if the answer is very short (might indicate lack of information)
    const isVeryShort = response.split(' ').length < 20;
    
    // Base confidence factors
    let confidence = 0.5;
    
    // Adjust based on relevance scores
    confidence += avgRelevance * 0.3;
    
    // Adjust based on low confidence indicators
    if (hasLowConfidenceIndicators) {
      confidence -= 0.4;
    }
    
    // Adjust based on answer length
    if (isVeryShort) {
      confidence -= 0.2;
    }
    
    // If the model is using a more capable model, slightly increase confidence
    if (this.model.includes('gpt-4')) {
      confidence += 0.1;
    }
    
    // Ensure confidence stays between 0 and 1
    return Math.max(0, Math.min(1, confidence));
  }
  
  // Additional utility methods
  
  async streamResponse(query, contextData) {
    const formattedContext = this.formatContextForLLM(contextData);
    const prompt = this.buildPrompt(query, formattedContext);
    
    const stream = await this.openai.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: "system",
          content: process.env.SYSTEM_MESSAGE,
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: process.env.MAX_TOKENS || 1000,
      temperature: 0.2,
      stream: true,
    });
    
    return {
      stream,
      sources: this.extractSourcesFromContext(contextData)
    };
  }
  
  /**
   * Find relevant context using semantic search with Qdrant vector database
   * 
   * @param {string} query - The user's question
   * @param {Array} allContextData - Optional fallback context data if vector search fails
   * @param {number} maxItems - Maximum number of context items to return
   * @returns {Promise<Array>} - Array of relevant context items with relevance scores
   */
  async filterRelevantContext(query, allContextData, maxItems = 5) {
    try {
      // Create vector store from existing Qdrant collection
      const vectorStore = await QdrantVectorStore.fromExistingCollection(
        this.embeddings,
        {
          client: this.qdrantClient,
          collectionName: this.collectionName,
          url: process.env.QUADRANT_API_URL,
        }
      );
      
      // Perform semantic search using the query
      const searchResults = await vectorStore.similaritySearchWithScore(query, maxItems);
      
      // Format the results to match our expected context structure
      // searchResults from similaritySearchWithScore returns [doc, score] pairs
      return searchResults.map(([result, score]) => ({
        pageContent: result.pageContent,
        metadata: result.metadata || {},
        score: score
      }));
    } catch (error) {
      console.error("Vector search failed:", error);
      
      // Fallback to keyword matching if vector search fails
      if (!allContextData || allContextData.length === 0) {
        return [];
      }
    }  
  }

  /**
   * Run a query against the Qdrant vector store and generate an LLM response
   * This is a convenience method that combines semantic search and response generation
   * 
   * @param {string} query - The user's question
   * @param {Array} fallbackContext - Optional fallback context if vector search fails
   * @param {number} maxResults - Maximum number of relevant documents to retrieve
   * @returns {Promise<Object>} - Object containing answer, sources, and confidence
   */
  async query(query, fallbackContext = [], maxResults = 5) {
    try {
      // Step 1: Retrieve relevant context using vector search
      const relevantContext = await this.filterRelevantContext(query, fallbackContext, maxResults);
      
      if (!relevantContext || relevantContext.length === 0) {
        return {
          answer: "I couldn't find any relevant information in the documentation to answer your question.",
          sources: [],
          confidence: 0
        };
      }
      
      // Step 2: Generate response using the retrieved context
      return await this.generateResponse(query, relevantContext);
    } catch (error) {
      console.error("Error in query:", error);
      
      // If we have fallback context and there was an error with vector search,
      // try using the fallback context directly
      if (fallbackContext && fallbackContext.length > 0) {
        try {
          console.log("Using fallback context due to error in vector search");
          return await this.generateResponse(query, fallbackContext);
        } catch (fallbackError) {
          console.error("Error using fallback context:", fallbackError);
          throw fallbackError;
        }
      }
      
      throw error;
    }
  }
  
  /**
   * Example of how to use the service with a Qdrant database
   */
  static example() {
    return `
// Load environment variables
require('dotenv').config();

// Initialize the LLM service with Qdrant
const llmService = new LLMService({
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4-turbo-preview',
  maxTokens: 1500,
  qdrantUrl: process.env.QDRANT_URL || 'http://localhost:6333',
  qdrantApiKey: process.env.QDRANT_API_KEY,
  collectionName: process.env.QDRANT_COLLECTION || 'documentation'
});

// Simple usage - single query
async function askQuestion() {
  const question = "How do I configure the footer styles?";
  
  try {
    const response = await llmService.query(question);
    console.log("Answer:", response.answer);
    console.log("Sources:", response.sources);
    console.log("Confidence:", response.confidence);
    return response;
  } catch (error) {
    console.error("Error:", error);
  }
}

// Batch processing example
async function processBatchQuestions(questions) {
  const results = [];
  
  for (const question of questions) {
    try {
      console.log("Processing question:", question);
      const result = await llmService.query(question);
      results.push({
        question,
        answer: result.answer,
        confidence: result.confidence,
        sources: result.sources.map(s => s.source)
      });
    } catch (error) {
      console.error("Error processing question:", question, error);
      results.push({
        question,
        error: error.message
      });
    }
  }
  
  return results;
}
`;
  }
}

// Export the class
module.exports = LLMService;