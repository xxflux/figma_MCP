# Figma MCP Plugin

This plugin connects Figma to the MCP (Machine Communication Protocol) server, enabling AI-assisted design operations.

## Features

- WebSocket connection to MCP server
- Create shapes and text elements
- Manipulate existing elements (color, radius, typeface, alignment, etc.)
- Get available fonts in Figma
- List nodes in the current document
- Control text resize behavior

## Development Setup

### Prerequisites

- Node.js and npm
- Figma Desktop app

### Installation

1. Clone this repository
2. Navigate to the plugin directory:
   ```
   cd figma-plugin
   ```
3. Install dependencies:
   ```
   npm install
   ```
4. Build the plugin:
   ```
   ./build.sh
   ```

### Loading the Plugin in Figma

1. Open Figma Desktop
2. Go to **Plugins** > **Development** > **Import plugin from manifest...**
3. Select the `dist/manifest.json` file from this project

## Development Workflow

### Full Build

To perform a complete build that cleans old files and rebuilds everything:

```
./build.sh
```

### Quick Update

During development, you can use the update script for faster iteration:

```
./update.sh
```

This will only update changed files without rebuilding everything.

### Watch Mode

To automatically compile changes as you save files:

```
npm run watch
```

## Plugin Structure

- `code/code.ts` - Main plugin code that runs in Figma
- `code/ui.html` - UI code (HTML, CSS, JS) for the plugin panel
- `manifest.json` - Plugin manifest file

## Connection to MCP Server

The plugin connects to an MCP server via WebSocket. The default server URL is `ws://localhost:8080` but can be changed in the plugin UI.

Features:
- Connection status indicator
- Manual connect/disconnect
- Custom server URL input
- Console log with colored messages

## Available Operations

The plugin supports various operations via the MCP server:

- Creating shapes and text
- Manipulating existing elements
- Selecting nodes
- Changing text properties
- And more

Refer to the code for the complete list of available operations and their parameters.

## Prerequisites

- Figma desktop app or Figma web in a browser that supports WebSockets
- Node.js and npm installed for development
- MCP server running (see the [server README](../figma-mcp-server/README.md))

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Build the plugin

```bash
npm run build
```

This will compile the TypeScript code to JavaScript.

### 3. Import into Figma

1. Open Figma
2. Go to Plugins menu > Development > Import plugin from manifest...
3. Select the `manifest.json` file from this directory

## Usage

### 1. Run the MCP server

Make sure the MCP server is running on your local machine. See the [server README](../figma-mcp-server/README.md) for instructions.

### 2. Open the plugin in Figma

1. In Figma, go to Plugins menu > Development > Figma MCP
2. The plugin UI will open and attempt to connect to the MCP server

### 3. Use Cursor Agent to create designs

With both the MCP server and plugin running, you can now use Cursor Agent to create designs in Figma.

## Development

### Project Structure

- `code/`: Contains the plugin source code
  - `code.ts`: Main plugin code that runs in Figma
  - `ui.html`: Plugin UI with WebSocket connection logic
- `manifest.json`: Plugin manifest file
- `package.json`: NPM package configuration
- `tsconfig.json`: TypeScript configuration

### Working on the Plugin

To work on the plugin, you can use the watch mode to automatically rebuild on changes:

```bash
npm run watch
```

Then, in Figma, use the Development > Show console menu to see console logs from the plugin.

## Troubleshooting

- **WebSocket Connection Error**: Make sure the MCP server is running and accessible on `ws://localhost:8080`
- **Plugin Not Showing in Figma**: Try refreshing the plugins list in Figma
- **Build Errors**: Check the TypeScript errors and make sure all dependencies are installed

## Notes for Deployment

For production use, you'll need to:

1. Obtain a Figma developer account
2. Create a plugin listing on Figma
3. Update the manifest.json with your plugin ID
4. Configure the plugin to connect to a deployed MCP server 