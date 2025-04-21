// This code runs in the Figma environment
// Reference the Figma Plugin API types
/// <reference types="@figma/plugin-typings" />

// Constants
const DEFAULT_FONT = "Inter";
const WEBSOCKET_SERVER_URL = "ws://localhost:8080";

// Show UI window for WebSocket communication
figma.showUI(__html__, { width: 400, height: 600 });

// WebSocket connection is managed in the UI thread
figma.ui.postMessage({ type: 'connect-to-server', serverUrl: WEBSOCKET_SERVER_URL });

// Define LLM service interfaces
interface OpenAICompletionRequest {
  model: string;
  messages: Array<{
    role: string;
    content: string | Array<{
      type: string;
      text?: string;
      image_url?: string;
    }>;
  }>;
  temperature?: number;
  max_tokens?: number;
}

interface ClaudeCompletionRequest {
  model: string;
  messages: Array<{
    role: string;
    content: Array<{
      type: string;
      text?: string;
      source?: {
        type: string;
        media_type: string;
        data: string;
      };
    }>;
  }>;
  temperature?: number;
  max_tokens?: number;
}

interface GeminiCompletionRequest {
  contents: Array<{
    role: string;
    parts: Array<{
      text?: string;
      inline_data?: {
        mime_type: string;
        data: string;
      };
    }>;
  }>;
  generationConfig?: {
    temperature?: number;
    maxOutputTokens?: number;
  };
}

// Define a variable to track if retries should be cancelled
let shouldCancelRetries = false;
// Server URL for API proxy - will be set from UI
let serverBaseUrl = 'http://localhost:3000';

// Handle messages from the UI thread
figma.ui.onmessage = async (msg) => {
  console.log('Received message in plugin:', msg);

  try {
    // Handle different operation types
    switch (msg.type) {
      case 'cancel-retries':
        shouldCancelRetries = true;
        figma.ui.postMessage({ 
          type: 'log-message', 
          message: 'Retry cancellation request received',
          messageType: 'info'
        });
        break;
        
      case 'set-server-url':
        serverBaseUrl = msg.serverUrl || 'http://localhost:3000';
        figma.ui.postMessage({ 
          type: 'log-message', 
          message: `Server URL set to: ${serverBaseUrl}`,
          messageType: 'info'
        });
        break;
        
      case 'generate-design-standalone':
        shouldCancelRetries = false; // Reset for new request
        await generateDesignWithLLM(
          msg.llmService, 
          msg.apiKey, 
          msg.prompt, 
          msg.images || []
        );
        break;
        
      case 'create-rectangle':
        await createRectangle(msg.position, msg.size, msg.color);
        break;
        
      case 'create-text': {
        try {
          console.log("Creating text:", msg.text, "at position:", msg.position);
          
          const textId = await createText(
            msg.text, 
            msg.position, 
            msg.fontSize, 
            msg.color, 
            msg.fontFamily || DEFAULT_FONT,
            msg.resizeMode || 'AUTO_WIDTH'
          );
          
          figma.ui.postMessage({ 
            type: 'operation-completed', 
            status: 'success',
            originalOperation: 'create-text',
            data: { nodeId: textId, text: msg.text }
          });
        } catch (error) {
          console.error("Error creating text:", error);
          figma.ui.postMessage({ 
            type: 'operation-error', 
            originalOperation: 'create-text',
            error: error instanceof Error ? error.message : String(error)
          });
        }
        break;
      }
        
      case 'create-page':
        await createPage(msg.pageName, msg.description, msg.styleGuide);
        break;
        
      // New operations
      case 'select-node':
        await selectNode(msg.nodeId);
        break;
        
      case 'change-color':
        await changeColor(msg.color, msg.nodeId);
        break;
        
      case 'change-radius':
        await changeRadius(msg.radius, msg.nodeId);
        break;
        
      case 'change-typeface':
        await changeTypeface(msg.fontFamily, msg.nodeId);
        break;
        
      case 'change-font-style':
        await changeFontStyle(msg.fontSize, msg.fontWeight, msg.italic, msg.nodeId);
        break;
        
      case 'change-alignment':
        await changeAlignment(msg.horizontal, msg.vertical, msg.nodeId);
        break;
        
      case 'change-spacing':
        await changeSpacing(msg.padding, msg.itemSpacing, msg.nodeId);
        break;
        
      case 'list-fonts':
        await listAvailableFonts();
        break;
        
      case 'list-nodes':
        await listAvailableNodes(msg.includeDetails);
        break;
        
      case 'change-text-resize':
        await changeTextResize(msg.resizeMode, msg.width, msg.height, msg.nodeId);
        break;
        
      case 'delete-node':
        await deleteNode(msg.nodeId);
        break;
        
      case 'move-node':
        await moveNode(msg.position, msg.nodeId);
        break;
        
      case 'create-icon': {
        try {
          console.log("Creating icon:", msg.iconName, "at position:", msg.position);
          
          const iconId = await createIcon(
            msg.iconName,
            msg.svgData,
            msg.position,
            msg.size || 24,
            msg.color,
            msg.strokeWidth || 2
          );
          
          figma.ui.postMessage({ 
            type: 'operation-completed', 
            status: 'success',
            originalOperation: 'create-icon',
            data: { nodeId: iconId, iconName: msg.iconName }
          });
          
          // We return here to prevent the generic operation-completed message below
          return;
        } catch (error) {
          console.error("Error creating icon:", error);
          figma.ui.postMessage({ 
            type: 'operation-error', 
            originalOperation: 'create-icon',
            error: error instanceof Error ? error.message : String(error)
          });
          
          // We return here to prevent the generic operation-completed message below
          return;
        }
      }
      
      case 'create-border-box': {
        try {
          console.log("Creating border box:", msg.options?.type, "at position:", msg.position);
          
          const boxId = await createBorderBox(
            msg.position,
            msg.size,
            msg.options
          );
          
          figma.ui.postMessage({ 
            type: 'operation-completed', 
            status: 'success',
            originalOperation: 'create-border-box',
            data: { nodeId: boxId, type: msg.options?.type }
          });
          
          // We return here to prevent the generic operation-completed message below
          return;
        } catch (error) {
          console.error("Error creating border box:", error);
          figma.ui.postMessage({ 
            type: 'operation-error', 
            originalOperation: 'create-border-box',
            error: error instanceof Error ? error.message : String(error)
          });
          
          // We return here to prevent the generic operation-completed message below
          return;
        }
      }
        
      case 'connection-status':
        // Log connection status changes
        console.log(`WebSocket connection status: ${msg.status}`);
        break;
        
      case 'draw-line': {
        try {
          console.log("Drawing line from:", msg.start, "to:", msg.end);
          const lineId = await drawLine(
            msg.start,
            msg.end,
            msg.color,
            msg.thickness || 1
          );
          
          figma.ui.postMessage({ 
            type: 'operation-completed', 
            status: 'success',
            originalOperation: 'draw-line',
            data: { nodeId: lineId }
          });
          
          // Return to prevent generic message
          return;
        } catch (error) {
          console.error("Error drawing line:", error);
          figma.ui.postMessage({ 
            type: 'operation-error', 
            originalOperation: 'draw-line',
            error: error instanceof Error ? error.message : String(error)
          });
          
          // Return to prevent generic message
          return;
        }
      }
        
      default:
        console.log("Unknown message type:", msg.type);
    }
    
    // Send generic operation completion message
    // This is for operations that don't send their own completion messages
    figma.ui.postMessage({ 
      type: 'operation-completed', 
      status: 'success',
      originalOperation: msg.type
    });
    
  } catch (error) {
    console.error("Error handling message:", error);
    
    // Send generic error message
    figma.ui.postMessage({ 
      type: 'operation-error', 
      originalOperation: msg.type,
      error: error instanceof Error ? error.message : String(error)
    });
  }
};

