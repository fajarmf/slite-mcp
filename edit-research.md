# **Architectural Analysis of Model Context Protocol (MCP) Integration for Slite Document Management**

## **Executive Summary**

The rapid integration of Large Language Models (LLMs) into enterprise workflows has necessitated the development of standardized interfaces that allow stochastic AI agents to interact with deterministic software systems. The Model Context Protocol (MCP) has emerged as the definitive standard for this interoperability, functioning as a universal translator between the probabilistic reasoning of models like Claude 3.5 Sonnet and the rigid API structures of SaaS platforms like Slite. This report provides an exhaustive technical analysis of the architectural requirements for implementing an MCP server designed to manage and edit Slite documentation.

The specific challenge addressed herein is the tension between implementation simplicity and operational robustness when handling large documents. While the Slite API primarily exposes a coarse-grained updateNote endpoint that necessitates full document replacement, the constraints of LLM token generation—specifically latency, cost, and the risk of output truncation—render a naive "full rewrite" strategy non-viable for production environments involving long-form content.

Through a rigorous examination of the Slite API specifications, the MCP filesystem reference implementation, and the performance characteristics of modern frontier models, this report advocates for a hybrid architectural pattern. This approach combines a **Search-and-Replace (Patching)** tool for high-frequency, low-latency edits with a **Full Overwrite** tool for document creation and major restructuring. This strategy mitigates the risks associated with the "lazy generation" phenomenon observed in large context windows and aligns with distributed systems best practices for handling concurrency and data integrity. The following sections detail the theoretical underpinnings, comparative analysis, and concrete TypeScript implementation strategies required to build this system.

## **1\. The Convergence of Distributed Systems and Generative AI**

To effectively design an MCP server for Slite, one must first contextualize the problem within the broader landscape of distributed systems engineering. An MCP server does not exist in a vacuum; it acts as a bridge (or proxy) between two distinct distributed entities: the AI Host (e.g., Claude Desktop, an IDE) and the remote SaaS provider (Slite). This tripartite architecture introduces unique challenges regarding state management, latency, and consistency that simpler client-server models do not face.

### **1.1 The Stateless vs. Stateful Paradox**

A fundamental characteristic of RESTful APIs like Slite’s is their stateless nature. Each request to updateNote is independent, carrying all the necessary information to mutate the resource state.1 Conversely, an AI agent operates in a pseudo-stateful "session." As the agent reads a document, plans an edit, and generates a tool call, it maintains a transient internal state within its context window.

The conflict arises when the agent attempts to impose its transient state onto the persistent state of the Slite database. In a "long document" scenario, the time gap between the agent reading the document (GET) and writing the changes (PUT) can be significant—measured in tens of seconds or even minutes if the model is generating a large volume of text. During this window, the state on the Slite server may drift due to human intervention or other API processes.

A robust MCP implementation must treat the Slite API not merely as a data store, but as a dynamic source of truth. The architecture must account for "stale reads," where the information in the agent's context window no longer matches the reality on the server. This requires implementing validation logic within the TypeScript server to check timestamps or content hashes before applying destructive edits, effectively implementing a customized optimistic locking mechanism on top of an API that may not natively enforce it for third-party integrations.2

### **1.2 The Evolution of Context and Tool Use**

The user's query posits a critical question: *“Maybe tools like Claude handle this much better nowadays and I should keep the MCP simple?”* This reflects a common misconception about the nature of "Context" in Large Language Models.

It is imperative to distinguish between **Input Context** (Reading) and **Output Generation** (Writing).

* **Input Context:** Modern models like Claude 3.5 Sonnet feature massive input windows (200,000 tokens).3 This allows the model to ingest and "understand" significantly larger Slite documents than previous generations. A 50-page technical specification is trivial for the model to read.  
* **Output Generation:** The ability to *write* text remains physically constrained. Most frontier models cap output generation at 4,096 or 8,192 tokens per response to manage computational load and latency. Furthermore, the probability of "hallucination" or "laziness" (summarizing text instead of reproducing it verbatim) increases non-linearly as the required output length grows.5

Therefore, while the model can *read* a large document easily, asking it to *rewrite* that same document to fix a single typo is an architectural anti-pattern. The "simple" approach of full rewriting hits the hard ceiling of output generation limits long before it hits the limits of input understanding. Consequently, the "best practice" is not defined by how much the model can read, but by how efficiently the system can minimize what the model must write.

