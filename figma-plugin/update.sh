#!/bin/bash

# Quick update script for Figma plugin during development
# Compatible with Mac OS and Unix-like systems

# Color codes for terminal output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Updating Figma Plugin files...${NC}"

# Ensure dist directory exists
if [ ! -d "dist" ]; then
    echo -e "${YELLOW}Creating dist directory...${NC}"
    mkdir -p dist
    if [ $? -ne 0 ]; then
        echo -e "${RED}Failed to create dist directory.${NC}"
        exit 1
    fi
fi

# Copy UI file (only if changed or doesn't exist)
if [ ! -f "dist/ui.html" ] || [ "code/ui.html" -nt "dist/ui.html" ]; then
    echo -e "${YELLOW}Copying UI HTML file...${NC}"
    cp code/ui.html dist/
    if [ $? -ne 0 ]; then
        echo -e "${RED}Failed to copy UI HTML file.${NC}"
        exit 1
    fi
fi

# Compile TypeScript
echo -e "${YELLOW}Compiling TypeScript files...${NC}"
npx tsc -p tsconfig.json
if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to compile TypeScript files.${NC}"
    exit 1
fi

# Copy manifest (only if changed or doesn't exist)
if [ ! -f "dist/manifest.json" ] || [ "manifest.json" -nt "dist/manifest.json" ]; then
    echo -e "${YELLOW}Copying manifest.json...${NC}"
    cp manifest.json dist/
    if [ $? -ne 0 ]; then
        echo -e "${RED}Failed to copy manifest.json.${NC}"
        exit 1
    fi
fi

echo -e "${GREEN}Update completed!${NC}" 