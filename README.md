# Figma MCP (Model Context Protocol)

A complete solution for creating and modifying Figma designs through Cursor Agent using the Model Context Protocol.

## Overview

This project enables AI-powered design creation in Figma using natural language prompts through Cursor Agent. It consists of two main components:

1. **MCP Server**: A Bun + TypeScript server that implements the Model Context Protocol and communicates with the Figma plugin via WebSockets.
2. **Figma Plugin**: A plugin that runs in Figma and executes design operations based on instructions from the MCP server.

With this integration, you can use natural language to:
- Create basic design elements (shapes, text, etc.)
- Design complete page layouts with multiple sections
- Modify existing designs

## Repository Structure

- **figma-mcp-server/**: The MCP server implementation
- **figma-plugin/**: The Figma plugin for executing design operations

## Quick Start

### 1. Set up the MCP Server

```bash
cd figma-mcp-server
cp .env.example .env  # Edit this file to add your Figma token
bun install
bun run index.ts
```

### 2. Set up the Figma Plugin

```bash
cd figma-plugin
npm install
npm run build
```

Then import the plugin into Figma:
1. Open Figma
2. Go to Plugins > Development > Import plugin from manifest
3. Select the `figma-plugin/manifest.json` file

### 3. Connect to Cursor Agent

In Cursor:
1. Go to Settings > Agent > MCP Servers
2. Add a new server with URL: `http://localhost:3000/api/mcp/schema`

## Detailed Documentation

For more detailed instructions, see:
- [MCP Server README](./figma-mcp-server/README.md)
- [Figma Plugin Setup Guide](./figma-plugin/README.md)

## Example Usage

Once everything is set up, you can use Cursor Agent to create designs with prompts like:

```
Create a landing page with a header, hero section with heading "Our Product" and subheading "The best solution for your needs", 3 features in the features section, and a footer with contact information.
```

## How It Works

1. Cursor Agent receives a natural language prompt
2. It sends a structured MCP request to the MCP server
3. The MCP server processes the request and sends instructions to the Figma plugin via WebSocket
4. The Figma plugin executes the design operations in Figma

## License

MIT 