## **2\. The Slite API Ecosystem: A Deep Technical Dive**

The capabilities of the MCP server are strictly bounded by the capabilities of the upstream Slite API. A granular analysis of the available endpoints reveals the constraints that will shape the TypeScript implementation.

### **2.1 The updateNote Endpoint: Idempotency and payload**

The primary mechanism for content modification in Slite is the PUT /v1/notes/{noteId} endpoint.1 In strict RESTful semantics, PUT is an idempotent method intended for resource replacement. The API documentation confirms that this endpoint accepts a JSON body containing title, markdown, or html fields.

| Method | Endpoint | Behavior | Implication for MCP |
| :---- | :---- | :---- | :---- |
| PUT | /v1/notes/{noteId} | Replaces the *entire* note content with the provided payload. | Requires full document construction before transmission. |
| GET | /v1/notes/{noteId} | Retrieves current content. Supports format=md. | Necessary for the Read-Modify-Write cycle. |
| PUT | /v1/notes/{noteId}/tiles/{tileId} | Updates a specific content block. | Theoretically allows granular edits but requires exposing internal Block IDs. |

The updateNote endpoint's requirement for a full payload is the primary driver of complexity. If the MCP server implements a patching strategy (e.g., "append text"), the server itself must assume the responsibility of fetching the existing content, merging the new text, and pushing the result. The API does not support PATCH semantics for appending text or modifying ranges of text directly.1

### **2.2 Markdown as the Transport Layer**

Slite supports importing and exporting content as Markdown.6 For an LLM-centric integration, Markdown is the optimal transport format for several reasons:

1. **Token Density:** Markdown uses significantly fewer tokens than HTML to represent the same formatting. A heading in Markdown is \# Header (2 tokens: \#, Header), whereas in HTML it is \<h1\>Header\</h1\> (7+ tokens depending on tokenization).  
2. **Model Training:** Models are heavily trained on Markdown data. They understand the semantic hierarchy of \#, \#\#, \*, and \> intuitively.  
3. **Parsing Robustness:** Generating valid HTML is prone to syntax errors (unclosed tags) that can break rendering. Markdown is more forgiving.8

However, reliance on Markdown conversion introduces fidelity risks. The Slite API performs an internal conversion from its block-based storage (Tiles) to Markdown when serving GET requests, and back to Tiles when receiving PUT requests. This "round-trip" conversion is not always lossless. Advanced Slite features—such as specific tile types, embedded widgets, or complex table layouts—may be simplified or stripped during the Markdown conversion.9

**Insight:** The MCP server must explicitly warn the LLM (via system prompts or tool descriptions) that the markdown representation is an approximation. The model should be discouraged from attempting to edit complex structural elements (like multi-column layouts) via the Markdown interface, as this could lead to layout corruption upon re-import.

### **2.3 The updateTile Alternative**

The research identifies a PUT /v1/notes/{noteId}/tiles/{tileId} endpoint.10 This endpoint allows for updating individual blocks of content. From a distributed systems perspective, this is enticing as it reduces the collision surface area—editing "Paragraph A" won't overwrite "Paragraph B" if they are separate tiles.

However, implementing a Tile-based MCP tool introduces massive complexity to the context window. To use this, the MCP server would need to:

1. Fetch the note.  
2. Parse the internal Slite structure to extract Tile IDs.  
3. Present the document to the LLM not as a coherent text, but as a list of JSON objects: \[{id: "tile\_1", content: "..."}, {id: "tile\_2", content: "..."}\].  
4. Force the LLM to reference these abstract IDs in its tool calls.

This increases the token cost of the *input* context significantly (JSON syntax overhead) and degrades the model's ability to understand the flow of the document. For a general-purpose editing assistant, the cognitive load this places on the model (and the developer) generally outweighs the concurrency benefits. Therefore, the Markdown-based updateNote path remains the preferred architecture, provided the "Full Rewrite" issue is solved via server-side patching.

### **2.4 API Rate Limits and Latency**

The Slite API documentation mentions 429 Rate limitation error responses.1 While specific quotas (e.g., 60 req/min) are standard 11, the implication for MCP is that the server cannot be "chatty." An architecture that requires the LLM to make 50 separate tool calls to fix 50 typos would likely trigger a rate limit, causing the agent to crash.

