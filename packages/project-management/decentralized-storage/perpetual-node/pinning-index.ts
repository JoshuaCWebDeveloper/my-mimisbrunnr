// JSON Pinning Index for Monitoring and Recovery
// File: packages/perpetual-node/src/services/pinning-index.ts

import { promises as fs } from 'fs';
import path from 'path';

export interface PinnedItem {
    cid: string;
    type: 'orbitdb-entry' | 'taglist' | 'did-document' | 'other';
    pinnedAt: number;
    size?: number;
    metadata?: Record<string, any>;
}

export interface CompactionRecord {
    originalCount: number;
    compactedCount: number;
    reduction: number;
    compactedAt: number;
}

export interface ScanResult {
    totalEntries: number;
    uniqueHandles: number;
    scannedAt: number;
}

export interface PinningIndexData {
    version: number;
    createdAt: number;
    lastUpdated: number;
    pinnedItems: Record<string, PinnedItem>;
    compactionHistory: CompactionRecord[];
    scanHistory: ScanResult[];
    metrics: {
        totalPinned: number;
        totalSize: number;
        byType: Record<string, number>;
    };
}

export interface PinningIndexConfig {
    maintainIndex: boolean;
    indexPath: string;
    maxHistoryEntries?: number;
    syncInterval?: number;
}

export class PinningIndex {
    private data: PinningIndexData;
    private syncTimer?: NodeJS.Timeout;
    private isDirty = false;

    constructor(private config: PinningIndexConfig) {
        this.data = this.getEmptyIndex();
    }

    private getEmptyIndex(): PinningIndexData {
        return {
            version: 1,
            createdAt: Date.now(),
            lastUpdated: Date.now(),
            pinnedItems: {},
            compactionHistory: [],
            scanHistory: [],
            metrics: {
                totalPinned: 0,
                totalSize: 0,
                byType: {},
            },
        };
    }

    async initialize(): Promise<void> {
        if (!this.config.maintainIndex) {
            console.log('📋 Pinning index maintenance disabled');
            return;
        }

        console.log(`📋 Initializing pinning index: ${this.config.indexPath}`);

        try {
            await this.loadIndex();
        } catch (error) {
            console.warn('⚠️ Could not load existing index, creating new one');
            this.data = this.getEmptyIndex();
        }

        // Set up periodic sync
        const syncInterval = this.config.syncInterval || 30000; // 30 seconds default
        this.syncTimer = setInterval(() => {
            if (this.isDirty) {
                this.syncToDisk().catch(error => {
                    console.error('Error syncing pinning index:', error);
                });
            }
        }, syncInterval);

        console.log('✅ Pinning index initialized');
    }

    private async loadIndex(): Promise<void> {
        const indexData = await fs.readFile(this.config.indexPath, 'utf-8');
        const parsed = JSON.parse(indexData);

        // Validate index structure
        if (parsed.version !== 1) {
            throw new Error('Unsupported index version');
        }

        this.data = parsed;
        console.log(
            `📊 Loaded index with ${
                Object.keys(this.data.pinnedItems).length
            } pinned items`
        );
    }

    private async syncToDisk(): Promise<void> {
        if (!this.config.maintainIndex) return;

        try {
            // Ensure directory exists
            const indexDir = path.dirname(this.config.indexPath);
            await fs.mkdir(indexDir, { recursive: true });

            // Write to temporary file first, then atomic rename
            const tempPath = `${this.config.indexPath}.tmp`;

            this.data.lastUpdated = Date.now();
            await fs.writeFile(
                tempPath,
                JSON.stringify(this.data, null, 2),
                'utf-8'
            );
            await fs.rename(tempPath, this.config.indexPath);

            this.isDirty = false;
            console.log('💾 Pinning index synced to disk');
        } catch (error) {
            console.error('Error syncing pinning index to disk:', error);
        }
    }

    async recordPin(
        cid: string,
        type: PinnedItem['type'],
        metadata?: Record<string, any>
    ): Promise<void> {
        if (!this.config.maintainIndex) return;

        const item: PinnedItem = {
            cid,
            type,
            pinnedAt: Date.now(),
            metadata,
        };

        this.data.pinnedItems[cid] = item;
        this.updateMetrics();
        this.isDirty = true;

        console.log(`📌 Recorded pin: ${cid} (${type})`);
    }

    async addEntry(entry: any): Promise<void> {
        if (!this.config.maintainIndex) return;

        const record = entry.payload.value;
        await this.recordPin(entry.hash, 'orbitdb-entry', {
            handle: record.handle,
            timestamp: record.timestamp,
            entryType: 'discovery',
        });
    }

