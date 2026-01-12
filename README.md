# Slite MCP Server

A Model Context Protocol (MCP) server that integrates with Slite's API to search, retrieve, create, and edit notes.

## Features

- 🔍 **Search Notes**: Search through your Slite workspace
- 📄 **Get Note Content**: Retrieve specific notes by ID in markdown or HTML format
- 🌳 **Browse Hierarchy**: Get child notes of any parent note
- 🤖 **Ask Questions**: Natural language question answering across your workspace
- ✏️ **Edit Notes**: Search-and-replace editing with validation and dry-run support
- 📝 **Create Notes**: Create new notes with markdown content
- 🔄 **Update Notes**: Full content replacement for major rewrites

## Installation

```bash
# Clone the repository
git clone https://github.com/fajarmf/slite-mcp.git
cd slite-mcp

# Install dependencies
npm install

# Build the project
npm run build
```

## Configuration

### Getting your Slite API Key

1. Log in to your Slite workspace
2. Go to Settings → API
3. Generate a new API key

### Setting up the MCP Server

Add the server to your MCP configuration file (`~/.mcp.json`):

```json
{
  "mcpServers": {
    "slite": {
      "command": "node",
      "args": ["/path/to/slite-mcp/build/index.js"],
      "env": {
        "SLITE_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

## Usage

Once configured, the following tools are available:

### slite_search
Search for notes in your Slite workspace.

**Parameters:**
- `query` (required): Search query string
- `hitsPerPage` (optional): Results per page (default: 10)

**Example:**
```json
{
  "tool": "slite_search",
  "arguments": {
    "query": "project documentation",
    "hitsPerPage": 5
  }
}
```

### slite_get_note
Retrieve a specific note by its ID.

**Parameters:**
- `noteId` (required): The ID of the note to retrieve
- `format` (optional): Format to return - "md" or "html" (default: "md")

**Example:**
```json
{
  "tool": "slite_get_note",
  "arguments": {
    "noteId": "BoptqNi4pm0lcV",
    "format": "md"
  }
}
```

### slite_get_note_children
Get all child notes of a parent note.

**Parameters:**
- `noteId` (required): The ID of the parent note
- `cursor` (optional): Pagination cursor for next page

**Example:**
```json
{
  "tool": "slite_get_note_children",
  "arguments": {
    "noteId": "5i6k33yrVu7eMy"
  }
}
```

### slite_ask
Ask natural language questions and get AI-powered answers from your Slite workspace.

**Parameters:**
- `question` (required): The question to ask
- `parentNoteId` (optional): Limit search to notes under this parent

**Example:**
```json
{
  "tool": "slite_ask",
  "arguments": {
    "question": "What is our deployment process?"
  }
}
```

### slite_create_note
Create a new note in your Slite workspace.

**Parameters:**
- `title` (required): Note title
- `markdown` (optional): Note content in markdown format
- `parentNoteId` (optional): Parent note ID (creates in personal channel if not specified)

**Example:**
```json
{
  "tool": "slite_create_note",
  "arguments": {
    "title": "Meeting Notes",
    "markdown": "# Meeting Notes\n\n- Discussed project timeline\n- Assigned tasks",
    "parentNoteId": "5i6k33yrVu7eMy"
  }
}
```

### slite_edit_note
Edit a note using search-and-replace. Preferred for targeted edits - faster and safer than full rewrite.

**Parameters:**
- `noteId` (required): The ID of the note to edit
- `edits` (required): Array of search-and-replace operations
  - `oldText`: Exact text to find (must be unique in document)
  - `newText`: Text to replace it with
- `dryRun` (optional): If true, validate edits without applying them

**Example:**
```json
{
  "tool": "slite_edit_note",
  "arguments": {
    "noteId": "BoptqNi4pm0lcV",
    "edits": [
      { "oldText": "Draft", "newText": "Final" },
      { "oldText": "TODO: add details", "newText": "Implementation complete" }
    ],
    "dryRun": false
  }
}
```

### slite_update_note
Replace entire note content. Use `slite_edit_note` for small changes.

**Parameters:**
- `noteId` (required): The ID of the note to update
- `markdown` (required): New markdown content (replaces entire note)
- `title` (optional): New title (keeps existing if not provided)

**Example:**
```json
{
  "tool": "slite_update_note",
  "arguments": {
    "noteId": "BoptqNi4pm0lcV",
    "markdown": "# New Content\n\nThis replaces everything.",
    "title": "Updated Title"
  }
}
```

## Testing

### Quick Start

```bash
# Copy environment config and add your API key
cp .env.example .env
# Edit .env with your SLITE_API_KEY

# Setup test data (creates test documents in Slite)
npm run test:setup

# Run all tests
npm test
```

### Test Setup

The `test:setup` command creates test documents in your Slite workspace:
- A parent note with 55 child notes (for cursor pagination testing)
- A "Test Data for MCP Server" child with searchable keywords

The script is idempotent - it won't create duplicates if test data already exists.

```bash
# Setup with a new parent note
npm run test:setup

# Or use an existing note as parent
npm run test:setup -- --parent=<note-id>

# Force recreation even if data exists
npm run test:setup -- --force
```

### Test Suite

The test suite includes:
- **API Tests**: Search, get note, get children, ask endpoint
- **Error Handling**: Invalid IDs, unauthorized access
- **Pagination**: hitsPerPage for search, cursor for children (requires 55+ children)
- **Content Formats**: Markdown and HTML output
- **MCP Server Integration**: All tools via stdio transport
- **Write Operations**: Create, edit, update - with content verification after each operation

## Development

### Project Structure

```
slite-mcp/
├── src/
│   └── index.ts           # Main MCP server (7 tools: 4 read, 3 write)
├── build/                 # Compiled JavaScript files
├── tests/
│   ├── index.test.js      # Consolidated test suite
│   └── setup-test-data.js # Idempotent test data setup
├── examples/              # Example configurations
├── package.json
├── tsconfig.json
└── README.md
```

### Building

```bash
npm run build
```

### Requirements

- Node.js 16+
- TypeScript 5.0+
- A valid Slite API key

## API Response Formats

The Slite API returns data in specific formats:

### Search Results
- Results are in the `hits` array
- Each hit contains: `id`, `title`, `highlight`, `updatedAt`, `type`, `parentNotes`

### Note Content
- Full markdown or HTML content
- Includes metadata: `id`, `title`, `url`, `updatedAt`, `parentNoteId`

### Child Notes
- Results in the `notes` array
- Pagination info: `total`, `hasNextPage`, `nextCursor`

## Troubleshooting

### Authentication Failed
- Verify your API key is correct
- Check if the key has the necessary permissions

### No Results Found
- Try different search terms
- Ensure the notes exist in your workspace
- Check if you have access to the notes

### API Changes
If you encounter errors, the Slite API might have changed. Check:
- Response format in the test scripts
- Endpoint URLs
- Required parameters

## Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues or questions:
- Create an issue on GitHub
- Check Slite's API documentation
- Review the test scripts for examples