**Architectural Decision:** The editing tool must support *batched* operations. Instead of a tool replace\_text(old, new) that is called once per change, the tool should be edit\_note(noteId, edits: Array\<{old, new}\>). This allows the agent to plan 50 edits and execute them in a single MCP transaction, which the server translates into a single Read-Modify-Write cycle on the Slite API.

## **3\. Model Context Protocol (MCP) Architecture**

The Model Context Protocol establishes the standardization layer. Understanding its primitives is essential to mapping the Slite API constraints into an interface the AI Agent can manipulate.

### **3.1 The MCP Topology**

The MCP architecture consists of three components 12:

1. **The Host:** The application running the LLM (e.g., Claude Desktop, Cursor, Sourcegraph Cody). The Host manages the user interface, the API keys for the model, and the context window.  
2. **The Client:** The library within the Host that speaks the MCP protocol.  
3. **The Server:** The external process (your Slite MCP implementation) that exposes capabilities.

The communication happens over a transport layer, typically Stdio (standard input/output) for local processes or SSE (Server-Sent Events) for remote connections. For a TS implementation, the @modelcontextprotocol/sdk manages the JSON-RPC message framing.13

### **3.2 Tool Definition Primitives**

In MCP, a "Tool" is the atomic unit of agency. It allows the model to perform side effects. A tool definition includes:

* **Name:** Unique identifier.  
* **Description:** Natural language prompt explaining *when* and *how* to use the tool.  
* **Input Schema:** A JSON Schema (Draft 2020-12) defining the arguments.14

The Input Schema is the critical design surface. It is the prompt that constrains the model's output. If the schema is loose (e.g., any object), the model will hallucinate arguments. If the schema is strictly typed (using Zod in TypeScript), the Host will validate the model's output before the Server ever sees it, preventing entire classes of runtime errors.

### **3.3 The Reference Filesystem Implementation**

The @modelcontextprotocol/server-filesystem is the canonical reference for editing capabilities.15 It exposes:

* read\_file: Fetches content.  
* write\_file: Overwrites content.  
* edit\_file: Applies unified diffs or search/replace blocks.

The existence of edit\_file in the reference implementation is the strongest evidence against the "Keep It Simple" (Full Rewrite) approach. The reference implementation acknowledges that even with local filesystems (where latency is zero), LLMs need a patching mechanism to handle large files efficiently.17 By mirroring this schema in the Slite MCP server, we leverage the pre-training and fine-tuning that models like Claude have received on standard tool use patterns.

## **4\. The Physics of Large Language Models in Document Editing**

To fully justify the architectural decisions, we must quantify the limitations of LLMs that necessitate complex server-side logic.

### **4.1 The Input-Output Asymmetry**

The most significant constraint in current LLM architecture is the asymmetry between reading and writing.

* **Reading (Prefill):** Parallelizable. The attention mechanism can process thousands of tokens simultaneously. This makes reading a 200k token document relatively fast.  
* **Writing (Decoding):** Sequential. The model generates one token at a time, autoregressively. Each token depends on the previous one.

Mathematics of Latency:  
If a user wants to fix a typo in a 5,000-word document (approx. 7,000 tokens):

* **Patch Approach:** Input \~7,000 tokens. Output \~50 tokens (the tool call). Latency: \~2 seconds.  
* **Full Rewrite:** Input \~7,000 tokens. Output \~7,000 tokens. Latency: \~3-5 minutes (assuming \~30 tokens/second).

This 100x difference in latency transforms the user experience from "interactive" to "batch processing." A user will not tolerate a 5-minute wait to fix a typo.

### **4.2 The "Laziness" Failure Mode**

When faced with a task to "repeat this 5,000-word text but change one word," LLMs exhibit a behavior anthropomorphically termed "laziness." To save compute or due to training data patterns, the model will output:

"Here is the updated text:  
\[Chapter 1... content unchanged...\]  
\[Chapter 2... content unchanged...\]  
The specific change is here...  
"

If the MCP server blindly takes this string and sends it to updateNote, the user's document is now literally replaced with the text "\[Chapter 1... content unchanged...\]". The actual content is deleted. This is a catastrophic data loss event.5

