module.exports = {
    postgres: {
        user: 'postgres',
        host: 'localhost',
        database: 'postgres',
        password: '_Welc0me',
        port: 5432
    },
    redis: {
        host: '10.1.10.138',
        port: 6379,
        password: 'password123',
        retryStrategy: (times) => {
            const delay = Math.min(times * 50, 2000);
            return delay;
        },
        connectTimeout: 10000,
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        showFriendlyErrorStack: true
    },
    strapi: {
        baseUrl: 'http://10.1.10.138:1337',
        token: 'e03e3195da111ca2d0713beb984d4e1dc082a7e05c21b430f291b0d231b750e7d80ebaada9155ed8ae7247e3c8c287cfa5d3aafef60d3dc95e8bce79244ac21d61706dd879d3799fab5a4a87e3b1fb8742dd00ef3bfe6028d02ec4412c59be6396f9aa5dd1b3189c3eba11d09ba52cf65a1905b58f8ee11b60b31aa44fb532cc'
    }
}; 