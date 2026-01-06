#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import {
  SearchArgsSchema,
  GetNoteArgsSchema,
  GetNoteChildrenArgsSchema,
  AskArgsSchema,
  EditNoteArgsSchema,
  UpdateNoteArgsSchema,
  CreateNoteArgsSchema,
  formatZodError,
} from "./validators.js";
import { z } from "zod";

const SLITE_API_BASE = "https://api.slite.com/v1";

interface SliteConfig {
  apiKey: string;
}

class SliteServer {
  private server: Server;
  private config: SliteConfig;

  constructor() {
    // Validate API key at startup - fail fast if missing
    const apiKey = process.env.SLITE_API_KEY;
    if (!apiKey || apiKey.trim() === "") {
      console.error("Error: SLITE_API_KEY environment variable is required");
      console.error("Please set your Slite API key in the environment or .env file");
      process.exit(1);
    }

    this.config = { apiKey };

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
          {
            name: "slite_edit_note",
            description:
              "Edit a Slite note using search-and-replace. Preferred for targeted edits - faster and safer than full rewrite. Each edit's oldText must be unique in the document.",
            inputSchema: {
              type: "object",
              properties: {
                noteId: {
                  type: "string",
                  description: "The ID of the note to edit",
                },
                edits: {
                  type: "array",
                  description: "List of search-and-replace operations applied sequentially",
                  items: {
                    type: "object",
                    properties: {
                      oldText: {
                        type: "string",
                        description: "Exact text to find (must be unique in document)",
                      },
                      newText: {
                        type: "string",
                        description: "Text to replace it with",
                      },
                    },
                    required: ["oldText", "newText"],
                  },
                },
                dryRun: {
                  type: "boolean",
                  description: "If true, validate edits without applying them",
                  default: false,
                },
              },
              required: ["noteId", "edits"],
            },
          },
          {
            name: "slite_update_note",
            description:
              "Replace entire note content. Use slite_edit_note for small changes. WARNING: This overwrites everything.",
            inputSchema: {
              type: "object",
              properties: {
                noteId: {
                  type: "string",
                  description: "The ID of the note to update",
                },
                title: {
                  type: "string",
                  description: "New title (optional - keeps existing if not provided)",
                },
                markdown: {
                  type: "string",
                  description: "New markdown content (replaces entire note)",
                },
              },
              required: ["noteId", "markdown"],
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
                  description: "Note title",
                },
                markdown: {
                  type: "string",
                  description: "Note content in markdown format",
                },
                parentNoteId: {
                  type: "string",
                  description: "Parent note ID (optional - creates in personal channel if not specified)",
                },
              },
              required: ["title"],
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case "slite_search": {
            const validated = SearchArgsSchema.parse(args);
            return await this.searchNotes(validated.query, validated.hitsPerPage);
          }

          case "slite_get_note": {
            const validated = GetNoteArgsSchema.parse(args);
            return await this.getNote(validated.noteId, validated.format);
          }

          case "slite_get_note_children": {
            const validated = GetNoteChildrenArgsSchema.parse(args);
            return await this.getNoteChildren(validated.noteId, validated.cursor);
          }

          case "slite_ask": {
            const validated = AskArgsSchema.parse(args);
            return await this.askSlite(validated.question, validated.parentNoteId);
          }

          case "slite_edit_note": {
            const validated = EditNoteArgsSchema.parse(args);
            return await this.editNote(validated.noteId, validated.edits, validated.dryRun);
          }

          case "slite_update_note": {
            const validated = UpdateNoteArgsSchema.parse(args);
            return await this.updateNote(validated.noteId, validated.markdown, validated.title);
          }

          case "slite_create_note": {
            const validated = CreateNoteArgsSchema.parse(args);
            return await this.createNote(validated.title, validated.markdown, validated.parentNoteId);
          }

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        // Handle Zod validation errors
        if (error instanceof z.ZodError) {
          throw new Error(`Invalid arguments: ${formatZodError(error)}`);
        }

        // Handle Axios errors with proper MCP error format
        if (axios.isAxiosError(error)) {
          const status = error.response?.status;
          const apiMessage = error.response?.data?.message || error.message;

          if (status === 401) {
            throw new Error(`Unauthorized: Invalid or missing Slite API key`);
          } else if (status === 404) {
            throw new Error(`Not found: ${apiMessage}`);
          } else if (status === 429) {
            throw new Error(`Rate limit exceeded: Please try again later`);
          } else {
            throw new Error(`Slite API error (${status}): ${apiMessage}`);
          }
        }

        // Re-throw other errors
        throw error;
      }
    });
  }

  private async makeSliteRequest(
    endpoint: string,
    options?: {
      method?: "GET" | "PUT" | "POST";
      params?: any;
      data?: any;
    },
    retries: number = 3
  ): Promise<any> {
    const { method = "GET", params, data } = options || {};

    try {
      const response = await axios({
        method,
        url: `${SLITE_API_BASE}${endpoint}`,
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
        },
        params,
        data,
      });
      return response.data;
    } catch (error) {
      // Handle rate limiting with exponential backoff
      if (axios.isAxiosError(error) && error.response?.status === 429 && retries > 0) {
        const retryAfter = error.response.headers["retry-after"];
        // Use Retry-After header if provided, otherwise exponential backoff (1s, 2s, 4s)
        const delay = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : Math.pow(2, 3 - retries) * 1000;

        console.error(`Rate limited. Retrying in ${delay}ms... (${retries} retries left)`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.makeSliteRequest(endpoint, options, retries - 1);
      }
      throw error;
    }
  }

  private async searchNotes(query: string, hitsPerPage: number) {
    const data = await this.makeSliteRequest("/search-notes", {
      params: { query, hitsPerPage },
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
      params: { format },
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
    const data = await this.makeSliteRequest(`/notes/${noteId}/children`, { params });

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

    const data = await this.makeSliteRequest("/ask", { params });

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

  private async editNote(
    noteId: string,
    edits: Array<{ oldText: string; newText: string }>,
    dryRun: boolean = false
  ) {
    // 1. Fetch current content
    const note = await this.makeSliteRequest(`/notes/${noteId}`, {
      params: { format: "md" },
    });
    let content = note.content;

    // 2. Apply edits with validation
    const results: string[] = [];
    for (let i = 0; i < edits.length; i++) {
      const { oldText, newText } = edits[i];
      const occurrences = content.split(oldText).length - 1;

      if (occurrences === 0) {
        return {
          content: [
            {
              type: "text",
              text: `Error: Edit #${i + 1} failed - text not found: "${oldText.substring(0, 50)}${oldText.length > 50 ? "..." : ""}"`,
            },
          ],
        };
      }
      if (occurrences > 1) {
        return {
          content: [
            {
              type: "text",
              text: `Error: Edit #${i + 1} failed - text found ${occurrences} times. Provide more context to make it unique.`,
            },
          ],
        };
      }

      content = content.replace(oldText, newText);
      results.push(
        `Edit #${i + 1}: Replaced "${oldText.substring(0, 30)}${oldText.length > 30 ? "..." : ""}" with "${newText.substring(0, 30)}${newText.length > 30 ? "..." : ""}"`
      );
    }

    // 3. Apply changes (unless dry run)
    if (!dryRun) {
      await this.makeSliteRequest(`/notes/${noteId}`, {
        method: "PUT",
        data: { markdown: content },
      });
    }

    return {
      content: [
        {
          type: "text",
          text: dryRun
            ? `Dry run successful - ${edits.length} edit(s) would be applied:\n${results.join("\n")}`
            : `Successfully applied ${edits.length} edit(s) to note ${noteId}:\n${results.join("\n")}`,
        },
      ],
    };
  }

  private async updateNote(noteId: string, markdown: string, title?: string) {
    const data: any = { markdown };
    if (title) data.title = title;

    await this.makeSliteRequest(`/notes/${noteId}`, {
      method: "PUT",
      data,
    });

    return {
      content: [
        {
          type: "text",
          text: `Successfully updated note ${noteId}${title ? ` with new title "${title}"` : ""}`,
        },
      ],
    };
  }

  private async createNote(
    title: string,
    markdown?: string,
    parentNoteId?: string
  ) {
    const data: any = { title };
    if (markdown) data.markdown = markdown;
    if (parentNoteId) data.parentNoteId = parentNoteId;

    const result = await this.makeSliteRequest("/notes", {
      method: "POST",
      data,
    });

    return {
      content: [
        {
          type: "text",
          text: `Created note "${result.title}" (ID: ${result.id})`,
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