To prevent this in a "Full Rewrite" architecture, the system prompt must aggressively threaten the model: *"You MUST output the entire text. Do not summarize."* Even with such prompts, the probability of compliance drops as document length increases. The **Patching** architecture eliminates this risk entirely by design, as the model is never asked to reproduce the unchanged parts.

## **5\. Comparative Analysis of Editing Patterns**

We can now rigorously compare the implementation options for the Slite MCP server.

### **Table 1: Comparative Analysis of Editing Architectures**

| Feature | Pattern A: Full Rewrite | Pattern B: Search & Replace | Pattern C: Unified Diff | Pattern D: Block (Tile) Editing |
| :---- | :---- | :---- | :---- | :---- |
| **Server Complexity** | Low (Pass-through) | High (String matching logic) | High (Parser implementation) | Extreme (Internal API mapping) |
| **Latency (Small Edit)** | High (Linear to doc size) | Low (Constant) | Low (Constant) | Medium (Depends on context) |
| **Token Cost** | Prohibitive | Minimal | Minimal | Moderate |
| **Data Safety** | Low (Truncation risk) | High (Validation possible) | Medium (Line number drift) | High (Atomic blocks) |
| **Model Reliability** | Low on large files | High (Claude 3.5 strong suit) | Medium (Math/counting is weak) | Low (Context confusion) |
| **Slite Compatibility** | Native (PUT endpoint) | Requires Read-Modify-Write | Requires Read-Modify-Write | Native (updateTile endpoint) |

### **5.1 Analysis of Pattern B: Search & Replace (Recommended)**

The Search & Replace pattern (or "Patching") offers the optimal balance. It works by asking the model to identify *anchors* in the text.

* **Schema:** { oldText: string, newText: string }  
* **Mechanism:** The server locates oldText and swaps it.

This capitalizes on Claude 3.5 Sonnet's "Copy-Paste" fidelity. Modern models are excellent at copying a sentence exactly as it appears in the context window. As long as the model copies the oldText correctly, the server can execute the swap deterministically.

**The "Context Window" Argument:** The user asked if large context windows solve the problem. Paradoxically, large context windows make Pattern B *more* effective. Because the model can see the whole document, it can ensure that the oldText anchor it chooses is unique. In smaller context windows, the model might pick a phrase like "The system shall" to replace, not realizing that phrase appears 50 times in the document. With 200k tokens, the model can see all 50 occurrences and choose a longer anchor (e.g., "The system shall, in accordance with RFC 2119, adhere to...") to ensure uniqueness.

## **6\. Technical Implementation Strategy (TypeScript)**

This section details the concrete implementation steps for the Slite MCP server using TypeScript and the @modelcontextprotocol/sdk.

### **6.1 Project Configuration**

The project should be structured as a standard Node.js application using TypeScript.

**Dependencies:**

* @modelcontextprotocol/sdk: Core SDK for server and transport.  
* zod: For schema definition and runtime validation.19  
* axios or fetch: For HTTP requests to Slite.  
* dotenv: For managing the SLITE\_API\_KEY.

**Server setup:**

TypeScript

import { Server } from "@modelcontextprotocol/sdk/server/index.js";  
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";  
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const server \= new Server(  
  { name: "slite-mcp-server", version: "1.0.0" },  
  { capabilities: { tools: {} } }  
);

// Transport connection  
const transport \= new StdioServerTransport();  
await server.connect(transport);

### **6.2 Tool Definition: slite\_edit\_note**

This is the critical tool for handling long documents. We define the schema using Zod to enforce the structure expected by the search-and-replace logic.

TypeScript

import { z } from "zod";

const EditNoteSchema \= z.object({  
  noteId: z.string().describe("The unique identifier of the Slite note"),  
  edits: z.array(  
    z.object({  
      oldText: z.string().describe("The exact text segment to replace. Must be unique in the document."),  
      newText: z.string().describe("The new text to replace the old text with.")  
    })  
  ).describe("List of search-and-replace operations. Changes are applied sequentially."),  
  dryRun: z.boolean().optional().describe("If true, checks if edits are possible without applying them.")  
});

### **6.3 The Patching Algorithm**

Implementing the patching logic requires careful handling of strings. A naive String.replace() only replaces the first occurrence. A global replace might change unintended parts. The safest approach is to verify uniqueness.

**Algorithm Pseudo-code:**

