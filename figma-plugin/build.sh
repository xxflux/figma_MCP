#!/bin/bash

# Simple build script for Figma plugin
# Compatible with Mac OS and Unix-like systems

# Color codes for terminal output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Starting Figma Plugin build process...${NC}"

# Check if node and npm are installed
if ! command -v node &> /dev/null || ! command -v npm &> /dev/null; then
    echo -e "${RED}Node.js and npm are required but not found. Please install them first.${NC}"
    exit 1
fi

# Clean up old dist files
echo -e "${YELLOW}Cleaning old dist files...${NC}"
rm -rf dist
if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to clean dist directory.${NC}"
    exit 1
fi

# Create dist directory
echo -e "${YELLOW}Creating dist directory...${NC}"
mkdir -p dist
if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to create dist directory.${NC}"
    exit 1
fi

# Copy UI file
echo -e "${YELLOW}Copying UI HTML file...${NC}"
cp code/ui.html dist/
if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to copy UI HTML file.${NC}"
    exit 1
fi

# Compile TypeScript
echo -e "${YELLOW}Compiling TypeScript files...${NC}"
npx tsc -p tsconfig.json
if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to compile TypeScript files.${NC}"
    exit 1
fi

# Copy manifest
echo -e "${YELLOW}Copying manifest.json...${NC}"
cp manifest.json dist/
if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to copy manifest.json.${NC}"
    exit 1
fi

echo -e "${GREEN}Build completed successfully!${NC}"
echo -e "${GREEN}Plugin files are in the 'dist' directory.${NC}"
echo -e "${YELLOW}To load the plugin in Figma:${NC}"
echo -e "1. Open Figma"
echo -e "2. Go to Plugins > Development > Import plugin from manifest..."
echo -e "3. Select the manifest.json file in the 'dist' directory" 