// Generate design with LLM API
async function generateDesignWithLLM(
  llmService: string, 
  apiKey: string, 
  prompt: string, 
  images: Array<{name: string, type: string, data: string}>
): Promise<void> {
  try {
    figma.ui.postMessage({ 
      type: 'log-message', 
      message: `Generating design with ${llmService}...`,
      messageType: 'info'
    });
    
    let response;
    
    // Handle different OpenAI models or other LLM services
    if (llmService.startsWith('openai-')) {
      const modelName = llmService.replace('openai-', '');
      response = await callOpenAI(apiKey, prompt, images, modelName);
    } else if (llmService === 'claude') {
      response = await callClaude(apiKey, prompt, images);
    } else if (llmService === 'gemini') {
      response = await callGemini(apiKey, prompt, images);
    } else {
      throw new Error(`Unsupported LLM service: ${llmService}`);
    }
    
    if (!response) {
      throw new Error('Failed to get response from LLM service');
    }
    
    figma.ui.postMessage({ 
      type: 'log-message', 
      message: 'AI response received, generating design...',
      messageType: 'info'
    });
    
    // Process and execute design commands
    await executeDesignPlan(response);
    
    figma.ui.postMessage({ 
      type: 'operation-completed', 
      status: 'success',
      originalOperation: 'generate-design-standalone',
      message: 'Design generated successfully'
    });
  } catch (error) {
    console.error('Error generating design:', error);
    figma.ui.postMessage({ 
      type: 'operation-error', 
      originalOperation: 'generate-design-standalone',
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

// Call OpenAI API with rate limiting and exponential backoff
async function callOpenAI(apiKey: string, prompt: string, images: Array<{name: string, type: string, data: string}>, modelName: string): Promise<string> {
  // Maximum number of retry attempts
  const MAX_RETRIES = 5;
  // Initial delay in milliseconds (1 second)
  const INITIAL_RETRY_DELAY = 1000;
  
  // Prepare request data outside the retry loop to avoid repeating this work
  const messages: Array<any> = [];
  const supportsImages = modelName === 'gpt-4-vision-preview';
  
  // Add system message
  messages.push({
    role: 'system', 
    content: `You are a design assistant that creates UI designs in Figma. 
You will output a JSON array of design operations that will be executed in Figma to create the design.
Only use the following operations that the Figma plugin supports:
- create-rectangle: Creates a rectangle with position, size, and color
- create-text: Creates text with position, text content, font size, color
- create-icon: Creates an icon with name, SVG data, position, size, color
- create-border-box: Creates a box with border, position, size, options
- draw-line: Draws a line from start to end position
Your response should be ONLY a valid JSON array of operations like this:
[
  {
    "type": "create-rectangle",
    "position": {"x": 100, "y": 100},
    "size": {"width": 200, "height": 100},
    "color": {"r": 0.8, "g": 0.1, "b": 0.2}
  },
  {
    "type": "create-text",
    "text": "Hello World",
    "position": {"x": 120, "y": 130},
    "fontSize": 24,
    "color": {"r": 0, "g": 0, "b": 0}
  }
]
Do not include any explanations or markdown in your response, just the JSON array.`
  });
  
  // Build user message with images if supported
  if (images && images.length > 0 && supportsImages) {
    const content: Array<any> = [{ type: 'text', text: prompt }];
    
    // Add images to content
    for (const image of images) {
      content.push({
        type: 'image_url',
        image_url: {
          url: image.data,
          detail: 'high'
        }
      });
    }
    
    messages.push({ role: 'user', content });
  } else {
    // If images are provided but model doesn't support them, add a note
    let userPrompt = prompt;
    if (images && images.length > 0 && !supportsImages) {
      figma.ui.postMessage({ 
        type: 'log-message', 
        message: `Warning: ${modelName} doesn't support image input. Proceeding with text-only prompt.`,
        messageType: 'error'
      });
      userPrompt = `${prompt}\n\nNote: User uploaded ${images.length} reference image(s), but they cannot be processed with this model.`;
    }
    messages.push({ role: 'user', content: userPrompt });
  }
  
  const requestData: OpenAICompletionRequest = {
    model: modelName,
    messages,
    temperature: 0.7,
    max_tokens: 4000
  };

  // Retry loop with exponential backoff
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Check if retries should be cancelled
      if (shouldCancelRetries && attempt > 1) {
        figma.ui.postMessage({ 
          type: 'log-message', 
          message: 'Retries cancelled by user',
          messageType: 'warning'
        });
        throw new Error('OpenAI API request cancelled by user');
      }
      
      // Use the proxy endpoint for CORS-free OpenAI access
      const url = `${serverBaseUrl}/api/proxy/openai`;
      
      // Log attempt number if it's a retry
      if (attempt > 1) {
        figma.ui.postMessage({ 
          type: 'log-message', 
          message: `Retry attempt ${attempt}/${MAX_RETRIES} for OpenAI request...`,
          messageType: 'info'
        });
      }
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          apiKey,
          model: modelName,
          messages,
          temperature: requestData.temperature,
          max_tokens: requestData.max_tokens
        })
      });
      
      // If the request was successful, return the response
      if (response.ok) {
        const data = await response.json();
        return data.choices[0].message.content;
      }
      
      // Parse error response
      const errorText = await response.text();
      let errorJson;
      try {
        errorJson = JSON.parse(errorText);
      } catch (e) {
        errorJson = null;
      }
      
      // Handle rate limiting (429) errors specifically
      if (response.status === 429) {
        // Get retry-after header if available
        const retryAfter = response.headers.get('retry-after');
        let delayMs = 0;
        
        if (retryAfter) {
          // If retry-after is provided, use that (it's in seconds)
          delayMs = parseInt(retryAfter) * 1000;
        } else {
          // Otherwise use exponential backoff
          delayMs = INITIAL_RETRY_DELAY * Math.pow(2, attempt - 1);
        }
        
        // Cap the maximum delay at 60 seconds
        delayMs = Math.min(delayMs, 60000);
        
        figma.ui.postMessage({ 
          type: 'log-message', 
          message: `Rate limit exceeded. Waiting ${delayMs/1000} seconds before retrying...`,
          messageType: 'warning'
        });
        
        // If this is not the last attempt, wait and then continue to next iteration
        if (attempt < MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
          continue;
        }
      }
      
      // For non-429 errors or if this was the last retry attempt
      let errorMessage = `OpenAI API error: ${response.status}`;
      
      if (errorJson && errorJson.error) {
        errorMessage += ` - ${errorJson.error.type || ''}: ${errorJson.error.message || 'Unknown error'}`;
        
        // Provide specific guidance for common errors
        if (errorJson.error.code === 'insufficient_quota') {
          errorMessage += `. You've exceeded your current quota. Please check your plan and billing details.`;
        }
      }
      
      throw new Error(errorMessage);
    } catch (error) {
      // If this is the last attempt, throw the error
      if (attempt === MAX_RETRIES) {
        console.error('Error calling OpenAI after max retries:', error);
        throw error;
      }
      
      // For network errors (not API errors), also retry with backoff
      if (!(error instanceof Error && error.message.includes('OpenAI API error'))) {
        const delayMs = INITIAL_RETRY_DELAY * Math.pow(2, attempt - 1);
        
        figma.ui.postMessage({ 
          type: 'log-message', 
          message: `Network error occurred. Retrying in ${delayMs/1000} seconds...`,
          messageType: 'warning'
        });
        
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }
  
  // This should never be reached due to the throw in the final iteration,
  // but TypeScript requires a return statement
  throw new Error('Failed to get response from OpenAI after maximum retries');
}

