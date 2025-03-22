const { Pool } = require('pg');
const config = require('./config');


async function deleteUser(userId) {
    // PostgreSQL configuration
    const pool = new Pool({
        user: config.postgres.user || 'postgres',
        host: config.postgres.host || 'localhost',
        database: config.postgres.database || 'postgres',
        password: config.postgres.password || '_Welc0me',
        port: config.postgres.port || 5432,
    });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Get user before deletion to verify it exists
        const userResult = await client.query(
            'SELECT * FROM users WHERE id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) {
            throw new Error('User not found');
        }

        // Delete the user
        await client.query(
            'DELETE FROM users WHERE id = $1',
            [userId]
        );

        await client.query('COMMIT');
        console.log('User deleted successfully:', userId);
        return true;

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error deleting user:', error);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}


async function displayCompanyUsers() {
    // PostgreSQL configuration
    const pool = new Pool({
        user: config.postgres.user || 'postgres',
        host: config.postgres.host || 'localhost',
        database: config.postgres.database || 'postgres',
        password: config.postgres.password || '_Welc0me',
        port: config.postgres.port || 5432,
    });

    try {
        // Query to get all users for company1
        const result = await pool.query(
            'SELECT * FROM users WHERE custom_fields->$1 IS NOT NULL',
            ['company1']
        );

        console.log('\n=== Users for company1 ===');
        console.log(`Total users found: ${result.rows.length}\n`);

        result.rows.forEach((user, index) => {
            console.log(`User ${index + 1}:`);
            console.log('ID:', user.id);
            console.log('Name:', user.name);
            console.log('Email:', user.email);
            console.log('Role:', user.role);
            console.log('Custom Fields:', JSON.stringify(user.custom_fields, null, 2));
            console.log('Created At:', user.created_at);
            console.log('Updated At:', user.updated_at);
            console.log('------------------------\n');
        });

    } catch (error) {
        console.error('Error fetching users:', error);
    } finally {
        await pool.end();
    }
}

// Run the function
displayCompanyUsers().catch(console.error);