    async recordCompaction(compactionData: CompactionRecord): Promise<void> {
        if (!this.config.maintainIndex) return;

        this.data.compactionHistory.push(compactionData);

        // Keep only recent history
        const maxHistory = this.config.maxHistoryEntries || 100;
        if (this.data.compactionHistory.length > maxHistory) {
            this.data.compactionHistory = this.data.compactionHistory.slice(
                -maxHistory
            );
        }

        this.isDirty = true;
        console.log(
            `🗜️ Recorded compaction: ${compactionData.reduction} entries removed`
        );
    }

    async updateScanResults(scanResult: ScanResult): Promise<void> {
        if (!this.config.maintainIndex) return;

        this.data.scanHistory.push(scanResult);

        // Keep only recent history
        const maxHistory = this.config.maxHistoryEntries || 100;
        if (this.data.scanHistory.length > maxHistory) {
            this.data.scanHistory = this.data.scanHistory.slice(-maxHistory);
        }

        this.isDirty = true;
        console.log(
            `🔍 Recorded scan result: ${scanResult.uniqueHandles} unique handles`
        );
    }

    async updateMetrics(
        additionalMetrics?: Record<string, any>
    ): Promise<void> {
        if (!this.config.maintainIndex) return;

        this.updateMetrics();

        if (additionalMetrics) {
            this.data.metrics = { ...this.data.metrics, ...additionalMetrics };
        }

        this.isDirty = true;
    }

    private updateMetrics(): void {
        const items = Object.values(this.data.pinnedItems);

        this.data.metrics = {
            totalPinned: items.length,
            totalSize: items.reduce((sum, item) => sum + (item.size || 0), 0),
            byType: items.reduce((acc, item) => {
                acc[item.type] = (acc[item.type] || 0) + 1;
                return acc;
            }, {} as Record<string, number>),
        };
    }

    async getStats(): Promise<any> {
        if (!this.config.maintainIndex) {
            return { indexMaintenance: false };
        }

        const recentScans = this.data.scanHistory.slice(-5);
        const recentCompactions = this.data.compactionHistory.slice(-5);

        return {
            indexMaintenance: true,
            metrics: this.data.metrics,
            lastUpdated: this.data.lastUpdated,
            recentActivity: {
                scans: recentScans,
                compactions: recentCompactions,
            },
            health: {
                isDirty: this.isDirty,
                syncInterval: this.config.syncInterval || 30000,
                indexPath: this.config.indexPath,
            },
        };
    }

    async getPinnedItemsByType(
        type: PinnedItem['type']
    ): Promise<PinnedItem[]> {
        if (!this.config.maintainIndex) return [];

        return Object.values(this.data.pinnedItems).filter(
            item => item.type === type
        );
    }

    async isPinned(cid: string): Promise<boolean> {
        if (!this.config.maintainIndex) return false;
        return cid in this.data.pinnedItems;
    }

    async removePinnedItem(cid: string): Promise<void> {
        if (!this.config.maintainIndex) return;

        if (cid in this.data.pinnedItems) {
            delete this.data.pinnedItems[cid];
            this.updateMetrics();
            this.isDirty = true;
            console.log(`🗑️ Removed pinned item: ${cid}`);
        }
    }

    async getCompactionSuggestions(): Promise<{
        totalEntries: number;
        duplicateHandles: number;
        oldEntries: number;
        potentialSavings: number;
    }> {
        if (!this.config.maintainIndex) {
            return {
                totalEntries: 0,
                duplicateHandles: 0,
                oldEntries: 0,
                potentialSavings: 0,
            };
        }

        const orbitdbEntries = await this.getPinnedItemsByType('orbitdb-entry');
        const handleCounts = new Map<string, number>();
        const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        let oldEntries = 0;

        for (const item of orbitdbEntries) {
            const handle = item.metadata?.handle;
            if (handle) {
                handleCounts.set(handle, (handleCounts.get(handle) || 0) + 1);
            }

            if (item.pinnedAt < oneWeekAgo) {
                oldEntries++;
            }
        }

        const duplicateHandles = Array.from(handleCounts.values()).reduce(
            (sum, count) => sum + Math.max(0, count - 1),
            0
        );

        return {
            totalEntries: orbitdbEntries.length,
            duplicateHandles,
            oldEntries,
            potentialSavings: duplicateHandles + Math.floor(oldEntries * 0.5),
        };
    }

    async exportForBackup(): Promise<PinningIndexData> {
        return { ...this.data };
    }

    async shutdown(): Promise<void> {
        console.log('🛑 Shutting down pinning index...');

        if (this.syncTimer) {
            clearInterval(this.syncTimer);
        }

        // Final sync if dirty
        if (this.isDirty && this.config.maintainIndex) {
            await this.syncToDisk();
        }

        console.log('✅ Pinning index shutdown complete');
    }
}
