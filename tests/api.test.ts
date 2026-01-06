/**
 * Direct Slite API Tests
 *
 * Tests the Slite API directly (not through MCP server)
 * Covers: API endpoints, error handling, pagination, content formats, search features
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import axios, { AxiosError } from 'axios';
import { SLITE_API_BASE, TEST_NOTE_ID, headers, sliteRequest } from './test-helpers.js';
import {
  SliteNote,
  SliteSearchResponse,
  SliteChildrenResponse,
  SliteAskResponse,
} from '../src/types.js';

// =============================================================================
// Slite API Tests
// =============================================================================

describe('Slite API', () => {
  it('should search notes', async () => {
    const data = await sliteRequest<SliteSearchResponse>('/search-notes', { query: 'test', hitsPerPage: 5 });
    assert.ok(Array.isArray(data.hits), 'hits should be an array');
    assert.ok(data.hits.length > 0, 'should return results');
  });

  it('should get a note by ID', async () => {
    if (!TEST_NOTE_ID) {
      console.log('    Skipping: TEST_NOTE_ID not set');
      return;
    }
    const data = await sliteRequest<SliteNote>(`/notes/${TEST_NOTE_ID}`, { format: 'md' });
    assert.ok(data.id, 'note should have an id');
    assert.ok(data.title, 'note should have a title');
  });

  it('should get note children', async () => {
    if (!TEST_NOTE_ID) {
      console.log('    Skipping: TEST_NOTE_ID not set');
      return;
    }
    const data = await sliteRequest<SliteChildrenResponse>(`/notes/${TEST_NOTE_ID}/children`);
    assert.ok(Array.isArray(data.notes), 'notes should be an array');
    assert.ok(typeof data.total === 'number', 'total should be a number');
  });

  it('should answer questions with /ask', async () => {
    const data = await sliteRequest<SliteAskResponse>('/ask', { question: 'What is this workspace about?' });
    assert.ok(typeof data.answer === 'string', 'answer should be a string');
  });
});

// =============================================================================
// Error Handling Tests
// =============================================================================

describe('Error Handling', () => {
  it('should return 404 for invalid note ID', async () => {
    try {
      await sliteRequest('/notes/invalid-note-id-xyz');
      assert.fail('Should have thrown an error');
    } catch (error) {
      const axiosError = error as AxiosError;
      assert.strictEqual(axiosError.response?.status, 404);
    }
  });

  it('should return 401 for invalid API key', async () => {
    try {
      await axios.get(`${SLITE_API_BASE}/search-notes`, {
        headers: { 'Authorization': 'Bearer invalid-key', 'Content-Type': 'application/json' },
        params: { query: 'test' }
      });
      assert.fail('Should have thrown an error');
    } catch (error) {
      const axiosError = error as AxiosError;
      assert.strictEqual(axiosError.response?.status, 401);
    }
  });

  it('should return 404 for invalid parent note children', async () => {
    try {
      await sliteRequest('/notes/invalid-note-id/children');
      assert.fail('Should have thrown an error');
    } catch (error) {
      const axiosError = error as AxiosError;
      assert.strictEqual(axiosError.response?.status, 404);
    }
  });
});

// =============================================================================
// Pagination Tests
// =============================================================================

describe('Pagination', () => {
  it('should paginate search results with hitsPerPage', async () => {
    const page1 = await sliteRequest<SliteSearchResponse>('/search-notes', { query: 'test', hitsPerPage: 2, page: 0 });
    const page2 = await sliteRequest<SliteSearchResponse>('/search-notes', { query: 'test', hitsPerPage: 2, page: 1 });

    assert.strictEqual(page1.hits.length, 2, 'page 1 should have 2 results');
    assert.strictEqual(page2.hits.length, 2, 'page 2 should have 2 results');

    // Pages should have different results
    const page1Ids = page1.hits.map(h => h.id);
    const page2Ids = page2.hits.map(h => h.id);
    const hasDifferent = !page1Ids.every(id => page2Ids.includes(id));
    assert.ok(hasDifferent, 'pages should have different results');
  });

  it('should paginate children with cursor (requires 55+ children)', async () => {
    if (!TEST_NOTE_ID) {
      console.log('    Skipping: TEST_NOTE_ID not set');
      return;
    }

    const page1 = await sliteRequest<SliteChildrenResponse>(`/notes/${TEST_NOTE_ID}/children`);

    if (page1.total <= 50) {
      console.log(`    Skipping: Only ${page1.total} children (need >50 for cursor test)`);
      return;
    }

    assert.ok(page1.hasNextPage, 'should have next page');
    assert.ok(page1.nextCursor, 'should have cursor');
    assert.strictEqual(page1.notes.length, 50, 'first page should have 50 children');

    // Fetch second page
    const page2 = await sliteRequest<SliteChildrenResponse>(`/notes/${TEST_NOTE_ID}/children`, { cursor: page1.nextCursor });
    assert.ok(page2.notes.length > 0, 'second page should have children');
    assert.strictEqual(page1.total, page1.notes.length + page2.notes.length, 'total should match');
  });
});

// =============================================================================
// Content Format Tests
// =============================================================================

describe('Content Formats', () => {
  let testChildId: string | undefined;

  before(async () => {
    if (!TEST_NOTE_ID) return;

    // Paginate through all children to find the test note
    let cursor: string | null = null;
    do {
      const params = cursor ? { cursor } : {};
      const children = await sliteRequest<SliteChildrenResponse>(`/notes/${TEST_NOTE_ID}/children`, params);
      const testNote = children.notes?.find(c => c.title === 'Test Data for MCP Server');
      if (testNote) {
        testChildId = testNote.id;
        break;
      }
      cursor = children.hasNextPage ? children.nextCursor ?? null : null;
    } while (cursor);
  });

  it('should return markdown format', async () => {
    if (!testChildId) {
      console.log('    Skipping: Test child note not found');
      return;
    }

    const data = await sliteRequest<SliteNote>(`/notes/${testChildId}`, { format: 'md' });
    assert.ok(data.content, 'should have content');
    // Markdown typically has # headers or ** bold
    const looksLikeMarkdown = data.content.includes('#') || data.content.includes('**');
    assert.ok(looksLikeMarkdown, 'content should look like markdown');
  });

  it('should return HTML format', async () => {
    if (!testChildId) {
      console.log('    Skipping: Test child note not found');
      return;
    }

    const data = await sliteRequest<SliteNote>(`/notes/${testChildId}`, { format: 'html' });
    assert.ok(data.content, 'should have content');
    assert.ok(data.content.includes('<'), 'content should contain HTML tags');
  });
});

// =============================================================================
// Search Feature Tests
// =============================================================================

describe('Search Features', () => {
  it('should handle special characters in search', async () => {
    const queries = ['test & data', 'test+data', '"test data"'];

    for (const query of queries) {
      const data = await sliteRequest<SliteSearchResponse>('/search-notes', { query, hitsPerPage: 5 });
      assert.ok(Array.isArray(data.hits), `"${query}" should return array`);
    }
  });

  it('should find unique test keyword', async () => {
    const data = await sliteRequest<SliteSearchResponse>('/search-notes', {
      query: 'MCP_UNIQUE_TEST_KEYWORD_123',
      hitsPerPage: 10
    });

    if (data.hits.length === 0) {
      console.log('    Warning: Unique keyword not found (indexing may take time)');
      return;
    }

    assert.ok(data.hits.length > 0, 'should find test keyword');
    const hasTestNote = data.hits.some(h => h.title === 'Test Data for MCP Server');
    assert.ok(hasTestNote, 'should find "Test Data for MCP Server" note');
  });

  it('should handle long queries', async () => {
    const longQuery = 'a'.repeat(200);
    const data = await sliteRequest<SliteSearchResponse>('/search-notes', { query: longQuery, hitsPerPage: 5 });
    assert.ok(Array.isArray(data.hits), 'should handle long query');
  });
});
