# Step-by-Step Installation and Usage Guide

This guide will walk you through the complete process of setting up and using the Figma MCP (Model Context Protocol) system with Cursor Agent.

## Prerequisites

Before you begin, make sure you have the following:

- [Bun](https://bun.sh/) installed for running the MCP server
- [Node.js and npm](https://nodejs.org/) installed for building the Figma plugin
- [Figma](https://www.figma.com/) account (free or paid)
- [Cursor](https://cursor.sh/) with Agent access
- Figma access token (we'll show you how to get this)

## Part 1: Setting Up the MCP Server

### Step 1: Clone or download the repository

```bash
git clone <repository-url>
cd figma-mcp
```

### Step 2: Get a Figma access token

1. Log in to your Figma account in a web browser
2. Go to Settings > Account > Personal access tokens
3. Create a new personal access token (give it a name like "MCP Server")
4. Copy the token (important: you won't be able to see it again after closing the window)

### Step 3: Configure the MCP server

1. Navigate to the server directory:
   ```bash
   cd figma-mcp-server
   ```

2. Create a `.env` file from the example:
   ```bash
   cp .env.example .env
   ```

3. Edit the `.env` file and paste your Figma access token:
   ```
   PORT=3000
   FIGMA_ACCESS_TOKEN=your_figma_access_token
   ```

### Step 4: Install dependencies and start the server

1. Install dependencies:
   ```bash
   bun install
   ```

2. Start the MCP server:
   ```bash
   bun run index.ts
   ```

3. You should see output confirming the server is running:
   ```
   Starting Figma MCP Server...
   MCP server running on port 3000
   WebSocket server running on port 8080
   ```

## Part 2: Setting Up the Figma Plugin

### Step 1: Build the plugin

1. Open a new terminal window (keep the MCP server running)
2. Navigate to the plugin directory:
   ```bash
   cd figma-plugin
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Build the plugin:
   ```bash
   npm run build
   ```

### Step 2: Import the plugin into Figma

1. Open Figma desktop app or Figma in your web browser
2. Create a new file or open an existing one
3. Click on the menu icon (≡) in the top-left corner
4. Navigate to Plugins > Development > Import plugin from manifest...
5. Browse to the `figma-plugin` directory and select the `manifest.json` file
6. The plugin should now be imported and available in your Development plugins

## Part 3: Configuring Cursor Agent

### Step 1: Add the MCP server to Cursor

1. Open Cursor
2. Click on the settings icon (⚙️) or use the keyboard shortcut (Cmd+, on Mac or Ctrl+, on Windows)
3. Navigate to Agent > MCP Servers
4. Click "Add MCP Server"
5. Enter the following URL: `http://localhost:3000/api/mcp/schema`
6. Save the settings

## Part 4: Using the System

### Step 1: Start all components

1. Make sure the MCP server is running
2. Open Figma and your design file
3. Run the Figma MCP plugin:
   - Go to Plugins > Development > Figma MCP
   - You should see a small plugin window showing "Connected to MCP server" if everything is working

### Step 2: Create designs using Cursor Agent

1. In Cursor, open a new or existing project
2. Use the Agent panel or command (Cmd+Shift+A or Ctrl+Shift+A)
3. Enter a design prompt, for example:
   ```
   Create a landing page with a header, hero section with heading "Our Amazing Product", 
   3 feature cards in the features section, and a footer with copyright information.
   ```

4. Cursor Agent will process your request and send it to your MCP server
5. The server will relay the instructions to the Figma plugin
6. Watch as the elements are created in your Figma file

### Step 3: Working with the created designs

1. Once elements are created in Figma, you can:
   - Modify them manually using Figma's tools
   - Continue to refine them with more specific instructions through Cursor Agent
   - Save the design or export components as needed

## Troubleshooting

### MCP Server Issues

- **Server won't start**: Make sure Bun is installed correctly and the required ports (3000 and 8080) are not in use
  - If you see `Failed to start server. Is port 3000 in use?` error, try changing the port in your `.env` file or stop any other services using port 3000
  - Similarly, if WebSocket port 8080 is in use, you'll need to modify the code in `server.ts` to use a different port
- **Authentication errors**: Verify your Figma access token is correct and has not expired
- **SSE error in Cursor**: If you see "SSE error: Invalid content type, expected 'text/event-stream'", make sure your server is properly implementing the Server-Sent Events protocol with the correct headers:
  ```
  Content-Type: text/event-stream
  Cache-Control: no-cache
  Connection: keep-alive
  ```
  And that responses are formatted as: `data: {"your":"json"}\n\n`

### Figma Plugin Issues

- **Plugin doesn't appear in Figma**: Try refreshing the plugins list or restarting Figma
- **WebSocket connection error**: Ensure the MCP server is running and port 8080 is accessible
- **Plugin crashes**: Check Figma's console for error messages (Plugins > Development > Show console)

### Cursor Agent Issues

- **MCP server not showing in Cursor**: Verify the server is running and the schema URL is correct
- **Agent doesn't use the MCP server**: Try restarting Cursor or manually selecting the MCP server when making a request

## Examples of Design Prompts

Here are some example prompts you can use with Cursor Agent:

### Create Basic Elements

```
Create a blue rectangle with rounded corners at position x=100, y=100, width=300, height=200.
```

### Create Text Elements

```
Add a headline "Welcome to Our Site" at the top of the page with font size 48px and centered alignment.
```

### Create a Complete Page Layout

```
Design a product page with:
- A navigation bar with links to Home, Features, Pricing, and Contact
- A hero section with heading "The Future is Now" and a subheading "Experience the next generation of design"
- A features section with 4 feature cards, each with an icon and description
- A testimonial section with 2 customer quotes
- A call-to-action section with a button "Get Started"
- A footer with company information and social media links
```

## Next Steps

As you become more familiar with the system, you can:

1. Customize the plugin code to support more design operations
2. Extend the MCP server to handle more complex design requests
3. Integrate with other design systems or component libraries
4. Create templates for common design patterns 