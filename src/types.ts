/**
 * Slite API Response Types
 *
 * These interfaces represent the shape of responses from the Slite API.
 * Used by both the main server code and tests.
 */

// =============================================================================
// Note Types
// =============================================================================

export interface SliteNote {
  id: string;
  title: string;
  content?: string;
  url?: string;
  archivedAt?: string | null;
  updatedAt?: string;
  type?: string;
}

export interface SliteParentNote {
  id: string;
  title: string;
}

// =============================================================================
// Search Types
// =============================================================================

export interface SliteSearchHit {
  id: string;
  title: string;
  highlight?: string;
  updatedAt: string;
  type: string;
  parentNotes?: SliteParentNote[];
}

export interface SliteSearchResponse {
  hits: SliteSearchHit[];
}

// =============================================================================
// Children Types
// =============================================================================

export interface SliteChildrenResponse {
  notes: SliteNote[];
  total: number;
  hasNextPage?: boolean;
  nextCursor?: string;
}

// =============================================================================
// Ask Types
// =============================================================================

export interface SliteAskSource {
  title?: string;
  url: string;
}

export interface SliteAskResponse {
  answer: string;
  sources?: SliteAskSource[];
}

// =============================================================================
// Create/Update Types
// =============================================================================

export interface SliteCreateNoteResponse {
  id: string;
  title: string;
  url?: string;
}