1. **Fetch Content:**  
   TypeScript  
   const currentNote \= await sliteClient.get(\`/notes/${noteId}\`);  
   let content \= currentNote.body.markdown; // Assuming markdown format

2. **Iterate and Apply:**  
   TypeScript  
   for (const edit of args.edits) {  
     // 1\. Check strict occurrence count  
     const occurrences \= content.split(edit.oldText).length \- 1;

     if (occurrences \=== 0) {  
       throw new Error(\`Text not found: "${edit.oldText.substring(0, 50)}..."\`);  
     }  
     if (occurrences \> 1) {  
       throw new Error(\`Ambiguous match: Text found ${occurrences} times. Provide more context.\`);  
     }

     // 2\. Apply replacement  
     content \= content.replace(edit.oldText, edit.newText);  
   }

3. **Push Update:**  
   TypeScript  
   if (\!args.dryRun) {  
     await sliteClient.put(\`/notes/${noteId}\`, {  
       markdown: content  
     });  
   }

Handling Whitespace:  
One common point of failure is whitespace mismatch between what the model "sees" (rendered Markdown) and what represents the file (raw bytes). The LLM might normalize newlines or ignore trailing spaces.

* **Best Practice:** The prompt description for oldText should emphasize: *"Copy the text exactly as it appears in the read\_resource output, including newlines."*  
* **Advanced Logic:** You can implement a "fuzzy" matcher that normalizes \\r\\n to \\n in both the source and the search string before matching, though this risks altering the document's formatting unintentionally.

### **6.4 Handling slite\_update\_note (Full Rewrite)**

You should still implement the full rewrite tool, but scope its use case.

TypeScript

const UpdateNoteSchema \= z.object({  
  noteId: z.string(),  
  markdown: z.string().describe("The FULL content of the note. WARNING: This replaces everything.")  
});

**Implementation:** This is a direct pass-through to the Slite API. No complex logic is needed.

### **6.5 Error Handling Strategies**

Integration with external APIs requires robust error handling.

* **429 Rate Limit:** If Slite returns a 429, the MCP server should catch this. It can either implement an exponential backoff retry loop (transparent to the user) or return a specific error message to the LLM: *"Rate limit exceeded. Please wait 60 seconds before retrying."*  
* **409 Conflict:** If the server detects (via timestamp checking) that the note changed during processing, it should throw a UserError prompting the model to re-read.  
* **Validation Errors:** If oldText is not found, the error message returned to the model is critical. It serves as feedback. The model can read the error *"Text not found"*, then try again with a different slice of text. This feedback loop is essential for agentic behavior.20

## **7\. Reliability, Safety, and Observability**

Moving beyond the code, operationalizing this feature requires safety nets.

### **7.1 Data Safety: The "Dry Run" Pattern**

The implementation of a dryRun flag (as seen in the schema above) is a best practice derived from the filesystem reference implementation.16 It allows the Agent to "Plan" its edits.

1. Agent calls edit\_note(..., dryRun=true).  
2. Server fetches note, attempts patch in memory.  
3. Server returns: *"Success: All 3 edits applied cleanly. Resulting file size: 12kb."* OR *"Error: Edit \#2 failed (text not found)."*  
4. Agent analyzes result. If success, calls edit\_note(..., dryRun=false).

This two-step process adds latency but drastically increases success rates for complex edits in long documents.

### **7.2 Security Considerations**

* **Prompt Injection:** The tool arguments (newText) are user-controlled input (via the LLM). While standard SQL injection concepts don't apply to Slite's Markdown API directly, the server should ensure that newText doesn't contain malicious Markdown payloads (e.g., links to phishing sites) if the documentation is public-facing. However, generally, the MCP server trusts the LLM's intent as a proxy for the user.  
* **Path Traversal:** If the MCP server implements local caching or logging, ensure noteId cannot be manipulated to write to the local filesystem (e.g., ../../etc/passwd). Zod schemas help here by validating noteId formats.21

### **7.3 Logging and Debugging**

MCP servers often run in the background (headless). Debugging "why did the edit fail?" is difficult.

* **Recommendation:** Use console.error (stderr) for logging. The MCP protocol uses stdout for communication, so writing logs to stdout will break the protocol handshake. stderr is usually captured by the Host (Claude Desktop logs) and is safe for debugging information.22

## **8\. Operationalizing and Testing**

Before deploying the server to the user's workflow, rigorous testing is required.

### **8.1 The MCP Inspector**

The MCP team provides an "Inspector" tool—a web-based GUI that connects to your running MCP server.23

* **Usage:** Run npx @modelcontextprotocol/inspector node build/index.js.  
* **Test Case 1:** Fetch a large note.  
* **Test Case 2:** Construct a slite\_edit\_note call with valid oldText. Verify the Slite API receives the patched content.  
* **Test Case 3:** Construct a call with oldText that doesn't exist. Verify the server returns a clean error, not a stack trace.

### **8.2 Integration with Claude Desktop**

Once the Inspector validates the logic:

1. Add the server to claude\_desktop\_config.json.  
2. Open Claude. Attach the server.  
3. **Prompt Test:** *"Fix the spelling of 'protocol' in the introduction of the Architecture note."*  
4. **Observation:** Watch the "Tool Calls" UI. Does Claude choose edit\_note or update\_note? If it chooses update\_note, you may need to adjust the tool description to emphasize that edit\_note is preferred for small changes.

## **Conclusion**

The implementation of an MCP server for Slite is a sophisticated exercise in distributed systems engineering. The user's initial inclination to "keep it simple" by performing full rewrites is understandable but ultimately flawed when applied to the domain of long-form documentation. The physical constraints of LLM output generation—specifically the high latency and truncation risks associated with large payloads—dictate that the "simple" solution is functionally broken for the stated use case.

The analysis conclusively supports a **hybrid architectural pattern**. By implementing a TypeScript server that handles the complexity of **Search-and-Replace (Patching)**, the user ensures that:

1. **Latency is minimized:** The model generates only the text that changes.  
2. **Integrity is preserved:** Unchanged sections of the document are never processed by the probabilistic model, eliminating the risk of accidental deletion or summarization.  
3. **Concurrency is managed:** The server creates a transactional boundary around the Read-Modify-Write cycle.

This approach aligns with the industry standards established by the official MCP filesystem implementation and leverages the specific strengths of the Claude 3.5 Sonnet model—namely, its high-fidelity context understanding and instruction following—while effectively neutralizing its weaknesses in bulk text generation. By following the TypeScript strategies and Zod schema definitions outlined in this report, the user can deliver a production-grade integration that transforms Slite from a static repository into a dynamic, agent-accessible knowledge base.

#### **Works cited**

1. Update a note \- Slite API for developers, accessed on January 5, 2026, [https://developers.slite.com/reference/updatenote](https://developers.slite.com/reference/updatenote)  
2. PUT is behaving like PATCH | {overwrite: true} is showing weird behaviour \- Stack Overflow, accessed on January 5, 2026, [https://stackoverflow.com/questions/70499181/put-is-behaving-like-patch-overwrite-true-is-showing-weird-behaviour](https://stackoverflow.com/questions/70499181/put-is-behaving-like-patch-overwrite-true-is-showing-weird-behaviour)  
3. Claude 3.5 Sonnet's Context Window Explained \- Arsturn, accessed on January 5, 2026, [https://www.arsturn.com/blog/claude-3-5-sonnets-context-window-explained](https://www.arsturn.com/blog/claude-3-5-sonnets-context-window-explained)  
4. Claude 3.5 Sonnet Complete Guide: AI Capabilities & Limits | Galileo, accessed on January 5, 2026, [https://galileo.ai/blog/claude-3-5-sonnet-complete-guide-ai-capabilities-analysis](https://galileo.ai/blog/claude-3-5-sonnet-complete-guide-ai-capabilities-analysis)  
5. Claude Sonnet 3.5's Ineffectiveness with Complex, Long-Context Text Editing and Additions, accessed on January 5, 2026, [https://www.reddit.com/r/ClaudeAI/comments/1ge7ay1/claude\_sonnet\_35s\_ineffectiveness\_with\_complex/](https://www.reddit.com/r/ClaudeAI/comments/1ge7ay1/claude_sonnet_35s_ineffectiveness_with_complex/)  
6. Create a note \- Slite API for developers, accessed on January 5, 2026, [https://developers.slite.com/reference/createnote](https://developers.slite.com/reference/createnote)  
7. Return a note \- Slite API for developers, accessed on January 5, 2026, [https://developers.slite.com/reference/getnotebyid](https://developers.slite.com/reference/getnotebyid)  
8. Formatting text with Markdown \- Zendesk help, accessed on January 5, 2026, [https://support.zendesk.com/hc/en-us/articles/4408846544922-Formatting-text-with-Markdown](https://support.zendesk.com/hc/en-us/articles/4408846544922-Formatting-text-with-Markdown)  
9. Markdown Formatting Issues with GPT-5 \- API \- OpenAI Developer Community, accessed on January 5, 2026, [https://community.openai.com/t/markdown-formatting-issues-with-gpt-5/1337570](https://community.openai.com/t/markdown-formatting-issues-with-gpt-5/1337570)  
10. Update a tile in a note \- Slite API for developers, accessed on January 5, 2026, [https://developers.slite.com/reference/updatetile](https://developers.slite.com/reference/updatetile)  
11. API Documentation \- REST API request limits \- Knowledge Center, accessed on January 5, 2026, [https://knowledge.channeladvisor.com/kc?id=kb\_article\&sysparm\_article=KB0017884](https://knowledge.channeladvisor.com/kc?id=kb_article&sysparm_article=KB0017884)  
12. Architecture overview \- Model Context Protocol, accessed on January 5, 2026, [https://modelcontextprotocol.io/docs/learn/architecture](https://modelcontextprotocol.io/docs/learn/architecture)  
13. The official TypeScript SDK for Model Context Protocol servers and clients \- GitHub, accessed on January 5, 2026, [https://github.com/modelcontextprotocol/typescript-sdk](https://github.com/modelcontextprotocol/typescript-sdk)  
14. Tools \- Model Context Protocol, accessed on January 5, 2026, [https://modelcontextprotocol.io/specification/draft/server/tools](https://modelcontextprotocol.io/specification/draft/server/tools)  
15. modelcontextprotocol/servers: Model Context Protocol Servers \- GitHub, accessed on January 5, 2026, [https://github.com/modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers)  
16. Java MCP Filesystem Server \- LobeHub, accessed on January 5, 2026, [https://lobehub.com/mcp/brunorozendo-mcp-server-filesystem](https://lobehub.com/mcp/brunorozendo-mcp-server-filesystem)  
17. MarcusJellinghaus/mcp\_server\_filesystem: MCP File System Server: A secure Model Context Protocol server that provides file operations for AI assistants. Enables Claude and other assistants to safely read, write, and list files in a designated project directory with robust path validation and security controls. \- GitHub, accessed on January 5, 2026, [https://github.com/MarcusJellinghaus/mcp\_server\_filesystem](https://github.com/MarcusJellinghaus/mcp_server_filesystem)  
18. r/ClaudeAI \- Claude is writing to file using filesystem-mcp and doing this, how cruel \- Reddit, accessed on January 5, 2026, [https://www.reddit.com/r/ClaudeAI/comments/1icrvf7/claude\_is\_writing\_to\_file\_using\_filesystemmcp\_and/](https://www.reddit.com/r/ClaudeAI/comments/1icrvf7/claude_is_writing_to_file_using_filesystemmcp_and/)  
19. How to build MCP servers with TypeScript SDK \- DEV Community, accessed on January 5, 2026, [https://dev.to/shadid12/how-to-build-mcp-servers-with-typescript-sdk-1c28](https://dev.to/shadid12/how-to-build-mcp-servers-with-typescript-sdk-1c28)  
20. Filesystem \- edit\_file function missing despite being in the codebase · Issue \#294 · modelcontextprotocol/servers \- GitHub, accessed on January 5, 2026, [https://github.com/modelcontextprotocol/servers/issues/294](https://github.com/modelcontextprotocol/servers/issues/294)  
21. Java MCP Filesystem Server, accessed on January 5, 2026, [https://mcpservers.org/servers/brunorozendo/mcp-server-filesystem](https://mcpservers.org/servers/brunorozendo/mcp-server-filesystem)  
22. Build an MCP server \- Model Context Protocol, accessed on January 5, 2026, [https://modelcontextprotocol.io/docs/develop/build-server](https://modelcontextprotocol.io/docs/develop/build-server)  
23. Build & Test a Model Context Protocol (MCP) Server with TypeScript and MCP Inspector, accessed on January 5, 2026, [https://hackteam.io/blog/build-test-mcp-server-typescript-mcp-inspector/](https://hackteam.io/blog/build-test-mcp-server-typescript-mcp-inspector/)