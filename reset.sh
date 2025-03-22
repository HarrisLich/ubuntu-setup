#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration (must match test-setup.sh)
STRAPI_APP_NAME="strapi-app"
STRAPI_PORT=1337
REDIS_PORT=6379
REDIS_PASSWORD="password123"

# Function to print status messages
print_status() {
    echo -e "${GREEN}[✓] $1${NC}"
}

print_error() {
    echo -e "${RED}[✗] $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}[!] $1${NC}"
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    print_error "Please run as root (use sudo)"
    exit 1
fi

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
TEST_DIR="$SCRIPT_DIR/strapi-test"

print_status "Starting cleanup process..."

# Stop and remove PM2 processes
print_status "Stopping and removing PM2 processes..."
if command -v pm2 >/dev/null 2>&1; then
    pm2 delete all
    pm2 save
    pm2 startup | grep -v "sudo" | bash
fi

# Stop Redis service
print_status "Stopping Redis service..."
systemctl stop redis-server || true

# Restore original Redis configuration if backup exists
print_status "Restoring Redis configuration..."
REDIS_CONFIG="/etc/redis/redis.conf"
REDIS_CONFIG_BACKUP="/etc/redis/redis.conf.backup"
if [ -f "$REDIS_CONFIG_BACKUP" ]; then
    cp "$REDIS_CONFIG_BACKUP" "$REDIS_CONFIG"
    rm "$REDIS_CONFIG_BACKUP"
fi

# Remove Redis
print_status "Removing Redis..."
apt-get remove -y redis-server
apt-get autoremove -y

# Remove Strapi application
print_status "Removing Strapi application..."
if [ -d "$TEST_DIR/$STRAPI_APP_NAME" ]; then
    rm -rf "$TEST_DIR/$STRAPI_APP_NAME"
fi

# Remove PM2 ecosystem file
print_status "Removing PM2 ecosystem file..."
if [ -f "$TEST_DIR/ecosystem.config.js" ]; then
    rm "$TEST_DIR/ecosystem.config.js"
fi

# Remove test directory
print_status "Removing test directory..."
if [ -d "$TEST_DIR" ]; then
    rm -rf "$TEST_DIR"
fi

# Remove PM2 globally
print_status "Removing PM2..."
if command -v pm2 >/dev/null 2>&1; then
    npm uninstall -g pm2
fi

# Remove Node.js
print_status "Removing Node.js..."
if command -v node >/dev/null 2>&1; then
    apt-get remove -y nodejs
    apt-get autoremove -y
    rm -rf /usr/lib/node_modules
    rm -rf ~/.npm
    rm -rf ~/.node-gyp
fi

# Clean up system
print_status "Cleaning up system..."
apt-get autoremove -y
apt-get clean

print_status "Cleanup completed successfully!"
print_status "You can now run test-setup.sh again for a fresh installation."
