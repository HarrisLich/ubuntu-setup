const Redis = require('ioredis');
const { Pool } = require('pg');
const axios = require('axios');

class SyncClient {
    constructor(config) {
        if (!config) {
            throw new Error('Configuration is required');
        }

        // PostgreSQL configuration
        this.pgPool = new Pool({
            user: config.postgres.user,
            host: config.postgres.host,
            database: config.postgres.database,
            password: config.postgres.password,
            port: config.postgres.port,
            // Add connection timeout and retry settings
            connectionTimeoutMillis: 10000,
            idleTimeoutMillis: 30000,
            max: 20, // Maximum number of clients in the pool
        });

        // Redis configuration
        this.redis = new Redis({
            host: config.redis.host,
            port: config.redis.port,
            password: config.redis.password,
            retryStrategy: (times) => {
                const delay = Math.min(times * 50, 2000);
                return delay;
            },
            connectTimeout: 10000,
            maxRetriesPerRequest: 3,
            enableReadyCheck: true
        });

        // Strapi configuration
        this.strapiConfig = {
            baseUrl: config.strapi.baseUrl,
            token: config.strapi.token,
            webhookSecret: config.strapi.webhookSecret
        };

        // Initialize database schema
        this.initializeDatabase().catch(error => {
            console.error('Failed to initialize database:', error);
            throw error;
        });

        // Setup connection error handlers
        this.setupErrorHandlers();
    }

    setupErrorHandlers() {
        // PostgreSQL error handling
        this.pgPool.on('error', (err) => {
            console.error('Unexpected error on idle PostgreSQL client', err);
            process.exit(-1);
        });

        // Redis error handling
        this.redis.on('error', (err) => {
            console.error('Redis connection error:', err);
        });

        this.redis.on('connect', () => {
            console.log('Successfully connected to Redis');
        });
    }

