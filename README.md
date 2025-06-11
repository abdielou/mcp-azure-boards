# MCP Azure Boards

A minimal MCP server for Azure Boards. It exposes tools to fetch work items, list your assigned work items, and retrieve attachments from Azure Boards.

## Features

- Fetch a single Azure Boards work item by ID
- List all work items assigned to the authenticated user
- List all attachments for a given work item
- Fetch content from a URL (including images and files)

# Cursor Registration

```json
{
  "mcpServers": {
    "azure-boards": {
      "command": "npx",
      "type": "stdio",
      "args": ["-y", "github:abdielou/mcp-azure-boards"],
      "env": {
        "AZDO_PAT": "<your-pat>",
        "AZDO_ORG_URL": "<your-org-url>"
      }
    }
  }
}
```
