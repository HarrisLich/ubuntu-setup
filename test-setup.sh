#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to print status messages
print_status() {
    echo -e "${GREEN}[✓] $1${NC}"
}

print_error() {
    echo -e "${RED}[✗] $1${NC}"
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    print_error "Please run as root (use sudo)"
    exit 1
fi

# Create a test directory
TEST_DIR="strapi-test"
mkdir -p $TEST_DIR
cd $TEST_DIR

# Download the setup script
print_status "Downloading setup script..."
curl -O https://raw.githubusercontent.com/yourusername/yourrepo/main/setup.js

# Make the script executable
chmod +x setup.js

# Install required dependencies
print_status "Installing required dependencies..."
apt-get update
apt-get install -y curl git

# Run the setup script
print_status "Running setup script..."
node setup.js

# Test Redis connection
print_status "Testing Redis connection..."
redis-cli -a password123 ping

# Test Strapi
print_status "Testing Strapi..."
curl -I http://localhost:1337/admin

# Check PM2 status
print_status "Checking PM2 status..."
pm2 status

# Print test results
print_status "Setup test completed!"
print_status "You can now:"
print_status "1. Access Strapi at http://localhost:1337/admin"
print_status "2. Check Redis at localhost:6379"
print_status "3. Monitor services with 'pm2 monit'"
print_status "4. View logs with 'pm2 logs'" 