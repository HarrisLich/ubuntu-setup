#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
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

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check if a port is in use
port_in_use() {
    netstat -tuln | grep ":$1 " >/dev/null 2>&1
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

# Update system packages
print_status "Updating system packages..."
apt-get update
apt-get upgrade -y

# Install required dependencies
print_status "Installing required dependencies..."
apt-get install -y curl git build-essential net-tools

# Check if Redis is already running
print_status "Checking Redis status..."
if redis-cli ping >/dev/null 2>&1; then
    print_status "Redis is already running. Skipping Redis installation and configuration."
else
    # Check if Redis port is available
    if port_in_use $REDIS_PORT; then
        print_error "Port $REDIS_PORT is already in use. Please free up this port or change REDIS_PORT in the script."
        exit 1
    fi

    # Install Redis
    print_status "Installing Redis..."
    if ! command_exists redis-cli; then
        apt-get install -y redis-server
    fi

    # Configure Redis
    print_status "Configuring Redis..."
    REDIS_CONFIG="/etc/redis/redis.conf"
    REDIS_CONFIG_BACKUP="/etc/redis/redis.conf.backup"

    # Backup existing Redis config
    if [ -f "$REDIS_CONFIG" ]; then
        cp "$REDIS_CONFIG" "$REDIS_CONFIG_BACKUP"
    fi

    # Create new Redis config
    cat > "$REDIS_CONFIG" << EOF
port $REDIS_PORT
requirepass $REDIS_PASSWORD
bind 127.0.0.1
EOF

    # Restart Redis service
    print_status "Restarting Redis service..."
    systemctl stop redis-server || true
    systemctl start redis-server
    systemctl enable redis-server

    # Verify Redis is running
    print_status "Verifying Redis connection..."
    if redis-cli -a "$REDIS_PASSWORD" ping; then
        print_status "Redis is running and configured correctly"
    else
        print_error "Redis configuration failed"
        # Restore backup if exists
        if [ -f "$REDIS_CONFIG_BACKUP" ]; then
            cp "$REDIS_CONFIG_BACKUP" "$REDIS_CONFIG"
            systemctl restart redis-server
        fi
        exit 1
    fi
fi

# Check if Strapi port is available
if port_in_use $STRAPI_PORT; then
    print_error "Port $STRAPI_PORT is already in use. Please free up this port or change STRAPI_PORT in the script."
    exit 1
fi

# Install Node.js 20.x
print_status "Installing Node.js 20.x..."
if ! command_exists node; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
else
    NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 20 ]; then
        print_status "Upgrading Node.js to version 20.x..."
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
        apt-get install -y nodejs
    fi
fi

# Verify Node.js installation
if ! command_exists node || ! command_exists npm; then
    print_error "Node.js or npm installation failed"
    exit 1
fi

# Install PM2 globally
print_status "Installing PM2..."
if ! command_exists pm2; then
    npm install -g pm2
fi

# Create Strapi application
print_status "Creating Strapi application..."
if [ -d "$STRAPI_APP_NAME" ]; then
    print_warning "Strapi directory already exists. Removing it..."
    rm -rf "$STRAPI_APP_NAME"
fi

npx create-strapi-app@latest "$STRAPI_APP_NAME" --quickstart --no-run

# Verify Strapi creation
if [ ! -d "$STRAPI_APP_NAME" ]; then
    print_error "Failed to create Strapi application"
    exit 1
fi

# Configure Strapi database
print_status "Configuring Strapi database..."
mkdir -p "$STRAPI_APP_NAME/config"

# Generate JWT secret
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(16).toString('base64'))")

# Create .env file
print_status "Creating Strapi environment file..."
cat > "$STRAPI_APP_NAME/.env" << EOF
HOST=0.0.0.0
PORT=$STRAPI_PORT
APP_KEYS=toBeGenerated1,toBeGenerated2,toBeGenerated3,toBeGenerated4
API_TOKEN_SALT=toBeGenerated
ADMIN_JWT_SECRET=$JWT_SECRET
TRANSFER_TOKEN_SALT=toBeGenerated
JWT_SECRET=$JWT_SECRET
EOF

# Create database.js
cat > "$STRAPI_APP_NAME/config/database.js" << EOF
module.exports = ({ env }) => ({
  host: env('HOST', '0.0.0.0'),
  port: env.int('PORT', $STRAPI_PORT),
  app: {
    keys: env.array('APP_KEYS'),
  },
  webhooks: {
    populateRelations: env.bool('WEBHOOKS_POPULATE_RELATIONS', false),
  },
  database: {
    connection: {
      client: 'sqlite',
      connection: {
        filename: env('DATABASE_FILENAME', '.tmp/data.db'),
      },
      useNullAsDefault: true,
    },
    debug: false,
  },
});
EOF

# Create plugins.js
print_status "Configuring Strapi plugins..."
cat > "$STRAPI_APP_NAME/config/plugins.js" << EOF
module.exports = ({ env }) => ({
  'users-permissions': {
    config: {
      jwtSecret: env('JWT_SECRET'),
    },
  },
});
EOF

