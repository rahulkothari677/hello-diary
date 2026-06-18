const express = require('express');
const cors = require('cors');
const db = require('./db');
const auth = require('./auth');
const sync = require('./sync');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for frontend web views and Capacitor local origin
app.use(cors({
    origin: '*', // In production, restrict to app scheme / website domains
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' })); // Support base64 inline drawing sync payload sizes

// Routes
app.use('/api/auth', auth.router);
app.use('/api/sync', sync);

// Health check endpoint (for load balancer target groups & health polling)
app.get('/health', (req, res) => {
    res.json({ status: 'OK', time: new Date() });
});

// Start server after verifying DB connection and schema initialization
async function startServer() {
    try {
        await db.initDB();
        app.listen(PORT, () => {
            console.log(`========================================================`);
            console.log(`🚀 Hello Diary Backend running on port ${PORT}`);
            console.log(`🛡️  Zero-Knowledge End-to-End Encryption enabled`);
            console.log(`========================================================`);
        });
    } catch (err) {
        console.error('Failed to start server due to database init failure:', err);
        process.exit(1);
    }
}

startServer();