    async initializeDatabase() {
        const client = await this.pgPool.connect();
        try {
            await client.query('BEGIN');

            // Create users table with standard fields and custom fields JSONB
            await client.query(`
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    name TEXT NOT NULL,
                    email TEXT NOT NULL,
                    password TEXT NOT NULL,
                    role INTEGER NOT NULL,
                    custom_fields JSONB DEFAULT '{}'::jsonb,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
            `);

            // Create function to update updated_at timestamp
            await client.query(`
                CREATE OR REPLACE FUNCTION update_updated_at_column()
                RETURNS TRIGGER AS $$
                BEGIN
                    NEW.updated_at = CURRENT_TIMESTAMP;
                    RETURN NEW;
                END;
                $$ language 'plpgsql';
            `);

            // Create trigger for updating updated_at
            await client.query(`
                DROP TRIGGER IF EXISTS update_users_updated_at ON users;
                CREATE TRIGGER update_users_updated_at
                    BEFORE UPDATE ON users
                    FOR EACH ROW
                    EXECUTE FUNCTION update_updated_at_column();
            `);

            await client.query('COMMIT');
            console.log('Database schema initialized successfully');
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error initializing database:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    // Helper method to get Redis key for a user
    getRedisKey(companyId, userId) {
        return `company:${companyId}:user:${userId}`;
    }

    // Handle Strapi user creation
    async handleStrapiCreate(entry, companyId) {
        console.log('Handling Strapi user creation:', { entry, companyId });
        const client = await this.pgPool.connect();
        try {
            await client.query('BEGIN');

            // Extract standard fields and custom fields
            const { username, email, provider, confirmed, blocked, createdAt, updatedAt, publishedAt, role, ...customFields } = entry;

            // Structure custom fields with company scoping
            const scopedCustomFields = {
                [companyId]: customFields
            };

            // Insert user into PostgreSQL
            const result = await client.query(
                `INSERT INTO users (name, email, password, role, custom_fields)
                 VALUES ($1, $2, $3, $4, $5)
                 RETURNING *`,
                [
                    username,
                    email,
                    '', // Password is not provided in webhook
                    role.id,
                    scopedCustomFields
                ]
            );

            const user = result.rows[0];

            // Store in Redis
            const redisKey = this.getRedisKey(companyId, user.id);
            await this.redis.setex(
                redisKey,
                86400, // 24 hours in seconds
                JSON.stringify(user)
            );

            await client.query('COMMIT');
            console.log('User created successfully:', user);

            return user;
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error creating user:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    // Handle Strapi user update
    async handleStrapiUpdate(entry, companyId) {
        console.log('Handling Strapi user update:', { entry, companyId });
        const client = await this.pgPool.connect();
        try {
            await client.query('BEGIN');

            // Get existing user to preserve other companies' custom fields
            const existingUser = await client.query(
                'SELECT custom_fields FROM users WHERE email = $1',
                [entry.email]
            );

            // Extract standard fields and custom fields
            const { username, email, provider, confirmed, blocked, createdAt, updatedAt, publishedAt, role, ...customFields } = entry;

            // Merge existing custom fields with new ones, preserving other companies' data
            const existingCustomFields = existingUser.rows[0]?.custom_fields || {};
            const scopedCustomFields = {
                ...existingCustomFields,
                [companyId]: customFields
            };

            // Update user in PostgreSQL
            const result = await client.query(
                `UPDATE users 
                 SET name = $1, email = $2, role = $3,
                     custom_fields = $4,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE email = $5
                 RETURNING *`,
                [
                    username,
                    email,
                    role.id,
                    scopedCustomFields,
                    email
                ]
            );

            if (result.rows.length === 0) {
                throw new Error('User not found');
            }

            const user = result.rows[0];

            // Update Redis
            const redisKey = this.getRedisKey(companyId, user.id);
            await this.redis.setex(
                redisKey,
                86400,
                JSON.stringify(user)
            );

            await client.query('COMMIT');
            console.log('User updated successfully:', user);

            return user;
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error updating user:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    // Handle Strapi user deletion
    async handleStrapiDelete(entry, companyId) {
        console.log('Handling Strapi user deletion:', { entry, companyId });
        const client = await this.pgPool.connect();
        try {
            await client.query('BEGIN');

            // Get user before deletion
            const userResult = await client.query(
                'SELECT * FROM users WHERE email = $1',
                [entry.email]
            );

            if (userResult.rows.length === 0) {
                throw new Error('User not found');
            }

            const user = userResult.rows[0];

            // Remove company-specific custom fields
            const { [companyId]: removed, ...remainingCustomFields } = user.custom_fields;

            // If there are no remaining company associations, delete the user
            if (Object.keys(remainingCustomFields).length === 0) {
                await client.query(
                    'DELETE FROM users WHERE email = $1',
                    [entry.email]
                );
            } else {
                // Otherwise, update the custom fields to remove the company's data
                await client.query(
                    `UPDATE users 
                     SET custom_fields = $1,
                         updated_at = CURRENT_TIMESTAMP
                     WHERE email = $2`,
                    [remainingCustomFields, entry.email]
                );
            }

            // Delete from Redis
            const redisKey = this.getRedisKey(companyId, user.id);
            await this.redis.del(redisKey);
            console.log('Redis key deleted:', redisKey);

            await client.query('COMMIT');
            console.log('User deleted successfully:', user);

            return user;
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error deleting user:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    // Get user from Redis or PostgreSQL
    async getUser(userId, companyId) {
        try {
            // Try Redis first
            const redisKey = this.getRedisKey(companyId, userId);
            const cachedUser = await this.redis.get(redisKey);

            if (cachedUser) {
                const user = JSON.parse(cachedUser);
                // Ensure we only return the company-specific custom fields
                if (user.custom_fields) {
                    const { custom_fields, ...standardFields } = user;
                    return {
                        ...standardFields,
                        ...custom_fields[companyId]
                    };
                }
                return user;
            }

            // If not in Redis, get from PostgreSQL
            const result = await this.pgPool.query(
                'SELECT * FROM users WHERE id = $1',
                [userId]
            );

            if (result.rows.length === 0) {
                throw new Error('User not found');
            }

            const user = result.rows[0];
            
            // Ensure we only return the company-specific custom fields
            if (user.custom_fields) {
                const { custom_fields, ...standardFields } = user;
                const flatUser = {
                    ...standardFields,
                    ...custom_fields[companyId]
                };

                // Cache in Redis
                await this.redis.setex(
                    redisKey,
                    86400,
                    JSON.stringify(flatUser)
                );

                return flatUser;
            }

            return user;
        } catch (error) {
            throw error;
        }
    }

    // Close connections
    async close() {
        await this.pgPool.end();
        await this.redis.quit();
    }
}

module.exports = SyncClient; 