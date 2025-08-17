// Bootstrap logic for the Perpetual Node service
import { PerpetualNodeService } from './services/perpetual-node-service.js';
import { serviceLogger } from './utils/logging.js';

export async function bootstrap(): Promise<void> {
    const service = new PerpetualNodeService();
    
    try {
        await service.start();
    } catch (error) {
        serviceLogger.error('Failed to start Perpetual Node service', {
            error: error instanceof Error ? error.message : error
        });
        process.exit(1);
    }
}