import { z } from "zod";

// Schema for slite_search tool
export const SearchArgsSchema = z.object({
  query: z.string().min(1, "query must be a non-empty string"),
  hitsPerPage: z.number().optional().default(10),
});

// Schema for slite_get_note tool
export const GetNoteArgsSchema = z.object({
  noteId: z.string().min(1, "noteId must be a non-empty string"),
  format: z.enum(["md", "html"]).optional().default("md"),
});

// Schema for slite_get_note_children tool
export const GetNoteChildrenArgsSchema = z.object({
  noteId: z.string().min(1, "noteId must be a non-empty string"),
  cursor: z.string().optional(),
});

// Schema for slite_ask tool
export const AskArgsSchema = z.object({
  question: z.string().min(1, "question must be a non-empty string"),
  parentNoteId: z.string().optional(),
});

// Schema for individual edit operation
const EditOperationSchema = z.object({
  oldText: z.string().min(1, "oldText must be a non-empty string"),
  newText: z.string(),
});

// Schema for slite_edit_note tool
export const EditNoteArgsSchema = z.object({
  noteId: z.string().min(1, "noteId must be a non-empty string"),
  edits: z.array(EditOperationSchema).min(1, "edits must be a non-empty array"),
  dryRun: z.boolean().optional().default(false),
});

// Schema for slite_update_note tool
export const UpdateNoteArgsSchema = z.object({
  noteId: z.string().min(1, "noteId must be a non-empty string"),
  markdown: z.string().min(1, "markdown must be a non-empty string"),
  title: z.string().optional(),
});

// Schema for slite_create_note tool
export const CreateNoteArgsSchema = z.object({
  title: z.string().min(1, "title must be a non-empty string"),
  markdown: z.string().optional(),
  parentNoteId: z.string().optional(),
});

// Inferred types for use in handler functions
export type SearchArgs = z.infer<typeof SearchArgsSchema>;
export type GetNoteArgs = z.infer<typeof GetNoteArgsSchema>;
export type GetNoteChildrenArgs = z.infer<typeof GetNoteChildrenArgsSchema>;
export type AskArgs = z.infer<typeof AskArgsSchema>;
export type EditNoteArgs = z.infer<typeof EditNoteArgsSchema>;
export type UpdateNoteArgs = z.infer<typeof UpdateNoteArgsSchema>;
export type CreateNoteArgs = z.infer<typeof CreateNoteArgsSchema>;

// Helper to format Zod errors into user-friendly messages
export function formatZodError(error: z.ZodError<unknown>): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
      return `${path}${issue.message}`;
    })
    .join("; ");
}
