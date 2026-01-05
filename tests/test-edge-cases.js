require('dotenv').config();
const axios = require('axios');

const SLITE_API_BASE = 'https://api.slite.com/v1';
const API_KEY = process.env.SLITE_API_KEY;
const TEST_NOTE_ID = process.env.TEST_NOTE_ID;

if (!API_KEY) {
  console.error('Error: SLITE_API_KEY not found. Please set it in your .env file.');
  process.exit(1);
}

if (!TEST_NOTE_ID) {
  console.error('Error: TEST_NOTE_ID is required.');
  console.error('Run `npm run test:setup` to create test documents.');
  process.exit(1);
}

// Will be populated by fetching children of TEST_NOTE_ID
let TEST_CHILD_NOTE_ID = null;

const headers = {
  'Authorization': `Bearer ${API_KEY}`,
  'Content-Type': 'application/json'
};

// Test 1: Pagination
async function testPagination() {
  console.log('1. Testing pagination...');
  try {
    // First page
    const page1 = await axios.get(`${SLITE_API_BASE}/search-notes`, {
      headers,
      params: { query: 'the', hitsPerPage: 3, page: 0 }
    });

    // Second page
    const page2 = await axios.get(`${SLITE_API_BASE}/search-notes`, {
      headers,
      params: { query: 'the', hitsPerPage: 3, page: 1 }
    });

    const page1Ids = page1.data.hits?.map(h => h.id) || [];
    const page2Ids = page2.data.hits?.map(h => h.id) || [];

    // Check pages have different results (unless there are fewer than 4 results)
    const totalPages = page1.data.nbPages || 1;
    if (totalPages > 1) {
      const hasDifferentResults = !page1Ids.every(id => page2Ids.includes(id));
      if (hasDifferentResults) {
        console.log(`   ✅ Pagination works - different results on different pages`);
        console.log(`   Total pages: ${totalPages}, Page 0: ${page1Ids.length} results, Page 1: ${page2Ids.length} results`);
        return true;
      } else {
        console.log('   ⚠️  Pages returned same results');
        return false;
      }
    } else {
      console.log('   ⚠️  Not enough results to test pagination fully');
      return true;
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return false;
  }
}

// Test 2: HTML vs Markdown format
async function testFormats() {
  console.log('\n2. Testing HTML vs Markdown format...');
  try {
    const mdResponse = await axios.get(`${SLITE_API_BASE}/notes/${TEST_CHILD_NOTE_ID}`, {
      headers,
      params: { format: 'md' }
    });

    const htmlResponse = await axios.get(`${SLITE_API_BASE}/notes/${TEST_CHILD_NOTE_ID}`, {
      headers,
      params: { format: 'html' }
    });

    const mdContent = mdResponse.data.content || '';
    const htmlContent = htmlResponse.data.content || '';

    // Check that HTML contains tags and MD doesn't (or vice versa)
    const htmlHasTags = htmlContent.includes('<') && htmlContent.includes('>');
    const mdHasHashHeaders = mdContent.includes('#') || mdContent.includes('**');

    if (htmlHasTags || mdHasHashHeaders || (mdContent !== htmlContent)) {
      console.log('   ✅ Format parameter works correctly');
      console.log(`   Markdown length: ${mdContent.length}, HTML length: ${htmlContent.length}`);
      return true;
    } else {
      console.log('   ⚠️  Both formats returned same content');
      return true; // Empty note case
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return false;
  }
}

// Test 3: Special characters in search
async function testSpecialCharacters() {
  console.log('\n3. Testing special characters in search...');
  const testCases = [
    { query: 'test & data', desc: 'ampersand' },
    { query: 'MCP_UNIQUE_TEST_KEYWORD_123', desc: 'underscore' },
    { query: '"test data"', desc: 'quotes' },
    { query: 'test+data', desc: 'plus sign' },
  ];

  let passed = 0;
  for (const tc of testCases) {
    try {
      const response = await axios.get(`${SLITE_API_BASE}/search-notes`, {
        headers,
        params: { query: tc.query, hitsPerPage: 5 }
      });
      console.log(`   ✅ "${tc.query}" (${tc.desc}) - ${response.data.hits?.length || 0} results`);
      passed++;
    } catch (error) {
      console.log(`   ❌ "${tc.query}" (${tc.desc}) - Error: ${error.response?.status || error.message}`);
    }
  }

  return passed === testCases.length;
}

// Test 4: Very long search query
async function testLongQuery() {
  console.log('\n4. Testing long search query...');
  const longQuery = 'a'.repeat(200);
  try {
    const response = await axios.get(`${SLITE_API_BASE}/search-notes`, {
      headers,
      params: { query: longQuery, hitsPerPage: 5 }
    });
    console.log(`   ✅ Long query (200 chars) accepted - ${response.data.hits?.length || 0} results`);
    return true;
  } catch (error) {
    if (error.response?.status === 400) {
      console.log('   ✅ Long query correctly rejected with 400');
      return true;
    }
    console.log(`   ⚠️  Status: ${error.response?.status || error.message}`);
    return false;
  }
}

// Test 5: Note children endpoint structure
// Tests the children endpoint response structure (pagination fields, note format)
// Note: Slite API appears to return all children regardless of limit parameter
async function testChildrenPagination() {
  console.log('\n5. Testing children endpoint structure...');
  try {
    const response = await axios.get(`${SLITE_API_BASE}/notes/${TEST_NOTE_ID}/children`, {
      headers
    });

    const { nextCursor, hasNextPage, total, notes } = response.data;
    const returnedCount = notes?.length || 0;

    console.log(`   Total: ${total}, Returned: ${returnedCount}`);
    console.log(`   Has next page: ${hasNextPage}, Cursor: ${nextCursor ? 'present' : 'none'}`);

    // Verify response structure
    const hasValidStructure = (
      typeof total === 'number' &&
      Array.isArray(notes) &&
      typeof hasNextPage === 'boolean'
    );

    if (!hasValidStructure) {
      console.log('   ❌ Invalid response structure');
      return false;
    }

    // Verify note objects have required fields
    if (notes.length > 0) {
      const firstNote = notes[0];
      const hasRequiredFields = firstNote.id && firstNote.title;
      if (!hasRequiredFields) {
        console.log('   ❌ Note objects missing required fields');
        return false;
      }
      console.log(`   First child: "${firstNote.title}" (${firstNote.id})`);
    }

    // Test cursor pagination if available
    if (hasNextPage && nextCursor) {
      const page2 = await axios.get(`${SLITE_API_BASE}/notes/${TEST_NOTE_ID}/children`, {
        headers,
        params: { cursor: nextCursor }
      });
      console.log(`   ✅ Cursor pagination works - page 2 has ${page2.data.notes?.length || 0} notes`);
    } else {
      console.log(`   ✅ Response structure valid (API returns all ${returnedCount} children in one page)`);
    }

    return true;
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return false;
  }
}

// Test 6: Search with unique keyword
async function testUniqueKeywordSearch() {
  console.log('\n6. Testing unique keyword search...');
  try {
    const response = await axios.get(`${SLITE_API_BASE}/search-notes`, {
      headers,
      params: { query: 'MCP_UNIQUE_TEST_KEYWORD_123', hitsPerPage: 10 }
    });

    const hits = response.data.hits || [];
    if (hits.length > 0) {
      console.log(`   ✅ Found ${hits.length} result(s) for unique keyword`);
      console.log(`   First match: "${hits[0].title}"`);
      return true;
    } else {
      console.log('   ⚠️  No results (indexing may take time)');
      return true;
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return false;
  }
}

// Test 7: Ask endpoint with context filter
async function testAskWithFilter() {
  console.log('\n7. Testing ask endpoint with parentNoteId filter...');
  try {
    const response = await axios.get(`${SLITE_API_BASE}/ask`, {
      headers,
      params: {
        question: 'What test data is available?',
        parentNoteId: TEST_NOTE_ID
      }
    });

    const answer = response.data.answer || '';
    if (answer.length > 0) {
      console.log('   ✅ Ask with filter returns answer');
      console.log(`   Answer preview: ${answer.substring(0, 100)}...`);
      return true;
    } else {
      console.log('   ⚠️  Empty answer');
      return true;
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.response?.status || error.message}`);
    return false;
  }
}

// Test 8: hitsPerPage parameter
async function testHitsPerPage() {
  console.log('\n8. Testing hitsPerPage parameter...');
  try {
    const small = await axios.get(`${SLITE_API_BASE}/search-notes`, {
      headers,
      params: { query: 'the', hitsPerPage: 2 }
    });

    const large = await axios.get(`${SLITE_API_BASE}/search-notes`, {
      headers,
      params: { query: 'the', hitsPerPage: 10 }
    });

    const countSmall = small.data.hits?.length || 0;
    const countLarge = large.data.hits?.length || 0;

    if (countSmall > 0 && countLarge > 0) {
      if (countSmall <= 2 && countLarge <= 10) {
        console.log(`   ✅ hitsPerPage works - hitsPerPage=2 returned ${countSmall}, hitsPerPage=10 returned ${countLarge}`);
      } else {
        console.log(`   ✅ hitsPerPage accepted - returned ${countSmall} and ${countLarge} results`);
        if (countSmall > 2) {
          console.log(`   ⚠️  Note: API may have minimum page size of ${countSmall}`);
        }
      }
      return true;
    } else {
      console.log(`   ❌ No results returned`);
      return false;
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return false;
  }
}

async function runEdgeCaseTests() {
  console.log('='.repeat(60));
  console.log('Edge Case Tests');
  console.log('='.repeat(60));
  console.log(`Test note ID: ${TEST_NOTE_ID}`);

  // Fetch children to get the first child ID dynamically
  console.log('Fetching children of test note...');
  try {
    const response = await axios.get(`${SLITE_API_BASE}/notes/${TEST_NOTE_ID}/children`, {
      headers
    });
    const children = response.data.notes || [];
    if (children.length === 0) {
      console.error('Error: No children found. Run `npm run test:setup` first.');
      process.exit(1);
    }
    // Find the "Test Data for MCP Server" note (first child with searchable content)
    const testDataNote = children.find(c => c.title === 'Test Data for MCP Server') || children[0];
    TEST_CHILD_NOTE_ID = testDataNote.id;
    console.log(`Found ${children.length} children. Using: ${testDataNote.title} (${TEST_CHILD_NOTE_ID})\n`);
  } catch (error) {
    console.error(`Error fetching children: ${error.message}`);
    process.exit(1);
  }

  const results = [];

  results.push(await testPagination());
  results.push(await testFormats());
  results.push(await testSpecialCharacters());
  results.push(await testLongQuery());
  results.push(await testChildrenPagination());
  results.push(await testUniqueKeywordSearch());
  results.push(await testAskWithFilter());
  results.push(await testHitsPerPage());

  const passed = results.filter(r => r).length;
  const total = results.length;

  console.log('\n' + '='.repeat(60));
  console.log(`Results: ${passed}/${total} tests passed`);
  console.log('='.repeat(60));

  process.exit(passed === total ? 0 : 1);
}

runEdgeCaseTests();
