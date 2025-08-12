// Cryptographic utilities (Extension-Only)
import { scryptSync } from 'crypto';
import nacl from 'tweetnacl';
import {
    TagCollection,
    UserManifest,
    SubscriptionCollection,
} from './data-structures';

interface KeyDerivationParams {
    N: number; // 32768 (2^15)
    r: number; // 8
    p: number; // 1
    dkLen: number; // 32
    salt: string; // "xcom-did-v1"
}

function deriveKey(
    passphrase: string,
    params: KeyDerivationParams
): Uint8Array {
    return scryptSync(
        passphrase,
        params.salt,
        params.N,
        params.r,
        params.p,
        params.dkLen
    );
}

function generateKeypair(seed: Uint8Array): {
    publicKey: Uint8Array;
    secretKey: Uint8Array;
} {
    return nacl.sign.keyPair.fromSeed(seed);
}

function generateDID(publicKey: Uint8Array): string {
    // Implement did:key generation from Ed25519 public key
    // Returns format: "did:key:z6Mk..."
}

function generateLookupKey(handle: string): string {
    // SHA-256 of lowercase handle for OrbitDB lookup
    return sha256(handle.toLowerCase());
}

function signMessage(message: Uint8Array, secretKey: Uint8Array): Uint8Array {
    return nacl.sign.detached(message, secretKey);
}

function verifySignature(
    message: Uint8Array,
    signature: Uint8Array,
    publicKey: Uint8Array
): boolean {
    return nacl.sign.detached.verify(message, signature, publicKey);
}

// Content encryption/decryption using passphrase-derived key
function deriveEncryptionKey(passphrase: string): Uint8Array {
    // Use same scrypt parameters but different salt for encryption key
    const encryptionParams = {
        ...SECURITY_PARAMS.SCRYPT,
        salt: 'xcom-encrypt-v1',
    };
    return scryptSync(
        passphrase,
        encryptionParams.salt,
        encryptionParams.N,
        encryptionParams.r,
        encryptionParams.p,
        encryptionParams.dkLen
    );
}

function encryptContent(
    content: string,
    passphrase: string
): {
    encryptedData: Uint8Array;
    nonce: Uint8Array;
} {
    const key = deriveEncryptionKey(passphrase);
    const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
    const messageBytes = new TextEncoder().encode(content);
    const encryptedData = nacl.secretbox(messageBytes, nonce, key);

    return { encryptedData, nonce };
}

function decryptContent(
    encryptedData: Uint8Array,
    nonce: Uint8Array,
    passphrase: string
): string {
    const key = deriveEncryptionKey(passphrase);
    const decryptedBytes = nacl.secretbox.open(encryptedData, nonce, key);

    if (!decryptedBytes) {
        throw new Error(
            'Decryption failed - invalid passphrase or corrupted data'
        );
    }

    return new TextDecoder().decode(decryptedBytes);
}

// Encrypted manifest wrapper for IPFS storage
interface EncryptedManifest {
    version: 1;
    encrypted: true;
    nonce: string; // Base64 encoded nonce
    data: string; // Base64 encoded encrypted UserManifest JSON
    createdAt: number;
    publicKey: string; // For verification that this is the right user's data
}

// Extension-specific validation functions
function validateTagCollection(
    tagCollection: unknown
): tagCollection is TagCollection {
    // Implementation for TagCollection validation
}

function validateUserManifest(manifest: unknown): manifest is UserManifest {
    // Implementation for UserManifest validation
}

function validateSubscriptionCollection(
    collection: unknown
): collection is SubscriptionCollection {
    // Implementation for SubscriptionCollection validation
}

// Security parameters (Extension-Only)
const SECURITY_PARAMS = {
    SCRYPT: {
        N: 32768, // 2^15 iterations
        r: 8, // Block size
        p: 1, // Parallelization
        dkLen: 32, // Output length
        salt: 'xcom-did-v1',
    },
    PASSPHRASE: {
        minLength: 16,
        requiredEntropy: 60,
    },
    TIMESTAMPS: {
        maxClockSkew: 300000,
        maxAge: 86400000,
    },
} as const;

// Placeholder for sha256 function that would be implemented elsewhere
function sha256(input: string): string {
    // Implementation would use actual crypto library
    return '';
}

export {
    KeyDerivationParams,
    deriveKey,
    generateKeypair,
    generateDID,
    generateLookupKey,
    signMessage,
    verifySignature,
    deriveEncryptionKey,
    encryptContent,
    decryptContent,
    validateTagCollection,
    validateUserManifest,
    validateSubscriptionCollection,
    SECURITY_PARAMS,
    EncryptedManifest,
};
