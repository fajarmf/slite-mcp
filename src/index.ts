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
    this.server = new Server({
      name: "slite-mcp",
      version: "1.0.0",
    });

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
                limit: {
                  type: "number",
                  description: "Maximum number of results (default: 10)",
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
                limit: {
                  type: "number",
                  description: "Maximum number of results (default: 20)",
                  default: 20,
                },
              },
              required: ["noteId"],
            },
          },
          {
            name: "slite_create_note",
            description: "Create a new note in Slite",
            inputSchema: {
              type: "object",
              properties: {
                title: {
                  type: "string",
                  description: "The title of the note",
                },
                markdown: {
                  type: "string",
                  description: "The markdown content of the note (optional)",
                },
                parentNoteId: {
                  type: "string",
                  description: "The ID of the parent note (optional, defaults to personal channel)",
                },
              },
              required: ["title"],
            },
          },
          {
            name: "slite_update_note",
            description: "Update an existing note in Slite",
            inputSchema: {
              type: "object",
              properties: {
                noteId: {
                  type: "string",
                  description: "The ID of the note to update",
                },
                title: {
                  type: "string",
                  description: "The new title of the note (optional)",
                },
                markdown: {
                  type: "string",
                  description: "The new markdown content of the note (optional)",
                },
              },
              required: ["noteId"],
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
            return await this.searchNotes(args?.query as string, (args?.limit as number) || 10);
          
          case "slite_get_note":
            return await this.getNote(args?.noteId as string, (args?.format as string) || "md");
          
          case "slite_get_note_children":
            return await this.getNoteChildren(args?.noteId as string, (args?.limit as number) || 20);

          case "slite_create_note":
            return await this.createNote(
              args?.title as string,
              args?.markdown as string,
              args?.parentNoteId as string
            );

          case "slite_update_note":
            return await this.updateNote(
              args?.noteId as string,
              args?.title as string,
              args?.markdown as string
            );

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

  private async makeSliteRequest(endpoint: string, params?: any, method: string = "GET", data?: any) {
    const config: any = {
      method,
      url: `${SLITE_API_BASE}${endpoint}`,
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
      },
    };

    if (method === "GET" && params) {
      config.params = params;
    }

    if ((method === "POST" || method === "PUT") && data) {
      config.data = data;
    }

    const response = await axios(config);
    return response.data;
  }

  private async searchNotes(query: string, limit: number) {
    const data = await this.makeSliteRequest("/search-notes", {
      query,
      limit,
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

  private async getNoteChildren(noteId: string, limit: number) {
    const data = await this.makeSliteRequest(`/notes/${noteId}/children`, {
      limit,
    });

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

  private async createNote(title: string, markdown?: string, parentNoteId?: string) {
    const requestBody: any = { title };

    if (markdown) {
      requestBody.markdown = markdown;
    }

    if (parentNoteId) {
      requestBody.parentNoteId = parentNoteId;
    }

    const data = await this.makeSliteRequest("/notes", undefined, "POST", requestBody);

    return {
      content: [
        {
          type: "text",
          text: `Note created successfully!\n\n**Title:** ${data.title}\n**ID:** ${data.id}\n**URL:** ${data.url || 'N/A'}`,
        },
      ],
    };
  }

  private async updateNote(noteId: string, title?: string, markdown?: string) {
    const requestBody: any = {};

    if (title) {
      requestBody.title = title;
    }

    if (markdown) {
      requestBody.markdown = markdown;
    }

    if (Object.keys(requestBody).length === 0) {
      throw new Error("At least one of title or markdown must be provided for update");
    }

    const data = await this.makeSliteRequest(`/notes/${noteId}`, undefined, "PUT", requestBody);

    return {
      content: [
        {
          type: "text",
          text: `Note updated successfully!\n\n**Title:** ${data.title}\n**ID:** ${data.id}\n**Updated At:** ${new Date(data.updatedAt).toLocaleString()}`,
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