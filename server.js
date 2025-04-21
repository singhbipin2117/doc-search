// Express API example
const express = require('express');
const LLMService = require('./llmService')
const app = express();
app.use(express.json());

// Initialize the LLM service with Qdrant
const llmService = new LLMService();

app.post('/api/docs/search', async (req, res) => {
  try {
    const { query } = req.body;
    
    if (!query) {
      return res.status(400).json({
        error: 'Missing required parameter: query'
      });
    }
    
    const result = await llmService.query(query);
    return res.json(result);
  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({
      error: 'An error occurred while processing your request'
    });
  }
});

app.listen(3000, () => {
  console.log('Documentation API running on port 3000');
});