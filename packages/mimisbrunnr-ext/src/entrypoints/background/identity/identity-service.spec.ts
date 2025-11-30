/**
 * Unit tests for IdentityService (MM-28)
 *
 * Tests identity management functionality including:
 * - Identity creation with passphrase
 * - Identity unlocking/locking
 * - Encryption/decryption operations
 * - Repository integration
 *
 * Note: These tests use real crypto functions (not mocked) but mock the repository layer.
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { IdentityService, type EncryptedIdentity } from './identity-service.js';
import type { IdentityRepository } from './identity-repository.js';

// Mock the repository
const mockRepository = {
    save: vi.fn(),
    get: vi.fn(),
    getByHandle: vi.fn(),
    list: vi.fn(),
    hasIdentity: vi.fn(),
    getCurrent: vi.fn(),
    delete: vi.fn(),
    clear: vi.fn(),
    close: vi.fn(),
} as unknown as {
    save: Mock;
    get: Mock;
    getByHandle: Mock;
    list: Mock;
    hasIdentity: Mock;
    getCurrent: Mock;
    delete: Mock;
    clear: Mock;
    close: Mock;
} & IdentityRepository;

describe('IdentityService', () => {
    let identityService: IdentityService;
    const mockPassphrase = 'test-passphrase-with-enough-length-16+';
    const mockHandle = '@testuser';

    beforeEach(() => {
        vi.clearAllMocks();

        // Create service with mocked repository
        identityService = new IdentityService();
        // @ts-expect-error - accessing private property for testing
        identityService.identityRepository = mockRepository;
    });

    describe('createIdentity', () => {
        it('should create a new identity with valid passphrase', async () => {
            // Arrange
            mockRepository.hasIdentity.mockResolvedValue(false);
            mockRepository.save.mockImplementation(
                (identity: EncryptedIdentity) => Promise.resolve(identity)
            );

            // Act
            const result = await identityService.createIdentity(
                mockPassphrase,
                mockHandle
            );

            // Assert
            expect(mockRepository.hasIdentity).toHaveBeenCalled();
            expect(mockRepository.save).toHaveBeenCalled();
            expect(result.handle).toBe(mockHandle);
            expect(result.did).toMatch(/^did:key:z6Mk/);
            expect(result.publicKey).toBeInstanceOf(Uint8Array);
            expect(result.secretKey).toBeInstanceOf(Uint8Array);
            expect(identityService.isUnlocked()).toBe(true);
        });

        it('should reject if passphrase is too short', async () => {
            // Act & Assert
            await expect(
                identityService.createIdentity('short', mockHandle)
            ).rejects.toThrow('Passphrase must be at least 16 characters');
        });

        it('should reject if identity already exists', async () => {
            // Arrange
            mockRepository.hasIdentity.mockResolvedValue(true);

            // Act & Assert
            await expect(
                identityService.createIdentity(mockPassphrase, mockHandle)
            ).rejects.toThrow('Identity already exists');
        });

        it('should reject if handle format is invalid', async () => {
            // Arrange
            mockRepository.hasIdentity.mockResolvedValue(false);

            // Act & Assert
            await expect(
                identityService.createIdentity(mockPassphrase, 'invalid-handle')
            ).rejects.toThrow('Invalid handle format');
        });
    });

    describe('unlockIdentity', () => {
        it('should unlock identity with correct passphrase', async () => {
            // Arrange - First create an identity
            mockRepository.hasIdentity.mockResolvedValue(false);
            const savedIdentities: EncryptedIdentity[] = [];
            mockRepository.save.mockImplementation(
                (identity: EncryptedIdentity) => {
                    savedIdentities.push(identity);
                    return Promise.resolve(identity);
                }
            );

            await identityService.createIdentity(mockPassphrase, mockHandle);
            const savedIdentity = savedIdentities[0];

            // Lock the identity
            identityService.lock();
            expect(identityService.isUnlocked()).toBe(false);

            // Mock getCurrent to return saved identity
            mockRepository.getCurrent.mockResolvedValue(savedIdentity);

            // Act - Unlock with correct passphrase
            const result = await identityService.unlockIdentity(mockPassphrase);

            // Assert
            expect(mockRepository.getCurrent).toHaveBeenCalled();
            expect(result.did).toBe(savedIdentity.did);
            expect(result.handle).toBe(mockHandle);
            expect(identityService.isUnlocked()).toBe(true);
        });

        it('should reject if no identity exists', async () => {
            // Arrange
            mockRepository.getCurrent.mockResolvedValue(null);

            // Act & Assert
            await expect(
                identityService.unlockIdentity(mockPassphrase)
            ).rejects.toThrow('No identity found');
        });

        it('should reject if passphrase is incorrect', async () => {
            // Arrange - Create identity with one passphrase
            mockRepository.hasIdentity.mockResolvedValue(false);
            const savedIdentities: EncryptedIdentity[] = [];
            mockRepository.save.mockImplementation(
                (identity: EncryptedIdentity) => {
                    savedIdentities.push(identity);
                    return Promise.resolve(identity);
                }
            );

            await identityService.createIdentity(mockPassphrase, mockHandle);
            identityService.lock();

            mockRepository.getCurrent.mockResolvedValue(savedIdentities[0]);

            // Act & Assert - Try to unlock with wrong passphrase
            await expect(
                identityService.unlockIdentity(
                    'wrong-passphrase-16chars-long!!'
                )
            ).rejects.toThrow('Invalid passphrase');
        });
    });

    describe('lock', () => {
        it('should lock the identity', async () => {
            // Arrange - Create and verify identity is unlocked
            mockRepository.hasIdentity.mockResolvedValue(false);
            mockRepository.save.mockImplementation(
                (identity: EncryptedIdentity) => Promise.resolve(identity)
            );

            await identityService.createIdentity(mockPassphrase, mockHandle);
            expect(identityService.isUnlocked()).toBe(true);

            // Act
            identityService.lock();

            // Assert
            expect(identityService.isUnlocked()).toBe(false);
            expect(() => identityService.getCurrent()).toThrow(
                'Identity not unlocked'
            );
        });
    });

    describe('hasIdentity', () => {
        it('should return true if identity exists', async () => {
            // Arrange
            mockRepository.hasIdentity.mockResolvedValue(true);

            // Act
            const result = await identityService.hasIdentity();

            // Assert
            expect(result).toBe(true);
            expect(mockRepository.hasIdentity).toHaveBeenCalled();
        });

        it('should return false if no identity exists', async () => {
            // Arrange
            mockRepository.hasIdentity.mockResolvedValue(false);

            // Act
            const result = await identityService.hasIdentity();

            // Assert
            expect(result).toBe(false);
        });
    });

    describe('delete', () => {
        it('should delete identity with correct passphrase', async () => {
            // Arrange - Create identity
            mockRepository.hasIdentity.mockResolvedValue(false);
            const savedIdentities: EncryptedIdentity[] = [];
            mockRepository.save.mockImplementation(
                (identity: EncryptedIdentity) => {
                    savedIdentities.push(identity);
                    return Promise.resolve(identity);
                }
            );

            const createdIdentity = await identityService.createIdentity(
                mockPassphrase,
                mockHandle
            );

            mockRepository.getCurrent.mockResolvedValue(savedIdentities[0]);
            mockRepository.delete.mockResolvedValue(undefined);

            // Act
            await identityService.delete(mockPassphrase);

            // Assert
            expect(mockRepository.delete).toHaveBeenCalledWith(
                createdIdentity.did
            );
            expect(identityService.isUnlocked()).toBe(false);
        });

        it('should reject if passphrase is incorrect', async () => {
            // Arrange - Create identity
            mockRepository.hasIdentity.mockResolvedValue(false);
            const savedIdentities: EncryptedIdentity[] = [];
            mockRepository.save.mockImplementation(
                (identity: EncryptedIdentity) => {
                    savedIdentities.push(identity);
                    return Promise.resolve(identity);
                }
            );

            await identityService.createIdentity(mockPassphrase, mockHandle);
            mockRepository.getCurrent.mockResolvedValue(savedIdentities[0]);

            // Act & Assert
            await expect(
                identityService.delete('wrong-passphrase-16chars-long!!')
            ).rejects.toThrow('Invalid passphrase');
            expect(mockRepository.delete).not.toHaveBeenCalled();
        });
    });

    describe('encryptWithCurrentIdentity', () => {
        it('should encrypt content when identity is unlocked', async () => {
            // Arrange - Create and unlock identity
            mockRepository.hasIdentity.mockResolvedValue(false);
            mockRepository.save.mockImplementation(
                (identity: EncryptedIdentity) => Promise.resolve(identity)
            );

            await identityService.createIdentity(mockPassphrase, mockHandle);

            const testContent = { test: 'data', nested: { value: 123 } };

            // Act
            const result = await identityService.encryptWithCurrentIdentity(
                testContent
            );

            // Assert
            expect(result.encryptedData).toBeTruthy();
            expect(result.nonce).toBeTruthy();
            expect(result.salt).toBeTruthy();
            expect(typeof result.encryptedData).toBe('string');
            expect(typeof result.nonce).toBe('string');
            expect(typeof result.salt).toBe('string');
        });

        it('should reject if identity is not unlocked', async () => {
            // Act & Assert
            await expect(
                identityService.encryptWithCurrentIdentity({ test: 'data' })
            ).rejects.toThrow('Identity not unlocked');
        });
    });

    describe('decryptWithCurrentIdentity', () => {
        it('should decrypt content when identity is unlocked', async () => {
            // Arrange - Create identity and encrypt some data
            mockRepository.hasIdentity.mockResolvedValue(false);
            mockRepository.save.mockImplementation(
                (identity: EncryptedIdentity) => Promise.resolve(identity)
            );

            await identityService.createIdentity(mockPassphrase, mockHandle);

            const testContent = { test: 'data', nested: { value: 123 } };
            const encrypted = await identityService.encryptWithCurrentIdentity(
                testContent
            );

            // Act - Decrypt the data
            const result = await identityService.decryptWithCurrentIdentity(
                encrypted.encryptedData,
                encrypted.nonce,
                encrypted.salt
            );

            // Assert
            expect(result).toEqual(testContent);
        });

        it('should reject if identity is not unlocked', async () => {
            // Act & Assert
            await expect(
                identityService.decryptWithCurrentIdentity(
                    'encrypted-data',
                    'nonce',
                    'salt'
                )
            ).rejects.toThrow('Identity not unlocked');
        });
    });

    describe('updateHandle', () => {
        it('should update handle when identity is unlocked', async () => {
            // Arrange - Create identity
            mockRepository.hasIdentity.mockResolvedValue(false);
            mockRepository.save.mockImplementation(
                (identity: EncryptedIdentity) => Promise.resolve(identity)
            );

            await identityService.createIdentity(mockPassphrase, mockHandle);

            const newHandle = '@newhandle';

            // Act
            await identityService.updateHandle(newHandle);

            // Assert
            expect(identityService.getCurrent().handle).toBe(newHandle);
            expect(mockRepository.save).toHaveBeenCalledTimes(2); // Once for create, once for update
        });

        it('should reject if identity is not unlocked', async () => {
            // Act & Assert
            await expect(
                identityService.updateHandle('@newhandle')
            ).rejects.toThrow('Identity not unlocked');
        });
    });
});
