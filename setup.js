const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const config = {
    strapi: {
        appName: 'strapi-app',
        port: 1337
    },
    redis: {
        port: 6379,
        password: 'password123'
    }
};

// Helper function to run shell commands
function runCommand(command, cwd = process.cwd()) {
    try {
        console.log(`Running: ${command}`);
        execSync(command, { stdio: 'inherit', cwd });
    } catch (error) {
        console.error(`Error running command: ${command}`);
        console.error(error);
        process.exit(1);
    }
}

// Main setup function
async function setup() {
    console.log('Starting setup process...');

    // Get the current working directory
    const currentDir = process.cwd();
    console.log(`Working directory: ${currentDir}`);

    // Update system packages
    console.log('\nUpdating system packages...');
    runCommand('sudo apt-get update');
    runCommand('sudo apt-get upgrade -y');

    // Install Node.js and npm if not already installed
    console.log('\nChecking Node.js installation...');
    try {
        execSync('node --version', { stdio: 'ignore' });
    } catch {
        console.log('Installing Node.js...');
        runCommand('curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -');
        runCommand('sudo apt-get install -y nodejs');
    }

    // Install Redis if not present
    console.log('\nChecking Redis installation...');
    try {
        execSync('redis-cli --version', { stdio: 'ignore' });
        console.log('Redis is already installed, configuring...');
    } catch {
        console.log('Installing Redis...');
        runCommand('sudo apt-get install -y redis-server');
    }
    
    // Configure Redis
    console.log('\nConfiguring Redis...');
    const redisConfig = `
port ${config.redis.port}
requirepass ${config.redis.password}
bind 127.0.0.1
`;
    try {
        fs.writeFileSync('/etc/redis/redis.conf', redisConfig);
        runCommand('sudo systemctl restart redis-server');
        runCommand('sudo systemctl enable redis-server');
    } catch (error) {
        console.error('Error configuring Redis:', error);
        console.log('Attempting to continue with existing Redis configuration...');
    }

    // Install PM2 globally
    console.log('\nInstalling PM2...');
    runCommand('sudo npm install -g pm2');

    // Create Strapi application
    console.log('\nCreating Strapi application...');
    runCommand(`npx create-strapi-app@latest ${config.strapi.appName} --quickstart --no-run`);

    // Configure Strapi database (using default SQLite)
    console.log('\nConfiguring Strapi database...');
    const strapiConfig = `
module.exports = ({ env }) => ({
  host: env('HOST', '0.0.0.0'),
  port: env.int('PORT', ${config.strapi.port}),
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
`;
    const strapiConfigPath = path.join(currentDir, config.strapi.appName, 'config/database.js');
    fs.writeFileSync(strapiConfigPath, strapiConfig);

    // Install Strapi dependencies and build
    console.log('\nInstalling Strapi dependencies...');
    runCommand('cd ' + path.join(currentDir, config.strapi.appName));
    runCommand('npm install');
    
    // Build Strapi application
    console.log('\nBuilding Strapi application...');
    runCommand('npm run build');

    // Create PM2 ecosystem file
    console.log('\nCreating PM2 ecosystem file...');
    const ecosystemConfig = `
module.exports = {
  apps: [
    {
      name: 'strapi',
      cwd: '${path.join(currentDir, config.strapi.appName)}',
      script: 'npm',
      args: 'start',
      env: {
        NODE_ENV: 'production',
        PORT: ${config.strapi.port},
      },
    },
  ],
};
`;
    fs.writeFileSync(path.join(currentDir, 'ecosystem.config.js'), ecosystemConfig);

    // Start services with PM2
    console.log('\nStarting services with PM2...');
    runCommand('pm2 start ecosystem.config.js');
    runCommand('pm2 save');
    runCommand('pm2 startup');

    console.log('\nSetup completed successfully!');
    console.log('\nNext steps:');
    console.log('1. Access Strapi admin panel at http://localhost:1337/admin');
    console.log('2. Create your admin account');
    console.log('3. Configure your content types and permissions');
    console.log('\nServices status:');
    runCommand('pm2 status');
}

// Run setup
setup().catch(error => {
    console.error('Setup failed:', error);
    process.exit(1);
});

