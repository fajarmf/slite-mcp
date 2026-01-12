const axios = require('axios');

// Mock axios
jest.mock('axios');

// Mock environment variable
const MOCK_API_KEY = 'test-api-key-do-not-use-real-key';
process.env.SLITE_API_KEY = MOCK_API_KEY;

const SLITE_API_BASE = 'https://api.slite.com/v1';

describe('Slite MCP Server', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Search Notes', () => {
    it('should search notes with correct parameters', async () => {
      const mockSearchResponse = {
        data: {
          hits: [
            {
              id: 'note-123',
              title: 'Test Note',
              highlight: 'This is a test note content',
              updatedAt: '2025-01-01T00:00:00Z',
              type: 'note',
              parentNotes: [{ title: 'Parent Folder' }]
            }
          ]
        }
      };

      axios.mockResolvedValue(mockSearchResponse);

      const response = await axios({
        method: 'GET',
        url: `${SLITE_API_BASE}/search-notes`,
        headers: {
          Authorization: `Bearer ${MOCK_API_KEY}`,
          'Content-Type': 'application/json'
        },
        params: { query: 'test', limit: 10 }
      });

      expect(axios).toHaveBeenCalledWith({
        method: 'GET',
        url: `${SLITE_API_BASE}/search-notes`,
        headers: {
          Authorization: `Bearer ${MOCK_API_KEY}`,
          'Content-Type': 'application/json'
        },
        params: { query: 'test', limit: 10 }
      });
      expect(response.data.hits).toHaveLength(1);
      expect(response.data.hits[0].title).toBe('Test Note');
    });

    it('should handle empty search results', async () => {
      axios.mockResolvedValue({ data: { hits: [] } });

      const response = await axios({
        method: 'GET',
        url: `${SLITE_API_BASE}/search-notes`,
        params: { query: 'nonexistent', limit: 10 }
      });

      expect(response.data.hits).toHaveLength(0);
    });
  });

  describe('Get Note', () => {
    it('should get note by ID with markdown format', async () => {
      const mockNoteResponse = {
        data: {
          id: 'note-123',
          title: 'Test Note',
          content: '# Test Note\n\nThis is the content.',
          updatedAt: '2025-01-01T00:00:00Z'
        }
      };

      axios.mockResolvedValue(mockNoteResponse);

      const response = await axios({
        method: 'GET',
        url: `${SLITE_API_BASE}/notes/note-123`,
        headers: {
          Authorization: `Bearer ${MOCK_API_KEY}`,
          'Content-Type': 'application/json'
        },
        params: { format: 'md' }
      });

      expect(response.data.title).toBe('Test Note');
      expect(response.data.content).toContain('# Test Note');
    });

    it('should handle note not found error', async () => {
      axios.mockRejectedValue({
        response: {
          status: 404,
          data: { error: 'Note not found' }
        }
      });

      await expect(
        axios({
          method: 'GET',
          url: `${SLITE_API_BASE}/notes/invalid-id`,
          params: { format: 'md' }
        })
      ).rejects.toMatchObject({
        response: { status: 404 }
      });
    });
  });

  describe('Get Note Children', () => {
    it('should get children of a parent note', async () => {
      const mockChildrenResponse = {
        data: {
          notes: [
            { id: 'child-1', title: 'Child Note 1', content: 'Content 1' },
            { id: 'child-2', title: 'Child Note 2', content: 'Content 2' }
          ],
          total: 2
        }
      };

      axios.mockResolvedValue(mockChildrenResponse);

      const response = await axios({
        method: 'GET',
        url: `${SLITE_API_BASE}/notes/parent-123/children`,
        headers: {
          Authorization: `Bearer ${MOCK_API_KEY}`,
          'Content-Type': 'application/json'
        },
        params: { limit: 20 }
      });

      expect(response.data.notes).toHaveLength(2);
      expect(response.data.total).toBe(2);
    });

    it('should handle empty children list', async () => {
      axios.mockResolvedValue({ data: { notes: [], total: 0 } });

      const response = await axios({
        method: 'GET',
        url: `${SLITE_API_BASE}/notes/parent-123/children`,
        params: { limit: 20 }
      });

      expect(response.data.notes).toHaveLength(0);
    });
  });

  describe('Create Note', () => {
    it('should create a new note with title and content', async () => {
      const mockCreateResponse = {
        data: {
          id: 'new-note-123',
          title: 'New Note',
          url: 'https://slite.com/notes/new-note-123'
        }
      };

      axios.mockResolvedValue(mockCreateResponse);

      const response = await axios({
        method: 'POST',
        url: `${SLITE_API_BASE}/notes`,
        headers: {
          Authorization: `Bearer ${MOCK_API_KEY}`,
          'Content-Type': 'application/json'
        },
        data: {
          title: 'New Note',
          markdown: '# New Note\n\nContent here.'
        }
      });

      expect(axios).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: `${SLITE_API_BASE}/notes`,
          data: {
            title: 'New Note',
            markdown: '# New Note\n\nContent here.'
          }
        })
      );
      expect(response.data.id).toBe('new-note-123');
    });

    it('should create note with parent', async () => {
      axios.mockResolvedValue({
        data: { id: 'new-note-456', title: 'Child Note' }
      });

      await axios({
        method: 'POST',
        url: `${SLITE_API_BASE}/notes`,
        data: {
          title: 'Child Note',
          parentNoteId: 'parent-123'
        }
      });

      expect(axios).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            parentNoteId: 'parent-123'
          })
        })
      );
    });
  });

  describe('Update Note', () => {
    it('should update note title', async () => {
      const mockUpdateResponse = {
        data: {
          id: 'note-123',
          title: 'Updated Title',
          updatedAt: '2025-01-02T00:00:00Z'
        }
      };

      axios.mockResolvedValue(mockUpdateResponse);

      const response = await axios({
        method: 'PUT',
        url: `${SLITE_API_BASE}/notes/note-123`,
        headers: {
          Authorization: `Bearer ${MOCK_API_KEY}`,
          'Content-Type': 'application/json'
        },
        data: { title: 'Updated Title' }
      });

      expect(axios).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'PUT',
          url: `${SLITE_API_BASE}/notes/note-123`
        })
      );
      expect(response.data.title).toBe('Updated Title');
    });

    it('should update note content', async () => {
      axios.mockResolvedValue({
        data: {
          id: 'note-123',
          title: 'Test Note',
          updatedAt: '2025-01-02T00:00:00Z'
        }
      });

      await axios({
        method: 'PUT',
        url: `${SLITE_API_BASE}/notes/note-123`,
        data: { markdown: '# Updated Content' }
      });

      expect(axios).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { markdown: '# Updated Content' }
        })
      );
    });

    it('should handle unauthorized error', async () => {
      axios.mockRejectedValue({
        response: {
          status: 401,
          data: { error: 'Unauthorized' }
        }
      });

      await expect(
        axios({
          method: 'PUT',
          url: `${SLITE_API_BASE}/notes/note-123`,
          data: { title: 'Test' }
        })
      ).rejects.toMatchObject({
        response: { status: 401 }
      });
    });
  });

  describe('Authentication', () => {
    it('should include authorization header in all requests', async () => {
      axios.mockResolvedValue({ data: {} });

      await axios({
        method: 'GET',
        url: `${SLITE_API_BASE}/search-notes`,
        headers: {
          Authorization: `Bearer ${MOCK_API_KEY}`,
          'Content-Type': 'application/json'
        },
        params: { query: 'test' }
      });

      expect(axios).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${MOCK_API_KEY}`
          })
        })
      );
    });
  });
});
