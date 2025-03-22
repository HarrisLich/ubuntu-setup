#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

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

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    print_error "Please run as root (use sudo)"
    exit 1
fi

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Create a test directory
TEST_DIR="$SCRIPT_DIR/strapi-test"
mkdir -p $TEST_DIR
cd $TEST_DIR

# Copy the setup script from the current directory
print_status "Copying setup script..."
cp "$SCRIPT_DIR/setup.js" .

# Install required dependencies
print_status "Installing required dependencies..."
apt-get update
apt-get install -y curl git

# Install Node.js if not present
if ! command_exists node; then
    print_status "Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi

# Install PM2 globally if not present
if ! command_exists pm2; then
    print_status "Installing PM2..."
    npm install -g pm2
fi

# Run the setup script
print_status "Running setup script..."
node setup.js

# Wait for services to start
print_status "Waiting for services to start..."
sleep 10

# Test Redis connection
print_status "Testing Redis connection..."
if command_exists redis-cli; then
    redis-cli -a password123 ping
else
    print_error "Redis CLI not found. Redis may not have been installed properly."
fi

# Test Strapi
print_status "Testing Strapi..."
if curl -I http://localhost:1337/admin >/dev/null 2>&1; then
    print_status "Strapi is running!"
else
    print_error "Strapi is not responding. Checking logs..."
    pm2 logs strapi --lines 20
fi

# Check PM2 status
print_status "Checking PM2 status..."
if command_exists pm2; then
    pm2 status
else
    print_error "PM2 not found. Services may not be running properly."
fi

# Print test results
print_status "Setup test completed!"
print_status "You can now:"
print_status "1. Access Strapi at http://localhost:1337/admin"
print_status "2. Check Redis at localhost:6379"
print_status "3. Monitor services with 'pm2 monit'"
print_status "4. View logs with 'pm2 logs'"

# Print troubleshooting information if needed
if ! command_exists node || ! command_exists pm2 || ! command_exists redis-cli; then
    print_warning "Some components may not be installed properly. Please check the logs above."
    print_warning "You may need to run the setup script again or install components manually."
fi 