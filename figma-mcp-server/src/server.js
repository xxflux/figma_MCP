// server.js
// Run with: node server.js
//
// Desired MCP flow:
//  1) GET /sse-cursor => SSE => event:endpoint => /message?sessionId=XYZ
//  2) POST /message?sessionId=XYZ => {method:"initialize"} => minimal HTTP ack => SSE => big "capabilities"
//  3) {method:"tools/list"} => SSE => Tools array (including addNumbersTool)
//  4) {method:"tools/call"} => SSE => result of the call (like summing two numbers)
//  5) notifications/initialized => ack
//
// To avoid "unknown ID" errors, we always use rpc.id in the SSE response.

import express from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import WebSocket from 'ws';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

// Lucide icons support
const LUCIDE_ICONS = {
  // Common icons
  'activity': '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-activity"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
  'alert-circle': '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-alert-circle"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>',
  'archive': '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-archive"><rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/></svg>',
  'arrow-right': '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-right"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>',
  'bell': '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-bell"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
  'calendar': '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-calendar"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>',
  'check': '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check"><path d="M20 6 9 17l-5-5"/></svg>',
  'chevron-down': '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-down"><path d="m6 9 6 6 6-6"/></svg>',
  'chevron-left': '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-left"><path d="m15 18-6-6 6-6"/></svg>',
  'chevron-right': '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right"><path d="m9 18 6-6-6-6"/></svg>',
  'chevron-up': '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-up"><path d="m18 15-6-6-6 6"/></svg>',
  'clipboard': '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-clipboard"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>',
  'clock': '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-clock"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  'copy': '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-copy"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>',
  'download': '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-download"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>',
  'edit': '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-edit"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
  'external-link': '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-external-link"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" x2="21" y1="14" y2="3"/></svg>',
  'file-text': '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-file-text"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/></svg>',
  'filter': '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-filter"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>',
  'heart': '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-heart"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>',
  'home': '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-home"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
  'image': '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-image"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>',
  'link': '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-link"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
  'mail': '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-mail"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>',
  'menu': '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-menu"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>',
  'minus': '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-minus"><line x1="5" x2="19" y1="12" y2="12"/></svg>',
  'more-horizontal': '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-more-horizontal"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>',
  'more-vertical': '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-more-vertical"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>',
  'plus': '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-plus"><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg>',
  'search': '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-search"><circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/></svg>',
  'settings': '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-settings"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>',
  'square-x': '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-square-x"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>',
  'trash': '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  'upload': '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-upload"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>',
  'user': '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-user"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  'x': '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x"><line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></svg>'
};

// You can add more icons here or load them dynamically from the Lucide library

const app = express();
const port = 3000;

// Constants
const FIGMA_ACCESS_TOKEN = process.env.FIGMA_ACCESS_TOKEN;
const FIGMA_API_BASE_URL = 'https://api.figma.com/v1';

// Enable CORS
app.use(cors());

// Parse JSON bodies
app.use(express.json());

// We store sessions by sessionId => { sseRes, initialized: boolean }
const sessions = new Map();

// Store connected Figma plugin clients
const figmaClients = new Map();

/*
|--------------------------------------------------------------------------
| WebSocket server for plugin communication
|--------------------------------------------------------------------------
*/
const wss = new WebSocket.Server({ port: 8080 });

console.log('WebSocket server running on port 8080');

// Handle WebSocket connections from Figma plugins
wss.on('connection', (ws) => {
  const clientId = Date.now().toString();
  figmaClients.set(clientId, ws);
  
  console.log(`Figma plugin connected: ${clientId}`);

  // Handle incoming messages from Figma plugin
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      console.log('Received message from plugin:', JSON.stringify(data, null, 2));
      
      // Handle different message types from plugin
      if (data.type === 'plugin-ready') {
        console.log('Plugin is ready and connected');
      } else if (data.type === 'operation-completed') {
        console.log('Operation completed:', data.originalOperation, data.status);
        
        // Check if this is part of a delete operation
        if (data.originalOperation === 'delete-node') {
          console.log('Delete operation completed successfully:', data.data);
        } else if (data.originalOperation === 'move-node') {
          console.log('Move operation completed successfully:', data.data);
        }
      } else if (data.type === 'nodes-deleted') {
        console.log('Nodes deleted:', data.count, data.nodeIds);
      } else if (data.type === 'nodes-moved') {
        console.log('Nodes moved:', data.count, 'nodes to new positions');
        console.log('Move details:', data.nodes);
      } else if (data.type === 'operation-error') {
        console.error('Operation error:', data.originalOperation, data.error);
      } else if (data.type === 'fonts-list') {
        console.log('Fonts list received:', data.fonts?.length);
      } else if (data.type === 'nodes-list') {
        console.log('Nodes list received:', data.count);
      } else {
        console.log('Unhandled message type:', data.type);
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  });

  // Handle disconnection
  ws.on('close', () => {
    console.log(`Figma plugin disconnected: ${clientId}`);
    figmaClients.delete(clientId);
  });

  // Send initial message to plugin
  ws.send(JSON.stringify({ type: 'server-ready', message: 'MCP server is ready' }));
});

// Function to send operations to Figma plugin via WebSocket
const sendOperationToPlugin = (operation) => {
  if (figmaClients.size === 0) {
    console.warn('No Figma plugins connected to send operation to');
    return;
  }

  // Send to all connected Figma plugins
  for (const [clientId, client] of figmaClients.entries()) {
    try {
      client.send(JSON.stringify(operation));
      console.log(`Operation sent to plugin ${clientId}`);
    } catch (error) {
      console.error(`Error sending to plugin ${clientId}:`, error);
    }
  }
};

// Health check endpoint
app.get('/', (req, res) => {
  return res.json({ status: 'Figma MCP Server is running' });
});

/*
|--------------------------------------------------------------------------
| 1) SSE => GET /sse-cursor
|--------------------------------------------------------------------------
|  => Sends event:endpoint => /message?sessionId=XYZ
|  => Does NOT send big JSON at this point
|  => Also sends a heartbeat every 10 seconds
*/
app.get("/sse-cursor", (req, res) => {
    console.log("[MCP] SSE => /sse-cursor connected");

    // SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // Generate a sessionId
    const sessionId = uuidv4();
    sessions.set(sessionId, { sseRes: res, initialized: false });
    console.log("[MCP] Created sessionId:", sessionId);

    // event: endpoint => /message?sessionId=...
    res.write(`event: endpoint\n`);
    res.write(`data: /message?sessionId=${sessionId}\n\n`);

    // Heartbeat every 10 seconds
    const hb = setInterval(() => {
        res.write(`event: heartbeat\ndata: ${Date.now()}\n\n`);
    }, 10000);

    // Cleanup on disconnect
    req.on("close", () => {
        clearInterval(hb);
        sessions.delete(sessionId);
        console.log("[MCP] SSE closed => sessionId=", sessionId);
    });
});


