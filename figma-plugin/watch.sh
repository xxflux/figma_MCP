#!/bin/bash

# Watch script for Figma plugin during development
# Compatible with Mac OS and Unix-like systems

# Color codes for terminal output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Setting up watch mode for Figma Plugin...${NC}"

# Initialize build
echo -e "${YELLOW}Initial build...${NC}"
./build.sh

if [ $? -ne 0 ]; then
    echo -e "${RED}Initial build failed. Exiting watch mode.${NC}"
    exit 1
fi

# Function to copy UI HTML and manifest when they change
function copy_static_files() {
    # Copy UI HTML if changed
    if [ "code/ui.html" -nt "dist/ui.html" ]; then
        echo -e "${YELLOW}Copying updated UI HTML file...${NC}"
        cp code/ui.html dist/
    fi
    
    # Copy manifest if changed
    if [ "manifest.json" -nt "dist/manifest.json" ]; then
        echo -e "${YELLOW}Copying updated manifest.json...${NC}"
        cp manifest.json dist/
    fi
}

echo -e "${GREEN}Starting watch mode for TypeScript files...${NC}"
echo -e "${YELLOW}Press Ctrl+C to stop watching.${NC}"

# Start TypeScript in watch mode
npx tsc -p tsconfig.json --watch &
TS_PID=$!

# Watch for changes in ui.html and manifest.json
while true; do
    copy_static_files
    sleep 1
done 