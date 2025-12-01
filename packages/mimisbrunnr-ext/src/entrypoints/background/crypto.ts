/**
 * Cryptographic Functions for Decentralized Identity (MM-28)
 *
 * This module implements all cryptographic operations for the extension:
 * - Scrypt-based key derivation with dual-salt architecture
 * - Ed25519 keypair generation and DID creation
 * - XSalsa20-Poly1305 authenticated encryption for content
 * - Passphrase validation and security checks
 *
 * Architecture:
 * - Identity salt (constant): Derives Ed25519 keypair from passphrase
 * - Content salt (random): Derives encryption key for manifests/collections
 * - Single passphrase workflow: User enters one passphrase for both operations
 *
 * Security parameters (from technical spec):
 * - Scrypt: N=2^15 (32768), r=8, p=1, output=32 bytes
 * - Passphrase: Minimum 16 characters
 * - Ed25519: 32-byte public key, 64-byte secret key
 * - XSalsa20-Poly1305: 24-byte nonce, authenticated encryption
 *
 * @remarks
 * Missing functionality (to be added in later tickets):
 * - TODO(MM-36): No rate limiting on crypto operations (brute force protection)
 * - TODO(MM-36): No secure memory clearing after use
 * - TODO(MM-35): No passphrase entropy validation (only length check)
 * - TODO(Epic 2): No key rotation mechanism
 * - TODO(Epic 2): No backup/recovery for lost passphrases
 */

import { scrypt } from 'scrypt-js';
import nacl from 'tweetnacl';
import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex } from '@noble/hashes/utils';

// ============================================================================
// Types
// ============================================================================

/**
 * W3C DID Core verification method
 */
export interface VerificationMethod {
    id: string;
    type: 'Ed25519VerificationKey2018';
    controller: string;
    publicKeyMultibase: string;
}

/**
 * DID document service endpoint
 */
export interface ServiceEndpoint {
    id: string;
    type: string;
    serviceEndpoint: string;
}

/**
 * W3C DID Core document structure
 * Always published unencrypted to IPFS
 */
