import { Injectable } from '@nestjs/common';
import { readFileSync } from 'fs';
import { load } from 'js-yaml';
import { TypedConfigService } from '../config/typed-config.service.js';

export interface LogConfig {
    defaultLogLevel: string;
    loggers: Record<string, string>;
}

@Injectable()
export class LogConfigService {
    private logConfig: LogConfig = {
        defaultLogLevel: 'info',
        loggers: {},
    };

    constructor(configService: TypedConfigService) {
        const logConfiguration = configService.get('app.service.logConfig');

        this.logConfig = this.loadLogConfig(logConfiguration);
    }

    private loadLogConfig(logConfiguration: string) {
        let logConfig: LogConfig = {
            defaultLogLevel: 'info',
            loggers: {},
        };

        try {
            const yamlContent = readFileSync(logConfiguration, 'utf8');
            const parsedConfig = load(yamlContent) as {
                defaultLogLevel?: string;
                loggers?: Record<string, string>;
            };
            logConfig = {
                defaultLogLevel: parsedConfig.defaultLogLevel || 'info',
                loggers: parsedConfig.loggers || {},
            };
        } catch (_error) {
            // Use defaults if file cannot be read - intentionally silent fallback
            // Using defaults: { defaultLogLevel: 'info', loggers: {} }
        }

        return logConfig;
    }

    getLogConfig(): LogConfig {
        return this.logConfig;
    }

    getScopeLevel(scope: string) {
        return this.logConfig.loggers[scope] ?? undefined;
    }

    getDefaultLogLevel() {
        return this.logConfig.defaultLogLevel;
    }
}
