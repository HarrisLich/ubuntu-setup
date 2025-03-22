module.exports = {
    postgres: {
        user: 'postgres',
        host: '10.1.10.142',
        database: 'postgres',
        password: '_Welc0me',
        port: 5432
    },
    redis: {
        host: 'localhost',
        port: 6379,
        password: 'password123'
    },
    strapi: {
        baseUrl: 'http://localhost:1337',
        token: process.env.STRAPI_TOKEN,
        webhookSecret: process.env.STRAPI_WEBHOOK_SECRET
    }
}; 