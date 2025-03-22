const SyncClient = require('./SyncClient');
const config = require('./config');

async function testSyncClient() {
    const syncClient = new SyncClient(config);
    const companyId = 'company1';
    
    try {
        console.log('Starting SyncClient tests...\n');

        // Test 1: Create a user with standard and custom fields
        console.log('Test 1: Creating a user...');
        const newUser = await syncClient.createUser({
            name: 'John Doe',
            email: 'john@example.com',
            password: 'hashedPassword123',
            role: 'user',
            profilePicture: 'https://example.com/profile.jpg',
            department: 'Engineering',
            location: 'New York',
            title: 'Software Engineer',
            internalNote: 'High priority candidate' // This will be filtered out for Strapi
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
        const updatedUser = await syncClient.updateUser(newUser.id, {
            name: 'John Doe Jr.',
            email: 'john@example.com',
            password: 'hashedPassword123',
            role: 'user',
            profilePicture: 'https://example.com/new-profile.jpg',
            department: 'Engineering',
            location: 'San Francisco',
            title: 'Senior Engineer',
            internalNote: 'Promoted to senior' // This will be filtered out for Strapi
        }, companyId);

        console.log('Updated user:', updatedUser);
        console.log('Test 3 completed successfully\n');

        // Test 4: Handle Strapi update event
        console.log('Test 4: Handling Strapi update event...');
        await syncClient.handleStrapiUpdate('user.update', {
            id: newUser.id,
            companyId: companyId,
            name: 'John Doe Jr.',
            email: 'john@example.com',
            role: 'admin',
            profilePicture: 'https://example.com/strapi-profile.jpg',
            department: 'Engineering',
            location: 'San Francisco',
            title: 'Senior Engineer',
            internalNote: 'Updated by Strapi' // This will be filtered out for Strapi
        });

        console.log('Strapi update handled successfully');
        console.log('Test 4 completed successfully\n');

        // Test 5: Delete the user
        console.log('Test 5: Deleting user...');
        const deletedUser = await syncClient.deleteUser(newUser.id, companyId);
        console.log('Deleted user:', deletedUser);
        console.log('Test 5 completed successfully\n');

        console.log('All tests completed successfully!');

    } catch (error) {
        console.error('Error in test:', error);
    } finally {
        await syncClient.close();
    }
}

testSyncClient(); 