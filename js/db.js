/* ==========================================================================
   Hello Diary — IndexedDB Wrapper System
   Manages all local IndexedDB storage, schema configurations, and
   encrypted CRUD operations.
   ========================================================================== */

'use strict';

const HelloDB = (function() {

    const DB_NAME = 'HelloDiaryDB';
    const DB_VERSION = 3;
    let dbInstance = null;

    /**
     * Helper to generate a cryptographically secure UUID (RFC4122).
     */
    function generateUUID() {
        return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
            (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
        );
    }

    /**
     * Initializes the IndexedDB database connection and creates object stores.
     */
    function initDatabase() {
        return new Promise((resolve, reject) => {
            if (dbInstance) {
                return resolve(dbInstance);
            }

            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = (event) => {
                console.error('Database failed to open:', event.target.error);
                reject(event.target.error);
            };

            request.onsuccess = (event) => {
                dbInstance = event.target.result;
                resolve(dbInstance);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // 1. Credentials Store (stores configuration, salt, and verification signature)
                if (!db.objectStoreNames.contains('credentials')) {
                    db.createObjectStore('credentials', { keyPath: 'id' });
                }

                // 2. Entries Store (stores encrypted diary records)
                if (!db.objectStoreNames.contains('entries')) {
                    const entriesStore = db.createObjectStore('entries', { keyPath: 'id' });
                    entriesStore.createIndex('date', 'date', { unique: false });
                }

                // 3. Settings Store (stores unencrypted application settings)
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'key' });
                }

                // 4. Media Store (stores encrypted attachments like voice notes or images)
                if (!db.objectStoreNames.contains('media')) {
                    const mediaStore = db.createObjectStore('media', { keyPath: 'id' });
                    mediaStore.createIndex('entryId', 'entryId', { unique: false });
                }

                // 5. Intruder Captures Store (stores unencrypted intruder snapshots)
                if (!db.objectStoreNames.contains('intruder_captures')) {
                    db.createObjectStore('intruder_captures', { keyPath: 'id' });
                }

                // 6. Deleted Entries Store (tombstone store for background cloud sync)
                if (!db.objectStoreNames.contains('deleted_entries')) {
                    db.createObjectStore('deleted_entries', { keyPath: 'id' });
                }
            };
        });
    }

    /**
     * Closes the database connection and resets the cache.
     */
    function closeDatabase() {
        if (dbInstance) {
            dbInstance.close();
            dbInstance = null;
        }
    }

    /**
     * Saves user authentication credentials during setup.
     * Generates a unique salt, derives key, and encrypts a verification signature phrase.
     */
    async function saveCredentials(pinOrPattern) {
        const db = await initDatabase();
        
        // 1. Generate salt and derive temporary key
        const salt = HelloCrypto.generateSalt();
        const key = await HelloCrypto.deriveKey(pinOrPattern, salt);

        // 2. Encrypt a static signature phrase
        const verificationPhrase = 'HelloDiarySanctuary';
        const { ciphertext, iv } = await HelloCrypto.encryptString(verificationPhrase, key);

        const config = {
            id: 'auth_config',
            salt: salt,
            verificationIv: iv,
            verificationCiphertext: ciphertext,
            failedAttempts: 0,
            lockoutUntil: 0
        };

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['credentials'], 'readwrite');
            const store = transaction.objectStoreNames ? transaction.objectStore( 'credentials' ) : transaction.objectStore('credentials');
            const request = store.put(config);

            request.onsuccess = () => resolve();
            request.onerror = (event) => reject(event.target.error);
        });
    }

    /**
     * Checks if credentials config exists in the database (checking if user has setup the app).
     */
    async function hasCredentials() {
        const db = await initDatabase();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['credentials'], 'readonly');
            const store = transaction.objectStore('credentials');
            const request = store.get('auth_config');

            request.onsuccess = (event) => {
                resolve(!!event.target.result);
            };
            request.onerror = (event) => reject(event.target.error);
        });
    }

    /**
     * Retrieves the current lockout configuration from database.
     */
    async function getLockoutConfig() {
        const db = await initDatabase();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['credentials'], 'readonly');
            const store = transaction.objectStore('credentials');
            const request = store.get('auth_config');

            request.onsuccess = (event) => {
                const result = event.target.result;
                resolve(result ? { failedAttempts: result.failedAttempts || 0, lockoutUntil: result.lockoutUntil || 0 } : null);
            };
            request.onerror = (event) => reject(event.target.error);
        });
    }


    /**
     * Verifies the user credentials and returns the derived key on success.
     * Implements a lockout mechanism of 15 minutes after 10 failed attempts.
     */
    async function verifyCredentials(pinOrPattern) {
        const db = await initDatabase();

        // 1. Fetch credentials details
        const config = await new Promise((resolve, reject) => {
            const transaction = db.transaction(['credentials'], 'readonly');
            const store = transaction.objectStore('credentials');
            const request = store.get('auth_config');
            request.onsuccess = (event) => resolve(event.target.result);
            request.onerror = (event) => reject(event.target.error);
        });

        if (!config) {
            throw new Error('Database credentials not initialized.');
        }

        // 2. Lockout Verification
        if (config.lockoutUntil && config.lockoutUntil > Date.now()) {
            const minutesLeft = Math.ceil((config.lockoutUntil - Date.now()) / (1000 * 60));
            throw new Error(`Account locked due to 10 failed attempts. Try again in ${minutesLeft} minute(s).`);
        }

        try {
            // 3. Derive key and try to decrypt signature phrase
            const key = await HelloCrypto.deriveKey(pinOrPattern, config.salt);
            const decrypted = await HelloCrypto.decryptString(
                config.verificationCiphertext,
                config.verificationIv,
                key
            );

            // 4. Verify match
            if (decrypted === 'HelloDiarySanctuary') {
                // Success: reset failures and lockout
                config.failedAttempts = 0;
                config.lockoutUntil = 0;
                await updateAuthConfig(config);
                return { key, isDecoy: false };
            } else {
                throw new Error('Invalid signature decrypted.'); // Should not happen under AES-GCM
            }
        } catch (error) {
            // If primary key decryption fails, check if it matches the decoy credentials
            if (config.decoyVerificationCiphertext) {
                try {
                    const decoyKey = await HelloCrypto.deriveKey(pinOrPattern, config.decoySalt);
                    const decryptedDecoy = await HelloCrypto.decryptString(
                        config.decoyVerificationCiphertext,
                        config.decoyVerificationIv,
                        decoyKey
                    );
                    
                    if (decryptedDecoy === 'HelloDiaryDecoy') {
                        // Success for Decoy PIN!
                        config.failedAttempts = 0;
                        config.lockoutUntil = 0;
                        await updateAuthConfig(config);
                        return { key: decoyKey, isDecoy: true };
                    }
                } catch (decoyErr) {
                    // Decoy decryption failed as well, continue to normal failure block
                }
            }

            // Decryption failure = Incorrect PIN/Pattern
            config.failedAttempts = (config.failedAttempts || 0) + 1;
            let msg = '';

            if (config.failedAttempts >= 10) {
                config.lockoutUntil = Date.now() + 15 * 60 * 1000; // 15 mins block
                msg = 'Account locked for 15 minutes after 10 failed attempts.';
            } else {
                const remaining = 10 - config.failedAttempts;
                msg = `Incorrect credentials. ${remaining} attempt(s) remaining.`;
            }

            await updateAuthConfig(config);
            throw new Error(msg);
        }
    }

    /**
     * Updates auth configuration record (failed attempts/lockout).
     */
    async function updateAuthConfig(config) {
        const db = await initDatabase();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['credentials'], 'readwrite');
            const store = transaction.objectStore('credentials');
            const request = store.put(config);
            request.onsuccess = () => resolve();
            request.onerror = (event) => reject(event.target.error);
        });
    }

    /**
     * Inserts a new encrypted diary entry.
     * @param {object} entryObj - Plaintext entry object { date, title, content, tags:[], mood:number, weather, location }.
     * @param {CryptoKey} key - Authentication derived cryptographic key.
     */
    async function insertEntry(entryObj, key) {
        const db = await initDatabase();
        
        // Prepare plaintext payload string
        const payloadStr = JSON.stringify({
            title: entryObj.title || '',
            content: entryObj.content || '',
            tags: entryObj.tags || [],
            mood: entryObj.mood || 3,
            weather: entryObj.weather || '',
            location: entryObj.location || '',
            favorite: !!entryObj.favorite
        });

        // Encrypt payload
        const { ciphertext, iv } = await HelloCrypto.encryptString(payloadStr, key);

        const record = {
            id: entryObj.id || generateUUID(),
            date: entryObj.date || Date.now(),
            updatedAt: entryObj.updatedAt || Date.now(),
            payload: ciphertext,
            iv: iv
        };

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['entries'], 'readwrite');
            const store = transaction.objectStore('entries');
            const request = store.put(record);

            request.onsuccess = () => resolve(record.id);
            request.onerror = (event) => reject(event.target.error);
        });
    }

    /**
     * Updates an existing encrypted diary entry.
     * Same encryption logic as insert.
     */
    async function updateEntry(entryObj, key) {
        if (!entryObj.id) {
            throw new Error('Entry ID is required for updates.');
        }
        return insertEntry(entryObj, key); // Put will overwrite existing by key path 'id'
    }

    /**
     * Deletes a diary entry by ID. Also deletes associated media attachments.
     */
    async function deleteEntry(entryId) {
        const db = await initDatabase();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['entries', 'media', 'deleted_entries'], 'readwrite');
            
            // Delete entry
            const entriesStore = transaction.objectStore('entries');
            entriesStore.delete(entryId);

            // Add to deleted_entries tombstone
            const deletedStore = transaction.objectStore('deleted_entries');
            deletedStore.put({ id: entryId, deletedAt: Date.now() });

            // Delete media matching entryId (via index query)
            const mediaStore = transaction.objectStore('media');
            const index = mediaStore.index('entryId');
            const request = index.openCursor(IDBKeyRange.only(entryId));

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    mediaStore.delete(cursor.primaryKey);
                    cursor.continue();
                }
            };

            transaction.oncomplete = () => resolve();
            transaction.onerror = (event) => reject(event.target.error);
        });
    }

    /**
     * Fetches and decrypts a single diary entry by ID.
     */
    async function getDecryptedEntry(entryId, key) {
        const db = await initDatabase();
        
        const record = await new Promise((resolve, reject) => {
            const transaction = db.transaction(['entries'], 'readonly');
            const store = transaction.objectStore('entries');
            const request = store.get(entryId);
            request.onsuccess = (event) => resolve(event.target.result);
            request.onerror = (event) => reject(event.target.error);
        });

        if (!record) return null;

        const plaintextStr = await HelloCrypto.decryptString(record.payload, record.iv, key);
        const payload = JSON.parse(plaintextStr);

        return {
            id: record.id,
            date: record.date,
            ...payload
        };
    }

    /**
     * Fetches, decrypts, and returns all diary entries sorted by date (reverse chronological).
     */
    async function getAllDecryptedEntries(key) {
        const db = await initDatabase();

        // 1. Fetch all raw records
        const records = await new Promise((resolve, reject) => {
            const transaction = db.transaction(['entries'], 'readonly');
            const store = transaction.objectStore('entries');
            const index = store.index('date');
            
            // Open cursor in reverse order (newest first)
            const request = index.openCursor(null, 'prev');
            const list = [];

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    list.push(cursor.value);
                    cursor.continue();
                } else {
                    resolve(list);
                }
            };
            request.onerror = (event) => reject(event.target.error);
        });

        // 2. Decrypt all entries asynchronously
        const decryptedList = [];
        for (const record of records) {
            try {
                const plaintext = await HelloCrypto.decryptString(record.payload, record.iv, key);
                const payload = JSON.parse(plaintext);
                decryptedList.push({
                    id: record.id,
                    date: record.date,
                    ...payload
                });
            } catch (err) {
                console.error(`Failed to decrypt entry ${record.id}:`, err);
                // Gracefully ignore corrupted records or those encrypted with other keys
            }
        }

        return decryptedList;
    }

    /**
     * Saves an unencrypted setting.
     */
    async function setSetting(key, value) {
        const db = await initDatabase();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['settings'], 'readwrite');
            const store = transaction.objectStore('settings');
            const request = store.put({ key, value });

            request.onsuccess = () => resolve();
            request.onerror = (event) => reject(event.target.error);
        });
    }

    /**
     * Retrieves an unencrypted setting.
     */
    async function getSetting(key) {
        const db = await initDatabase();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['settings'], 'readonly');
            const store = transaction.objectStore('settings');
            const request = store.get(key);

            request.onsuccess = (event) => {
                resolve(event.target.result ? event.target.result.value : null);
            };
            request.onerror = (event) => reject(event.target.error);
        });
    }

    /**
     * Saves an encrypted file attachment (voice note, image) associated with an entry.
     * @param {string} entryId - Associated diary entry UUID.
     * @param {ArrayBuffer} arrayBuffer - Raw media bytes.
     * @param {string} mimeType - The mimeType of the media (e.g. 'image/png').
     * @param {CryptoKey} key - Encryption derived key.
     * @returns {Promise<string>} - Media ID.
     */
    async function saveMedia(entryId, arrayBuffer, mimeType, key) {
        const db = await initDatabase();

        // Encrypt buffer
        const { ciphertext, iv } = await HelloCrypto.encryptBuffer(arrayBuffer, key);

        const record = {
            id: generateUUID(),
            entryId: entryId,
            payload: ciphertext,
            iv: iv,
            mimeType: mimeType
        };

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['media'], 'readwrite');
            const store = transaction.objectStore('media');
            const request = store.put(record);

            request.onsuccess = () => resolve(record.id);
            request.onerror = (event) => reject(event.target.error);
        });
    }

    /**
     * Retrieves and decrypts a media attachment.
     * @returns {Promise<{ mimeType: string, buffer: ArrayBuffer }>}
     */
    async function getMedia(mediaId, key) {
        const db = await initDatabase();

        const record = await new Promise((resolve, reject) => {
            const transaction = db.transaction(['media'], 'readonly');
            const store = transaction.objectStore('media');
            const request = store.get(mediaId);
            request.onsuccess = (event) => resolve(event.target.result);
            request.onerror = (event) => reject(event.target.error);
        });

        if (!record) return null;

        const decryptedBuffer = await HelloCrypto.decryptBuffer(record.payload, record.iv, key);

        return {
            mimeType: record.mimeType,
            buffer: decryptedBuffer
        };
    }

    async function getAllRawEntries() {
        const db = await initDatabase();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['entries'], 'readonly');
            const store = transaction.objectStore('entries');
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = (event) => reject(event.target.error);
        });
    }

    async function getAllSettings() {
        const db = await initDatabase();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['settings'], 'readonly');
            const store = transaction.objectStore('settings');
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = (event) => reject(event.target.error);
        });
    }

    async function restoreRawEntry(record) {
        const db = await initDatabase();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['entries'], 'readwrite');
            const store = transaction.objectStore('entries');
            const request = store.put(record);
            request.onsuccess = () => resolve();
            request.onerror = (event) => reject(event.target.error);
        });
    }

    async function restoreSetting(record) {
        const db = await initDatabase();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['settings'], 'readwrite');
            const store = transaction.objectStore('settings');
            const request = store.put(record);
            request.onsuccess = () => resolve();
            request.onerror = (event) => reject(event.target.error);
        });
    }

    async function saveDecoyCredentials(pinOrPattern) {
        const db = await initDatabase();
        
        // Fetch credentials details
        const config = await new Promise((resolve, reject) => {
            const transaction = db.transaction(['credentials'], 'readonly');
            const store = transaction.objectStore('credentials');
            const request = store.get('auth_config');
            request.onsuccess = (event) => resolve(event.target.result);
            request.onerror = (event) => reject(event.target.error);
        });

        if (!config) {
            throw new Error('Database credentials not initialized.');
        }

        if (pinOrPattern === null) {
            // Disable decoy mode
            config.decoySalt = null;
            config.decoyVerificationCiphertext = null;
            config.decoyVerificationIv = null;
            await updateAuthConfig(config);
            return;
        }

        // Generate decoy salt and derive key
        const decoySalt = HelloCrypto.generateSalt();
        const decoyKey = await HelloCrypto.deriveKey(pinOrPattern, decoySalt);
        
        // Encrypt verification phrase "HelloDiaryDecoy"
        const { ciphertext, iv } = await HelloCrypto.encryptString('HelloDiaryDecoy', decoyKey);
        
        config.decoySalt = decoySalt;
        config.decoyVerificationCiphertext = ciphertext;
        config.decoyVerificationIv = iv;
        
        await updateAuthConfig(config);
    }

    async function saveIntruderCapture(imageDataUrl) {
        const db = await initDatabase();
        const record = {
            id: generateUUID(),
            timestamp: Date.now(),
            image: imageDataUrl
        };
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['intruder_captures'], 'readwrite');
            const store = transaction.objectStore('intruder_captures');
            const request = store.put(record);
            request.onsuccess = () => resolve(record);
            request.onerror = (event) => reject(event.target.error);
        });
    }

    async function getIntruderCaptures() {
        const db = await initDatabase();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['intruder_captures'], 'readonly');
            const store = transaction.objectStore('intruder_captures');
            const request = store.getAll();
            request.onsuccess = () => {
                const results = request.result || [];
                // Sort by timestamp descending
                results.sort((a, b) => b.timestamp - a.timestamp);
                resolve(results);
            };
            request.onerror = (event) => reject(event.target.error);
        });
    }

    async function deleteIntruderCapture(id) {
        const db = await initDatabase();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['intruder_captures'], 'readwrite');
            const store = transaction.objectStore('intruder_captures');
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = (event) => reject(event.target.error);
        });
    }

    async function clearIntruderCaptures() {
        const db = await initDatabase();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['intruder_captures'], 'readwrite');
            const store = transaction.objectStore('intruder_captures');
            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = (event) => reject(event.target.error);
        });
    }

    async function getDeletedEntries() {
        const db = await initDatabase();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['deleted_entries'], 'readonly');
            const store = transaction.objectStore('deleted_entries');
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = (event) => reject(event.target.error);
        });
    }

    async function clearDeletedEntries(ids) {
        if (!ids || ids.length === 0) return;
        const db = await initDatabase();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['deleted_entries'], 'readwrite');
            const store = transaction.objectStore('deleted_entries');
            ids.forEach(id => store.delete(id));
            transaction.oncomplete = () => resolve();
            transaction.onerror = (event) => reject(event.target.error);
        });
    }

    // Public API Exports
    return {
        initDatabase,
        saveCredentials,
        hasCredentials,
        getLockoutConfig,
        verifyCredentials,
        insertEntry,
        updateEntry,
        deleteEntry,
        getDecryptedEntry,
        getAllDecryptedEntries,
        setSetting,
        getSetting,
        saveMedia,
        getMedia,
        closeDatabase,
        getAllRawEntries,
        getAllSettings,
        restoreRawEntry,
        restoreSetting,
        saveDecoyCredentials,
        saveIntruderCapture,
        getIntruderCaptures,
        deleteIntruderCapture,
        clearIntruderCaptures,
        getDeletedEntries,
        clearDeletedEntries
    };

})();

// Export globally
if (typeof module !== 'undefined' && module.exports) {
    module.exports = HelloDB;
} else {
    window.HelloDB = HelloDB;
}
