// This code runs in the Figma environment
// Reference the Figma Plugin API types
/// <reference types="@figma/plugin-typings" />

// Constants
const DEFAULT_FONT = "Inter";
const WEBSOCKET_SERVER_URL = "ws://localhost:8080";

// Show UI window for WebSocket communication
figma.showUI(__html__, { width: 400, height: 350 });

// WebSocket connection is managed in the UI thread
figma.ui.postMessage({ type: 'connect-to-server', serverUrl: WEBSOCKET_SERVER_URL });

// Handle messages from the UI thread
figma.ui.onmessage = async (msg) => {
  console.log('Received message in plugin:', msg);

  try {
    // Handle different operation types
    switch (msg.type) {
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
        
      case 'connection-status':
        // Log connection status changes
        console.log(`WebSocket connection status: ${msg.status}`);
        break;
        
      default:
        console.error(`Unknown operation type: ${msg.type}`);
    }
    
    // Notify UI that operation is complete
    figma.ui.postMessage({ 
      type: 'operation-completed', 
      originalOperation: msg.type,
      status: 'success'
    });
  } catch (error: unknown) {
    console.error('Error executing operation:', error);
    figma.ui.postMessage({ 
      type: 'operation-error', 
      originalOperation: msg.type,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

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