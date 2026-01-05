#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";

const SLITE_API_BASE = "https://api.slite.com/v1";

interface SliteConfig {
  apiKey: string;
}

class SliteServer {
  private server: Server;
  private config: SliteConfig;

  constructor() {
    this.server = new Server(
      {
        name: "slite-mcp",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.config = {
      apiKey: process.env.SLITE_API_KEY || "",
    };

    this.setupToolHandlers();
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "slite_search",
            description: "Search for notes in Slite",
            inputSchema: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "Search query",
                },
                hitsPerPage: {
                  type: "number",
                  description: "Maximum number of results per page (default: 10)",
                  default: 10,
                },
              },
              required: ["query"],
            },
          },
          {
            name: "slite_get_note",
            description: "Get a specific note by ID",
            inputSchema: {
              type: "object",
              properties: {
                noteId: {
                  type: "string",
                  description: "The ID of the note to retrieve",
                },
                format: {
                  type: "string",
                  description: "Format to return (markdown or html)",
                  enum: ["md", "html"],
                  default: "md",
                },
              },
              required: ["noteId"],
            },
          },
          {
            name: "slite_get_note_children",
            description: "Get child notes of a parent note",
            inputSchema: {
              type: "object",
              properties: {
                noteId: {
                  type: "string",
                  description: "The ID of the parent note",
                },
                cursor: {
                  type: "string",
                  description: "Cursor for pagination (from previous response)",
                },
              },
              required: ["noteId"],
            },
          },
          {
            name: "slite_ask",
            description: "Ask a question to your Slite notes in natural language. Returns an AI-generated answer with sources.",
            inputSchema: {
              type: "object",
              properties: {
                question: {
                  type: "string",
                  description: "The question to ask Slite",
                },
                parentNoteId: {
                  type: "string",
                  description: "Optional filter to only search within notes under this parent note ID",
                },
              },
              required: ["question"],
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case "slite_search":
            return await this.searchNotes(args?.query as string, (args?.hitsPerPage as number) || 10);

          case "slite_get_note":
            return await this.getNote(args?.noteId as string, (args?.format as string) || "md");

          case "slite_get_note_children":
            return await this.getNoteChildren(args?.noteId as string, args?.cursor as string | undefined);

          case "slite_ask":
            return await this.askSlite(args?.question as string, args?.parentNoteId as string | undefined);

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    });
  }

  private async makeSliteRequest(endpoint: string, params?: any) {
    const response = await axios.get(`${SLITE_API_BASE}${endpoint}`, {
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
      },
      params,
    });
    return response.data;
  }

  private async searchNotes(query: string, hitsPerPage: number) {
    const data = await this.makeSliteRequest("/search-notes", {
      query,
      hitsPerPage,
    });

    const results = data.hits?.map((hit: any) => ({
      id: hit.id,
      title: hit.title,
      content: hit.highlight || "",
      updatedAt: hit.updatedAt,
      type: hit.type,
      parentNotes: hit.parentNotes?.map((p: any) => p.title).join(" > ") || "",
    })) || [];

    return {
      content: [
        {
          type: "text",
          text: `Found ${results.length} notes:\n\n${results
            .map((note: any) => `**${note.title}** (ID: ${note.id})\nPath: ${note.parentNotes}\n${note.content ? `Preview: ${note.content}\n` : ''}Updated: ${new Date(note.updatedAt).toLocaleDateString()}\n---`)
            .join("\n")}`,
        },
      ],
    };
  }

  private async getNote(noteId: string, format: string) {
    const data = await this.makeSliteRequest(`/notes/${noteId}`, {
      format,
    });

    return {
      content: [
        {
          type: "text",
          text: `**${data.title}**\n\n${data.content}`,
        },
      ],
    };
  }

  private async getNoteChildren(noteId: string, cursor?: string) {
    const params: any = {};
    if (cursor) {
      params.cursor = cursor;
    }
    const data = await this.makeSliteRequest(`/notes/${noteId}/children`, params);

    const children = data.notes || [];

    if (children.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: "No child notes found.",
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `Found ${children.length} child notes (Total: ${data.total}):\n\n${children
            .map((note: any) => `**${note.title}** (ID: ${note.id})\n${note.content?.substring(0, 200) || 'No content preview'}${note.content?.length > 200 ? '...' : ''}\n---`)
            .join("\n")}`,
        },
      ],
    };
  }

  private async askSlite(question: string, parentNoteId?: string) {
    const params: any = { question };
    if (parentNoteId) {
      params.parentNoteId = parentNoteId;
    }

    const data = await this.makeSliteRequest("/ask", params);

    const sources = data.sources || [];
    const sourcesList = sources.length > 0
      ? `\n\n**Sources:**\n${sources.map((s: any) => `- [${s.title || 'Untitled'}](${s.url})`).join("\n")}`
      : "";

    return {
      content: [
        {
          type: "text",
          text: `${data.answer || "No answer available."}${sourcesList}`,
        },
      ],
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Slite MCP server running on stdio");
  }
}

const server = new SliteServer();
server.run().catch(console.error);