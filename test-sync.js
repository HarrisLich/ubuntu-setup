const SyncClient = require('./SyncClient');
const config = require('./config');
const crypto = require('crypto');

async function testSyncClient() {
    // Generate a unique company identifier for testing
    const uniqueId = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const companyId = `test_company_${uniqueId}`;
    config.companyId = companyId;
    
    const syncClient = new SyncClient(config);
    
    try {
        console.log('Starting SyncClient tests...\n');
        console.log(`Using company ID: ${companyId}\n`);

        // Test database connections
        console.log('Testing database connections...');
        try {
            // Test PostgreSQL connection
            const pgClient = await syncClient.pgPool.connect();
            await pgClient.query('SELECT 1');
            pgClient.release();
            console.log('✓ PostgreSQL connection successful');

            // Test Redis connection
            await syncClient.redis.ping();
            console.log('✓ Redis connection successful\n');
        } catch (error) {
            console.error('Database connection test failed:', error);
            throw error;
        }

        // Test 1: Create a user with standard and custom fields
        console.log('Test 1: Creating a user...');
        const newUser = await syncClient.handleStrapiCreate({
            username: 'John Doe',
            email: 'john@example.com',
            provider: 'local',
            confirmed: true,
            blocked: false,
            role: {
                id: 1,
                name: 'Authenticated'
            },
            // Custom fields
            department: 'Engineering',
            location: 'New York',
            title: 'Software Engineer',
            skills: ['JavaScript', 'Node.js', 'PostgreSQL'],
            preferences: {
                theme: 'dark',
                notifications: true
            }
        }, companyId);

        console.log('Created user:', newUser);
        console.log('Test 1 completed successfully\n');

        // Test 2: Get the user from Redis cache
        console.log('Test 2: Getting user from Redis cache...');
        const cachedUser = await syncClient.getUser(newUser.id, companyId);
        console.log('Retrieved cached user:', cachedUser);
        console.log('Test 2 completed successfully\n');

        // Test 3: Update the user with new fields
        console.log('Test 3: Updating user...');
        const updatedUser = await syncClient.handleStrapiUpdate({
            username: 'John Doe Jr.',
            email: 'john@example.com',
            provider: 'local',
            confirmed: true,
            blocked: false,
            role: {
                id: 2,
                name: 'Admin'
            },
            // Updated custom fields
            department: 'Engineering',
            location: 'San Francisco',
            title: 'Senior Engineer',
            skills: ['JavaScript', 'Node.js', 'PostgreSQL', 'Redis'],
            preferences: {
                theme: 'light',
                notifications: false
            }
        }, companyId);

        console.log('Updated user:', updatedUser);
        console.log('Test 3 completed successfully\n');

        // Test 4: Verify data consistency
        console.log('Test 4: Verifying data consistency...');
        const pgUser = await syncClient.pgPool.query(
            'SELECT * FROM users WHERE email = $1',
            ['john@example.com']
        );
        console.log('PostgreSQL user data:', pgUser.rows[0]);

        const redisUser = await syncClient.redis.get(
            `company:${companyId}:user:${newUser.id}`
        );
        console.log('Redis user data:', JSON.parse(redisUser));
        console.log('Test 4 completed successfully\n');

        // Test 5: Delete the user
        console.log('Test 5: Deleting user...');
        const deletedUser = await syncClient.handleStrapiDelete({
            email: 'john@example.com'
        }, companyId);
        console.log('Deleted user:', deletedUser);
        console.log('Test 5 completed successfully\n');

        // Test 6: Verify deletion
        console.log('Test 6: Verifying deletion...');
        const deletedPgUser = await syncClient.pgPool.query(
            'SELECT * FROM users WHERE email = $1',
            ['john@example.com']
        );
        console.log('PostgreSQL user after deletion:', deletedPgUser.rows[0]);

        const deletedRedisUser = await syncClient.redis.get(
            `company:${companyId}:user:${newUser.id}`
        );
        console.log('Redis user after deletion:', deletedRedisUser);
        console.log('Test 6 completed successfully\n');

        console.log('All tests completed successfully!');

    } catch (error) {
        console.error('Error in test:', error);
        throw error;
    } finally {
        await syncClient.close();
    }
}

// Run the tests
testSyncClient().catch(error => {
    console.error('Test suite failed:', error);
    process.exit(1);
}); 