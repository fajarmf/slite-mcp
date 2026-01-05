require('dotenv').config();
const axios = require('axios');

const SLITE_API_BASE = 'https://api.slite.com/v1';
const API_KEY = process.env.SLITE_API_KEY;

if (!API_KEY) {
  console.error('Error: SLITE_API_KEY not found. Please set it in your .env file.');
  process.exit(1);
}

const headers = {
  'Authorization': `Bearer ${API_KEY}`,
  'Content-Type': 'application/json'
};

async function testInvalidNoteId() {
  console.log('1. Testing invalid note ID...');
  try {
    await axios.get(`${SLITE_API_BASE}/notes/invalid-note-id-12345`, { headers });
    console.log('   ❌ Expected error but request succeeded');
    return false;
  } catch (error) {
    if (error.response?.status === 404) {
      console.log('   ✅ Correctly returns 404 for invalid note ID');
      return true;
    } else {
      console.log(`   ⚠️  Unexpected status: ${error.response?.status}`);
      return false;
    }
  }
}

async function testInvalidApiKey() {
  console.log('\n2. Testing invalid API key...');
  try {
    await axios.get(`${SLITE_API_BASE}/search-notes`, {
      headers: {
        'Authorization': 'Bearer invalid-api-key-12345',
        'Content-Type': 'application/json'
      },
      params: { query: 'test' }
    });
    console.log('   ❌ Expected error but request succeeded');
    return false;
  } catch (error) {
    if (error.response?.status === 401) {
      console.log('   ✅ Correctly returns 401 for invalid API key');
      return true;
    } else {
      console.log(`   ⚠️  Unexpected status: ${error.response?.status}`);
      return false;
    }
  }
}

async function testEmptySearchQuery() {
  console.log('\n3. Testing empty search query...');
  try {
    const response = await axios.get(`${SLITE_API_BASE}/search-notes`, {
      headers,
      params: { query: '' }
    });
    console.log(`   ✅ Empty query handled (returned ${response.data.hits?.length || 0} results)`);
    return true;
  } catch (error) {
    if (error.response?.status === 400) {
      console.log('   ✅ Correctly returns 400 for empty query');
      return true;
    } else {
      console.log(`   ⚠️  Unexpected error: ${error.response?.status} - ${error.message}`);
      return false;
    }
  }
}

async function testMissingRequiredParams() {
  console.log('\n4. Testing missing required parameters...');
  try {
    await axios.get(`${SLITE_API_BASE}/search-notes`, { headers });
    console.log('   ⚠️  Request succeeded without query parameter');
    return true;
  } catch (error) {
    if (error.response?.status === 400) {
      console.log('   ✅ Correctly returns 400 for missing query param');
      return true;
    } else {
      console.log(`   ⚠️  Unexpected status: ${error.response?.status}`);
      return false;
    }
  }
}

async function testInvalidChildrenNoteId() {
  console.log('\n5. Testing children endpoint with invalid note ID...');
  try {
    await axios.get(`${SLITE_API_BASE}/notes/invalid-note-id/children`, { headers });
    console.log('   ❌ Expected error but request succeeded');
    return false;
  } catch (error) {
    if (error.response?.status === 404) {
      console.log('   ✅ Correctly returns 404 for invalid parent note ID');
      return true;
    } else {
      console.log(`   ⚠️  Unexpected status: ${error.response?.status}`);
      return false;
    }
  }
}

async function testAskEndpointEmptyQuestion() {
  console.log('\n6. Testing ask endpoint with empty question...');
  try {
    const response = await axios.get(`${SLITE_API_BASE}/ask`, {
      headers,
      params: { question: '' }
    });
    console.log('   ⚠️  Empty question accepted');
    console.log(`   Response: ${JSON.stringify(response.data).substring(0, 100)}...`);
    return true;
  } catch (error) {
    if (error.response?.status === 400) {
      console.log('   ✅ Correctly returns 400 for empty question');
      return true;
    } else {
      console.log(`   ⚠️  Status: ${error.response?.status} - ${error.message}`);
      return false;
    }
  }
}

async function runErrorHandlingTests() {
  console.log('='.repeat(60));
  console.log('Error Handling Tests');
  console.log('='.repeat(60));

  const results = [];

  results.push(await testInvalidNoteId());
  results.push(await testInvalidApiKey());
  results.push(await testEmptySearchQuery());
  results.push(await testMissingRequiredParams());
  results.push(await testInvalidChildrenNoteId());
  results.push(await testAskEndpointEmptyQuestion());

  const passed = results.filter(r => r).length;
  const total = results.length;

  console.log('\n' + '='.repeat(60));
  console.log(`Results: ${passed}/${total} tests passed`);
  console.log('='.repeat(60));

  process.exit(passed === total ? 0 : 1);
}

runErrorHandlingTests();
