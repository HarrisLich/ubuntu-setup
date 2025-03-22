const axios = require('axios');
const crypto = require('crypto');
const config = require('./config');

const SERVER_URL = 'http://localhost:3000';
const COMPANY_ID = 'company1';

// Helper function to generate webhook signature
function generateSignature(payload, secret) {
    const hmac = crypto.createHmac('sha256', secret);
    return hmac.update(JSON.stringify(payload)).digest('hex');
}

// Helper function to send webhook
async function sendWebhook(event, entry) {
    const payload = {
        event,
        model: 'user',
        entry
    };

    const signature = generateSignature(payload, config.strapi.webhookSecret);

    try {
        const response = await axios.post(`${SERVER_URL}/strapi/webhook`, payload, {
            headers: {
                'Content-Type': 'application/json',
                'strapi-signature': signature,
                'x-company-id': COMPANY_ID
            }
        });
        console.log(`Webhook ${event} response:`, response.data);
        return response.data;
    } catch (error) {
        console.error(`Error sending ${event} webhook:`, error.response?.data || error.message);
        throw error;
    }
}

// Test data
const testUser = {
    id: 1,
    name: 'John Doe',
    email: 'john@example.com',
    password: 'hashedPassword123',
    role: 1,
    profilePicture: 'https://example.com/profile.jpg',
    department: 'Engineering',
    position: 'Senior Developer'
};

const updatedUser = {
    ...testUser,
    name: 'John Updated',
    role: 0,
    profilePicture: 'https://example.com/new-profile.jpg',
    department: 'Senior Engineering',
    position: 'Lead Developer'
};

// Run tests
async function runTests() {
    try {
        console.log('Starting webhook tests...\n');

        // Test 1: Create user
        console.log('Test 1: Simulating user creation webhook');
        await sendWebhook('entry.create', testUser);
        console.log('User creation webhook sent successfully\n');

        // Test 2: Update user
        console.log('Test 2: Simulating user update webhook');
        await sendWebhook('entry.update', updatedUser);
        console.log('User update webhook sent successfully\n');

        // Test 3: Delete user
        console.log('Test 3: Simulating user deletion webhook');
        await sendWebhook('entry.delete', { id: testUser.id });
        console.log('User deletion webhook sent successfully\n');

        console.log('All webhook tests completed successfully!');
    } catch (error) {
        console.error('Test suite failed:', error);
        process.exit(1);
    }
}

// Run the tests
runTests();