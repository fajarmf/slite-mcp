const axios = require('axios');

const SLITE_API_BASE = 'https://api.slite.com/v1';
const API_KEY = '5L173-xi9vACND0mKslF-4e6bda0601db2b23550fe85378b5758ba14f7cb0a4fe5d207d0be9addb22e993';

async function testSpecificNote() {
  const noteId = process.argv[2] || 'BoptqNi4pm0lcV'; // First note from search results
  
  console.log(`Testing specific note: ${noteId}\n`);
  
  try {
    // Test get note endpoint
    console.log('Testing GET /notes/:id endpoint...');
    const response = await axios.get(`${SLITE_API_BASE}/notes/${noteId}`, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      },
      params: {
        format: 'md'
      }
    });
    
    console.log('Response Headers:');
    console.log(JSON.stringify(response.headers, null, 2));
    console.log('\nResponse Body:');
    console.log(JSON.stringify(response.data, null, 2));
    
    // Also test children endpoint
    console.log('\n\nTesting GET /notes/:id/children endpoint...');
    const childrenResponse = await axios.get(`${SLITE_API_BASE}/notes/${noteId}/children`, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      },
      params: {
        limit: 10
      }
    });
    
    console.log('Children Response Headers:');
    console.log(JSON.stringify(childrenResponse.headers, null, 2));
    console.log('\nChildren Response Body:');
    console.log(JSON.stringify(childrenResponse.data, null, 2));
    
  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testSpecificNote();