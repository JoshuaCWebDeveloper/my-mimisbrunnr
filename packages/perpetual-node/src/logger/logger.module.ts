import { INQUIRER } from '@nestjs/core';
import { Module, Scope } from '@nestjs/common';
import { LogConfigService } from './log-config.service.js';
import { Logger } from './logger.js';
import { ConfigModule } from '../config/config.module.js';

export const ROOT_LOGGER = Symbol('ROOT_LOGGER');

@Module({
    imports: [ConfigModule],
    providers: [
        LogConfigService,
        {
            provide: ROOT_LOGGER,
            useFactory: (logConfigService: LogConfigService) => {
                return new Logger(['App'], undefined, logConfigService);
            },
            inject: [LogConfigService],
        },
        {
            provide: Logger,
            scope: Scope.TRANSIENT,
            useFactory: (parentLogger: Logger, parentProvider: unknown) => {
                return parentLogger.createChild(
                    parentProvider?.constructor?.name ?? String(parentProvider)
                );
            },
            inject: [ROOT_LOGGER, INQUIRER],
        },
    ],
    exports: [Logger],
})
export class LoggerModule {}