export interface DIDDocument {
    '@context': string[];
    id: string;
    verificationMethod: VerificationMethod[];
    assertionMethod: string[];
    service: ServiceEndpoint[];
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Constant salt for identity key derivation
 * Used to derive Ed25519 keypair from passphrase deterministically
 */
const IDENTITY_SALT = 'xcom-did-v1';

/**
 * Scrypt parameters (from technical spec)
 * Balanced for UX & security in browser environment
 */
const SCRYPT_PARAMS = {
    N: 1 << 15, // 32768 - CPU/memory cost parameter
    r: 8, // Block size parameter
    p: 1, // Parallelization parameter
    dkLen: 32, // Derived key length in bytes
};

/**
 * Content encryption salt length (random, stored with encrypted content)
 */
const CONTENT_SALT_LENGTH = 32;

/**
 * Nonce length for XSalsa20-Poly1305
 */
const NONCE_LENGTH = 24;

// ============================================================================
// Key Derivation
// ============================================================================

/**
 * Derive a 32-byte key from passphrase using scrypt
 *
 * @param passphrase - User's passphrase
 * @param salt - Salt (string or Uint8Array)
 * @returns Derived key (32 bytes)
 *
 * @remarks
 * This is the core KDF used for both:
 * 1. Identity key derivation (constant IDENTITY_SALT)
 * 2. Content encryption key derivation (random salt)
 *
 * TODO(MM-36): Add progress callback for long-running operations
 */
async function deriveKey(
    passphrase: string,
    salt: string | Uint8Array
): Promise<Uint8Array> {
    const passphraseBytes = new TextEncoder().encode(passphrase);
    const saltBytes =
        typeof salt === 'string' ? new TextEncoder().encode(salt) : salt;

    const derivedKey = await scrypt(
        passphraseBytes,
        saltBytes,
        SCRYPT_PARAMS.N,
        SCRYPT_PARAMS.r,
        SCRYPT_PARAMS.p,
        SCRYPT_PARAMS.dkLen
    );

    // TODO(MM-36): Clear sensitive data from memory
    // passphraseBytes.fill(0);

    return new Uint8Array(derivedKey);
}

/**
 * Derive Ed25519 seed from passphrase for identity keypair
 * Uses constant IDENTITY_SALT for deterministic generation
 *
 * @param passphrase - User's passphrase
 * @returns 32-byte seed for Ed25519 keypair
 */
export async function deriveIdentitySeed(
    passphrase: string
): Promise<Uint8Array> {
    return deriveKey(passphrase, IDENTITY_SALT);
}

/**
 * Derive content encryption key from passphrase
 * Uses provided salt (random, stored with encrypted content)
 *
 * @param passphrase - User's passphrase
 * @param salt - Content-specific salt
 * @returns 32-byte encryption key
 */
async function deriveContentKey(
    passphrase: string,
    salt: Uint8Array
): Promise<Uint8Array> {
    return deriveKey(passphrase, salt);
}

// ============================================================================
// Ed25519 and DID Operations
// ============================================================================

/**
 * Generate Ed25519 keypair from seed
 *
 * @param seed - 32-byte seed
 * @returns Ed25519 keypair
 */
export function generateKeypairFromSeed(seed: Uint8Array): nacl.SignKeyPair {
    return nacl.sign.keyPair.fromSeed(seed);
}

/**
 * Generate DID:key from Ed25519 public key
 * Uses multicodec encoding as per DID spec
 *
 * @param publicKey - Ed25519 public key (32 bytes)
 * @returns DID string (did:key:z6Mk...)
 *
 * @remarks
 * Format: did:key:z<multibase-multicodec-pubkey>
 * - Multicodec prefix for Ed25519: 0xed01 (2 bytes)
 * - Multibase encoding: base58btc (prefix 'z')
 */
export function generateDIDFromPublicKey(publicKey: Uint8Array): string {
    // Ed25519 multicodec prefix (0xed 0x01)
    const multicodecPrefix = new Uint8Array([0xed, 0x01]);

    // Concatenate prefix + public key
    const multicodecKey = new Uint8Array(
        multicodecPrefix.length + publicKey.length
    );
    multicodecKey.set(multicodecPrefix);
    multicodecKey.set(publicKey, multicodecPrefix.length);

    // Encode as base58btc
    const base58Key = base58Encode(multicodecKey);

    return `did:key:z${base58Key}`;
}

/**
 * Extract Ed25519 public key from DID:key
 *
 * @param did - DID string (did:key:z6Mk...)
 * @returns Ed25519 public key (32 bytes)
 * @throws Error if DID format is invalid
 */
export function extractPublicKeyFromDID(did: string): Uint8Array {
    if (!did.startsWith('did:key:z')) {
        throw new Error('Invalid DID format - must start with did:key:z');
    }

    // Remove 'did:key:z' prefix
    const base58Key = did.substring(9);

    // Decode base58
    const multicodecKey = base58Decode(base58Key);

    // Verify multicodec prefix (0xed 0x01 for Ed25519)
    if (multicodecKey[0] !== 0xed || multicodecKey[1] !== 0x01) {
        throw new Error('Invalid DID - not an Ed25519 key');
    }

    // Extract public key (skip 2-byte prefix)
    return multicodecKey.slice(2);
}

// ============================================================================
// Content Encryption (XSalsa20-Poly1305)
// ============================================================================

/**
 * Generate random salt for content encryption
 *
 * @returns Random salt (32 bytes)
 */
export function generateContentSalt(): Uint8Array {
    return nacl.randomBytes(CONTENT_SALT_LENGTH);
}

/**
 * Generate random nonce for encryption
 *
 * @returns Random nonce (24 bytes)
 */
export function generateNonce(): Uint8Array {
    return nacl.randomBytes(NONCE_LENGTH);
}

/**
 * Encrypt content using passphrase-derived key
 *
 * @param content - Content to encrypt (JSON serializable)
 * @param passphrase - User's passphrase
 * @param salt - Content salt (random, will be stored with encrypted data)
 * @returns Encrypted data (base64) and nonce (base64)
 *
 * @remarks
 * Uses XSalsa20-Poly1305 authenticated encryption
 * Salt must be stored alongside encrypted data for decryption
 * TODO(MM-35): Add size limits before encryption
 */
export async function encryptContent(
    content: unknown,
    passphrase: string,
    salt: Uint8Array
): Promise<{ encryptedData: string; nonce: string }> {
    // Derive encryption key
    const key = await deriveContentKey(passphrase, salt);

    // Serialize content to JSON
    const contentJSON = JSON.stringify(content);
    const contentBytes = new TextEncoder().encode(contentJSON);

    // Generate nonce
    const nonce = generateNonce();

    // Encrypt with XSalsa20-Poly1305
    const encryptedBytes = nacl.secretbox(contentBytes, nonce, key);

    // TODO(MM-36): Clear sensitive data
    // key.fill(0);
    // contentBytes.fill(0);

    // Encode as base64
    return {
        encryptedData: bytesToBase64(encryptedBytes),
        nonce: bytesToBase64(nonce),
    };
}

/**
 * Decrypt content using passphrase-derived key
 *
 * @param encryptedData - Encrypted data (base64)
 * @param nonce - Nonce (base64)
 * @param passphrase - User's passphrase
 * @param salt - Content salt used during encryption
 * @returns Decrypted content (parsed JSON)
 * @throws Error if decryption fails (wrong passphrase or corrupted data)
 *
 * @remarks
 * TODO(MM-35): Add size validation before decryption
 */
export async function decryptContent<T = unknown>(
    encryptedData: string,
    nonce: string,
    passphrase: string,
    salt: Uint8Array
): Promise<T> {
    // Derive decryption key
    const key = await deriveContentKey(passphrase, salt);

    // Decode from base64
    const encryptedBytes = base64ToBytes(encryptedData);
    const nonceBytes = base64ToBytes(nonce);

    // Decrypt with XSalsa20-Poly1305
    const decryptedBytes = nacl.secretbox.open(encryptedBytes, nonceBytes, key);

    // TODO(MM-36): Clear sensitive data
    // key.fill(0);

    if (!decryptedBytes) {
        throw new Error(
            'Decryption failed - invalid passphrase or corrupted data'
        );
    }

    // Parse JSON
    const contentJSON = new TextDecoder().decode(decryptedBytes);
    return JSON.parse(contentJSON) as T;
}

// ============================================================================
// Signing Operations
// ============================================================================

/**
 * Sign data with Ed25519 secret key
 *
 * @param data - Data to sign (will be JSON serialized)
 * @param secretKey - Ed25519 secret key (64 bytes)
 * @returns Signature (64 bytes)
 */
export function signData(data: unknown, secretKey: Uint8Array): Uint8Array {
    const dataJSON = JSON.stringify(data);
    const dataBytes = new TextEncoder().encode(dataJSON);
    return nacl.sign.detached(dataBytes, secretKey);
}

/**
 * Verify Ed25519 signature
 *
 * @param data - Original data
 * @param signature - Signature (64 bytes)
 * @param publicKey - Ed25519 public key (32 bytes)
 * @returns True if signature is valid
 */
export function verifySignature(
    data: unknown,
    signature: Uint8Array,
    publicKey: Uint8Array
): boolean {
    const dataJSON = JSON.stringify(data);
    const dataBytes = new TextEncoder().encode(dataJSON);
    return nacl.sign.detached.verify(dataBytes, signature, publicKey);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Convert bytes to base64 string
 */
export function bytesToBase64(bytes: Uint8Array): string {
    // Use browser's btoa with binary string
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

/**
 * Convert base64 string to bytes
 */
export function base64ToBytes(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

/**
 * Base58 encoding (Bitcoin alphabet)
 */
const BASE58_ALPHABET =
    '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Encode(bytes: Uint8Array): string {
    const digits = [0];

    for (let i = 0; i < bytes.length; i++) {
        let carry = bytes[i];
        for (let j = 0; j < digits.length; j++) {
            carry += digits[j] << 8;
            digits[j] = carry % 58;
            carry = (carry / 58) | 0;
        }
        while (carry > 0) {
            digits.push(carry % 58);
            carry = (carry / 58) | 0;
        }
    }

    // Handle leading zeros
    for (let i = 0; i < bytes.length && bytes[i] === 0; i++) {
        digits.push(0);
    }

    return digits
        .reverse()
        .map(d => BASE58_ALPHABET[d])
        .join('');
}

function base58Decode(str: string): Uint8Array {
    const bytes = [0];

    for (let i = 0; i < str.length; i++) {
        const c = str[i];
        const value = BASE58_ALPHABET.indexOf(c);
        if (value === -1) {
            throw new Error('Invalid base58 character');
        }

        let carry = value;
        for (let j = 0; j < bytes.length; j++) {
            carry += bytes[j] * 58;
            bytes[j] = carry & 0xff;
            carry >>= 8;
        }
        while (carry > 0) {
            bytes.push(carry & 0xff);
            carry >>= 8;
        }
    }

    // Handle leading zeros
    for (let i = 0; i < str.length && str[i] === BASE58_ALPHABET[0]; i++) {
        bytes.push(0);
    }

    return new Uint8Array(bytes.reverse());
}

/**
 * Generate SHA-256 hash of string (for lookup keys)
 *
 * @param input - String to hash
 * @returns Hex-encoded hash
 */
export function sha256Hash(input: string): string {
    const bytes = new TextEncoder().encode(input);
    const hash = sha256(bytes);
    return bytesToHex(hash);
}

/**
 * Generate lookup key from handle
 * Used for OrbitDB discovery records
 *
 * @param handle - X.com handle (e.g., @alice)
 * @returns SHA-256 hash of lowercase handle
 */
export function generateLookupKey(handle: string): string {
    return sha256Hash(handle.toLowerCase());
}