# Install Strapi dependencies and build
print_status "Installing Strapi dependencies..."
cd "$STRAPI_APP_NAME"
npm install

print_status "Building Strapi application..."
npm run build

# Verify build
if [ ! -d "dist" ]; then
    print_error "Strapi build failed"
    exit 1
fi

# Update PM2 ecosystem file with environment variables
print_status "Creating PM2 ecosystem file..."
cat > "../ecosystem.config.js" << EOF
module.exports = {
  apps: [
    {
      name: 'strapi',
      cwd: '${TEST_DIR}/${STRAPI_APP_NAME}',
      script: 'npm',
      args: 'start',
      env: {
        NODE_ENV: 'production',
        PORT: $STRAPI_PORT,
        HOST: '0.0.0.0',
        APP_KEYS: 'toBeGenerated1,toBeGenerated2,toBeGenerated3,toBeGenerated4',
        API_TOKEN_SALT: 'toBeGenerated',
        ADMIN_JWT_SECRET: '$JWT_SECRET',
        TRANSFER_TOKEN_SALT: 'toBeGenerated',
        JWT_SECRET: '$JWT_SECRET',
      },
    },
  ],
};
EOF

# Start services with PM2
print_status "Starting services with PM2..."
cd ..
pm2 delete strapi 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save
pm2 startup

# Wait for services to start
print_status "Waiting for services to start..."
sleep 15

# Test Strapi
print_status "Testing Strapi..."
MAX_RETRIES=5
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -I "http://localhost:$STRAPI_PORT/admin" >/dev/null 2>&1; then
        print_status "Strapi is running!"
        break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
        print_error "Strapi is not responding after $MAX_RETRIES attempts. Checking logs..."
        pm2 logs strapi --lines 20
        exit 1
    fi
    print_warning "Strapi not ready yet, retrying in 5 seconds... ($RETRY_COUNT/$MAX_RETRIES)"
    sleep 5
done

# Print final status
print_status "Setup completed successfully!"
print_status "You can now:"
print_status "1. Access Strapi at http://localhost:$STRAPI_PORT/admin"
print_status "2. Check Redis at localhost:$REDIS_PORT"
print_status "3. Monitor services with 'pm2 monit'"
print_status "4. View logs with 'pm2 logs'"

# Print PM2 status
print_status "Current PM2 status:"
pm2 status

# Print environment setup instructions
print_status "Setting up environment variables..."
print_status "1. Create a .env file in your project root:"
cat > .env.example << EOF
# Strapi API Token (Required)
# Get this from Strapi Admin Panel -> Settings -> API Tokens
STRAPI_TOKEN=your_strapi_token_here

# Strapi Webhook Secret (Required)
# This will be used to verify webhook signatures
STRAPI_WEBHOOK_SECRET=your_webhook_secret_here

# Server Port (Optional)
PORT=3000
EOF

print_status "2. Configure Strapi Webhook:"
print_status "   a. Log in to Strapi Admin Panel at http://localhost:$STRAPI_PORT/admin"
print_status "   b. Navigate to Settings -> Webhooks"
print_status "   c. Click 'Create new webhook'"
print_status "   d. Configure the webhook with the following settings:"
print_status "      - Name: User Sync Webhook"
print_status "      - URL: http://localhost:3000/strapi/webhook"
print_status "      - Events: Select 'Entry.create', 'Entry.update', and 'Entry.delete'"
print_status "      - Headers: Add 'x-company-id' header with your company ID"
print_status "      - Secret: Generate a secure random string and use it as STRAPI_WEBHOOK_SECRET"
print_status "   e. Save the webhook configuration"
print_status "   f. Copy the generated webhook secret to your .env file"

print_status "3. Get Strapi API Token:"
print_status "   a. In Strapi Admin Panel, go to Settings -> API Tokens"
print_status "   b. Click 'Create new API Token'"
print_status "   c. Configure the token:"
print_status "      - Name: Sync Client Token"
print_status "      - Description: Token for SyncClient application"
print_status "      - Token duration: Unlimited"
print_status "      - Token type: Full access"
print_status "   d. Save and copy the generated token to your .env file"

print_status "4. Final .env file should look like this (replace with your values):"
cat > .env.example << EOF
STRAPI_TOKEN=your_generated_token_here
STRAPI_WEBHOOK_SECRET=your_generated_webhook_secret_here
PORT=3000
EOF

print_status "5. Start the SyncClient application:"
print_status "   a. Navigate to your project directory"
print_status "   b. Install dependencies: npm install"
print_status "   c. Start the server: node index.js"

print_status "6. Test the setup:"
print_status "   a. Create a new user in Strapi"
print_status "   b. Check the webhook logs in your SyncClient application"
print_status "   c. Verify the user was synced to PostgreSQL and Redis"

print_warning "IMPORTANT: Keep your .env file secure and never commit it to version control!"
print_warning "Make sure to use strong, unique values for STRAPI_TOKEN and STRAPI_WEBHOOK_SECRET" 