// Call Claude API
async function callClaude(apiKey: string, prompt: string, images: Array<{name: string, type: string, data: string}>): Promise<string> {
  try {
    figma.ui.postMessage({ 
      type: 'log-message', 
      message: 'Calling Claude API via proxy server...',
      messageType: 'info'
    });
    
    const systemPrompt = `You are a design assistant that creates UI designs in Figma. 
You will output a JSON array of design operations that will be executed in Figma to create the design.
Only use the following operations that the Figma plugin supports:
- create-rectangle: Creates a rectangle with position, size, and color
- create-text: Creates text with position, text content, font size, color
- create-icon: Creates an icon with name, SVG data, position, size, color
- create-border-box: Creates a box with border, position, size, options
- draw-line: Draws a line from start to end position
Your response should be ONLY a valid JSON array of operations like this:
[
  {
    "type": "create-rectangle",
    "position": {"x": 100, "y": 100},
    "size": {"width": 200, "height": 100},
    "color": {"r": 0.8, "g": 0.1, "b": 0.2}
  },
  {
    "type": "create-text",
    "text": "Hello World",
    "position": {"x": 120, "y": 130},
    "fontSize": 24,
    "color": {"r": 0, "g": 0, "b": 0}
  }
]
Do not include any explanations or markdown in your response, just the JSON array.`;
    
    const content: Array<any> = [
      { type: 'text', text: systemPrompt + '\n\n' + prompt }
    ];
    
    // Add images if provided
    for (const image of images) {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: image.type,
          data: image.data.split(',')[1] // Remove data URL prefix
        }
      });
    }
    
    const messages = [
      { role: 'user', content }
    ];
    
    // Use the proxy endpoint for CORS-free Claude access
    const url = `${serverBaseUrl}/api/proxy/claude`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        apiKey,
        model: 'claude-3-opus-20240229',
        messages,
        temperature: 0.7,
        max_tokens: 4000
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Claude API error: ${errorData.error?.message || response.statusText}`);
    }
    
    const data = await response.json();
    return data.content[0].text;
  } catch (error) {
    console.error('Error calling Claude:', error);
    throw error;
  }
}

// Call Gemini API
async function callGemini(apiKey: string, prompt: string, images: Array<{name: string, type: string, data: string}>): Promise<string> {
  try {
    figma.ui.postMessage({ 
      type: 'log-message', 
      message: 'Calling Gemini API via proxy server...',
      messageType: 'info'
    });
    
    const systemPrompt = `You are a design assistant that creates UI designs in Figma. 
You will output a JSON array of design operations that will be executed in Figma to create the design.
Only use the following operations that the Figma plugin supports:
- create-rectangle: Creates a rectangle with position, size, and color
- create-text: Creates text with position, text content, font size, color
- create-icon: Creates an icon with name, SVG data, position, size, color
- create-border-box: Creates a box with border, position, size, options
- draw-line: Draws a line from start to end position
Your response should be ONLY a valid JSON array of operations like this:
[
  {
    "type": "create-rectangle",
    "position": {"x": 100, "y": 100},
    "size": {"width": 200, "height": 100},
    "color": {"r": 0.8, "g": 0.1, "b": 0.2}
  },
  {
    "type": "create-text",
    "text": "Hello World",
    "position": {"x": 120, "y": 130},
    "fontSize": 24,
    "color": {"r": 0, "g": 0, "b": 0}
  }
]
Do not include any explanations or markdown in your response, just the JSON array.`;
    
    const parts: Array<{text?: string, inline_data?: {mime_type: string, data: string}}> = [
      { text: systemPrompt + '\n\n' + prompt }
    ];
    
    // Add images if provided
    for (const image of images) {
      parts.push({
        inline_data: {
          mime_type: image.type,
          data: image.data.split(',')[1] // Remove data URL prefix
        }
      });
    }
    
    const contents = [
      { role: 'user', parts }
    ];
    
    // Use the proxy endpoint for CORS-free Gemini access
    const url = `${serverBaseUrl}/api/proxy/gemini`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        apiKey,
        contents,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 4000
        }
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Gemini API error: ${errorData.error?.message || response.statusText}`);
    }
    
    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
  } catch (error) {
    console.error('Error calling Gemini:', error);
    throw error;
  }
}

