require('dotenv').config();
const axios = require('axios');

const SLITE_API_BASE = 'https://api.slite.com/v1';

// API keys from .env file
const API_KEYS = [
  process.env.SLITE_API_KEY,
  process.env.SLITE_API_KEY_2
].filter(Boolean);

if (API_KEYS.length === 0) {
  console.error('Error: No API keys found. Please set SLITE_API_KEY in your .env file.');
  console.error('Copy .env.example to .env and add your API key.');
  process.exit(1);
}

async function testSliteConnection(apiKey, keyName) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing Slite API connection with ${keyName}`);
  console.log(`${'='.repeat(60)}\n`);

  try {
    // Test 1: Search for notes
    console.log('1. Testing search endpoint...');
    console.log(`   URL: ${SLITE_API_BASE}/search-notes`);
    console.log(`   Query: "${process.argv[2] || 'test'}", Limit: 5`);
    
    const searchResponse = await axios.get(`${SLITE_API_BASE}/search-notes`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      params: {
        query: process.argv[2] || 'test',
        limit: 5
      }
    });
    
    console.log('\n✓ Search successful!');
    console.log('\nResponse Headers:');
    console.log(JSON.stringify(searchResponse.headers, null, 2));
    console.log('\nResponse Body:');
    console.log(JSON.stringify(searchResponse.data, null, 2));
    console.log(`\nFound ${searchResponse.data.notes?.length || 0} notes`);

    // Test 2: Get a specific note (if we found any)
    if (searchResponse.data.notes && searchResponse.data.notes.length > 0) {
      const firstNoteId = searchResponse.data.notes[0].id;
      console.log(`\n2. Testing get note endpoint...`);
      console.log(`   URL: ${SLITE_API_BASE}/notes/${firstNoteId}`);
      console.log(`   Format: markdown`);
      
      const noteResponse = await axios.get(`${SLITE_API_BASE}/notes/${firstNoteId}`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        params: {
          format: 'markdown'
        }
      });
      
      console.log('\n✓ Get note successful!');
      console.log('\nResponse Headers:');
      console.log(JSON.stringify(noteResponse.headers, null, 2));
      console.log('\nResponse Body:');
      console.log(JSON.stringify(noteResponse.data, null, 2));

      // Test 3: Get note children
      console.log(`\n3. Testing get note children endpoint...`);
      console.log(`   URL: ${SLITE_API_BASE}/notes/${firstNoteId}/children`);
      console.log(`   Limit: 10`);
      
      const childrenResponse = await axios.get(`${SLITE_API_BASE}/notes/${firstNoteId}/children`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        params: {
          limit: 10
        }
      });
      
      console.log('\n✓ Get children successful!');
      console.log('\nResponse Headers:');
      console.log(JSON.stringify(childrenResponse.headers, null, 2));
      console.log('\nResponse Body:');
      console.log(JSON.stringify(childrenResponse.data, null, 2));
    } else {
      console.log('No notes found to test individual note endpoints\n');
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log('All tests passed! ✅');
    console.log(`${keyName} is working correctly!`);
    console.log(`${'='.repeat(60)}`);
    return true;
    
  } catch (error) {
    console.error(`\n${'='.repeat(60)}`);
    console.error(`❌ API test failed for ${keyName}:`, error.message);
    
    if (error.response) {
      console.error('\nError Response Details:');
      console.error('Status:', error.response.status);
      console.error('Status Text:', error.response.statusText);
      console.error('\nResponse Headers:');
      console.error(JSON.stringify(error.response.headers, null, 2));
      console.error('\nResponse Body:');
      console.error(JSON.stringify(error.response.data, null, 2));
      
      if (error.response.status === 401) {
        console.error('\n⚠️  Authentication failed. The API key might be invalid or expired.');
      } else if (error.response.status === 404) {
        console.error('\n⚠️  Endpoint not found. The API might have changed.');
      }
    } else if (error.request) {
      console.error('\nRequest Details:');
      console.error('URL:', error.config?.url);
      console.error('Method:', error.config?.method);
      console.error('Headers:', JSON.stringify(error.config?.headers, null, 2));
      console.error('\n⚠️  No response received. Check your internet connection.');
    }
    console.error(`${'='.repeat(60)}`);
    return false;
  }
}

// Run the tests for API keys
async function runTests() {
  console.log('Testing Slite API keys from .env file...');
  if (process.argv[2]) {
    console.log(`Using custom search query: "${process.argv[2]}"`);
  }
  console.log('Usage: node test-slite-api.js [search-query]\n');
  
  let workingKey = null;
  
  for (let i = 0; i < API_KEYS.length; i++) {
    const keyName = `API Key ${i + 1}`;
    const success = await testSliteConnection(API_KEYS[i], keyName);
    
    if (success) {
      workingKey = i + 1;
      break;
    }
  }
  
  if (workingKey) {
    console.log(`\n✅ SUCCESS: API Key ${workingKey} is working!`);
    console.log(`Update your MCP server to use: SLITE_API_KEY="${API_KEYS[workingKey - 1]}"`);
  } else {
    console.log('\n❌ FAILURE: Neither API key is working.');
    console.log('Please check if the keys are valid or if the Slite API has changed.');
  }
}

// Run all tests
runTests();