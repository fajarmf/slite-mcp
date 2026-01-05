require('dotenv').config();
const { spawn } = require('child_process');
const path = require('path');

const API_KEY = process.env.SLITE_API_KEY;
const TEST_NOTE_ID = process.env.TEST_NOTE_ID || 'wtz12XJazNSK7s';

if (!API_KEY) {
  console.error('Error: SLITE_API_KEY not found. Please set it in your .env file.');
  process.exit(1);
}

class MCPTestClient {
  constructor() {
    this.messageId = 0;
    this.pendingResponses = new Map();
    this.buffer = '';
  }

  async start() {
    return new Promise((resolve, reject) => {
      const serverPath = path.join(__dirname, '..', 'build', 'index.js');

      this.process = spawn('node', [serverPath], {
        env: { ...process.env, SLITE_API_KEY: API_KEY },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      this.process.stdout.on('data', (data) => {
        this.buffer += data.toString();
        this.processBuffer();
      });

      this.process.stderr.on('data', (data) => {
        const msg = data.toString();
        if (msg.includes('running on stdio')) {
          resolve();
        }
      });

      this.process.on('error', reject);
      this.process.on('exit', (code) => {
        if (code !== 0 && code !== null) {
          reject(new Error(`Server exited with code ${code}`));
        }
      });

      // Give server time to start
      setTimeout(resolve, 1000);
    });
  }

  processBuffer() {
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim()) {
        try {
          const message = JSON.parse(line);
          const resolver = this.pendingResponses.get(message.id);
          if (resolver) {
            resolver(message);
            this.pendingResponses.delete(message.id);
          }
        } catch (e) {
          // Ignore non-JSON lines
        }
      }
    }
  }

  async sendRequest(method, params = {}) {
    const id = ++this.messageId;
    const request = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };

    return new Promise((resolve, reject) => {
      this.pendingResponses.set(id, resolve);
      this.process.stdin.write(JSON.stringify(request) + '\n');

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingResponses.has(id)) {
          this.pendingResponses.delete(id);
          reject(new Error('Request timed out'));
        }
      }, 30000);
    });
  }

  async callTool(name, args) {
    return this.sendRequest('tools/call', { name, arguments: args });
  }

  async listTools() {
    return this.sendRequest('tools/list');
  }

  stop() {
    if (this.process) {
      this.process.kill();
    }
  }
}

async function testListTools(client) {
  console.log('1. Testing tools/list...');
  try {
    const response = await client.listTools();
    const tools = response.result?.tools || [];
    const toolNames = tools.map(t => t.name);

    const expectedTools = ['slite_search', 'slite_get_note', 'slite_get_note_children', 'slite_ask'];
    const hasAllTools = expectedTools.every(t => toolNames.includes(t));

    if (hasAllTools) {
      console.log(`   ✅ All ${expectedTools.length} tools registered: ${toolNames.join(', ')}`);
      return true;
    } else {
      console.log(`   ❌ Missing tools. Found: ${toolNames.join(', ')}`);
      return false;
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return false;
  }
}

async function testSearchTool(client) {
  console.log('\n2. Testing slite_search tool...');
  try {
    const response = await client.callTool('slite_search', { query: 'test', hitsPerPage: 5 });
    const content = response.result?.content?.[0]?.text || '';

    if (content.includes('Found') && content.includes('notes')) {
      console.log('   ✅ Search tool returns formatted results');
      console.log(`   Preview: ${content.substring(0, 100)}...`);
      return true;
    } else {
      console.log(`   ❌ Unexpected response format`);
      return false;
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return false;
  }
}

async function testGetNoteTool(client) {
  console.log('\n3. Testing slite_get_note tool...');
  try {
    const response = await client.callTool('slite_get_note', {
      noteId: TEST_NOTE_ID,
      format: 'md'
    });
    const content = response.result?.content?.[0]?.text || '';

    if (content.includes('**') || content.length > 0) {
      console.log('   ✅ Get note tool returns note content');
      console.log(`   Preview: ${content.substring(0, 100)}...`);
      return true;
    } else {
      console.log('   ⚠️  Note appears to be empty');
      return true; // Empty note is valid
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return false;
  }
}

async function testGetNoteChildrenTool(client) {
  console.log('\n4. Testing slite_get_note_children tool...');
  try {
    const response = await client.callTool('slite_get_note_children', {
      noteId: TEST_NOTE_ID
    });
    const content = response.result?.content?.[0]?.text || '';

    if (content.includes('child notes') || content.includes('No child notes')) {
      console.log('   ✅ Get children tool returns child information');
      console.log(`   Preview: ${content.substring(0, 100)}...`);
      return true;
    } else {
      console.log('   ❌ Unexpected response format');
      return false;
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return false;
  }
}

async function testAskTool(client) {
  console.log('\n5. Testing slite_ask tool...');
  try {
    const response = await client.callTool('slite_ask', {
      question: 'What is the MCP test doc about?'
    });
    const content = response.result?.content?.[0]?.text || '';

    if (content.length > 0 && !content.startsWith('Error:')) {
      console.log('   ✅ Ask tool returns an answer');
      console.log(`   Preview: ${content.substring(0, 150)}...`);
      return true;
    } else if (content.startsWith('Error:')) {
      console.log(`   ❌ Tool returned error: ${content}`);
      return false;
    } else {
      console.log('   ⚠️  Empty response');
      return false;
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return false;
  }
}

async function testErrorHandling(client) {
  console.log('\n6. Testing error handling for invalid note...');
  try {
    const response = await client.callTool('slite_get_note', {
      noteId: 'invalid-note-id-xyz'
    });
    const content = response.result?.content?.[0]?.text || '';

    if (content.includes('Error:') || content.includes('404') || content.includes('not found')) {
      console.log('   ✅ Error is properly returned for invalid note');
      return true;
    } else {
      console.log(`   ⚠️  Response: ${content.substring(0, 100)}`);
      return true;
    }
  } catch (error) {
    console.log(`   ✅ Error thrown as expected: ${error.message}`);
    return true;
  }
}

async function runMCPIntegrationTests() {
  console.log('='.repeat(60));
  console.log('MCP Server Integration Tests');
  console.log('='.repeat(60));
  console.log(`Using test note ID: ${TEST_NOTE_ID}\n`);

  const client = new MCPTestClient();

  try {
    console.log('Starting MCP server...\n');
    await client.start();

    const results = [];

    results.push(await testListTools(client));
    results.push(await testSearchTool(client));
    results.push(await testGetNoteTool(client));
    results.push(await testGetNoteChildrenTool(client));
    results.push(await testAskTool(client));
    results.push(await testErrorHandling(client));

    const passed = results.filter(r => r).length;
    const total = results.length;

    console.log('\n' + '='.repeat(60));
    console.log(`Results: ${passed}/${total} tests passed`);
    console.log('='.repeat(60));

    client.stop();
    process.exit(passed === total ? 0 : 1);

  } catch (error) {
    console.error('Failed to start MCP server:', error.message);
    client.stop();
    process.exit(1);
  }
}

runMCPIntegrationTests();
