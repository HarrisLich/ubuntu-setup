const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const SyncClient = require('./SyncClient');
const config = require('./config');

// Initialize Express app
const app = express();
const port = process.env.PORT || 3000;

// Initialize SyncClient
const syncClient = new SyncClient(config);

// Middleware
app.use(bodyParser.json());

// Webhook signature verification middleware
const verifyWebhookSignature = (req, res, next) => {
    const signature = req.headers['strapi-signature'];
    if (!signature) {
        return res.status(401).json({ error: 'No signature provided' });
    }

    // Verify the webhook signature
    const hmac = crypto.createHmac('sha256', config.strapi.webhookSecret);
    const calculatedSignature = hmac
        .update(JSON.stringify(req.body))
        .digest('hex');

    if (signature !== calculatedSignature) {
        return res.status(401).json({ error: 'Invalid signature' });
    }

    next();
};

// Error handling middleware
const errorHandler = (err, req, res, next) => {
    console.error('Error details:', {
        message: err.message,
        stack: err.stack,
        status: err.status || 500,
        response: err.response?.data
    });
    res.status(err.status || 500).json({
        error: err.message || 'Internal Server Error',
        details: err.response?.data || null
    });
};

// Strapi webhook handler
app.post('/strapi/webhook', async (req, res, next) => {
    try {
        const { event, entry, model } = req.body;
        const companyId = req.headers['x-company-id'];

        if (!companyId) {
            return res.status(400).json({ error: 'x-company-id header is required' });
        }

        console.log('Received Strapi webhook:', { event, model, companyId, entry });

        // Only process user-related events
        if (model !== 'user') {
            return res.status(200).json({ message: 'Ignoring non-user event' });
        }

        switch (event) {
            case 'entry.create':
                await syncClient.handleStrapiCreate(entry, companyId);
                break;
            case 'entry.update':
                await syncClient.handleStrapiUpdate(entry, companyId);
                break;
            case 'entry.delete':
                await syncClient.handleStrapiDelete(entry, companyId);
                break;
            default:
                console.log('Unhandled event type:', event);
        }

        res.status(200).json({ message: 'Webhook processed successfully' });
    } catch (error) {
        console.error('Error processing webhook:', error);
        next(error);
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Apply error handling middleware
app.use(errorHandler);

// Start server
const server = app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
    console.log(`Strapi webhook endpoint: http://localhost:${port}/strapi/webhook`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM received. Closing server...');
    await syncClient.close();
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
}); 