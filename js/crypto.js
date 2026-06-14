/* ==========================================================================
   Hello Diary — Cryptographic Engine
   Handles AES-256-GCM encryption/decryption, PBKDF2 key derivation,
   and random value generation using browser Web Crypto API.
   ========================================================================== */

'use strict';

const HelloCrypto = (function() {
    
    // Constant parameters
    const PBKDF2_ITERATIONS = 600000;
    const SALT_BYTE_LENGTH = 16;
    const IV_BYTE_LENGTH = 12;

    /**
     * Converts an ArrayBuffer to a Hexadecimal string.
     */
    function bufferToHex(buffer) {
        return Array.from(new Uint8Array(buffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    /**
     * Converts a Hexadecimal string to an ArrayBuffer.
     */
    function hexToBuffer(hex) {
        if (!hex || hex.length % 2 !== 0) {
            throw new Error('Invalid hex string');
        }
        const bytes = new Uint8Array(hex.length / 2);
        for (let i = 0; i < bytes.length; i++) {
            bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
        }
        return bytes.buffer;
    }

    /**
     * Generates a cryptographically secure random salt (hex format).
     */
    function generateSalt() {
        const salt = window.crypto.getRandomValues(new Uint8Array(SALT_BYTE_LENGTH));
        return bufferToHex(salt);
    }

    /**
     * Derives a cryptographic key from a PIN or Pattern string using PBKDF2.
     * @param {string} password - User PIN/Pattern input.
     * @param {string} saltHex - 16-byte random salt hex string.
     * @returns {Promise<CryptoKey>} - Derived CryptoKey object.
     */
    async function deriveKey(password, saltHex) {
        const encoder = new TextEncoder();
        const passwordBytes = encoder.encode(password);
        const saltBytes = new Uint8Array(hexToBuffer(saltHex));

        // Import password as raw key material
        const baseKey = await window.crypto.subtle.importKey(
            'raw',
            passwordBytes,
            'PBKDF2',
            false,
            ['deriveKey']
        );

        // Derive AES-GCM 256-bit key
        return window.crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: saltBytes,
                iterations: PBKDF2_ITERATIONS,
                hash: 'SHA-256'
            },
            baseKey,
            {
                name: 'AES-GCM',
                length: 256
            },
            false, // Not exportable
            ['encrypt', 'decrypt']
        );
    }

    /**
     * Encrypts a plaintext string using AES-256-GCM.
     * @param {string} plaintext - Content to encrypt.
     * @param {CryptoKey} key - The derived AES CryptoKey.
     * @returns {Promise<{ ciphertext: string, iv: string }>} - Encrypted hex payload and unique IV.
     */
    async function encryptString(plaintext, key) {
        const encoder = new TextEncoder();
        const plaintextBytes = encoder.encode(plaintext);
        
        // Generate unique 12-byte IV
        const iv = window.crypto.getRandomValues(new Uint8Array(IV_BYTE_LENGTH));

        const ciphertextBuffer = await window.crypto.subtle.encrypt(
            {
                name: 'AES-GCM',
                iv: iv
            },
            key,
            plaintextBytes
        );

        return {
            ciphertext: bufferToHex(ciphertextBuffer),
            iv: bufferToHex(iv)
        };
    }

    /**
     * Decrypts a ciphertext hex string using AES-256-GCM.
     * @param {string} ciphertextHex - Encrypted data in hex format.
     * @param {string} ivHex - Unique IV used during encryption in hex.
     * @param {CryptoKey} key - The derived AES CryptoKey.
     * @returns {Promise<string>} - Decrypted plaintext string.
     */
    async function decryptString(ciphertextHex, ivHex, key) {
        const ciphertextBuffer = hexToBuffer(ciphertextHex);
        const ivBuffer = hexToBuffer(ivHex);

        const decryptedBuffer = await window.crypto.subtle.decrypt(
            {
                name: 'AES-GCM',
                iv: new Uint8Array(ivBuffer)
            },
            key,
            ciphertextBuffer
        );

        const decoder = new TextDecoder();
        return decoder.decode(decryptedBuffer);
    }

    /**
     * Encrypts a binary ArrayBuffer using AES-256-GCM.
     * @param {ArrayBuffer} buffer - Raw buffer data to encrypt.
     * @param {CryptoKey} key - The derived AES CryptoKey.
     * @returns {Promise<{ ciphertext: string, iv: string }>} - Encrypted hex payload and unique IV.
     */
    async function encryptBuffer(buffer, key) {
        const iv = window.crypto.getRandomValues(new Uint8Array(IV_BYTE_LENGTH));

        const ciphertextBuffer = await window.crypto.subtle.encrypt(
            {
                name: 'AES-GCM',
                iv: iv
            },
            key,
            buffer
        );

        return {
            ciphertext: bufferToHex(ciphertextBuffer),
            iv: bufferToHex(iv)
        };
    }

    /**
     * Decrypts an encrypted hex string back into a binary ArrayBuffer.
     * @param {string} ciphertextHex - Encrypted data in hex.
     * @param {string} ivHex - Unique IV hex.
     * @param {CryptoKey} key - The derived AES CryptoKey.
     * @returns {Promise<ArrayBuffer>} - Decrypted raw buffer.
     */
    async function decryptBuffer(ciphertextHex, ivHex, key) {
        const ciphertextBuffer = hexToBuffer(ciphertextHex);
        const ivBuffer = hexToBuffer(ivHex);

        return window.crypto.subtle.decrypt(
            {
                name: 'AES-GCM',
                iv: new Uint8Array(ivBuffer)
            },
            key,
            ciphertextBuffer
        );
    }

    // Public API Exports
    return {
        generateSalt,
        deriveKey,
        encryptString,
        decryptString,
        encryptBuffer,
        decryptBuffer,
        bufferToHex,
        hexToBuffer
    };

})();

// Export globally for modules or browser context
if (typeof module !== 'undefined' && module.exports) {
    module.exports = HelloCrypto;
} else {
    window.HelloCrypto = HelloCrypto;
}
