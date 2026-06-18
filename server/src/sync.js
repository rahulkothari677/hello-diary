const express = require('express');
const db = require('./db');
const { authenticateToken } = require('./auth');

const router = express.Router();

router.post('/', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const { lastSyncedTime, changes } = req.body;
    
    // Ensure lastSyncedTime is a valid number, default to 0
    const sinceTime = Number(lastSyncedTime) || 0;
    
    // Capture server-side sync time (in milliseconds)
    const serverSyncTime = Date.now();

    try {
        // Begin Transaction for atomic consistency
        await db.query('BEGIN');

        // 1. Process client changes
        if (Array.isArray(changes) && changes.length > 0) {
            for (const change of changes) {
                const { id, encrypted_data, updated_at, deleted } = change;
                if (!id || typeof encrypted_data !== 'string' || !updated_at) {
                    continue; // Skip invalid entries
                }

                // Check existing entry in db
                const checkRes = await db.query('SELECT updated_at FROM entries WHERE id = $1 AND user_id = $2', [id, userId]);
                
                if (checkRes.rows.length === 0) {
                    // Entry does not exist, insert it
                    await db.query(
                        'INSERT INTO entries (id, user_id, encrypted_data, updated_at, deleted) VALUES ($1, $2, $3, $4, $5)',
                        [id, userId, encrypted_data, Number(updated_at), !!deleted]
                    );
                } else {
                    const dbUpdatedAt = Number(checkRes.rows[0].updated_at);
                    const clientUpdatedAt = Number(updated_at);
                    
                    if (clientUpdatedAt > dbUpdatedAt) {
                        // Client version is newer, update db
                        await db.query(
                            'UPDATE entries SET encrypted_data = $1, updated_at = $2, deleted = $3 WHERE id = $4 AND user_id = $5',
                            [encrypted_data, clientUpdatedAt, !!deleted, id, userId]
                        );
                    }
                }
            }
        }

        // Commit Transaction
        await db.query('COMMIT');

        // 2. Fetch updates from server (newer than sinceTime)
        const updatesRes = await db.query(
            'SELECT id, encrypted_data, updated_at, deleted FROM entries WHERE user_id = $1 AND updated_at > $2',
            [userId, sinceTime]
        );

        // Filter out items that the client already has at the same or newer timestamp
        const clientChangesMap = new Map();
        if (Array.isArray(changes)) {
            changes.forEach(c => clientChangesMap.set(c.id, Number(c.updated_at)));
        }

        const updatesToSend = updatesRes.rows.filter(row => {
            const clientTime = clientChangesMap.get(row.id);
            if (clientTime !== undefined) {
                // If client just uploaded it, send back only if server's timestamp is strictly greater
                return Number(row.updated_at) > clientTime;
            }
            return true;
        });

        // Return updates and server sync timestamp
        res.json({
            updates: updatesToSend.map(row => ({
                id: row.id,
                encrypted_data: row.encrypted_data,
                updated_at: Number(row.updated_at),
                deleted: row.deleted
            })),
            syncTime: serverSyncTime
        });

    } catch (err) {
        // Rollback Transaction on error
        try {
            await db.query('ROLLBACK');
        } catch (rollbackErr) {
            console.error('Error during transaction rollback:', rollbackErr);
        }
        console.error('Sync error:', err);
        res.status(500).json({ error: 'Server error during sync' });
    }
});

module.exports = router;
