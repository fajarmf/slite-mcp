/**
 * Shared test helpers for Slite MCP Server tests
 */

import 'dotenv/config';
import axios from 'axios';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';

export const SLITE_API_BASE = 'https://api.slite.com/v1';
export const API_KEY = process.env.SLITE_API_KEY;
export const TEST_NOTE_ID = process.env.TEST_NOTE_ID;

if (!API_KEY) {
  console.error('Error: SLITE_API_KEY not found. Set it in your .env file.');
  process.exit(1);
}

export const headers = {
  'Authorization': `Bearer ${API_KEY}`,
  'Content-Type': 'application/json'
};

/**
 * Make a direct request to the Slite API
 */
export async function sliteRequest<T = unknown>(
  endpoint: string,
  params: Record<string, unknown> = {}
): Promise<T> {
  const response = await axios.get<T>(`${SLITE_API_BASE}${endpoint}`, { headers, params });
  return response.data;
}

interface McpMessage {
  id: number;
  jsonrpc: string;
  result?: unknown;
  error?: unknown;
}

interface McpServer {
  start: () => Promise<void>;
  stop: () => void;
  sendRequest: (method: string, params?: Record<string, unknown>) => Promise<McpMessage>;
}

/**
 * Create and manage an MCP server process for testing
 */
export function createMcpServer(): McpServer {
  let serverProcess: ChildProcess | null = null;
  let messageId = 0;
  let buffer = '';
  const pendingResponses = new Map<number, (message: McpMessage) => void>();

  function processBuffer(): void {
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim()) {
        try {
          const message = JSON.parse(line) as McpMessage;
          const resolver = pendingResponses.get(message.id);
          if (resolver) {
            resolver(message);
            pendingResponses.delete(message.id);
          }
        } catch (e) {
          // Ignore non-JSON lines
        }
      }
    }
  }

  async function start(): Promise<void> {
    const serverPath = path.join(__dirname, '..', 'build', 'index.js');

    serverProcess = spawn('node', [serverPath], {
      env: { ...process.env, SLITE_API_KEY: API_KEY },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    serverProcess.stdout?.on('data', (data: Buffer) => {
      buffer += data.toString();
      processBuffer();
    });

    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  function stop(): void {
    if (serverProcess) {
      serverProcess.kill();
    }
  }

  function sendRequest(method: string, params: Record<string, unknown> = {}): Promise<McpMessage> {
    const id = ++messageId;
    const request = { jsonrpc: '2.0', id, method, params };

    return new Promise((resolve, reject) => {
      pendingResponses.set(id, resolve);
      serverProcess?.stdin?.write(JSON.stringify(request) + '\n');

      setTimeout(() => {
        if (pendingResponses.has(id)) {
          pendingResponses.delete(id);
          reject(new Error('Request timed out'));
        }
      }, 30000);
    });
  }

  return { start, stop, sendRequest };
}
