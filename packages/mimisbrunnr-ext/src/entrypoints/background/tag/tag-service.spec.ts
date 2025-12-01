/**
 * Unit tests for TagService (MM-28)
 *
 * Tests tag management and IPFS publishing functionality including:
 * - Tag CRUD operations
 * - Tag collection building and publishing
 * - Encrypted/unencrypted publishing
 * - Tag retrieval and decryption
 * - Tag import with merge/overwrite modes
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { TagService } from './tag-service.js';
import type { TagRepository } from './tag-repository.js';
import type { IpfsService } from '../ipfs/ipfs-service.js';
import type {
    IdentityService,
    Identity,
} from '../identity/identity-service.js';
import type {
    Tag,
    CreateTag,
    TagCollection,
    EncryptedTagCollection,
} from '@my-mimisbrunnr/protocol';

// Mock repositories and services
const mockTagRepository = {
    get: vi.fn(),
    list: vi.fn(),
    listByUsername: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
    clear: vi.fn(),
    importTags: vi.fn(),
} as unknown as {
    get: Mock;
    list: Mock;
    listByUsername: Mock;
    upsert: Mock;
    delete: Mock;
    clear: Mock;
    importTags: Mock;
} & TagRepository;

const mockIpfsService = {
    addObject: vi.fn(),
    retrieveObject: vi.fn(),
    initialize: vi.fn(),
    stop: vi.fn(),
} as unknown as {
    addObject: Mock;
    retrieveObject: Mock;
    initialize: Mock;
    stop: Mock;
} & IpfsService;

const mockIdentityService = {
    getCurrent: vi.fn(),
    isUnlocked: vi.fn(),
    encryptWithCurrentIdentity: vi.fn(),
    decryptWithCurrentIdentity: vi.fn(),
} as unknown as {
    getCurrent: Mock;
    isUnlocked: Mock;
    encryptWithCurrentIdentity: Mock;
    decryptWithCurrentIdentity: Mock;
} & IdentityService;

describe('TagService', () => {
    let tagService: TagService;

    const mockIdentity: Identity = {
        did: 'did:key:z6MkTest123',
        publicKey: new Uint8Array(32),
        secretKey: new Uint8Array(64),
        handle: '@testuser',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };

    const mockTag: Tag = {
        id: 'tag-1',
        username: 'elonmusk',
        name: 'Tech CEO',
        color: '#1DA1F2',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };

    const mockCreateTag: CreateTag = {
        username: 'elonmusk',
        name: 'Tech CEO',
        color: '#1DA1F2',
    };

    beforeEach(() => {
        vi.clearAllMocks();

        // Create service with mocked dependencies
        tagService = new TagService(mockIpfsService, mockIdentityService);
        // accessing private property for testing
        (
            tagService as unknown as { tagRepository: TagRepository }
        ).tagRepository = mockTagRepository;
    });

    describe('CRUD Operations', () => {
        describe('get', () => {
            it('should retrieve a tag by id', async () => {
                // Arrange
                mockTagRepository.get.mockResolvedValue(mockTag);

                // Act
                const result = await tagService.get('tag-1');

                // Assert
                expect(mockTagRepository.get).toHaveBeenCalledWith('tag-1');
                expect(result).toEqual(mockTag);
            });

            it('should return null if tag not found', async () => {
                // Arrange
                mockTagRepository.get.mockResolvedValue(null);

                // Act
                const result = await tagService.get('non-existent');

                // Assert
                expect(result).toBeNull();
            });
        });

        describe('list', () => {
            it('should retrieve all tags', async () => {
                // Arrange
                const tags = [mockTag, { ...mockTag, id: 'tag-2' }];
                mockTagRepository.list.mockResolvedValue(tags);

                // Act
                const result = await tagService.list();

                // Assert
                expect(mockTagRepository.list).toHaveBeenCalled();
                expect(result).toEqual(tags);
            });
        });

        describe('listByUsername', () => {
            it('should retrieve tags for a specific username', async () => {
                // Arrange
                mockTagRepository.listByUsername.mockResolvedValue([mockTag]);

                // Act
                const result = await tagService.listByUsername('elonmusk');

                // Assert
                expect(mockTagRepository.listByUsername).toHaveBeenCalledWith(
                    'elonmusk'
                );
                expect(result).toEqual([mockTag]);
            });
        });

        describe('upsert', () => {
            it('should create a new tag', async () => {
                // Arrange
                mockTagRepository.upsert.mockResolvedValue(mockTag);

                // Act
                const result = await tagService.upsert(mockCreateTag);

                // Assert
                expect(mockTagRepository.upsert).toHaveBeenCalledWith(
                    mockCreateTag
                );
                expect(result).toEqual(mockTag);
            });

            it('should update an existing tag', async () => {
                // Arrange
                const updatedTag = { ...mockTag, name: 'Updated Name' };
                mockTagRepository.upsert.mockResolvedValue(updatedTag);

                // Act
                const result = await tagService.upsert(updatedTag);

                // Assert
                expect(mockTagRepository.upsert).toHaveBeenCalledWith(
                    updatedTag
                );
                expect(result).toEqual(updatedTag);
            });
        });

        describe('delete', () => {
            it('should delete a tag by id', async () => {
                // Arrange
                mockTagRepository.delete.mockResolvedValue(undefined);

                // Act
                await tagService.delete('tag-1');

                // Assert
                expect(mockTagRepository.delete).toHaveBeenCalledWith('tag-1');
            });
        });
    });

    describe('Publishing', () => {
        describe('publishTagCollection - encrypted', () => {
            it('should publish encrypted tag collection', async () => {
                // Arrange
                mockIdentityService.getCurrent.mockReturnValue(mockIdentity);
                mockTagRepository.list.mockResolvedValue([mockTag]);
                mockIdentityService.encryptWithCurrentIdentity.mockResolvedValue(
                    {
                        encryptedData: 'encrypted-data',
                        nonce: 'nonce',
                        salt: 'salt',
                    }
                );
                mockIpfsService.addObject.mockResolvedValue('QmTest123');

                // Act
                const cid = await tagService.publishTagCollection({
                    encrypt: true,
                });

                // Assert
                expect(mockIdentityService.getCurrent).toHaveBeenCalled();
                expect(mockTagRepository.list).toHaveBeenCalled();
                expect(
                    mockIdentityService.encryptWithCurrentIdentity
                ).toHaveBeenCalled();
                expect(mockIpfsService.addObject).toHaveBeenCalledWith(
                    expect.objectContaining({
                        version: 1,
                        encrypted: true,
                        data: 'encrypted-data',
                        nonce: 'nonce',
                        contentSalt: 'salt',
                    }),
                    {}
                );
                expect(cid).toBe('QmTest123');
            });

            it('should pass pin option to IPFS service', async () => {
                // Arrange
                mockIdentityService.getCurrent.mockReturnValue(mockIdentity);
                mockTagRepository.list.mockResolvedValue([mockTag]);
                mockIdentityService.encryptWithCurrentIdentity.mockResolvedValue(
                    {
                        encryptedData: 'encrypted-data',
                        nonce: 'nonce',
                        salt: 'salt',
                    }
                );
                mockIpfsService.addObject.mockResolvedValue('QmTest123');

                // Act
                await tagService.publishTagCollection({
                    encrypt: true,
                    pin: true,
                });

                // Assert
                expect(mockIpfsService.addObject).toHaveBeenCalledWith(
                    expect.any(Object),
                    { pin: true }
                );
            });
        });

        describe('publishTagCollection - unencrypted', () => {
            it('should publish unencrypted tag collection', async () => {
                // Arrange
                mockIdentityService.getCurrent.mockReturnValue(mockIdentity);
                mockTagRepository.list.mockResolvedValue([mockTag]);
                mockIpfsService.addObject.mockResolvedValue('QmTest123');

                // Act
                const cid = await tagService.publishTagCollection({
                    encrypt: false,
                });

                // Assert
                expect(
                    mockIdentityService.encryptWithCurrentIdentity
                ).not.toHaveBeenCalled();
                expect(mockIpfsService.addObject).toHaveBeenCalledWith(
                    expect.objectContaining({
                        version: 1,
                        encrypted: false,
                        handle: '@testuser',
                        tags: [mockTag],
                    }),
                    {}
                );
                expect(cid).toBe('QmTest123');
            });
        });
    });

    describe('Retrieval', () => {
        describe('retrieveTagCollection - encrypted', () => {
            it('should retrieve and decrypt encrypted tag collection', async () => {
                // Arrange
                const encryptedCollection: EncryptedTagCollection = {
                    id: 'col-1',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    version: 1,
                    encrypted: true,
                    data: 'encrypted-data',
                    nonce: 'nonce',
                    contentSalt: 'salt',
                };

                const plainCollection: TagCollection = {
                    id: 'col-1',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    version: 1,
                    encrypted: false,
                    handle: '@testuser',
                    tags: [mockTag],
                };

                mockIpfsService.retrieveObject.mockResolvedValue(
                    encryptedCollection
                );
                mockIdentityService.decryptWithCurrentIdentity.mockResolvedValue(
                    plainCollection
                );

                // Act
                const result = await tagService.retrieveTagCollection(
                    'QmTest123'
                );

                // Assert
                expect(mockIpfsService.retrieveObject).toHaveBeenCalledWith(
                    'QmTest123'
                );
                expect(
                    mockIdentityService.decryptWithCurrentIdentity
                ).toHaveBeenCalledWith('encrypted-data', 'nonce', 'salt');
                expect(result).toEqual(plainCollection);
            });
        });

        describe('retrieveTagCollection - unencrypted', () => {
            it('should retrieve unencrypted tag collection', async () => {
                // Arrange
                const plainCollection: TagCollection = {
                    id: 'col-1',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    version: 1,
                    encrypted: false,
                    handle: '@testuser',
                    tags: [mockTag],
                };

                mockIpfsService.retrieveObject.mockResolvedValue(
                    plainCollection
                );

                // Act
                const result = await tagService.retrieveTagCollection(
                    'QmTest123'
                );

                // Assert
                expect(mockIpfsService.retrieveObject).toHaveBeenCalledWith(
                    'QmTest123'
                );
                expect(
                    mockIdentityService.decryptWithCurrentIdentity
                ).not.toHaveBeenCalled();
                expect(result).toEqual(plainCollection);
            });
        });

        describe('retrieveTagCollection - invalid', () => {
            it('should reject invalid tag collection format', async () => {
                // Arrange
                mockIpfsService.retrieveObject.mockResolvedValue({
                    invalid: 'data',
                });

                // Act & Assert
                await expect(
                    tagService.retrieveTagCollection('QmTest123')
                ).rejects.toThrow('Invalid tag collection format');
            });
        });
    });

    describe('Import', () => {
        describe('importTagCollection', () => {
            it('should import tags with merge mode', async () => {
                // Arrange
                const tagCollection: TagCollection = {
                    id: 'col-1',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    version: 1,
                    encrypted: false,
                    handle: '@testuser',
                    tags: [
                        mockTag,
                        { ...mockTag, id: 'tag-2', username: 'other' },
                    ],
                };

                mockIpfsService.retrieveObject.mockResolvedValue(tagCollection);
                mockTagRepository.importTags.mockResolvedValue({
                    imported: 2,
                    total: 2,
                });

                // Act
                const result = await tagService.importTagCollection(
                    'QmTest123',
                    {
                        mode: 'merge',
                    }
                );

                // Assert
                expect(mockIpfsService.retrieveObject).toHaveBeenCalledWith(
                    'QmTest123'
                );
                expect(mockTagRepository.importTags).toHaveBeenCalledWith(
                    expect.arrayContaining([
                        expect.objectContaining({ username: 'elonmusk' }),
                        expect.objectContaining({ username: 'other' }),
                    ]),
                    'merge'
                );
                expect(result).toEqual({ imported: 2, total: 2 });
            });

            it('should import tags with overwrite mode', async () => {
                // Arrange
                const tagCollection: TagCollection = {
                    id: 'col-1',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    version: 1,
                    encrypted: false,
                    handle: '@testuser',
                    tags: [mockTag],
                };

                mockIpfsService.retrieveObject.mockResolvedValue(tagCollection);
                mockTagRepository.importTags.mockResolvedValue({
                    imported: 1,
                    total: 1,
                });

                // Act
                const result = await tagService.importTagCollection(
                    'QmTest123',
                    {
                        mode: 'overwrite',
                    }
                );

                // Assert
                expect(mockTagRepository.importTags).toHaveBeenCalledWith(
                    expect.any(Array),
                    'overwrite'
                );
                expect(result).toEqual({ imported: 1, total: 1 });
            });

            it('should default to merge mode if not specified', async () => {
                // Arrange
                const tagCollection: TagCollection = {
                    id: 'col-1',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    version: 1,
                    encrypted: false,
                    handle: '@testuser',
                    tags: [mockTag],
                };

                mockIpfsService.retrieveObject.mockResolvedValue(tagCollection);
                mockTagRepository.importTags.mockResolvedValue({
                    imported: 1,
                    total: 1,
                });

                // Act
                await tagService.importTagCollection('QmTest123');

                // Assert
                expect(mockTagRepository.importTags).toHaveBeenCalledWith(
                    expect.any(Array),
                    'merge'
                );
            });
        });
    });

    describe('User Manifest', () => {
        describe('publishUserManifest', () => {
            it('should publish encrypted user manifest', async () => {
                // Arrange
                const mockDid = 'did:key:z6MkTest123';
                const tagCollection: TagCollection = {
                    id: 'col-1',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    version: 1,
                    encrypted: false,
                    handle: '@testuser',
                    tags: [mockTag],
                };

                mockIdentityService.getCurrent.mockReturnValue(mockIdentity);
                mockIdentityService.encryptWithCurrentIdentity.mockResolvedValue(
                    {
                        encryptedData: 'encrypted-manifest',
                        nonce: 'manifest-nonce',
                        salt: 'manifest-salt',
                    }
                );
                mockIpfsService.addObject.mockResolvedValue('QmManifest123');

                // Act
                const cid = await tagService.publishUserManifest(
                    mockDid,
                    [tagCollection],
                    { encrypt: true }
                );

                // Assert
                expect(mockIdentityService.getCurrent).toHaveBeenCalled();
                expect(
                    mockIdentityService.encryptWithCurrentIdentity
                ).toHaveBeenCalled();
                expect(mockIpfsService.addObject).toHaveBeenCalledWith(
                    expect.objectContaining({
                        version: 1,
                        encrypted: true,
                        data: 'encrypted-manifest',
                        nonce: 'manifest-nonce',
                        contentSalt: 'manifest-salt',
                    }),
                    {}
                );
                expect(cid).toBe('QmManifest123');
            });
        });
    });
});
