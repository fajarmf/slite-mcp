#!/usr/bin/env node

/**
 * Test Data Setup Script (Idempotent)
 *
 * Creates the required test documents in Slite for running the test suite.
 * If test data already exists, it will skip creation.
 *
 * Usage:
 *   npm run test:setup
 *   npm run test:setup -- --parent=<existing-note-id>
 *
 * The script will:
 * 1. Check if parent note exists and has enough children (55+)
 * 2. Only create missing children if needed
 * 3. Skip entirely if test data is already complete
 */

require('dotenv').config();
const axios = require('axios');

const SLITE_API_BASE = 'https://api.slite.com/v1';
const API_KEY = process.env.SLITE_API_KEY;
const MIN_CHILDREN = 55; // >50 needed to test cursor pagination

if (!API_KEY) {
  console.error('Error: SLITE_API_KEY not found in .env file');
  console.error('Please copy .env.example to .env and add your API key');
  process.exit(1);
}

const headers = {
  'Authorization': `Bearer ${API_KEY}`,
  'Content-Type': 'application/json'
};

// Generate content for the first child (with searchable keywords)
function getFirstChildContent() {
  return `# Test Data for MCP Server

This note contains test data for validating the Slite MCP Server functionality.

## Test Content Sections

### Section 1: Basic Text
This is basic text content that can be searched and retrieved.

### Section 2: Lists
- Item one
- Item two
- Item three

### Section 3: Code Block
\`\`\`javascript
function testFunction() {
  return "Hello from Slite MCP!";
}
\`\`\`

### Section 4: Searchable Keywords
The following keywords should be searchable:
- **MCP_UNIQUE_TEST_KEYWORD_123**
- integration testing
- API validation

## Metadata
- Purpose: MCP Server Testing
- Author: Test Setup Script
`;
}

// Generate content for pagination test children
function getPaginationChildContent(index) {
  return `# Pagination Test Note ${index}

This is child note ${index} for testing cursor-based pagination.

## Content
Sample content for pagination testing note number ${index}.

- List item A
- List item B

Created for testing the Slite MCP Server children endpoint pagination.
`;
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};

  for (const arg of args) {
    if (arg.startsWith('--parent=')) {
      options.parentNoteId = arg.split('=')[1];
    }
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    }
    if (arg === '--force' || arg === '-f') {
      options.force = true;
    }
  }

  return options;
}

function showHelp() {
  console.log(`
Test Data Setup Script (Idempotent)

Creates test documents in Slite required for running the test suite.
Skips creation if test data already exists with ${MIN_CHILDREN}+ children.

Usage:
  npm run test:setup                    Check/create test data
  npm run test:setup -- --parent=<id>   Use existing note as parent
  npm run test:setup -- --force         Force create even if data exists

Options:
  --parent=<id>   Use an existing Slite note as the parent
  --force, -f     Force creation even if enough children exist
  --help, -h      Show this help message

After running, add TEST_NOTE_ID to your .env file (if not already set).
`);
}

async function createNote(title, content, parentNoteId = null) {
  const payload = {
    title,
    markdown: content
  };

  if (parentNoteId) {
    payload.parentNoteId = parentNoteId;
  }

  const response = await axios.post(`${SLITE_API_BASE}/notes`, payload, { headers });
  return response.data;
}

async function getNote(noteId) {
  const response = await axios.get(`${SLITE_API_BASE}/notes/${noteId}`, {
    headers,
    params: { format: 'md' }
  });
  return response.data;
}

async function getChildren(noteId) {
  // Fetch all children using cursor pagination
  let allChildren = [];
  let cursor = null;

  do {
    const params = cursor ? { cursor } : {};
    const response = await axios.get(`${SLITE_API_BASE}/notes/${noteId}/children`, {
      headers,
      params
    });

    allChildren = allChildren.concat(response.data.notes || []);
    cursor = response.data.hasNextPage ? response.data.nextCursor : null;
  } while (cursor);

  return allChildren;
}

