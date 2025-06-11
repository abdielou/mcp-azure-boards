import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as azdev from "azure-devops-node-api";
import TurndownService from "turndown";
import { z } from "zod";

const server = new McpServer({
  name: "Azure Boards",
  version: "0.0.1",
});
const turndownService = new TurndownService();

const pat = process.env.AZDO_PAT ?? "";
const orgUrl = process.env.AZDO_ORG_URL ?? "";

if (!pat || !orgUrl)
  throw new Error("AZDO_PAT and AZDO_ORG_URL env vars are required");

const authHandler = azdev.getPersonalAccessTokenHandler(pat);
const connection = new azdev.WebApi(orgUrl, authHandler);
const witApiPromise = connection.getWorkItemTrackingApi();

server.tool(
  "work-item",
  "Fetches a single Azure Boards work-item by its ID (read-only); returns a text block with Markdown summary (title, state, description, attachments)",
  { id: z.number().describe("The work item ID") },
  async ({ id }) => {
    const witApi = await witApiPromise;
    const wi = await witApi.getWorkItem(id, undefined, undefined, 1);
    if (!wi) {
      return {
        content: [{ type: "text", text: `Work item ${id} not found.` }],
      };
    }

    const fields = wi.fields ?? ({} as Record<string, unknown>);
    const title = String(fields["System.Title"] ?? "<no title>");
    const state = String(fields["System.State"] ?? "<no state>");
    // Build the UI link for the work item
    const project = String(fields["System.TeamProject"] ?? "<no project>");
    const url = `${orgUrl.replace(/\/$/, "")}/${encodeURIComponent(
      project
    )}/_workitems/edit/${id}`;
    const htmlUserStoryFormat = String(
      fields["Custom.UserStoryFormat"] ?? "<no user story format>"
    );
    const userStoryFormat = turndownService.turndown(htmlUserStoryFormat);
    const htmlDesc = String(fields["System.Description"] ?? "<no description>");
    const desc = turndownService.turndown(htmlDesc);
    // Collect attachments from work item relations
    const relations = (wi as any).relations ?? [];
    const attachments = relations
      .filter((rel: any) => rel.rel === "AttachedFile")
      .map((rel: any) => {
        const name = rel.attributes?.name ?? "<no name>";
        // Append fileName param so downloads preserve original name and extension
        const separator = rel.url.includes("?") ? "&" : "?";
        const url = `${rel.url}${separator}fileName=${encodeURIComponent(
          name
        )}`;
        return { name, url };
      });

    // Build attachments section if any
    let attachmentsSection = "";
    if (attachments.length > 0) {
      attachmentsSection =
        "\n\n---\n**Attachments:**\n" +
        attachments
          .map(
            (att: { name: string; url: string }) =>
              `* [${att.name}](${att.url})`
          )
          .join("\n");
    }
    const markdown = `# [${title}](${url})\n\n**State:** ${state}\n\n---\n${userStoryFormat}\n\n---\n${desc}${attachmentsSection}`;
    return {
      content: [{ type: "text", text: markdown }],
    };
  }
);

server.tool(
  "my-work-items",
  "Lists all Azure Boards work-items assigned to the authenticated user (read-only); returns a text block with Markdown list of work items (ID, title, state, sprint)",
  {},
  async () => {
    const witApi = await witApiPromise;

    // WIQL query to fetch work-items assigned to the current user
    const wiql: { query: string } = {
      query:
        "SELECT [System.Id] FROM WorkItems WHERE [System.AssignedTo] = @Me AND [System.State] IN ('Development', 'In Review', 'Merged', 'New', 'Requirements') ORDER BY [System.ChangedDate] DESC",
    };

    const queryResult = await witApi.queryByWiql(wiql);
    const workItemRefs = queryResult.workItems ?? [];

    if (workItemRefs.length === 0) {
      return {
        content: [{ type: "text", text: "No work items assigned to you." }],
      };
    }

    // Fetch detailed information in batches (API limit ~200 IDs per call)
    const ids = workItemRefs.map((wi) => wi.id as number);
    const batchSize = 200;
    const workItems: unknown[] = [];

    for (let i = 0; i < ids.length; i += batchSize) {
      const batch = ids.slice(i, i + batchSize);
      const items = (await witApi.getWorkItems(batch)) ?? [];
      workItems.push(...items);
    }

    const markdown = workItems
      .map((wi) => {
        const workItem = wi as {
          id?: number;
          fields?: Record<string, unknown>;
        };
        const fields = workItem.fields ?? {};
        const title = String(fields["System.Title"] ?? "<no title>");
        const state = String(fields["System.State"] ?? "<no state>");
        const sprint = String(fields["System.IterationPath"] ?? "<no sprint>");
        return `* #${workItem.id ?? "?"} – ${title} (**${state}**) - ${sprint}`;
      })
      .join("\n");

    return { content: [{ type: "text", text: markdown }] };
  }
);

server.tool(
  "work-item-attachments",
  "Lists all attachments (name and URL) for a given work item ID; returns a JSON array of {name, url} in a text block",
  { id: z.number().describe("The work item ID") },
  async ({ id }) => {
    const witApi = await witApiPromise;
    const wi = await witApi.getWorkItem(id, undefined, undefined, 1);
    const relations = (wi as any).relations ?? [];
    const attachments = relations
      .filter((rel: any) => rel.rel === "AttachedFile")
      .map((rel: any) => {
        const name = rel.attributes?.name ?? "<no name>";
        const separator = rel.url.includes("?") ? "&" : "?";
        const url = `${rel.url}${separator}fileName=${encodeURIComponent(
          name
        )}`;
        return { name, url };
      });
    return {
      content: [{ type: "text", text: JSON.stringify(attachments, null, 2) }],
    };
  }
);

server.tool(
  "fetch-url",
  "Fetches content from a URL; returns structured blocks: type=image (Base64 image data), type=text (text content), type=resource (binary blob with uri, blob, mimeType, name)",
  {
    url: z.string().describe("The URL to fetch"),
    name: z
      .string()
      .optional()
      .describe("Optional filename for saving the content"),
  },
  async ({ url, name: overrideName }) => {
    const response = await fetch(url, {
      headers: {
        Authorization: `Basic ${Buffer.from(":" + pat).toString("base64")}`,
      },
    });
    const buffer = Buffer.from(await response.arrayBuffer());
    const mimeType = response.headers.get("content-type") ?? "";
    // Determine file name from URL if provided
    let extractedName: string | undefined;
    try {
      extractedName = new URL(url).searchParams.get("fileName") ?? undefined;
    } catch {}
    const finalName = overrideName ?? extractedName;
    // Images -> image block
    if (mimeType.startsWith("image/")) {
      return {
        content: [
          {
            type: "image",
            data: buffer.toString("base64"),
            mimeType,
            name: finalName,
          },
        ],
      };
    }
    // Text types (e.g., CSV) -> text block
    if (mimeType.startsWith("text/")) {
      const textContent = buffer.toString("utf8");
      return {
        content: [{ type: "text", text: textContent, name: finalName }],
      };
    }
    // Other binaries (PDF, Excel, Word) -> resource block
    return {
      content: [
        {
          type: "resource",
          resource: { uri: url, blob: buffer.toString("base64"), mimeType },
          name: finalName,
        },
      ],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
