const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');
require('dotenv').config();

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'super-secure-secret-key-12345';

// 1. Fetch user salt for E2EE key derivation
router.get('/salt', async (req, res) => {
    const { username } = req.query;
    if (!username) {
        return res.status(400).json({ error: 'Username is required' });
    }

    try {
        const result = await db.query('SELECT salt FROM users WHERE username = $1', [username.toLowerCase().trim()]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({ salt: result.rows[0].salt });
    } catch (err) {
        res.status(500).json({ error: 'Database error' });
    }
});

// 2. Register new user
router.post('/register', async (req, res) => {
    const { username, password, salt } = req.body;
    if (!username || !password || !salt) {
        return res.status(400).json({ error: 'Username, password, and E2EE salt are required' });
    }

    const cleanUsername = username.toLowerCase().trim();
    if (cleanUsername.length < 3) {
        return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }

    try {
        // Check if username is taken
        const existCheck = await db.query('SELECT id FROM users WHERE username = $1', [cleanUsername]);
        if (existCheck.rows.length > 0) {
            return res.status(409).json({ error: 'Username is already taken' });
        }

        // Hash password with bcrypt
        const passwordHash = await bcrypt.hash(password, 10);

        // Insert into database
        await db.query(
            'INSERT INTO users (username, password_hash, salt) VALUES ($1, $2, $3)',
            [cleanUsername, passwordHash, salt]
        );

        res.status(201).json({ message: 'User registered successfully' });
    } catch (err) {
        console.error('Registration error:', err);
        res.status(500).json({ error: 'Server error during registration' });
    }
});

// 3. Authenticate and login user
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    const cleanUsername = username.toLowerCase().trim();

    try {
        const result = await db.query('SELECT * FROM users WHERE username = $1', [cleanUsername]);
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        const user = result.rows[0];
        const passwordMatch = await bcrypt.compare(password, user.password_hash);
        if (!passwordMatch) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        // Generate JWT token (expires in 30 days)
        const token = jwt.sign(
            { id: user.id, username: user.username },
            JWT_SECRET,
            { expiresIn: '30d' }
        );

        res.json({
            token,
            user: {
                id: user.id,
                username: user.username
            }
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Server error during login' });
    }
});

// 4. Authentication Middleware
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token missing' });
    }

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token' });
        }
        req.user = decoded;
        next();
    });
}

module.exports = {
    router,
    authenticateToken
};
