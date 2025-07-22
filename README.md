# Slite MCP Server

A Model Context Protocol (MCP) server that integrates with Slite's API to search and retrieve notes.

## Features

- 🔍 **Search Notes**: Search through your Slite workspace
- 📄 **Get Note Content**: Retrieve specific notes by ID in markdown or HTML format
- 🌳 **Browse Hierarchy**: Get child notes of any parent note

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
- `limit` (optional): Maximum number of results (default: 10)

**Example:**
```json
{
  "tool": "slite_search",
  "arguments": {
    "query": "project documentation",
    "limit": 5
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
- `limit` (optional): Maximum number of results (default: 20)

**Example:**
```json
{
  "tool": "slite_get_note_children",
  "arguments": {
    "noteId": "5i6k33yrVu7eMy",
    "limit": 10
  }
}
```

## Testing

Run the test scripts to verify your API connection:

```bash
# Test API connection with default search
node tests/test-slite-api.js

# Test with custom search query
node tests/test-slite-api.js "your search term"

# Test specific note retrieval
node tests/test-specific-note.js [noteId]
```

## Development

### Project Structure

```
slite-mcp/
├── src/
│   └── index.ts        # Main MCP server implementation
├── build/              # Compiled JavaScript files
├── tests/              # Test scripts
├── examples/           # Example configurations
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