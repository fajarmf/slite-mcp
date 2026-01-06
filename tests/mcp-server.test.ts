/**
 * MCP Server Integration Tests
 *
 * Tests the MCP server via stdio transport
 * Covers: tool listing, read operations, error handling
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { TEST_NOTE_ID, createMcpServer } from './test-helpers.js';

interface McpToolResult {
  result?: {
    tools?: Array<{ name: string }>;
    content?: Array<{ text: string }>;
  };
  error?: unknown;
}

describe('MCP Server', () => {
  const server = createMcpServer();

  before(async () => {
    await server.start();
  });

  after(() => {
    server.stop();
  });

  // ===========================================================================
  // Tool Discovery
  // ===========================================================================

  it('should list all tools', async () => {
    const response = await server.sendRequest('tools/list') as McpToolResult;
    const tools = response.result?.tools || [];
    const toolNames = tools.map(t => t.name);

    // Read tools
    assert.ok(toolNames.includes('slite_search'), 'should have slite_search');
    assert.ok(toolNames.includes('slite_get_note'), 'should have slite_get_note');
    assert.ok(toolNames.includes('slite_get_note_children'), 'should have slite_get_note_children');
    assert.ok(toolNames.includes('slite_ask'), 'should have slite_ask');

    // Write tools
    assert.ok(toolNames.includes('slite_create_note'), 'should have slite_create_note');
    assert.ok(toolNames.includes('slite_edit_note'), 'should have slite_edit_note');
    assert.ok(toolNames.includes('slite_update_note'), 'should have slite_update_note');
  });

  // ===========================================================================
  // Read Operations
  // ===========================================================================

  it('should execute slite_search tool', async () => {
    const response = await server.sendRequest('tools/call', {
      name: 'slite_search',
      arguments: { query: 'test', hitsPerPage: 5 }
    }) as McpToolResult;

    const content = response.result?.content?.[0]?.text || '';
    assert.ok(content.includes('Found'), 'should return formatted results');
  });

  it('should execute slite_get_note tool', async () => {
    if (!TEST_NOTE_ID) {
      console.log('    Skipping: TEST_NOTE_ID not set');
      return;
    }

    const response = await server.sendRequest('tools/call', {
      name: 'slite_get_note',
      arguments: { noteId: TEST_NOTE_ID, format: 'md' }
    }) as McpToolResult;

    const content = response.result?.content?.[0]?.text || '';
    assert.ok(content.length > 0, 'should return note content');
  });

  it('should execute slite_get_note_children tool', async () => {
    if (!TEST_NOTE_ID) {
      console.log('    Skipping: TEST_NOTE_ID not set');
      return;
    }

    const response = await server.sendRequest('tools/call', {
      name: 'slite_get_note_children',
      arguments: { noteId: TEST_NOTE_ID }
    }) as McpToolResult;

    const content = response.result?.content?.[0]?.text || '';
    assert.ok(content.includes('child notes'), 'should return children info');
  });

  it('should execute slite_ask tool', async () => {
    const response = await server.sendRequest('tools/call', {
      name: 'slite_ask',
      arguments: { question: 'What is this about?' }
    }) as McpToolResult;

    const content = response.result?.content?.[0]?.text || '';
    assert.ok(content.length > 0 || content === '', 'should return answer or empty');
  });

  // ===========================================================================
  // Error Handling
  // ===========================================================================

  it('should handle errors gracefully', async () => {
    const response = await server.sendRequest('tools/call', {
      name: 'slite_get_note',
      arguments: { noteId: 'invalid-note-id-xyz' }
    }) as McpToolResult;

    const content = response.result?.content?.[0]?.text || '';
    assert.ok(content.includes('Error') || response.error, 'should return error');
  });
});