/*
|--------------------------------------------------------------------------
| 2) JSON-RPC => POST /message?sessionId=...
|--------------------------------------------------------------------------
|   => "initialize" => minimal ack => SSE => big "capabilities"
|   => "tools/list" => minimal ack => SSE => array of tools
|   => "tools/call" => minimal ack => SSE => result of the call, e.g. sum
|   => "notifications/initialized" => ack
|--------------------------------------------------------------------------
*/
app.post("/message", async (req, res) => {
    console.log("[MCP] POST /message => body:", req.body, " query:", req.query);

    const sessionId = req.query.sessionId || req.header('X-Figma-MCP-SessionId');
    if (!sessionId) {
        return res.status(400).json({ error: "Missing sessionId in ?sessionId=... or X-Figma-MCP-SessionId header" });
    }
    const sessionData = sessions.get(sessionId);
    if (!sessionData) {
        return res.status(404).json({ error: "No SSE session with that sessionId" });
    }

    const rpc = req.body;
    // Check JSON-RPC formatting
    if (!rpc || rpc.jsonrpc !== "2.0" || !rpc.method) {
        return res.json({
            jsonrpc: "2.0",
            id: rpc?.id ?? null,
            error: {
                code: -32600,
                message: "Invalid JSON-RPC request"
            }
        });
    }

    // Minimal HTTP ack
    res.json({
        jsonrpc: "2.0",
        id: rpc.id,
        result: { ack: `Received ${rpc.method}` }
    });

    // The actual response => SSE
    const sseRes = sessionData.sseRes;
    if (!sseRes) {
        console.log("[MCP] No SSE response found => sessionId=", sessionId);
        return;
    }

    // Process the JSON-RPC method
    let result;
    let error;

    switch (rpc.method) {
        // -- initialize
        case "initialize": {
            sessionData.initialized = true;

            // SSE => event: message => big "capabilities"
            const initCaps = {
                jsonrpc: "2.0",
                id: rpc.id, // Use the same ID => no "unknown ID" error
                result: {
                    protocolVersion: "2024-11-05",
                    capabilities: {
                        tools: { listChanged: true },
                        resources: { subscribe: true, listChanged: true },
                        prompts: { listChanged: true },
                        logging: {}
                    },
                    serverInfo: {
                        name: "final-capabilities-server",
                        version: "1.0.0"
                    }
                }
            };
            sseRes.write(`event: message\n`);
            sseRes.write(`data: ${JSON.stringify(initCaps)}\n\n`);
            console.log("[MCP] SSE => event: message => init caps => sessionId=", sessionId);
            return;
        }

        // -- tools/list
        case "tools/list": {
            const toolsMsg = {
                jsonrpc: "2.0",
                id: rpc.id, // same ID => no "unknown ID"
                result: {
                    tools: [
                        {
                            name: "addNumbersTool",
                            description: "Adds two numbers 'a' and 'b' and returns their sum.",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    a: { type: "number" },
                                    b: { type: "number" }
                                },
                                required: ["a", "b"]
                            }
                        },
                        {
                            name: "figma.getFile",
                            description: "Get a Figma file by ID",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    fileId: {
                                        type: "string",
                                        description: "The ID of the Figma file"
                                    }
                                },
                                required: ["fileId"]
                            }
                        },
                        {
                            name: "figma.createRectangle",
                            description: "Create a rectangle shape in Figma",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    position: {
                                        type: "object",
                                        description: "Position coordinates",
                                        properties: {
                                            x: { type: "number" },
                                            y: { type: "number" }
                                        },
                                        required: ["x", "y"]
                                    },
                                    size: {
                                        type: "object",
                                        description: "Size dimensions",
                                        properties: {
                                            width: { type: "number" },
                                            height: { type: "number" }
                                        },
                                        required: ["width", "height"]
                                    },
                                    color: {
                                        type: "object",
                                        description: "Fill color in RGB (values from 0-1)",
                                        properties: {
                                            r: { type: "number" },
                                            g: { type: "number" },
                                            b: { type: "number" }
                                        }
                                    }
                                },
                                required: ["position", "size"]
                            }
                        },
                        {
                            name: "figma.createText",
                            description: "Create a text element in Figma",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    text: {
                                        type: "string",
                                        description: "The text content"
                                    },
                                    position: {
                                        type: "object",
                                        description: "Position coordinates",
                                        properties: {
                                            x: { type: "number" },
                                            y: { type: "number" }
                                        },
                                        required: ["x", "y"]
                                    },
                                    fontSize: {
                                        type: "number",
                                        description: "Font size in pixels"
                                    },
                                    color: {
                                        type: "object",
                                        description: "Text color in RGB (values from 0-1)",
                                        properties: {
                                            r: { type: "number" },
                                            g: { type: "number" },
                                            b: { type: "number" }
                                        }
                                    },
                                    fontFamily: {
                                        type: "string",
                                        description: "Font family to use (e.g., 'Inter', 'Roboto')"
                                    },
                                    resizeMode: {
                                        type: "string",
                                        description: "Text resize behavior: 'AUTO_WIDTH', 'AUTO_HEIGHT', or 'FIXED_SIZE'",
                                        enum: ["AUTO_WIDTH", "AUTO_HEIGHT", "FIXED_SIZE"]
                                    }
                                },
                                required: ["text", "position"]
                            }
                        },
                        {
                            name: "figma.createPage",
                            description: "Create a complete page based on description",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    pageName: {
                                        type: "string",
                                        description: "Name of the page to create"
                                    },
                                    description: {
                                        type: "string",
                                        description: "Detailed description of the page layout and contents"
                                    },
                                    styleGuide: {
                                        type: "object",
                                        description: "Style guide parameters",
                                        properties: {
                                            colors: {
                                                type: "object",
                                                description: "Color palette to use"
                                            },
                                            spacing: {
                                                type: "object",
                                                description: "Spacing guidelines"
                                            },
                                            typography: {
                                                type: "object",
                                                description: "Typography settings"
                                            }
                                        }
                                    }
                                },
                                required: ["pageName", "description"]
                            }
                        },
                        // New tools
                        {
                            name: "figma.selectNode",
                            description: "Select a node by its ID in the Figma canvas",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    nodeId: {
                                        type: "string",
                                        description: "The ID of the node to select"
                                    }
                                },
                                required: ["nodeId"]
                            }
                        },
                        {
                            name: "figma.changeColor",
                            description: "Change the color of the selected node(s)",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    color: {
                                        type: "object",
                                        description: "Fill color in RGB (values from 0-1)",
                                        properties: {
                                            r: { type: "number" },
                                            g: { type: "number" },
                                            b: { type: "number" }
                                        },
                                        required: ["r", "g", "b"]
                                    },
                                    nodeId: {
                                        type: "string",
                                        description: "Optional node ID to target. If not provided, currently selected nodes will be used"
                                    }
                                },
                                required: ["color"]
                            }
                        },
                        {
                            name: "figma.changeRadius",
                            description: "Change the corner radius of the selected node(s)",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    radius: {
                                        type: "number",
                                        description: "Corner radius value in pixels"
                                    },
                                    nodeId: {
                                        type: "string",
                                        description: "Optional node ID to target. If not provided, currently selected nodes will be used"
                                    }
                                },
                                required: ["radius"]
                            }
                        },
                        {
                            name: "figma.changeTypeface",
                            description: "Change the typeface of the selected text node(s)",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    fontFamily: {
                                        type: "string",
                                        description: "Font family name (e.g., 'Inter', 'Roboto')"
                                    },
                                    nodeId: {
                                        type: "string",
                                        description: "Optional node ID to target. If not provided, currently selected nodes will be used"
                                    }
                                },
                                required: ["fontFamily"]
                            }
                        },
                        {
                            name: "figma.changeFontStyle",
                            description: "Change the font style of the selected text node(s)",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    fontSize: {
                                        type: "number",
                                        description: "Font size in pixels"
                                    },
                                    fontWeight: {
                                        type: "string",
                                        description: "Font weight (e.g., 'Regular', 'Bold', 'SemiBold')"
                                    },
                                    italic: {
                                        type: "boolean",
                                        description: "Whether the text should be italic"
                                    },
                                    nodeId: {
                                        type: "string",
                                        description: "Optional node ID to target. If not provided, currently selected nodes will be used"
                                    }
                                }
                            }
                        },
                        {
                            name: "figma.changeAlignment",
                            description: "Change the text alignment of the selected text node(s)",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    horizontal: {
                                        type: "string",
                                        description: "Horizontal alignment ('LEFT', 'CENTER', 'RIGHT', 'JUSTIFIED')"
                                    },
                                    vertical: {
                                        type: "string",
                                        description: "Vertical alignment ('TOP', 'CENTER', 'BOTTOM')"
                                    },
                                    nodeId: {
                                        type: "string",
                                        description: "Optional node ID to target. If not provided, currently selected nodes will be used"
                                    }
                                }
                            }
                        },
                        {
                            name: "figma.changeSpacing",
                            description: "Change margin or padding of the selected auto layout node(s)",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    padding: {
                                        type: "object",
                                        description: "Padding values",
                                        properties: {
                                            top: { type: "number" },
                                            right: { type: "number" },
                                            bottom: { type: "number" },
                                            left: { type: "number" }
                                        }
                                    },
                                    itemSpacing: {
                                        type: "number",
                                        description: "Spacing between items in auto layout"
                                    },
                                    nodeId: {
                                        type: "string",
                                        description: "Optional node ID to target. If not provided, currently selected nodes will be used"
                                    }
                                }
                            }
                        },
                        {
                            name: "figma.listFonts",
                            description: "Get a list of available font families in Figma",
                            inputSchema: {
                                type: "object",
                                properties: {}
                            }
                        },
                        {
                            name: "figma.changeTextResize",
                            description: "Change the resize behavior of text elements",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    resizeMode: {
                                        type: "string",
                                        description: "Text resize behavior: 'AUTO_WIDTH', 'AUTO_HEIGHT', or 'FIXED_SIZE'",
                                        enum: ["AUTO_WIDTH", "AUTO_HEIGHT", "FIXED_SIZE"]
                                    },
                                    width: {
                                        type: "number",
                                        description: "Width in pixels (used for AUTO_HEIGHT and FIXED_SIZE modes)"
                                    },
                                    height: {
                                        type: "number",
                                        description: "Height in pixels (used for FIXED_SIZE mode only)"
                                    },
                                    nodeId: {
                                        type: "string", 
                                        description: "Optional node ID to target. If not provided, currently selected nodes will be used"
                                    }
                                },
                                required: ["resizeMode"]
                            }
                        },
                        {
                            name: "figma.listNodes",
                            description: "List all node IDs and types in the current page",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    includeDetails: {
                                        type: "boolean",
                                        description: "Whether to include details about each node (name, type, etc.)"
                                    }
                                }
                            }
                        },
                        {
                            name: "figma.deleteNode",
                            description: "Delete a node or nodes from the Figma canvas",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    nodeId: {
                                        type: "string",
                                        description: "Optional node ID to delete. If not provided, currently selected nodes will be deleted"
                                    }
                                }
                            }
                        },
                        {
                            name: "figma.moveNode",
                            description: "Move a node or nodes to a specific position on the canvas",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    position: {
                                        type: "object",
                                        description: "The position to move the node(s) to",
                                        properties: {
                                            x: { 
                                                type: "number",
                                                description: "X coordinate in Figma's coordinate system"
                                            },
                                            y: { 
                                                type: "number",
                                                description: "Y coordinate in Figma's coordinate system"
                                            }
                                        },
                                        required: ["x", "y"]
                                    },
                                    nodeId: {
                                        type: "string",
                                        description: "Optional node ID to move. If not provided, currently selected nodes will be moved"
                                    }
                                },
                                required: ["position"]
                            }
                        },
                        {
                            name: "figma.createIcon",
                            description: "Create a Lucide icon in Figma",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    iconName: {
                                        type: "string",
                                        description: "Name of the Lucide icon to create (e.g., 'heart', 'home', 'settings')"
                                    },
                                    position: {
                                        type: "object",
                                        description: "Position coordinates",
                                        properties: {
                                            x: { type: "number" },
                                            y: { type: "number" }
                                        },
                                        required: ["x", "y"]
                                    },
                                    size: {
                                        type: "number",
                                        description: "Icon size in pixels (default: 24)"
                                    },
                                    color: {
                                        type: "object",
                                        description: "Icon color in RGB (values from 0-1)",
                                        properties: {
                                            r: { type: "number" },
                                            g: { type: "number" },
                                            b: { type: "number" }
                                        }
                                    },
                                    strokeWidth: {
                                        type: "number",
                                        description: "Icon stroke width (default: 2)"
                                    }
                                },
                                required: ["iconName", "position"]
                            }
                        },
                        {
                            name: "figma.createBorderBox",
                            description: "Create a border line box or button in Figma",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    position: {
                                        type: "object",
                                        description: "Position coordinates",
                                        properties: {
                                            x: { type: "number" },
                                            y: { type: "number" }
                                        },
                                        required: ["x", "y"]
                                    },
                                    size: {
                                        type: "object",
                                        description: "Size dimensions",
                                        properties: {
                                            width: { type: "number" },
                                            height: { type: "number" }
                                        },
                                        required: ["width", "height"]
                                    },
                                    options: {
                                        type: "object",
                                        description: "Box/button styling options",
                                        properties: {
                                            type: {
                                                type: "string",
                                                description: "Type of element to create ('box' or 'button')",
                                                enum: ["box", "button"]
                                            },
                                            borderColor: {
                                                type: "object",
                                                description: "Border color in RGB (values from 0-1)",
                                                properties: {
                                                    r: { type: "number" },
                                                    g: { type: "number" },
                                                    b: { type: "number" }
                                                }
                                            },
                                            borderWidth: {
                                                type: "number",
                                                description: "Border width in pixels (default: 1)"
                                            },
                                            fillColor: {
                                                type: "object",
                                                description: "Fill color in RGB (values from 0-1)",
                                                properties: {
                                                    r: { type: "number" },
                                                    g: { type: "number" },
                                                    b: { type: "number" }
                                                }
                                            },
                                            cornerRadius: {
                                                type: "number",
                                                description: "Corner radius in pixels"
                                            },
                                            text: {
                                                type: "string",
                                                description: "Text to display inside the box/button"
                                            },
                                            textColor: {
                                                type: "object",
                                                description: "Text color in RGB (values from 0-1)",
                                                properties: {
                                                    r: { type: "number" },
                                                    g: { type: "number" },
                                                    b: { type: "number" }
                                                }
                                            },
                                            fontSize: {
                                                type: "number",
                                                description: "Text font size in pixels (default: 16)"
                                            },
                                            fontFamily: {
                                                type: "string",
                                                description: "Text font family (default: Inter)"
                                            }
                                        },
                                        required: ["type"]
                                    }
                                },
                                required: ["position", "size", "options"]
                            }
                        },
                        {
                            name: "figma.drawLine",
                            description: "Draw a line in Figma",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    start: {
                                        type: "object",
                                        description: "Starting position coordinates",
                                        properties: {
                                            x: { type: "number" },
                                            y: { type: "number" }
                                        },
                                        required: ["x", "y"]
                                    },
                                    end: {
                                        type: "object",
                                        description: "Ending position coordinates",
                                        properties: {
                                            x: { type: "number" },
                                            y: { type: "number" }
                                        },
                                        required: ["x", "y"]
                                    },
                                    color: {
                                        type: "object",
                                        description: "Line color in RGB (values from 0-1, default: black)",
                                        properties: {
                                            r: { type: "number" },
                                            g: { type: "number" },
                                            b: { type: "number" }
                                        }
                                    },
                                    thickness: {
                                        type: "number",
                                        description: "Line thickness in pixels (default: 1)"
                                    }
                                },
                                required: ["start", "end"]
                            }
                        }
                    ],
                    count: 19
                }
            };
            sseRes.write(`event: message\n`);
            sseRes.write(`data: ${JSON.stringify(toolsMsg)}\n\n`);
            console.log("[MCP] SSE => event: message => tools/list => sessionId=", sessionId);
            return;
        }

        // -- tools/call: e.g. addNumbersTool or Figma tools
        case "tools/call": {
            // e.g. { name: "addNumbersTool", arguments: { a:..., b:... } }
            const toolName = rpc.params?.name;
            const args = rpc.params?.arguments || {};
            console.log("[MCP] tools/call => name=", toolName, "args=", args);

            if (toolName === "addNumbersTool") {
                const sum = (args.a || 0) + (args.b || 0);
                // SSE => event: message => the result
                const callMsg = {
                    jsonrpc: "2.0",
                    id: rpc.id, // use the same ID => no unknown ID
                    result: {
                        content: [
                            {
                                type: "text",
                                text: `Sum of ${args.a} + ${args.b} = ${sum}`
                            }
                        ]
                    }
                };
                sseRes.write(`event: message\n`);
                sseRes.write(`data: ${JSON.stringify(callMsg)}\n\n`);
                console.log("[MCP] SSE => event: message => tools/call => sum", sum);
            } 
            else if (toolName === "figma.getFile") {
                // Use Figma API to get file data
                if (!args.fileId) {
                    const errorMsg = {
                        jsonrpc: "2.0",
                        id: rpc.id,
                        error: {
                            code: -32602,
                            message: "Invalid params",
                            data: "Missing fileId parameter"
                        }
                    };
                    sseRes.write(`event: message\n`);
                    sseRes.write(`data: ${JSON.stringify(errorMsg)}\n\n`);
                    return;
                }
                
                try {
                    const response = await fetch(`${FIGMA_API_BASE_URL}/files/${args.fileId}`, {
                        headers: {
                            'X-Figma-Token': FIGMA_ACCESS_TOKEN || ''
                        }
                    });
                    
                    if (!response.ok) {
                        throw new Error(`Figma API error: ${response.statusText}`);
                    }
                    
                    const data = await response.json();
                    
                    const callMsg = {
                        jsonrpc: "2.0",
                        id: rpc.id,
                        result: {
                            content: [
                                {
                                    type: "text",
                                    text: JSON.stringify(data, null, 2)
                                }
                            ]
                        }
                    };
                    sseRes.write(`event: message\n`);
                    sseRes.write(`data: ${JSON.stringify(callMsg)}\n\n`);
                    console.log("[MCP] SSE => event: message => figma.getFile success");
                } catch (err) {
                    console.error('Error fetching Figma file:', err);
                    const errorMsg = {
                        jsonrpc: "2.0",
                        id: rpc.id,
                        error: {
                            code: -32603,
                            message: "Internal error",
                            data: "Failed to fetch Figma file"
                        }
                    };
                    sseRes.write(`event: message\n`);
                    sseRes.write(`data: ${JSON.stringify(errorMsg)}\n\n`);
                }
            }
            else if (toolName === "figma.createRectangle") {
                // Use WebSocket to send operation to plugin
                if (!args.position || !args.size) {
                    const errorMsg = {
                        jsonrpc: "2.0",
                        id: rpc.id,
                        error: {
                            code: -32602,
                            message: "Invalid params",
                            data: "Missing position or size parameters"
                        }
                    };
                    sseRes.write(`event: message\n`);
                    sseRes.write(`data: ${JSON.stringify(errorMsg)}\n\n`);
                    return;
                }
                
                sendOperationToPlugin({
                    type: 'create-rectangle',
                    position: args.position,
                    size: args.size,
                    color: args.color || { r: 0.8, g: 0.8, b: 0.8 }
                });
                
                const callMsg = {
                    jsonrpc: "2.0",
                    id: rpc.id,
                    result: {
                        content: [
                            {
                                type: "text",
                                text: "Rectangle creation operation sent to plugin"
                            }
                        ]
                    }
                };
                sseRes.write(`event: message\n`);
                sseRes.write(`data: ${JSON.stringify(callMsg)}\n\n`);
                console.log("[MCP] SSE => event: message => figma.createRectangle success");
            }
            else if (toolName === "figma.createText") {
                // Use WebSocket to send operation to plugin
                if (!args.text || !args.position) {
                    const errorMsg = {
                        jsonrpc: "2.0",
                        id: rpc.id,
                        error: {
                            code: -32602,
                            message: "Invalid params",
                            data: "Missing text or position parameters"
                        }
                    };
                    sseRes.write(`event: message\n`);
                    sseRes.write(`data: ${JSON.stringify(errorMsg)}\n\n`);
                    return;
                }
                
                sendOperationToPlugin({
                    type: 'create-text',
                    text: args.text,
                    position: args.position,
                    fontSize: args.fontSize || 24,
                    color: args.color || { r: 0, g: 0, b: 0 },
                    fontFamily: args.fontFamily || "Inter",
                    resizeMode: args.resizeMode || "AUTO_WIDTH"
                });
                
                const callMsg = {
                    jsonrpc: "2.0",
                    id: rpc.id,
                    result: {
                        content: [
                            {
                                type: "text",
                                text: "Text creation operation sent to plugin"
                            }
                        ]
                    }
                };
                sseRes.write(`event: message\n`);
                sseRes.write(`data: ${JSON.stringify(callMsg)}\n\n`);
                console.log("[MCP] SSE => event: message => figma.createText success");
            }
            else if (toolName === "figma.createPage") {
                // Use WebSocket to send operation to plugin
                if (!args.pageName || !args.description) {
                    const errorMsg = {
                        jsonrpc: "2.0",
                        id: rpc.id,
                        error: {
                            code: -32602,
                            message: "Invalid params",
                            data: "Missing pageName or description parameters"
                        }
                    };
                    sseRes.write(`event: message\n`);
                    sseRes.write(`data: ${JSON.stringify(errorMsg)}\n\n`);
                    return;
                }
                
                sendOperationToPlugin({
                    type: 'create-page',
                    pageName: args.pageName,
                    description: args.description,
                    styleGuide: args.styleGuide || {}
                });
                
                const callMsg = {
                    jsonrpc: "2.0",
                    id: rpc.id,
                    result: {
                        content: [
                            {
                                type: "text",
                                text: "Page creation operation sent to plugin"
                            }
                        ]
                    }
                };
                sseRes.write(`event: message\n`);
                sseRes.write(`data: ${JSON.stringify(callMsg)}\n\n`);
                console.log("[MCP] SSE => event: message => figma.createPage success");
            }
            // New tool handlers
            else if (toolName === "figma.selectNode") {
                if (!args.nodeId) {
                    const errorMsg = {
                        jsonrpc: "2.0",
                        id: rpc.id,
                        error: {
                            code: -32602,
                            message: "Invalid params",
                            data: "Missing nodeId parameter. Please first use figma.listNodes to get available node IDs."
                        }
                    };
                    sseRes.write(`event: message\n`);
                    sseRes.write(`data: ${JSON.stringify(errorMsg)}\n\n`);
                    return;
                }
                
                // Send operation to plugin
                sendOperationToPlugin({
                    type: 'select-node',
                    nodeId: args.nodeId
                });
                
                // Set up a timeout to handle the response
                const timeout = setTimeout(() => {
                    const timeoutMsg = {
                        jsonrpc: "2.0",
                        id: rpc.id,
                        error: {
                            code: -32603,
                            message: "Operation timeout",
                            data: "Node selection operation timed out. Try using figma.listNodes first to get valid node IDs."
                        }
                    };
                    sseRes.write(`event: message\n`);
                    sseRes.write(`data: ${JSON.stringify(timeoutMsg)}\n\n`);
                }, 5000); // 5 second timeout
                
                // Listen for operation completion or error
                const handlePluginResponse = (message) => {
                    try {
                        const data = JSON.parse(message);
                        if (data.type === 'operation-completed' && data.originalOperation === 'select-node') {
                            clearTimeout(timeout);
                            const callMsg = {
                                jsonrpc: "2.0",
                                id: rpc.id,
                                result: {
                                    content: [
                                        {
                                            type: "text",
                                            text: `Successfully selected node: ${args.nodeId}`
                                        }
                                    ]
                                }
                            };
                            sseRes.write(`event: message\n`);
                            sseRes.write(`data: ${JSON.stringify(callMsg)}\n\n`);
                            console.log("[MCP] SSE => event: message => figma.selectNode success");
                        } else if (data.type === 'operation-error' && data.originalOperation === 'select-node') {
                            clearTimeout(timeout);
                            
                            // Format a more helpful error message with guidance
                            let helpfulMessage = data.error;
                            if (data.error && data.error.includes("not found")) {
                                helpfulMessage = `${data.error}\n\nPlease try these steps:\n1. Use figma.listNodes to get valid node IDs\n2. Make sure you're on the correct page in Figma\n3. Try using one of the available node IDs from the list`;
                            }
                            
                            const errorMsg = {
                                jsonrpc: "2.0",
                                id: rpc.id,
                                error: {
                                    code: -32603,
                                    message: "Operation failed",
                                    data: helpfulMessage
                                }
                            };
                            sseRes.write(`event: message\n`);
                            sseRes.write(`data: ${JSON.stringify(errorMsg)}\n\n`);
                            console.log("[MCP] SSE => event: message => figma.selectNode error:", data.error);
                        }
                    } catch (error) {
                        console.error('Error handling plugin response:', error);
                    }
                };
                
                // Add one-time listener for the next plugin response
                const ws = Array.from(figmaClients.values())[0];
                if (ws) {
                    ws.once('message', handlePluginResponse);
            } else {
                    clearTimeout(timeout);
                    const noConnectionMsg = {
                        jsonrpc: "2.0",
                        id: rpc.id,
                        error: {
                            code: -32603,
                            message: "No Figma connection",
                            data: "No Figma plugin connection available. Make sure the Figma plugin is running and connected."
                        }
                    };
                    sseRes.write(`event: message\n`);
                    sseRes.write(`data: ${JSON.stringify(noConnectionMsg)}\n\n`);
                }
            }
            else if (toolName === "figma.changeColor") {
                if (!args.color) {
                    const errorMsg = {
                        jsonrpc: "2.0",
                        id: rpc.id,
                        error: {
                            code: -32602,
                            message: "Invalid params",
                            data: "Missing color parameter"
                        }
                    };
                    sseRes.write(`event: message\n`);
                    sseRes.write(`data: ${JSON.stringify(errorMsg)}\n\n`);
                    return;
                }
                
                sendOperationToPlugin({
                    type: 'change-color',
                    color: args.color,
                    nodeId: args.nodeId || null
                });
                
                const callMsg = {
                    jsonrpc: "2.0",
                    id: rpc.id,
                    result: {
                        content: [
                            {
                                type: "text",
                                text: `Color change operation sent to plugin`
                            }
                        ]
                    }
                };
                sseRes.write(`event: message\n`);
                sseRes.write(`data: ${JSON.stringify(callMsg)}\n\n`);
                console.log("[MCP] SSE => event: message => figma.changeColor success");
            }
            else if (toolName === "figma.changeRadius") {
                if (args.radius === undefined) {
                    const errorMsg = {
                        jsonrpc: "2.0",
                        id: rpc.id,
                        error: {
                            code: -32602,
                            message: "Invalid params",
                            data: "Missing radius parameter"
                        }
                    };
                    sseRes.write(`event: message\n`);
                    sseRes.write(`data: ${JSON.stringify(errorMsg)}\n\n`);
                    return;
                }
                
                sendOperationToPlugin({
                    type: 'change-radius',
                    radius: args.radius,
                    nodeId: args.nodeId || null
                });
                
                const callMsg = {
                    jsonrpc: "2.0",
                    id: rpc.id,
                    result: {
                        content: [
                            {
                                type: "text",
                                text: `Corner radius change operation sent to plugin`
                            }
                        ]
                    }
                };
                sseRes.write(`event: message\n`);
                sseRes.write(`data: ${JSON.stringify(callMsg)}\n\n`);
                console.log("[MCP] SSE => event: message => figma.changeRadius success");
            }
            else if (toolName === "figma.changeTypeface") {
                if (!args.fontFamily) {
                    const errorMsg = {
                        jsonrpc: "2.0",
                        id: rpc.id,
                        error: {
                            code: -32602,
                            message: "Invalid params",
                            data: "Missing fontFamily parameter"
                        }
                    };
                    sseRes.write(`event: message\n`);
                    sseRes.write(`data: ${JSON.stringify(errorMsg)}\n\n`);
                    return;
                }
                
                sendOperationToPlugin({
                    type: 'change-typeface',
                    fontFamily: args.fontFamily,
                    nodeId: args.nodeId || null
                });
                
                const callMsg = {
                    jsonrpc: "2.0",
                    id: rpc.id,
                    result: {
                        content: [
                            {
                                type: "text",
                                text: `Typeface change operation sent to plugin`
                            }
                        ]
                    }
                };
                sseRes.write(`event: message\n`);
                sseRes.write(`data: ${JSON.stringify(callMsg)}\n\n`);
                console.log("[MCP] SSE => event: message => figma.changeTypeface success");
            }
            else if (toolName === "figma.changeFontStyle") {
                if (!args.fontSize && !args.fontWeight && args.italic === undefined) {
                    const errorMsg = {
                        jsonrpc: "2.0",
                        id: rpc.id,
                        error: {
                            code: -32602,
                            message: "Invalid params",
                            data: "At least one of fontSize, fontWeight, or italic must be provided"
                        }
                    };
                    sseRes.write(`event: message\n`);
                    sseRes.write(`data: ${JSON.stringify(errorMsg)}\n\n`);
                    return;
                }
                
                sendOperationToPlugin({
                    type: 'change-font-style',
                    fontSize: args.fontSize,
                    fontWeight: args.fontWeight,
                    italic: args.italic,
                    nodeId: args.nodeId || null
                });
                
                const callMsg = {
                    jsonrpc: "2.0",
                    id: rpc.id,
                    result: {
                        content: [
                            {
                                type: "text",
                                text: `Font style change operation sent to plugin`
                            }
                        ]
                    }
                };
                sseRes.write(`event: message\n`);
                sseRes.write(`data: ${JSON.stringify(callMsg)}\n\n`);
                console.log("[MCP] SSE => event: message => figma.changeFontStyle success");
            }
            else if (toolName === "figma.changeAlignment") {
                if (!args.horizontal && !args.vertical) {
                    const errorMsg = {
                        jsonrpc: "2.0",
                        id: rpc.id,
                        error: {
                            code: -32602,
                            message: "Invalid params",
                            data: "At least one of horizontal or vertical alignment must be provided"
                        }
                    };
                    sseRes.write(`event: message\n`);
                    sseRes.write(`data: ${JSON.stringify(errorMsg)}\n\n`);
                    return;
                }
                
                sendOperationToPlugin({
                    type: 'change-alignment',
                    horizontal: args.horizontal,
                    vertical: args.vertical,
                    nodeId: args.nodeId || null
                });
                
                const callMsg = {
                    jsonrpc: "2.0",
                    id: rpc.id,
                    result: {
                        content: [
                            {
                                type: "text",
                                text: `Alignment change operation sent to plugin`
                            }
                        ]
                    }
                };
                sseRes.write(`event: message\n`);
                sseRes.write(`data: ${JSON.stringify(callMsg)}\n\n`);
                console.log("[MCP] SSE => event: message => figma.changeAlignment success");
            }
            else if (toolName === "figma.changeSpacing") {
                if (!args.padding && args.itemSpacing === undefined) {
                    const errorMsg = {
                        jsonrpc: "2.0",
                        id: rpc.id,
                        error: {
                            code: -32602,
                            message: "Invalid params",
                            data: "At least one of padding or itemSpacing must be provided"
                        }
                    };
                    sseRes.write(`event: message\n`);
                    sseRes.write(`data: ${JSON.stringify(errorMsg)}\n\n`);
                    return;
                }
                
                sendOperationToPlugin({
                    type: 'change-spacing',
                    padding: args.padding,
                    itemSpacing: args.itemSpacing,
                    nodeId: args.nodeId || null
                });
                
                const callMsg = {
                    jsonrpc: "2.0",
                    id: rpc.id,
                    result: {
                        content: [
                            {
                                type: "text",
                                text: `Spacing change operation sent to plugin`
                            }
                        ]
                    }
                };
                sseRes.write(`event: message\n`);
                sseRes.write(`data: ${JSON.stringify(callMsg)}\n\n`);
                console.log("[MCP] SSE => event: message => figma.changeSpacing success");
            }
            else if (toolName === "figma.listFonts") {
                // Send operation to plugin to get available fonts
                sendOperationToPlugin({
                    type: 'list-fonts'
                });
                
                // Define a set of common fonts available in Figma as a fallback
                const commonFonts = [
                    "Inter", "Roboto", "SF Pro", "Helvetica Neue", "Arial", 
                    "Georgia", "Times New Roman", "Courier New", "Comic Sans MS", 
                    "Open Sans", "Montserrat", "Lato", "Poppins", "Playfair Display", 
                    "Nunito", "Work Sans", "Source Sans Pro", "IBM Plex Sans", "Roboto Mono"
                ];
                
                const callMsg = {
                    jsonrpc: "2.0",
                    id: rpc.id,
                    result: {
                        content: [
                            {
                                type: "text",
                                text: `Font families available in Figma: ${JSON.stringify(commonFonts)}`
                            }
                        ],
                        fonts: commonFonts
                    }
                };
                sseRes.write(`event: message\n`);
                sseRes.write(`data: ${JSON.stringify(callMsg)}\n\n`);
                console.log("[MCP] SSE => event: message => figma.listFonts success");
            }
            else if (toolName === "figma.listNodes") {
                // Send operation to plugin to get available nodes
                sendOperationToPlugin({
                    type: 'list-nodes',
                    includeDetails: args.includeDetails || false
                });
                
                // Set up a timeout to handle the response
                const timeout = setTimeout(() => {
                    const timeoutMsg = {
                        jsonrpc: "2.0",
                        id: rpc.id,
                        error: {
                            code: -32603,
                            message: "Operation timeout",
                            data: "Node listing operation timed out"
                        }
                    };
                    sseRes.write(`event: message\n`);
                    sseRes.write(`data: ${JSON.stringify(timeoutMsg)}\n\n`);
                }, 5000); // 5 second timeout
                
                // Listen for operation completion or error
                const handlePluginResponse = (message) => {
                    try {
                        const data = JSON.parse(message);
                        if (data.type === 'nodes-list') {
                            clearTimeout(timeout);
                            const callMsg = {
                                jsonrpc: "2.0",
                                id: rpc.id,
                                result: {
                                    content: [
                                        {
                                            type: "text",
                                            text: `Available nodes in the current page: ${JSON.stringify(data.nodes, null, 2)}`
                                        }
                                    ],
                                    nodes: data.nodes
                                }
                            };
                            sseRes.write(`event: message\n`);
                            sseRes.write(`data: ${JSON.stringify(callMsg)}\n\n`);
                            console.log("[MCP] SSE => event: message => figma.listNodes success");
                        } else if (data.type === 'operation-error' && data.originalOperation === 'list-nodes') {
                            clearTimeout(timeout);
                            const errorMsg = {
                                jsonrpc: "2.0",
                                id: rpc.id,
                                error: {
                                    code: -32603,
                                    message: "Operation failed",
                                    data: data.error
                                }
                            };
                            sseRes.write(`event: message\n`);
                            sseRes.write(`data: ${JSON.stringify(errorMsg)}\n\n`);
                            console.log("[MCP] SSE => event: message => figma.listNodes error:", data.error);
                        }
                    } catch (error) {
                        console.error('Error handling plugin response:', error);
                    }
                };
                
                // Add one-time listener for the next plugin response
                const ws = Array.from(figmaClients.values())[0];
                if (ws) {
                    ws.once('message', handlePluginResponse);
                } else {
                    const errorMsg = {
                        jsonrpc: "2.0",
                        id: rpc.id,
                        error: {
                            code: -32603,
                            message: "No Figma plugin connected",
                            data: "Cannot list nodes because no Figma plugin is connected"
                        }
                    };
                    sseRes.write(`event: message\n`);
                    sseRes.write(`data: ${JSON.stringify(errorMsg)}\n\n`);
                    console.log("[MCP] SSE => event: message => figma.listNodes error: No plugin connected");
                    clearTimeout(timeout);
                }
            }
            else if (toolName === "figma.changeTextResize") {
                if (!args.resizeMode) {
                    const errorMsg = {
                        jsonrpc: "2.0",
                        id: rpc.id,
                        error: {
                            code: -32602,
                            message: "Invalid params",
                            data: "Missing resizeMode parameter"
                        }
                    };
                    sseRes.write(`event: message\n`);
                    sseRes.write(`data: ${JSON.stringify(errorMsg)}\n\n`);
                    return;
                }
                
                sendOperationToPlugin({
                    type: 'change-text-resize',
                    resizeMode: args.resizeMode,
                    width: args.width,
                    height: args.height,
                    nodeId: args.nodeId || null
                });
                
                const callMsg = {
                    jsonrpc: "2.0",
                    id: rpc.id,
                    result: {
                        content: [
                            {
                                type: "text",
                                text: `Text resize mode changed to ${args.resizeMode}`
                            }
                        ]
                    }
                };
                sseRes.write(`event: message\n`);
                sseRes.write(`data: ${JSON.stringify(callMsg)}\n\n`);
                console.log("[MCP] SSE => event: message => figma.changeTextResize success");
            }
            else if (toolName === "figma.deleteNode") {
                // Send operation to plugin
                sendOperationToPlugin({
                    type: 'delete-node',
                    nodeId: args.nodeId || null
                });
                
                // Set up a timeout to handle the response
                const timeout = setTimeout(() => {
                    const timeoutMsg = {
                        jsonrpc: "2.0",
                        id: rpc.id,
                        error: {
                            code: -32603,
                            message: "Operation timeout",
                            data: "Delete node operation timed out. The plugin might be disconnected."
                        }
                    };
                    sseRes.write(`event: message\n`);
                    sseRes.write(`data: ${JSON.stringify(timeoutMsg)}\n\n`);
                }, 5000); // 5 second timeout
                
                // Listen for operation completion or error
                const handlePluginResponse = (message) => {
                    try {
                        const data = JSON.parse(message);
                        if (data.type === 'operation-completed' && data.originalOperation === 'delete-node') {
                            clearTimeout(timeout);
                            const callMsg = {
                                jsonrpc: "2.0",
                                id: rpc.id,
                                result: {
                                    content: [
                                        {
                                            type: "text",
                                            text: `Successfully deleted ${args.nodeId ? `node: ${args.nodeId}` : 'selected nodes'}`
                                        }
                                    ]
                                }
                            };
                            sseRes.write(`event: message\n`);
                            sseRes.write(`data: ${JSON.stringify(callMsg)}\n\n`);
                            console.log("[MCP] SSE => event: message => figma.deleteNode success");
                        } else if (data.type === 'nodes-deleted') {
                            clearTimeout(timeout);
                            const callMsg = {
                                jsonrpc: "2.0",
                                id: rpc.id,
                                result: {
                                    content: [
                                        {
                                            type: "text",
                                            text: `Successfully deleted ${data.count} node(s): ${data.nodeIds.join(', ')}`
                                        }
                                    ]
                                }
                            };
                            sseRes.write(`event: message\n`);
                            sseRes.write(`data: ${JSON.stringify(callMsg)}\n\n`);
                            console.log("[MCP] SSE => event: message => figma.deleteNode success");
                        } else if (data.type === 'operation-error' && data.originalOperation === 'delete-node') {
                            clearTimeout(timeout);
                            const errorMsg = {
                                jsonrpc: "2.0",
                                id: rpc.id,
                                error: {
                                    code: -32603,
                                    message: "Operation failed",
                                    data: data.error || "Failed to delete node(s)"
                                }
                            };
                            sseRes.write(`event: message\n`);
                            sseRes.write(`data: ${JSON.stringify(errorMsg)}\n\n`);
                            console.log("[MCP] SSE => event: message => figma.deleteNode error:", data.error);
                        }
                    } catch (error) {
                        console.error('Error handling plugin response:', error);
                    }
                };
                
                // Add one-time listener for the next plugin response
                const ws = Array.from(figmaClients.values())[0];
                if (ws) {
                    ws.once('message', handlePluginResponse);
                } else {
                    clearTimeout(timeout);
                    const noConnectionMsg = {
                        jsonrpc: "2.0",
                        id: rpc.id,
                        error: {
                            code: -32603,
                            message: "No Figma connection",
                            data: "No Figma plugin connection available. Make sure the Figma plugin is running and connected."
                        }
                    };
                    sseRes.write(`event: message\n`);
                    sseRes.write(`data: ${JSON.stringify(noConnectionMsg)}\n\n`);
                }
            }
            else if (toolName === "figma.moveNode") {
                // Use WebSocket to send operation to plugin
                if (!args.position) {
                    const errorMsg = {
                        jsonrpc: "2.0",
                        id: rpc.id,
                        error: {
                            code: -32602,
                            message: "Invalid params",
                            data: "Missing position parameter"
                        }
                    };
                    sseRes.write(`event: message\n`);
                    sseRes.write(`data: ${JSON.stringify(errorMsg)}\n\n`);
                    return;
                }
                
                // Create a timeout to handle possible failures
                const timeout = setTimeout(() => {
                    const errorMsg = {
                        jsonrpc: "2.0",
                        id: rpc.id,
                        error: {
                            code: -32603,
                            message: "Operation timeout",
                            data: "The operation timed out. The plugin might be disconnected."
                        }
                    };
                    sseRes.write(`event: message\n`);
                    sseRes.write(`data: ${JSON.stringify(errorMsg)}\n\n`);
                }, 5000);
                
                // Set up message listener for operation completion or error
                const handleMovedNodes = (clientId, ws, message) => {
                    try {
                        const data = JSON.parse(message.toString());
                        
                        if (data.type === 'nodes-moved') {
                            clearTimeout(timeout);
                            
                            const callMsg = {
                                jsonrpc: "2.0",
                                id: rpc.id,
                                result: {
                                    content: [
                                        {
                                            type: "text",
                                            text: `Moved ${data.count} node(s) to position (${args.position.x}, ${args.position.y})`
                                        }
                                    ]
                                }
                            };
                            sseRes.write(`event: message\n`);
                            sseRes.write(`data: ${JSON.stringify(callMsg)}\n\n`);
                            ws.removeListener('message', handleMovedNodes.bind(null, clientId, ws));
                        } 
                        else if (data.type === 'operation-error' && data.originalOperation === 'move-node') {
                            clearTimeout(timeout);
                            
                            const errorMsg = {
                                jsonrpc: "2.0",
                                id: rpc.id,
                                error: {
                                    code: -32603,
                                    message: "Operation error",
                                    data: data.error
                                }
                            };
                            sseRes.write(`event: message\n`);
                            sseRes.write(`data: ${JSON.stringify(errorMsg)}\n\n`);
                            ws.removeListener('message', handleMovedNodes.bind(null, clientId, ws));
                        }
                        else if (data.type === 'operation-completed' && data.originalOperation === 'move-node') {
                            clearTimeout(timeout);
                            
                            const callMsg = {
                                jsonrpc: "2.0",
                                id: rpc.id,
                                result: {
                                    content: [
                                        {
                                            type: "text",
                                            text: `Successfully moved node(s) to position (${args.position.x}, ${args.position.y})`
                                        }
                                    ]
                                }
                            };
                            sseRes.write(`event: message\n`);
                            sseRes.write(`data: ${JSON.stringify(callMsg)}\n\n`);
                            ws.removeListener('message', handleMovedNodes.bind(null, clientId, ws));
                        }
                    } catch (error) {
                        console.error(`Error parsing WebSocket message:`, error);
                    }
                };
                
                // Add temporary message handler for each client
                for (const [clientId, ws] of figmaClients.entries()) {
                    ws.on('message', handleMovedNodes.bind(null, clientId, ws));
                }
                
                sendOperationToPlugin({
                    type: 'move-node',
                    position: args.position,
                    nodeId: args.nodeId
                });
                
                // We don't send a response here as it will be sent by the message handler
            }
            else if (toolName === "figma.createIcon") {
                // Use WebSocket to send operation to plugin
                if (!args.iconName || !args.position) {
                    const errorMsg = {
                        jsonrpc: "2.0",
                        id: rpc.id,
                        error: {
                            code: -32602,
                            message: "Invalid params",
                            data: "Missing iconName or position parameters"
                        }
                    };
                    sseRes.write(`event: message\n`);
                    sseRes.write(`data: ${JSON.stringify(errorMsg)}\n\n`);
                    return;
                }
                
                let iconNameToUse = args.iconName;
                let svgDataToSend = LUCIDE_ICONS[iconNameToUse];
                let fallbackUsed = false;

                // Check if the icon exists, use fallback if not
                if (!svgDataToSend) {
                    console.warn(`Icon '${args.iconName}' not found in Lucide icon set. Falling back to 'square-x'.`);
                    iconNameToUse = 'square-x';
                    svgDataToSend = LUCIDE_ICONS[iconNameToUse]; // Get fallback SVG
                    fallbackUsed = true;

                    // Ensure fallback icon exists
                    if (!svgDataToSend) {
                         const errorMsg = {
                            jsonrpc: "2.0",
                            id: rpc.id,
                            error: {
                                code: -32603,
                                message: "Internal Server Error",
                                data: "Fallback icon 'square-x' is missing from the server configuration."
                            }
                        };
                        sseRes.write(`event: message\n`);
                        sseRes.write(`data: ${JSON.stringify(errorMsg)}\n\n`);
                        return;
                    }
                }
                
                // Create a timeout to handle possible failures
                const timeout = setTimeout(() => {
                    const errorMsg = {
                        jsonrpc: "2.0",
                        id: rpc.id,
                        error: {
                            code: -32603,
                            message: "Operation timeout",
                            data: "The operation timed out. The plugin might be disconnected."
                        }
                    };
                    sseRes.write(`event: message\n`);
                    sseRes.write(`data: ${JSON.stringify(errorMsg)}\n\n`);
                    // Ensure the listener is removed on timeout
                    for (const [clientId, ws] of figmaClients.entries()) {
                        ws.removeListener('message', handleIconCreation.bind(null, clientId, ws));
                    }
                }, 5000);
                
                // Set up message listener for operation completion or error
                const handleIconCreation = (clientId, ws, message) => {
                    try {
                        const data = JSON.parse(message.toString());
                        
                        if (data.type === 'operation-completed' && data.originalOperation === 'create-icon') {
                            clearTimeout(timeout);
                            
                            let successText = `Successfully created '${iconNameToUse}' icon (ID: ${data.data?.nodeId || 'unknown'})`;
                            if (fallbackUsed) {
                                successText = `Icon '${args.iconName}' not found. Created fallback '${iconNameToUse}' icon instead (ID: ${data.data?.nodeId || 'unknown'})`;
                            }
                            
                            const callMsg = {
                                jsonrpc: "2.0",
                                id: rpc.id,
                                result: {
                                    content: [
                                        {
                                            type: "text",
                                            text: successText
                                        }
                                    ]
                                }
                            };
                            sseRes.write(`event: message\n`);
                            sseRes.write(`data: ${JSON.stringify(callMsg)}\n\n`);
                            ws.removeListener('message', handleIconCreation.bind(null, clientId, ws));
                        } 
                        else if (data.type === 'operation-error' && data.originalOperation === 'create-icon') {
                            clearTimeout(timeout);
                            
                            const errorMsg = {
                                jsonrpc: "2.0",
                                id: rpc.id,
                                error: {
                                    code: -32603,
                                    message: "Operation error creating icon",
                                    data: data.error
                                }
                            };
                            sseRes.write(`event: message\n`);
                            sseRes.write(`data: ${JSON.stringify(errorMsg)}\n\n`);
                            ws.removeListener('message', handleIconCreation.bind(null, clientId, ws));
                        }
                    } catch (error) {
                        console.error(`Error parsing WebSocket message during icon creation:`, error);
                         // Clear timeout and remove listener in case of parsing error
                         clearTimeout(timeout);
                         ws.removeListener('message', handleIconCreation.bind(null, clientId, ws));
                    }
                };
                
                // Add temporary message handler for each client
                for (const [clientId, ws] of figmaClients.entries()) {
                    ws.on('message', handleIconCreation.bind(null, clientId, ws));
                }
                
                // Send the operation to the plugin with the potentially modified icon name and SVG data
                sendOperationToPlugin({
                    type: 'create-icon',
                    iconName: iconNameToUse, // Use potentially fallback name
                    svgData: svgDataToSend, // Use potentially fallback SVG
                    position: args.position,
                    size: args.size, // Pass through optional args
                    color: args.color,
                    strokeWidth: args.strokeWidth
                });
                
                // We don't send a response here as it will be sent by the message handler
            }
            else if (toolName === "figma.createBorderBox") {
                // Use WebSocket to send operation to plugin
                if (!args.position || !args.size || !args.options) {
                    const errorMsg = {
                        jsonrpc: "2.0",
                        id: rpc.id,
                        error: {
                            code: -32602,
                            message: "Invalid params",
                            data: "Missing position, size, or options parameters"
                        }
                    };
                    sseRes.write(`event: message\n`);
                    sseRes.write(`data: ${JSON.stringify(errorMsg)}\n\n`);
                    return;
                }
                
                // Create a timeout to handle possible failures
                const timeout = setTimeout(() => {
                    const errorMsg = {
                        jsonrpc: "2.0",
                        id: rpc.id,
                        error: {
                            code: -32603,
                            message: "Operation timeout",
                            data: "The operation timed out. The plugin might be disconnected."
                        }
                    };
                    sseRes.write(`event: message\n`);
                    sseRes.write(`data: ${JSON.stringify(errorMsg)}\n\n`);
                }, 5000);
                
                // Set up message listener for operation completion or error
                const handleBorderBoxCreation = (clientId, ws, message) => {
                    try {
                        const data = JSON.parse(message.toString());
                        
                        if (data.type === 'operation-completed' && data.originalOperation === 'create-border-box') {
                            clearTimeout(timeout);
                            
                            const callMsg = {
                                jsonrpc: "2.0",
                                id: rpc.id,
                                result: {
                                    content: [
                                        {
                                            type: "text",
                                            text: `Successfully created border box (ID: ${data.data?.nodeId || 'unknown'})`
                                        }
                                    ]
                                }
                            };
                            sseRes.write(`event: message\n`);
                            sseRes.write(`data: ${JSON.stringify(callMsg)}\n\n`);
                            ws.removeListener('message', handleBorderBoxCreation.bind(null, clientId, ws));
                        } 
                        else if (data.type === 'operation-error' && data.originalOperation === 'create-border-box') {
                            clearTimeout(timeout);
                            
                            const errorMsg = {
                                jsonrpc: "2.0",
                                id: rpc.id,
                                error: {
                                    code: -32603,
                                    message: "Operation error",
                                    data: data.error
                                }
                            };
                            sseRes.write(`event: message\n`);
                            sseRes.write(`data: ${JSON.stringify(errorMsg)}\n\n`);
                            ws.removeListener('message', handleBorderBoxCreation.bind(null, clientId, ws));
                        }
                    } catch (error) {
                        console.error(`Error parsing WebSocket message:`, error);
                    }
                };
                
                // Add temporary message handler for each client
                for (const [clientId, ws] of figmaClients.entries()) {
                    ws.on('message', handleBorderBoxCreation.bind(null, clientId, ws));
                }
                
                // Send the operation to the plugin with the styling options
                sendOperationToPlugin({
                    type: 'create-border-box',
                    position: args.position,
                    size: args.size,
                    options: args.options
                });
                
                // We don't send a response here as it will be sent by the message handler
            }
            else if (toolName === "figma.drawLine") {
                // Use WebSocket to send operation to plugin
                if (!args.start || !args.end) {
                    const errorMsg = {
                        jsonrpc: "2.0",
                        id: rpc.id,
                        error: {
                            code: -32602,
                            message: "Invalid params",
                            data: "Missing start or end parameters"
                        }
                    };
                    sseRes.write(`event: message\n`);
                    sseRes.write(`data: ${JSON.stringify(errorMsg)}\n\n`);
                    return;
                }
                
                // Create a timeout to handle possible failures
                const timeout = setTimeout(() => {
                    const errorMsg = {
                        jsonrpc: "2.0",
                        id: rpc.id,
                        error: {
                            code: -32603,
                            message: "Operation timeout",
                            data: "The operation timed out. The plugin might be disconnected."
                        }
                    };
                    sseRes.write(`event: message\n`);
                    sseRes.write(`data: ${JSON.stringify(errorMsg)}\n\n`);
                    // Ensure the listener is removed on timeout
                    for (const [clientId, ws] of figmaClients.entries()) {
                        ws.removeListener('message', handleLineDrawing.bind(null, clientId, ws));
                    }
                }, 5000); // 5 second timeout
                
                // Set up message listener for operation completion or error
                const handleLineDrawing = (clientId, ws, message) => {
                    try {
                        const data = JSON.parse(message.toString());
                        
                        if (data.type === 'operation-completed' && data.originalOperation === 'draw-line') {
                            clearTimeout(timeout);
                            
                            const callMsg = {
                                jsonrpc: "2.0",
                                id: rpc.id,
                                result: {
                                    content: [
                                        {
                                            type: "text",
                                            text: `Successfully drew line (ID: ${data.data?.nodeId || 'unknown'}) from (${args.start.x}, ${args.start.y}) to (${args.end.x}, ${args.end.y})`
                                        }
                                    ]
                                }
                            };
                            sseRes.write(`event: message\n`);
                            sseRes.write(`data: ${JSON.stringify(callMsg)}\n\n`);
                            ws.removeListener('message', handleLineDrawing.bind(null, clientId, ws));
                        } 
                        else if (data.type === 'operation-error' && data.originalOperation === 'draw-line') {
                            clearTimeout(timeout);
                            
                            const errorMsg = {
                                jsonrpc: "2.0",
                                id: rpc.id,
                                error: {
                                    code: -32603,
                                    message: "Operation error drawing line",
                                    data: data.error
                                }
                            };
                            sseRes.write(`event: message\n`);
                            sseRes.write(`data: ${JSON.stringify(errorMsg)}\n\n`);
                            ws.removeListener('message', handleLineDrawing.bind(null, clientId, ws));
                        }
                    } catch (error) {
                        console.error(`Error parsing WebSocket message during line drawing:`, error);
                         // Clear timeout and remove listener in case of parsing error
                         clearTimeout(timeout);
                         ws.removeListener('message', handleLineDrawing.bind(null, clientId, ws));
                    }
                };
                
                // Add temporary message handler for each client
                for (const [clientId, ws] of figmaClients.entries()) {
                    ws.on('message', handleLineDrawing.bind(null, clientId, ws));
                }
                
                // Send the operation to the plugin
                sendOperationToPlugin({
                    type: 'draw-line',
                    start: args.start,
                    end: args.end,
                    color: args.color, // Pass color directly, plugin handles default
                    thickness: args.thickness // Pass thickness directly, plugin handles default
                });
                
                // We don't send a response here as it will be sent by the message handler
            }
            else {
                // Unknown tool
                const errorMsg = {
                    jsonrpc: "2.0",
                    id: rpc.id,
                    error: {
                        code: -32601,
                        message: "Method not found",
                        data: `Tool '${toolName}' not implemented`
                    }
                };
                sseRes.write(`event: message\n`);
                sseRes.write(`data: ${JSON.stringify(errorMsg)}\n\n`);
            }
            return;
        }

        // -- notifications/initialized
        case "notifications/initialized": {
            console.log("[MCP] notifications/initialized => sessionId=", sessionId);
            // done, no SSE needed
            return;
        }

        default: {
            console.log("[MCP] unknown method =>", rpc.method);
            const errObj = {
                jsonrpc: "2.0",
                id: rpc.id,
                error: {
                    code: -32601,
                    message: `Method '${rpc.method}' not recognized`
                }
            };
            sseRes.write(`event: message\n`);
            sseRes.write(`data: ${JSON.stringify(errObj)}\n\n`);
            return;
        }
    }
});

// Start the server
app.listen(port, () => {
    console.log(`[MCP] final server with tools/call at http://localhost:${port}`);
    console.log("GET  /sse-cursor => SSE => endpoint => /message?sessionId=...");
    console.log("POST /message?sessionId=... => initialize => SSE => capabilities, tools/list => SSE => Tools, tools/call => SSE => sum, etc.");
    console.log("Starting Figma MCP Server...");
});

// Handle server shutdown
process.on('SIGINT', () => {
    console.log('Shutting down server...');
    
    // Close all SSE connections
    for (const [sessionId, session] of sessions.entries()) {
        sessions.delete(sessionId);
        console.log(`Closed SSE connection: ${sessionId}`);
    }
    
    // Close the WebSocket server
    wss.close();
    
    process.exit(0);
});