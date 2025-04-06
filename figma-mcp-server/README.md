# Figma MCP Server

This is a Model Context Protocol (MCP) server that allows creating and modifying design elements in Figma using Cursor Agent. The server communicates with Figma via a plugin to execute design operations.

## Features

- Create design elements in Figma using natural language prompts through Cursor Agent
- WebSocket communication between the server and Figma plugin
- MCP schema for integration with Cursor Agent
- Support for various design operations:
  - Creating rectangles, text elements, and other shapes
  - Building complete page layouts based on descriptions
  - Applying styles and positioning elements

## Tech Stack

- Server: Bun + TypeScript + Hono
- Plugin: Figma Plugin API + TypeScript + WebSockets

## Prerequisites

- [Bun](https://bun.sh/) installed
- Figma account
- Cursor with Agent access

## Setup Instructions

### 1. Clone the repository

```bash
git clone <repository-url>
cd figma-mcp
```

### 2. Set up environment variables

```bash
cp figma-mcp-server/.env.example figma-mcp-server/.env
```

Edit the `.env` file to add your Figma access token:

```
PORT=3000
FIGMA_ACCESS_TOKEN=your_figma_access_token
```

You can get a Figma access token from your [Figma account settings](https://www.figma.com/developers/api#access-tokens).

### 3. Install dependencies for the MCP server

```bash
cd figma-mcp-server
bun install
```

### 4. Install dependencies for the Figma plugin

```bash
cd ../figma-plugin
npm install
```

### 5. Build the Figma plugin

```bash
cd ../figma-plugin
npm run build
```

## Running the Server

Start the MCP server:

```bash
cd figma-mcp-server
bun run index.ts
```

This will start the server on port 3000 (or the port specified in your `.env` file) and a WebSocket server on port 8080.

## Installing the Figma Plugin

1. Open Figma and go to the plugins menu
2. Click "Development" > "Import plugin from manifest..."
3. Navigate to the `figma-plugin` directory and select the `manifest.json` file

## Integrating with Cursor Agent

Add the MCP server to Cursor Agent by configuring it in your Cursor settings:

1. Open Cursor
2. Go to Settings
3. Navigate to "Agent" > "MCP Servers"
4. Add a new MCP server with URL: `http://localhost:3000/api/mcp/schema`

## Using the MCP Server with Cursor Agent

Once everything is set up, you can use natural language prompts in Cursor Agent to create designs in Figma:

1. Make sure the MCP server is running
2. Open the Figma plugin in Figma
3. In Cursor Agent, type a prompt like:
   ```
   Create a landing page with a header, hero section with heading "Welcome to Our Platform", a features section with 3 features, and a footer.
   ```

## Example Operations

- Create a rectangle:
  ```
  Create a blue rectangle at position x=100, y=200 with width=300 and height=150.
  ```

- Create text:
  ```
  Add a heading "Welcome" at position x=150, y=100 with font size 48px.
  ```

- Create a complete page:
  ```
  Create a product page with a navigation bar, hero section with heading "Our Product", features section, testimonials, and a contact form.
  ```

## Troubleshooting

- **WebSocket Connection Issues**: Make sure your Figma plugin has proper access to connect to localhost:8080
- **Plugin Not Working**: Check that you've built the plugin with `npm run build` and imported it correctly in Figma
- **MCP Server Not Visible in Cursor**: Ensure the server is running and the schema endpoint is accessible

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