async function setupTestData(options = {}) {
  console.log('='.repeat(60));
  console.log('Slite MCP Server - Test Data Setup');
  console.log('='.repeat(60));
  console.log();

  // Check if TEST_NOTE_ID is already set in env
  let parentNoteId = options.parentNoteId || process.env.TEST_NOTE_ID;
  let parentNote;

  // Step 1: Check existing parent note
  if (parentNoteId) {
    console.log(`Checking existing note: ${parentNoteId}`);
    try {
      parentNote = await getNote(parentNoteId);
      console.log(`  Found: "${parentNote.title}"`);

      // Check existing children
      console.log('  Counting children...');
      const existingChildren = await getChildren(parentNoteId);
      const childCount = existingChildren.length;
      console.log(`  Found ${childCount} existing children`);

      // Check if we have the searchable test note
      const hasTestDataNote = existingChildren.some(c => c.title === 'Test Data for MCP Server');

      if (childCount >= MIN_CHILDREN && hasTestDataNote) {
        if (!options.force) {
          console.log();
          console.log('='.repeat(60));
          console.log('Test data already exists!');
          console.log('='.repeat(60));
          console.log();
          console.log(`Parent note has ${childCount} children (need ${MIN_CHILDREN}+)`);
          console.log('Searchable test note: present');
          console.log();
          console.log('No action needed. Your .env should have:');
          console.log(`TEST_NOTE_ID=${parentNoteId}`);
          console.log();
          console.log('Run tests with: npm run test:all');
          console.log('Use --force to recreate test data anyway.');
          console.log();
          return { parentNoteId, childCount, skipped: true };
        } else {
          console.log('  --force specified, will create additional children');
        }
      }

      // Calculate how many more children we need
      const needed = MIN_CHILDREN - childCount;
      if (needed > 0 && !hasTestDataNote) {
        console.log(`  Need to create ${needed} children + test data note`);
      } else if (needed > 0) {
        console.log(`  Need to create ${needed} more children`);
      } else if (!hasTestDataNote) {
        console.log('  Need to create test data note');
      }

    } catch (error) {
      if (error.response?.status === 404) {
        console.log(`  Note not found, will create new parent`);
        parentNoteId = null;
      } else {
        console.error(`  Error: ${error.response?.data?.message || error.message}`);
        process.exit(1);
      }
    }
  }

  // Step 2: Create parent if needed
  if (!parentNoteId) {
    console.log('Creating parent test note...');
    try {
      parentNote = await createNote(
        'MCP Test Doc',
        `# MCP Test Document

Parent document for MCP Server test suite.

This note and its children are used for automated testing.

## Children
- Child 1: Test content with searchable keywords
- Children 2-${MIN_CHILDREN}: Pagination test notes (>50 for cursor testing)
`
      );
      parentNoteId = parentNote.id;
      console.log(`  Created: "${parentNote.title}" (${parentNoteId})`);
    } catch (error) {
      console.error(`  Error creating parent note: ${error.response?.data?.message || error.message}`);
      process.exit(1);
    }
  }

  console.log();

  // Step 3: Determine what children to create
  const existingChildren = await getChildren(parentNoteId);
  const existingTitles = new Set(existingChildren.map(c => c.title));
  const hasTestDataNote = existingTitles.has('Test Data for MCP Server');

  const childrenToCreate = [];

  // Add test data note if missing
  if (!hasTestDataNote) {
    childrenToCreate.push({
      title: 'Test Data for MCP Server',
      content: getFirstChildContent()
    });
  }

  // Add pagination test notes until we have MIN_CHILDREN
  const currentCount = existingChildren.length + (hasTestDataNote ? 0 : 1);
  for (let i = 2; currentCount + childrenToCreate.length - (hasTestDataNote ? 0 : 1) < MIN_CHILDREN; i++) {
    const title = `Pagination Test Note ${i}`;
    if (!existingTitles.has(title)) {
      childrenToCreate.push({
        title,
        content: getPaginationChildContent(i)
      });
    }
  }

  if (childrenToCreate.length === 0) {
    console.log('No additional children needed.');
  } else {
    console.log(`Creating ${childrenToCreate.length} child notes...`);
    const startTime = Date.now();

    for (let i = 0; i < childrenToCreate.length; i++) {
      const { title, content } = childrenToCreate[i];

      try {
        await createNote(title, content, parentNoteId);

        // Progress indicator
        if ((i + 1) % 10 === 0 || i === 0 || i === childrenToCreate.length - 1) {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          console.log(`  [${i + 1}/${childrenToCreate.length}] Created "${title}" (${elapsed}s elapsed)`);
        }
      } catch (error) {
        console.error(`  Error creating "${title}": ${error.response?.data?.message || error.message}`);
        process.exit(1);
      }
    }

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`  Done in ${totalTime}s`);
  }

  console.log();

  // Step 4: Final count and output
  const finalChildren = await getChildren(parentNoteId);

  console.log('='.repeat(60));
  console.log('Setup Complete!');
  console.log('='.repeat(60));
  console.log();
  console.log('Add this line to your .env file:');
  console.log();
  console.log(`TEST_NOTE_ID=${parentNoteId}`);
  console.log();
  console.log(`Total: 1 parent + ${finalChildren.length} children`);
  console.log(`Parent URL: ${parentNote.url}`);
  console.log();
  console.log('Run the test suite with: npm run test:all');
  console.log();

  return {
    parentNoteId,
    childCount: finalChildren.length,
    skipped: false
  };
}

// Main execution
const options = parseArgs();

if (options.help) {
  showHelp();
  process.exit(0);
}

setupTestData(options).catch(error => {
  console.error('Unexpected error:', error.message);
  process.exit(1);
});
