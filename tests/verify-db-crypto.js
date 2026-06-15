/* ==========================================================================
   Hello Diary — Database & Cryptography Test Suite
   Runs inside test.html to verify zero-knowledge encryption, IndexedDB CRUD,
   settings retrieval, media attachments, and the 10-attempt lockout system.
   ========================================================================== */

'use strict';

(async function() {
    const outputEl = document.getElementById('test-output');
    
    function log(message) {
        console.log('[TEST LOG]', message);
        if (outputEl) {
            outputEl.textContent += '\n' + message;
        }
    }

    function assert(condition, message) {
        if (!condition) {
            throw new Error('ASSERTION FAILED: ' + message);
        }
    }

    try {
        log('--- STARTING HELLO DIARY TEST SUITE ---');

        // 1. Clean existing database
        log('Cleaning previous test databases...');
        await new Promise((resolve, reject) => {
            const req = indexedDB.deleteDatabase('HelloDiaryDB');
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });

        // 2. Initialize Database
        log('Initializing HelloDiaryDB...');
        const db = await HelloDB.initDatabase();
        assert(db !== null, 'Database instance is initialized');
        assert(db.objectStoreNames.contains('credentials'), 'Credentials store exists');
        assert(db.objectStoreNames.contains('entries'), 'Entries store exists');
        assert(db.objectStoreNames.contains('settings'), 'Settings store exists');
        assert(db.objectStoreNames.contains('media'), 'Media store exists');
        log('✓ Database initialization verified.');

        // 3. Save Credentials
        log('Setting up access credentials (PIN: "123456")...');
        await HelloDB.saveCredentials('123456');
        assert(await HelloDB.hasCredentials(), 'Credentials status should be true');
        log('✓ App Setup / credentials generation verified.');

        // 4. Verify Credentials (Success Case)
        log('Verifying unlock with CORRECT PIN ("123456")...');
        const result = await HelloDB.verifyCredentials('123456');
        assert(result.key instanceof CryptoKey, 'Success yields a valid CryptoKey object');
        assert(result.isDecoy === false, 'Decoy status should be false');
        log('✓ Unlock success verified.');

        // 5. Verify Credentials (Incorrect PIN & Lockout Case)
        log('Testing incorrect unlock attempts (attempts 1 to 9)...');
        for (let i = 1; i <= 9; i++) {
            try {
                await HelloDB.verifyCredentials('wrong_pin');
                assert(false, 'Should throw error on incorrect PIN');
            } catch (err) {
                assert(err.message.includes('Incorrect credentials'), `Attempt ${i} throws wrong credentials error: ` + err.message);
            }
        }

        log('Verifying that attempt 10 triggers LOCKOUT...');
        try {
            await HelloDB.verifyCredentials('wrong_pin');
            assert(false, 'Should throw lockout error on 10th failure');
        } catch (err) {
            assert(err.message.includes('Account locked'), '10th attempt throws lockout error: ' + err.message);
        }

        log('Verifying that further attempts remain blocked immediately...');
        try {
            await HelloDB.verifyCredentials('123456'); // Correct PIN should also be locked out now
            assert(false, 'Correct PIN should fail when locked');
        } catch (err) {
            assert(err.message.includes('Account locked'), 'Correct PIN fails on active lockout: ' + err.message);
        }
        log('✓ 10-attempt lockout system verified.');

        // 6. Reset database state for data storage tests (clear lockout)
        log('Recreating test database for CRUD tests...');
        HelloDB.closeDatabase();
        await new Promise((resolve, reject) => {
            const req = indexedDB.deleteDatabase('HelloDiaryDB');
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
        
        await HelloDB.saveCredentials('secret123');
        const { key } = await HelloDB.verifyCredentials('secret123');

        // 7. Insert Diary Entry (Encryption Check)
        log('Inserting a new entry containing sensitive text...');
        const originalEntry = {
            title: 'My Secret Journal',
            content: 'Today I brainstormed a secret business idea.',
            mood: 5,
            tags: ['ideas', 'business'],
            weather: 'sunny',
            location: 'Home Office'
        };

        const entryId = await HelloDB.insertEntry(originalEntry, key);
        assert(typeof entryId === 'string', 'Returned entry ID is a string');
        log(`✓ Entry successfully saved. ID: ${entryId}`);

        // 8. Low-Level Database Inspection (Verify Ciphertext)
        log('Querying raw IndexedDB records to check for encryption...');
        const rawRecord = await new Promise((resolve, reject) => {
            const transaction = HelloDB.initDatabase().then(dbInst => {
                const tx = dbInst.transaction(['entries'], 'readonly');
                const store = tx.objectStore('entries');
                const req = store.get(entryId);
                req.onsuccess = (e) => resolve(e.target.result);
                req.onerror = (e) => reject(e.target.error);
            });
        });

        assert(rawRecord.payload !== undefined, 'Raw record contains payload');
        assert(rawRecord.iv !== undefined, 'Raw record contains IV');
        
        // Ensure plaintext content is NOT visible in the database
        const isPlaintextVisible = rawRecord.payload.includes('brainstormed') || rawRecord.payload.includes('secret');
        assert(!isPlaintextVisible, 'Database payload does NOT leak plaintext details.');
        log('✓ Verified: Data is fully encrypted (ciphertext only in DB).');

        // 9. Retrieve and Decrypt Entry
        log('Retrieving and decrypting entry...');
        const decryptedEntry = await HelloDB.getDecryptedEntry(entryId, key);
        assert(decryptedEntry.title === originalEntry.title, 'Title decrypted matches');
        assert(decryptedEntry.content === originalEntry.content, 'Content decrypted matches');
        assert(decryptedEntry.mood === originalEntry.mood, 'Mood decrypted matches');
        assert(decryptedEntry.tags.includes('ideas'), 'Tags decrypted matches');
        log('✓ Verified: Decrypted content matches original input.');

        // 10. Update Entry
        log('Testing entry update...');
        decryptedEntry.content = 'Updated secret contents.';
        await HelloDB.updateEntry(decryptedEntry, key);

        const updatedEntry = await HelloDB.getDecryptedEntry(entryId, key);
        assert(updatedEntry.content === 'Updated secret contents.', 'Content successfully updated and decrypted');
        log('✓ Entry update verified.');

        // 11. Test Unencrypted Settings Store
        log('Testing settings store (get/set)...');
        await HelloDB.setSetting('app_theme', 'cosmic-universe');
        const savedThemeSetting = await HelloDB.getSetting('app_theme');
        assert(savedThemeSetting === 'cosmic-universe', 'Saved theme setting matches');
        log('✓ Settings store verified.');

        // 12. Test Encrypted Media Attachments
        log('Testing encrypted binary media storage (ArrayBuffer)...');
        const rawBytes = new Uint8Array([72, 101, 108, 108, 111, 32, 68, 105, 97, 114, 121]); // "Hello Diary"
        const mediaId = await HelloDB.saveMedia(entryId, rawBytes.buffer, 'text/plain', key);
        assert(typeof mediaId === 'string', 'Media ID returned is a string');
        
        // Decrypt media
        const decryptedMedia = await HelloDB.getMedia(mediaId, key);
        assert(decryptedMedia.mimeType === 'text/plain', 'Media mimeType decrypted matches');
        
        const decryptedBytes = new Uint8Array(decryptedMedia.buffer);
        assert(decryptedBytes.length === rawBytes.length, 'Decrypted media length matches');
        for (let i = 0; i < rawBytes.length; i++) {
            assert(decryptedBytes[i] === rawBytes[i], `Byte ${i} matches: ${decryptedBytes[i]}`);
        }
        log('✓ Encrypted media attachments verified.');

        // 13. Delete Entry
        log('Deleting entry and associated media...');
        await HelloDB.deleteEntry(entryId);

        const deletedCheck = await HelloDB.getDecryptedEntry(entryId, key);
        assert(deletedCheck === null, 'Entry is deleted');
        
        const deletedMediaCheck = await HelloDB.getMedia(mediaId, key);
        assert(deletedMediaCheck === null, 'Associated media is deleted');
        log('✓ Delete cascade verified.');

        log('--- ALL TESTS PASSED SUCCESSFULLY! ---');
        log('TESTS_STATUS: PASSED');
        
    } catch (error) {
        log('!!! TEST SUITE FAILED !!!');
        log('Error: ' + error.stack);
        log('TESTS_STATUS: FAILED');
    }
})();