// Execute design plan from LLM output
async function executeDesignPlan(responseText: string): Promise<void> {
  try {
    // Clean up the response text to ensure it's valid JSON
    let cleanedText = responseText.trim();
    
    // If response is wrapped in code blocks, extract just the JSON
    if (cleanedText.startsWith('```') && cleanedText.endsWith('```')) {
      cleanedText = cleanedText.slice(cleanedText.indexOf('\n') + 1, cleanedText.lastIndexOf('```')).trim();
    }
    
    // If there's still a JSON marker at the start, remove it
    if (cleanedText.startsWith('```json')) {
      cleanedText = cleanedText.slice(7).trim();
    }
    
    const operations = JSON.parse(cleanedText);
    
    if (!Array.isArray(operations)) {
      throw new Error('Response is not a valid array of operations');
    }
    
    figma.ui.postMessage({ 
      type: 'log-message', 
      message: `Executing ${operations.length} design operations...`,
      messageType: 'info'
    });
    
    // Execute each operation sequentially
    for (let i = 0; i < operations.length; i++) {
      const op = operations[i];
      figma.ui.postMessage({ 
        type: 'log-message', 
        message: `Operation ${i+1}/${operations.length}: ${op.type}`,
        messageType: 'info'
      });
      
      switch (op.type) {
        case 'create-rectangle':
          await createRectangle(op.position, op.size, op.color);
          break;
          
        case 'create-text':
          await createText(
            op.text, 
            op.position, 
            op.fontSize, 
            op.color, 
            op.fontFamily || DEFAULT_FONT,
            op.resizeMode || 'AUTO_WIDTH'
          );
          break;
          
        case 'create-icon':
          await createIcon(
            op.iconName,
            op.svgData,
            op.position,
            op.size || 24,
            op.color,
            op.strokeWidth || 2
          );
          break;
          
        case 'create-border-box':
          await createBorderBox(
            op.position,
            op.size,
            op.options
          );
          break;
          
        case 'draw-line':
          await drawLine(
            op.start,
            op.end,
            op.color,
            op.thickness || 1
          );
          break;
          
        default:
          console.warn(`Unsupported operation type: ${op.type}`);
      }
    }
    
    figma.ui.postMessage({ 
      type: 'log-message', 
      message: 'All design operations executed successfully',
      messageType: 'info'
    });
  } catch (error) {
    console.error('Error executing design plan:', error);
    throw new Error(`Failed to execute design plan: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Function to list available fonts in Figma
async function listAvailableFonts(): Promise<void> {
  try {
    // Get all available fonts (this might be slow)
    const fontList = await figma.listAvailableFontsAsync();
    
    // Extract unique font family names
    const fontFamilies = new Set<string>();
    for (const font of fontList) {
      fontFamilies.add(font.fontName.family);
    }
    
    // Convert to array and sort alphabetically
    const uniqueFamilies = Array.from(fontFamilies).sort();
    
    // Send the list back to the UI
    figma.ui.postMessage({
      type: 'fonts-list',
      fonts: uniqueFamilies
    });
    
    return;
  } catch (error) {
    console.error('Error listing fonts:', error);
    throw new Error('Failed to list available fonts');
  }
}

// Function to create a rectangle
async function createRectangle(position: {x: number, y: number}, size: {width: number, height: number}, color?: {r: number, g: number, b: number}) {
  const rect = figma.createRectangle();
  
  // Set position
  rect.x = position.x;
  rect.y = position.y;
  
  // Set size
  rect.resize(size.width, size.height);
  
  // Set color
  if (color) {
    const rgbColor = { r: color.r, g: color.g, b: color.b };
    const solidPaint: SolidPaint = { type: 'SOLID', color: rgbColor };
    rect.fills = [solidPaint];
  }
  
  // Select the created rectangle
  figma.currentPage.selection = [rect];
  figma.viewport.scrollAndZoomIntoView([rect]);
  
  return rect.id;
}

// Function to create text
async function createText(
  text: string, 
  position: {x: number, y: number}, 
  fontSize: number = 24, 
  color?: {r: number, g: number, b: number}, 
  fontFamily: string = DEFAULT_FONT,
  resizeMode: 'AUTO_WIDTH' | 'AUTO_HEIGHT' | 'FIXED_SIZE' = 'AUTO_WIDTH'
): Promise<string> {
  // Create a text node
  const textNode = figma.createText();
  
  // Set position
  textNode.x = position.x;
  textNode.y = position.y;
  
  try {
    // Load a font to use
    console.log(`Loading font: ${fontFamily} Regular`);
    try {
      await figma.loadFontAsync({ family: fontFamily, style: "Regular" });
    } catch (fontError) {
      console.warn(`Failed to load ${fontFamily} Regular, falling back to Inter:`, fontError);
      // If specified font fails, try using Inter as fallback
      fontFamily = DEFAULT_FONT;
      await figma.loadFontAsync({ family: DEFAULT_FONT, style: "Regular" });
    }
    
    // Set the text content and font size
    textNode.fontName = { family: fontFamily, style: "Regular" };
    textNode.characters = text;
    textNode.fontSize = fontSize;
    
    // Set resize behavior
    switch (resizeMode) {
      case 'AUTO_WIDTH':
        textNode.textAutoResize = 'WIDTH_AND_HEIGHT';
        break;
      case 'AUTO_HEIGHT':
        textNode.textAutoResize = 'HEIGHT';
        textNode.resize(300, textNode.height); // Set a default width
        break;
      case 'FIXED_SIZE':
        textNode.textAutoResize = 'NONE';
        textNode.resize(300, 100); // Set default dimensions
        break;
    }
    
    // Set color if provided
    if (color) {
      const rgbColor = { r: color.r, g: color.g, b: color.b };
      const solidPaint: SolidPaint = { type: 'SOLID', color: rgbColor };
      textNode.fills = [solidPaint];
    }
    
    // Select the created text
    figma.currentPage.selection = [textNode];
    figma.viewport.scrollAndZoomIntoView([textNode]);
    
    return textNode.id;
  } catch (error) {
    // Clean up the node if there was an error
    textNode.remove();
    console.error('Error creating text:', error);
    throw new Error(`Failed to create text: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Function to create a page based on description
async function createPage(pageName: string, description: string, styleGuide: any = {}): Promise<any> {
  // Use font from style guide if provided, otherwise use default
  const fontFamily = styleGuide?.typography?.fontFamily || DEFAULT_FONT;
  
  // Create a new page
  const page = figma.createPage();
  page.name = pageName;
  
  // Set as current page
  figma.currentPage = page;
  
  // Create a main frame for the page content
  const frame = figma.createFrame();
  frame.name = "Main Content";
  frame.resize(1440, 900); // Default size, adjust as needed
  
  // Parse the description to determine what to create
  // This is a simplified implementation - a more sophisticated one would use
  // natural language processing or predefined templates
  
  // For demonstration, let's create a simple layout based on keywords in the description
  
  if (description.toLowerCase().includes('header')) {
    await createHeader(frame, styleGuide);
  }
  
  if (description.toLowerCase().includes('hero')) {
    await createHeroSection(frame, description, styleGuide);
  }
  
  if (description.toLowerCase().includes('features') || description.toLowerCase().includes('benefits')) {
    await createFeaturesSection(frame, description, styleGuide);
  }
  
  if (description.toLowerCase().includes('footer')) {
    await createFooter(frame, styleGuide);
  }
  
  // Select the frame to show it
  figma.currentPage.selection = [frame];
  figma.viewport.scrollAndZoomIntoView([frame]);
  
  return {
    pageId: page.id,
    frameId: frame.id
  };
}

// Helper function to create a header section
async function createHeader(parent: FrameNode, styleGuide: any) {
  const fontFamily = styleGuide?.typography?.fontFamily || DEFAULT_FONT;
  
  const header = figma.createFrame();
  header.name = "Header";
  header.resize(parent.width, 80);
  header.x = 0;
  header.y = 0;
  
  // Add a logo
  await figma.loadFontAsync({ family: fontFamily, style: "Bold" });
  const logo = figma.createText();
  logo.characters = "LOGO";
  logo.fontSize = 24;
  logo.x = 40;
  logo.y = 28;
  
  // Add navigation items
  const navItems = ["Home", "Features", "Pricing", "Contact"];
  let xOffset = parent.width - 400;
  
  for (const item of navItems) {
    await figma.loadFontAsync({ family: fontFamily, style: "Regular" });
    const navItem = figma.createText();
    navItem.characters = item;
    navItem.fontSize = 16;
    navItem.x = xOffset;
    navItem.y = 32;
    xOffset += 100;
    
    header.appendChild(navItem);
  }
  
  header.appendChild(logo);
  parent.appendChild(header);
  
  return header.id;
}

// Helper function to create a hero section
async function createHeroSection(parent: FrameNode, description: string, styleGuide: any) {
  const fontFamily = styleGuide?.typography?.fontFamily || DEFAULT_FONT;
  
  const hero = figma.createFrame();
  hero.name = "Hero Section";
  hero.resize(parent.width, 500);
  hero.x = 0;
  hero.y = 90; // Below header
  
  // Add a heading
  await figma.loadFontAsync({ family: fontFamily, style: "Bold" });
  const heading = figma.createText();
  
  // Extract heading from description or use default
  const headingMatch = description.match(/heading ['"]([^'"]+)['"]/i);
  heading.characters = headingMatch ? headingMatch[1] : "Welcome to Our Platform";
  
  heading.fontSize = 48;
  heading.x = parent.width / 2 - 400;
  heading.y = 100;
  heading.resize(800, heading.height);
  heading.textAlignHorizontal = "CENTER";
  
  // Add a subheading
  await figma.loadFontAsync({ family: fontFamily, style: "Regular" });
  const subheading = figma.createText();
  
  // Extract subheading from description or use default
  const subheadingMatch = description.match(/subheading ['"]([^'"]+)['"]/i);
  subheading.characters = subheadingMatch 
    ? subheadingMatch[1] 
    : "The best solution for your design and productivity needs";
  
  subheading.fontSize = 24;
  subheading.x = parent.width / 2 - 400;
  subheading.y = 170;
  subheading.resize(800, subheading.height);
  subheading.textAlignHorizontal = "CENTER";
  
  // Add a CTA button
  const ctaButton = figma.createRectangle();
  ctaButton.resize(200, 50);
  ctaButton.x = parent.width / 2 - 100;
  ctaButton.y = 250;
  ctaButton.cornerRadius = 8;
  
  // Set button color from style guide or default
  const buttonColor = styleGuide?.colors?.primary 
    ? styleGuide.colors.primary 
    : { r: 0.2, g: 0.4, b: 0.9 };
  const buttonSolidPaint: SolidPaint = { type: 'SOLID', color: buttonColor };
  ctaButton.fills = [buttonSolidPaint];
  
  // Add button text
  await figma.loadFontAsync({ family: fontFamily, style: "SemiBold" });
  const buttonText = figma.createText();
  buttonText.characters = "Get Started";
  buttonText.fontSize = 16;
  const textSolidPaint: SolidPaint = { type: 'SOLID', color: { r: 1, g: 1, b: 1 } };
  buttonText.fills = [textSolidPaint];
  buttonText.x = parent.width / 2 - 50;
  buttonText.y = 265;
  
  // Add elements to hero
  hero.appendChild(heading);
  hero.appendChild(subheading);
  hero.appendChild(ctaButton);
  hero.appendChild(buttonText);
  
  // Add hero to parent
  parent.appendChild(hero);
  
  return hero.id;
}

// Helper function to create a features section
async function createFeaturesSection(parent: FrameNode, description: string, styleGuide: any) {
  const fontFamily = styleGuide?.typography?.fontFamily || DEFAULT_FONT;
  
  const features = figma.createFrame();
  features.name = "Features Section";
  features.resize(parent.width, 600);
  features.x = 0;
  features.y = 600; // Below hero
  
  // Section title
  await figma.loadFontAsync({ family: fontFamily, style: "Bold" });
  const title = figma.createText();
  title.characters = "Key Features";
  title.fontSize = 36;
  title.x = parent.width / 2 - 150;
  title.y = 40;
  title.resize(300, title.height);
  title.textAlignHorizontal = "CENTER";
  
  features.appendChild(title);
  
  // Create feature cards
  const numberOfFeatures = description.toLowerCase().includes("3 features") ? 3 : 
                          description.toLowerCase().includes("4 features") ? 4 : 3;
  
  const cardWidth = 320;
  const spacing = 40;
  const totalWidth = numberOfFeatures * cardWidth + (numberOfFeatures - 1) * spacing;
  let xOffset = (parent.width - totalWidth) / 2;
  
  for (let i = 0; i < numberOfFeatures; i++) {
    // Create a card
    const card = figma.createFrame();
    card.name = `Feature ${i + 1}`;
    card.resize(cardWidth, 400);
    card.x = xOffset;
    card.y = 120;
    card.cornerRadius = 8;
    const cardSolidPaint: SolidPaint = { type: 'SOLID', color: { r: 0.98, g: 0.98, b: 0.98 } };
    card.fills = [cardSolidPaint];
    
    // Create icon placeholder
    const icon = figma.createEllipse();
    icon.resize(80, 80);
    icon.x = cardWidth / 2 - 40;
    icon.y = 40;
    const iconSolidPaint: SolidPaint = { type: 'SOLID', color: { r: 0.9, g: 0.9, b: 0.9 } };
    icon.fills = [iconSolidPaint];
    
    // Create feature title
    await figma.loadFontAsync({ family: fontFamily, style: "SemiBold" });
    const featureTitle = figma.createText();
    featureTitle.characters = `Feature ${i + 1}`;
    featureTitle.fontSize = 24;
    featureTitle.x = 20;
    featureTitle.y = 150;
    featureTitle.resize(cardWidth - 40, featureTitle.height);
    featureTitle.textAlignHorizontal = "CENTER";
    
    // Create feature description
    await figma.loadFontAsync({ family: fontFamily, style: "Regular" });
    const featureDesc = figma.createText();
    featureDesc.characters = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Aenean gravida est nec finibus dictum.";
    featureDesc.fontSize = 16;
    featureDesc.x = 20;
    featureDesc.y = 200;
    featureDesc.resize(cardWidth - 40, featureDesc.height);
    featureDesc.textAlignHorizontal = "CENTER";
    
    // Add elements to card
    card.appendChild(icon);
    card.appendChild(featureTitle);
    card.appendChild(featureDesc);
    
    // Add card to features section
    features.appendChild(card);
    
    // Update xOffset for next card
    xOffset += cardWidth + spacing;
  }
  
  // Add features to parent
  parent.appendChild(features);
  
  return features.id;
}

// Helper function to create a footer
async function createFooter(parent: FrameNode, styleGuide: any) {
  const fontFamily = styleGuide?.typography?.fontFamily || DEFAULT_FONT;
  
  const footer = figma.createFrame();
  footer.name = "Footer";
  footer.resize(parent.width, 200);
  footer.x = 0;
  footer.y = 1200; // Below features
  const footerSolidPaint: SolidPaint = { type: 'SOLID', color: { r: 0.1, g: 0.1, b: 0.1 } };
  footer.fills = [footerSolidPaint];
  
  // Add copyright text
  await figma.loadFontAsync({ family: fontFamily, style: "Regular" });
  const copyright = figma.createText();
  copyright.characters = "© 2023 Company Name. All rights reserved.";
  copyright.fontSize = 14;
  const copyrightSolidPaint: SolidPaint = { type: 'SOLID', color: { r: 0.9, g: 0.9, b: 0.9 } };
  copyright.fills = [copyrightSolidPaint];
  copyright.x = parent.width / 2 - 150;
  copyright.y = 150;
  
  // Add footer links
  const links = ["Privacy Policy", "Terms of Service", "Contact Us"];
  let xOffset = parent.width / 2 - 200;
  
  for (const linkText of links) {
    const link = figma.createText();
    link.characters = linkText;
    link.fontSize = 14;
    const linkSolidPaint: SolidPaint = { type: 'SOLID', color: { r: 0.9, g: 0.9, b: 0.9 } };
    link.fills = [linkSolidPaint];
    link.x = xOffset;
    link.y = 100;
    
    footer.appendChild(link);
    xOffset += 150;
  }
  
  footer.appendChild(copyright);
  parent.appendChild(footer);
  
  return footer.id;
}

// Helper functions for node operations
function getTargetNodes(nodeId?: string): readonly SceneNode[] {
  if (nodeId) {
    const node = figma.getNodeById(nodeId);
    if (!node) {
      throw new Error(`Node with ID ${nodeId} not found`);
    }
    return [node as SceneNode];
  } else {
    // Use current selection if no nodeId is specified
    return figma.currentPage.selection;
  }
}

// Function to select a node by ID
async function selectNode(nodeId: string): Promise<void> {
  // First check if the node exists
  const node = figma.getNodeById(nodeId);
  if (!node) {
    // Try to get more context about why the node wasn't found
    const currentPage = figma.currentPage;
    const allNodes = currentPage.findAll();
    const nodeIds = allNodes.map(n => n.id);
    
    throw new Error(
      `Node with ID "${nodeId}" not found. ` +
      `Current page has ${allNodes.length} nodes. ` +
      `Available node IDs: ${nodeIds.join(', ')}`
    );
  }
  
  // Check if the node is a valid SceneNode
  if (!('type' in node)) {
    throw new Error(`Node "${nodeId}" is not a valid Figma node type`);
  }
  
  // Select the node
  figma.currentPage.selection = [node as SceneNode];
  
  // Scroll and zoom to show the node
  figma.viewport.scrollAndZoomIntoView([node as SceneNode]);
  
  // Log success for debugging
  console.log(`Successfully selected node: ${nodeId} (Type: ${node.type})`);
}

// Function to change the color of selected nodes
async function changeColor(color: {r: number, g: number, b: number}, nodeId?: string): Promise<void> {
  const targetNodes = getTargetNodes(nodeId);
  if (targetNodes.length === 0) {
    throw new Error('No nodes selected for color change');
  }
  
  const rgbColor = { r: color.r, g: color.g, b: color.b };
  const solidPaint: SolidPaint = { type: 'SOLID', color: rgbColor };
  
  for (const node of targetNodes) {
    if ('fills' in node) {
      // We need to create a new array because the fills property is readonly
      const newFills = [...(node.fills as readonly Paint[])];
      // Replace first fill or add one if none exists
      if (newFills.length > 0) {
        newFills[0] = solidPaint;
      } else {
        newFills.push(solidPaint);
      }
      node.fills = newFills;
    }
  }
}

// Function to change the corner radius of selected nodes
async function changeRadius(radius: number, nodeId?: string): Promise<void> {
  const targetNodes = getTargetNodes(nodeId);
  if (targetNodes.length === 0) {
    throw new Error('No nodes selected for radius change');
  }
  
  for (const node of targetNodes) {
    if ('cornerRadius' in node) {
      // For Rectangle, Ellipse, etc. that support setRangeCornerRadius
      if ('setRangeCornerRadius' in node && typeof node.setRangeCornerRadius === 'function') {
        node.setRangeCornerRadius(0, 3, radius);
      } 
      // For other nodes, use corner specific properties if available
      else if ('topLeftRadius' in node) {
        node.topLeftRadius = radius;
        node.topRightRadius = radius;
        node.bottomLeftRadius = radius;
        node.bottomRightRadius = radius;
      }
    }
  }
}

// Function to change the typeface of selected text nodes
async function changeTypeface(fontFamily: string, nodeId?: string): Promise<void> {
  const targetNodes = getTargetNodes(nodeId);
  if (targetNodes.length === 0) {
    throw new Error('No nodes selected for typeface change');
  }
  
  // Try to load the font
  try {
    // Load the font with Regular style first
    await figma.loadFontAsync({ family: fontFamily, style: "Regular" });
    
    for (const node of targetNodes) {
      if (node.type === 'TEXT') {
        // Handle text nodes
        const textNode = node as TextNode;
        const currentFontName = textNode.fontName as FontName;
        
        // Create a new FontName object
        const newFont = { family: fontFamily, style: currentFontName.style };
        
        try {
          // Try to load the font with the current style
          await figma.loadFontAsync(newFont);
          textNode.fontName = newFont;
        } catch (e) {
          console.warn(`Could not load ${fontFamily} with style ${currentFontName.style}, falling back to Regular style`);
          // If specific style isn't available, try with Regular style
          textNode.fontName = { family: fontFamily, style: "Regular" };
        }
      }
    }
  } catch (error) {
    console.error(`Failed to load font family "${fontFamily}":`, error);
    throw new Error(`Failed to load font family "${fontFamily}". Make sure it exists in Figma.`);
  }
}

// Function to change font style (size, weight, italic)
async function changeFontStyle(fontSize?: number, fontWeight?: string, italic?: boolean, nodeId?: string): Promise<void> {
  const targetNodes = getTargetNodes(nodeId);
  if (targetNodes.length === 0) {
    throw new Error('No nodes selected for font style change');
  }
  
  for (const node of targetNodes) {
    if (node.type === 'TEXT') {
      const textNode = node as TextNode;
      
      // Change font size if specified
      if (fontSize !== undefined) {
        textNode.fontSize = fontSize;
      }
      
      // Change font weight if specified
      if (fontWeight !== undefined) {
        const currentFontName = textNode.fontName as FontName;
        let newStyle = fontWeight;
        
        // Add Italic if needed
        if (italic === true && !newStyle.includes('Italic')) {
          newStyle += ' Italic';
        } else if (italic === false && newStyle.includes('Italic')) {
          // Remove Italic if present
          newStyle = newStyle.replace('Italic', '').trim();
        }
        
        try {
          // Try to load the font with the new style
          await figma.loadFontAsync({ family: currentFontName.family, style: newStyle });
          textNode.fontName = { family: currentFontName.family, style: newStyle };
        } catch (e) {
          console.warn(`Could not load font with style ${newStyle}, skipping weight change`);
        }
      }
      // Handle just italic change if fontWeight isn't specified
      else if (italic !== undefined) {
        const currentFontName = textNode.fontName as FontName;
        let newStyle = currentFontName.style;
        
        if (italic && !newStyle.includes('Italic')) {
          newStyle += ' Italic';
        } else if (!italic && newStyle.includes('Italic')) {
          newStyle = newStyle.replace('Italic', '').trim();
        }
        
        try {
          // Try to load the font with the new style
          await figma.loadFontAsync({ family: currentFontName.family, style: newStyle });
          textNode.fontName = { family: currentFontName.family, style: newStyle };
        } catch (e) {
          console.warn(`Could not load font with style ${newStyle}, skipping italic change`);
        }
      }
    }
  }
}

// Function to change text alignment
async function changeAlignment(horizontal?: string, vertical?: string, nodeId?: string): Promise<void> {
  const targetNodes = getTargetNodes(nodeId);
  if (targetNodes.length === 0) {
    throw new Error('No nodes selected for alignment change');
  }
  
  for (const node of targetNodes) {
    if (node.type === 'TEXT') {
      // Change horizontal alignment if specified
      if (horizontal) {
        switch (horizontal.toLowerCase()) {
          case 'left':
            node.textAlignHorizontal = 'LEFT';
            break;
          case 'center':
            node.textAlignHorizontal = 'CENTER';
            break;
          case 'right':
            node.textAlignHorizontal = 'RIGHT';
            break;
          case 'justified':
            node.textAlignHorizontal = 'JUSTIFIED';
            break;
          default:
            console.warn(`Unknown horizontal alignment: ${horizontal}`);
        }
      }
      
      // Change vertical alignment if specified
      if (vertical) {
        switch (vertical.toLowerCase()) {
          case 'top':
            node.textAlignVertical = 'TOP';
            break;
          case 'center':
            node.textAlignVertical = 'CENTER';
            break;
          case 'bottom':
            node.textAlignVertical = 'BOTTOM';
            break;
          default:
            console.warn(`Unknown vertical alignment: ${vertical}`);
        }
      }
    }
  }
}

// Function to change spacing (padding and item spacing) for auto layout frames
async function changeSpacing(padding?: number | {top?: number, right?: number, bottom?: number, left?: number}, 
                            itemSpacing?: number, 
                            nodeId?: string): Promise<void> {
  const targetNodes = getTargetNodes(nodeId);
  if (targetNodes.length === 0) {
    throw new Error('No nodes selected for spacing change');
  }
  
  for (const node of targetNodes) {
    if (node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'INSTANCE') {
      // Change item spacing if specified and the node has auto layout
      if (itemSpacing !== undefined && node.layoutMode !== 'NONE') {
        node.itemSpacing = itemSpacing;
      }
      
      // Change padding if specified
      if (padding !== undefined) {
        if (typeof padding === 'number') {
          // Apply uniform padding
          node.paddingTop = padding;
          node.paddingRight = padding;
          node.paddingBottom = padding;
          node.paddingLeft = padding;
        } else {
          // Apply individual padding values
          if (padding.top !== undefined) node.paddingTop = padding.top;
          if (padding.right !== undefined) node.paddingRight = padding.right;
          if (padding.bottom !== undefined) node.paddingBottom = padding.bottom;
          if (padding.left !== undefined) node.paddingLeft = padding.left;
        }
      }
    }
  }
}

// Function to list all available nodes in the current page
async function listAvailableNodes(includeDetails: boolean = false): Promise<void> {
  try {
    const currentPage = figma.currentPage;
    const allNodes = currentPage.findAll();
    
    // Create a list of node information
    const nodesList = allNodes.map(node => {
      if (includeDetails) {
        return {
          id: node.id,
          name: node.name,
          type: node.type,
          visible: 'visible' in node ? node.visible : true,
          parent: node.parent ? { 
            id: node.parent.id, 
            type: node.parent.type,
            name: node.parent.name
          } : null
        };
      } else {
        return {
          id: node.id,
          type: node.type
        };
      }
    });
    
    // Send the node list back to the UI
    figma.ui.postMessage({
      type: 'nodes-list',
      nodes: nodesList,
      count: nodesList.length,
      currentPageId: currentPage.id,
      currentPageName: currentPage.name
    });
    
  } catch (error) {
    console.error('Error listing nodes:', error);
    throw new Error('Failed to list available nodes');
  }
}

// Function to change text resize mode
async function changeTextResize(resizeMode: 'AUTO_WIDTH' | 'AUTO_HEIGHT' | 'FIXED_SIZE', 
                               width?: number, 
                               height?: number, 
                               nodeId?: string): Promise<void> {
  const targetNodes = getTargetNodes(nodeId);
  if (targetNodes.length === 0) {
    throw new Error('No nodes selected for text resize change');
  }
  
  for (const node of targetNodes) {
    if (node.type === 'TEXT') {
      const textNode = node as TextNode;
      
      // First, we need to load the font that the text is currently using
      try {
        const currentFont = textNode.fontName as FontName;
        await figma.loadFontAsync(currentFont);
        
        console.log(`Font loaded successfully: ${currentFont.family} ${currentFont.style}`);
        
        // Now we can safely change the resize behavior
        switch (resizeMode) {
          case 'AUTO_WIDTH':
            textNode.textAutoResize = 'WIDTH_AND_HEIGHT';
            break;
          case 'AUTO_HEIGHT':
            textNode.textAutoResize = 'HEIGHT';
            // Set width if provided, otherwise keep current width
            if (width !== undefined) {
              textNode.resize(width, textNode.height);
            }
            break;
          case 'FIXED_SIZE':
            textNode.textAutoResize = 'NONE';
            // Set dimensions if provided, otherwise keep current dimensions
            if (width !== undefined && height !== undefined) {
              textNode.resize(width, height);
            } else if (width !== undefined) {
              textNode.resize(width, textNode.height);
            } else if (height !== undefined) {
              textNode.resize(textNode.width, height);
            }
            break;
        }
      } catch (error) {
        console.error('Error loading font:', error);
        throw new Error(`Failed to change text resize mode: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
}

// Function to delete nodes by ID or selection
async function deleteNode(nodeId?: string): Promise<void> {
  const targetNodes = getTargetNodes(nodeId);
  if (targetNodes.length === 0) {
    throw new Error('No nodes selected for deletion');
  }
  
  // Store the IDs of nodes that will be deleted
  const deletedIds = targetNodes.map(node => node.id);
  
  // Delete each node
  for (const node of targetNodes) {
    node.remove();
  }
  
  console.log(`Successfully deleted ${targetNodes.length} node(s): ${deletedIds.join(', ')}`);
  
  // First send detailed information about deleted nodes
  figma.ui.postMessage({
    type: 'nodes-deleted',
    count: targetNodes.length,
    nodeIds: deletedIds
  });
  
  // Then send the operation-completed message that the server is specifically listening for
  figma.ui.postMessage({ 
    type: 'operation-completed', 
    originalOperation: 'delete-node',
    status: 'success',
    data: {
      count: targetNodes.length,
      nodeIds: deletedIds
    }
  });
}

// Function to move nodes to a specific position
async function moveNode(position: {x: number, y: number}, nodeId?: string): Promise<void> {
  const targetNodes = getTargetNodes(nodeId);
  if (targetNodes.length === 0) {
    throw new Error('No nodes selected for moving');
  }
  
  // Store original positions for reporting
  const originalPositions = targetNodes.map(node => ({
    id: node.id,
    name: node.name,
    oldX: node.x,
    oldY: node.y
  }));
  
  // Move each node to the new position
  // If multiple nodes are selected, offset them to prevent overlapping
  let offsetX = 0;
  let offsetY = 0;
  const offsetStep = 20; // Pixels to offset each node by

  for (const node of targetNodes) {
    // Set the new position
    node.x = position.x + offsetX;
    node.y = position.y + offsetY;
    
    // Increment offset for next node if multiple nodes are selected
    if (targetNodes.length > 1) {
      offsetX += offsetStep;
      offsetY += offsetStep;
    }
  }
  
  // If only one node is moved, center the view on it
  if (targetNodes.length === 1) {
    figma.viewport.scrollAndZoomIntoView(targetNodes);
  }
  
  console.log(`Successfully moved ${targetNodes.length} node(s) to (${position.x}, ${position.y})`);
  
  // Send information about moved nodes
  figma.ui.postMessage({
    type: 'nodes-moved',
    count: targetNodes.length,
    nodes: targetNodes.map(node => ({
      id: node.id,
      name: node.name,
      newX: node.x,
      newY: node.y
    })),
    originalPositions
  });
}

// Function to create an icon from Lucide Icons
async function createIcon(
  iconName: string,
  svgData: string,
  position: {x: number, y: number},
  size: number = 24,
  color?: {r: number, g: number, b: number},
  strokeWidth: number = 2
): Promise<string> {
  try {
    console.log(`Creating icon: ${iconName}`);
    
    if (!svgData) {
      throw new Error(`Missing SVG data for icon: ${iconName}`);
    }
    
    // Create a node from the SVG string
    const svgNode = figma.createNodeFromSvg(svgData);
    
    // Create a frame to group the SVG elements
    const frame = figma.createFrame();
    frame.name = `Lucide Icon: ${iconName}`;
    frame.x = position.x;
    frame.y = position.y;
    frame.fills = []; // Make the frame background transparent
    
    // Calculate sizing for the outer frame
    const aspectRatio = svgNode.width / svgNode.height;
    let frameWidth, frameHeight;
    
    if (aspectRatio >= 1) {
      frameWidth = size;
      frameHeight = size / aspectRatio;
    } else {
      frameWidth = size * aspectRatio;
      frameHeight = size;
    }
    
    // Resize the frame
    frame.resize(frameWidth, frameHeight);
    
    // Move the SVG elements into the frame
    const svgElements = [...svgNode.children]; // Make a copy of the children
    
    // Process all SVG elements before adding to the frame
    for (const element of svgElements) {
      // Detach from original SVG node and add to our frame
      frame.appendChild(element);
      
      // Apply color if provided
      if (color && 'strokes' in element) {
        const rgbColor = { r: color.r, g: color.g, b: color.b };
        const strokePaint: SolidPaint = { type: 'SOLID', color: rgbColor };
        element.strokes = [strokePaint];
        
        // Set stroke width if the element has strokes
        if ('strokeWeight' in element) {
          element.strokeWeight = strokeWidth;
        }
      }
    }
    
    // Clean up the original SVG node since we've moved all its children
    svgNode.remove();

    // Group the elements within the frame
    if (svgElements.length > 0) {
        const group = figma.group(svgElements, frame);
        group.name = "IconContent"; // Name the group for clarity

        // Calculate target size (90% of frame)
        const targetWidth = frame.width * 0.9;
        const targetHeight = frame.height * 0.9;

        // Calculate scale factor to fit within target size, maintaining aspect ratio
        const groupWidth = group.width;
        const groupHeight = group.height;

        if (groupWidth > 0 && groupHeight > 0) {
            const scaleX = targetWidth / groupWidth;
            const scaleY = targetHeight / groupHeight;
            const scale = Math.min(scaleX, scaleY);

            // Resize the group
            group.resize(groupWidth * scale, groupHeight * scale);

            // Center the resized group within the frame
            group.x = (frame.width - group.width) / 2;
            group.y = (frame.height - group.height) / 2;
        } else {
             console.warn("Icon content group has zero width or height, skipping resize/centering.");
             // Fallback centering for empty/invalid groups
             group.x = (frame.width - group.width) / 2;
             group.y = (frame.height - group.height) / 2;
        }
    }
    
    // Select the created frame with the icon
    figma.currentPage.selection = [frame];
    figma.viewport.scrollAndZoomIntoView([frame]);
    
    return frame.id;
  } catch (error) {
    console.error('Error creating icon:', error);
    throw new Error(`Failed to create icon: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Function to create a border line box or button
async function createBorderBox(
  position: {x: number, y: number},
  size: {width: number, height: number},
  options: {
    type: 'box' | 'button',
    borderColor?: {r: number, g: number, b: number},
    borderWidth?: number,
    fillColor?: {r: number, g: number, b: number},
    cornerRadius?: number,
    text?: string,
    textColor?: {r: number, g: number, b: number},
    fontSize?: number,
    fontFamily?: string
  }
): Promise<string> {
  try {
    console.log(`Creating ${options.type} at position:`, position);
    
    // Create a frame
    const frame = figma.createFrame();
    frame.name = options.type === 'button' ? 'Button' : 'Border Box';
    frame.x = position.x;
    frame.y = position.y;
    frame.resize(size.width, size.height);
    
    // Set corner radius if provided
    if (options.cornerRadius !== undefined) {
      frame.cornerRadius = options.cornerRadius;
    }
    
    // Set fill color if provided
    if (options.fillColor) {
      const rgbColor = { r: options.fillColor.r, g: options.fillColor.g, b: options.fillColor.b };
      const solidPaint: SolidPaint = { type: 'SOLID', color: rgbColor };
      frame.fills = [solidPaint];
    } else {
      // Make the frame background transparent
      frame.fills = [];
    }
    
    // Set border color and width if provided
    if (options.borderColor) {
      const rgbColor = { r: options.borderColor.r, g: options.borderColor.g, b: options.borderColor.b };
      const solidPaint: SolidPaint = { type: 'SOLID', color: rgbColor };
      frame.strokes = [solidPaint];
      frame.strokeWeight = options.borderWidth || 1;
    }
    
    // Add text if provided
    if (options.text) {
      const textNode = figma.createText();
      
      // Load font
      let actualFontFamily = options.fontFamily || DEFAULT_FONT;
      try {
        await figma.loadFontAsync({ family: actualFontFamily, style: "Regular" });
      } catch (fontError) {
        console.warn(`Failed to load ${actualFontFamily} Regular, falling back to Inter:`, fontError);
        actualFontFamily = DEFAULT_FONT;
        await figma.loadFontAsync({ family: DEFAULT_FONT, style: "Regular" });
      }
      
      // Set text properties
      textNode.fontName = { family: actualFontFamily, style: "Regular" };
      textNode.characters = options.text;
      textNode.fontSize = options.fontSize || 16;
      
      // Set text color if provided
      if (options.textColor) {
        const rgbColor = { r: options.textColor.r, g: options.textColor.g, b: options.textColor.b };
        const solidPaint: SolidPaint = { type: 'SOLID', color: rgbColor };
        textNode.fills = [solidPaint];
      }
      
      // Center the text in the frame
      textNode.textAlignHorizontal = 'CENTER';
      textNode.textAlignVertical = 'CENTER';
      textNode.resize(frame.width, frame.height); // Make text node same size as frame for centering
      textNode.x = 0; // Position relative to frame
      textNode.y = 0; // Position relative to frame
      frame.appendChild(textNode);
      
      // Reset frame layout mode if we added text
      // frame.layoutMode = 'VERTICAL';
      // frame.primaryAxisAlignItems = 'CENTER';
      // frame.counterAxisAlignItems = 'CENTER';
    }
    
    // Select the created frame
    figma.currentPage.selection = [frame];
    figma.viewport.scrollAndZoomIntoView([frame]);
    
    return frame.id;
  } catch (error) {
    console.error('Error creating border box:', error);
    throw new Error(`Failed to create border box: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Function to draw a line
async function drawLine(
  start: {x: number, y: number},
  end: {x: number, y: number},
  color?: {r: number, g: number, b: number},
  thickness: number = 1
): Promise<string> {
  try {
    console.log(`Drawing line from (${start.x}, ${start.y}) to (${end.x}, ${end.y})`);
    const line = figma.createLine();
    
    // Set line coordinates
    line.x = start.x;
    line.y = start.y;
    // Adjust the endpoint relative to the start point for the line's internal coordinate system
    line.resize(end.x - start.x, end.y - start.y);
    
    // Set line color
    const rgbColor = color ? { r: color.r, g: color.g, b: color.b } : { r: 0, g: 0, b: 0 }; // Default black
    const solidPaint: SolidPaint = { type: 'SOLID', color: rgbColor };
    line.strokes = [solidPaint];
    line.strokeWeight = thickness;
    
    // Select the created line
    figma.currentPage.selection = [line];
    figma.viewport.scrollAndZoomIntoView([line]);
    
    return line.id;
  } catch (error) {
    console.error('Error drawing line:', error);
    throw new Error(`Failed to draw line: ${error instanceof Error ? error.message : String(error)}`);
  }
} 