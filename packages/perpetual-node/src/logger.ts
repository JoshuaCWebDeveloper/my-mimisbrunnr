import { LoggerService, Module, Scope } from '@nestjs/common';
import { INQUIRER } from '@nestjs/core';
import * as log from 'loglevel';

export const ROOT_LOGGER = Symbol('ROOT_LOGGER');

export class Logger implements LoggerService {
    constructor(private scopes: string[]) {
        // Initialize loglevel with default settings
        if (process.env.NODE_ENV === 'test') {
            log.setLevel('silent');
        } else {
            log.setLevel((process.env.LOG_LEVEL as log.LogLevelDesc) || 'info');
        }
    }

    private get scope(): string {
        return this.scopes.slice(-1)[0];
    }

    createChild(scope: string): Logger {
        return new Logger([...this.scopes, scope]);
    }

    private stringify(part: unknown): string {
        if (typeof part === 'string') {
            return part;
        }

        try {
            return JSON.stringify(part);
        } catch (_) {
            // continue
        }

        try {
            return String(part);
        } catch (_) {
            // continue
        }

        return '';
    }

    private formatMessage(...parts: unknown[]): unknown[] {
        return [`[${this.scope}] `, ...parts.map(part => this.stringify(part))];
    }

    error(message: unknown, ...optionalParams: unknown[]) {
        log.error(this.formatMessage(message, ...optionalParams));
    }

    warn(message: unknown, ...optionalParams: unknown[]) {
        log.warn(this.formatMessage(message, ...optionalParams));
    }

    log(message: unknown, ...optionalParams: unknown[]) {
        log.info(this.formatMessage(message, ...optionalParams));
    }

    info(message: unknown, ...optionalParams: unknown[]) {
        log.info(this.formatMessage(message, ...optionalParams));
    }

    debug(message: unknown, ...optionalParams: unknown[]) {
        log.debug(this.formatMessage(message, ...optionalParams));
    }

    verbose(message: unknown, ...optionalParams: unknown[]) {
        log.trace(this.formatMessage(message, ...optionalParams));
    }

    trace(message: unknown, ...optionalParams: unknown[]) {
        log.trace(this.formatMessage(message, ...optionalParams));
    }

    setLevel(level: log.LogLevelDesc) {
        log.setLevel(level);
    }

    getLevel(): number {
        return log.getLevel();
    }

}

@Module({
    providers: [
        {
            provide: ROOT_LOGGER,
            useFactory: () => {
                return new Logger(['APP_ROOT']);
            },
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
