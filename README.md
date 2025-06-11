# MCP Azure Boards

A minimal MCP server for Azure Boards. It exposes tools to fetch work items, list your assigned work items, and retrieve attachments from Azure Boards.

## Features

- Fetch a single Azure Boards work item by ID
- List all work items assigned to the authenticated user
- List all attachments for a given work item
- Fetch content from a URL (including images and files)

## Prerequisites

- Node.js (v16 or newer recommended)
- An Azure DevOps Personal Access Token (PAT) with appropriate permissions

## Setup

1. Clone the repository and install dependencies:
   ```sh
   npm install
   ```
2. Create a `.env` file in the project root with the following variables:
   ```env
   AZDO_PAT=your-azure-devops-personal-access-token
   AZDO_ORG_URL=https://dev.azure.com/your-organization
   ```

## Build

To compile the TypeScript source:

```sh
npm run build
```

## Usage

To start the MCP Azure Boards server:

```sh
npm start
```

The server will connect via stdio and expose tools for use in compatible clients (such as Cursor).

## License

ISC
