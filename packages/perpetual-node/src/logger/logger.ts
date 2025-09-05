import { LoggerService } from '@nestjs/common';
import log from 'loglevel';
import { LogConfigService } from './log-config.service.js';

// The level of the loglevel library controls all levels for the entire
// application. We set it to trace to ensure that all levels are
// enabled for the application.
log.setLevel('trace');

const logLevelNames = Object.fromEntries(
    Object.entries(log.levels).map(([key, value]) => [value, key.toLowerCase()])
) as Record<log.LogLevelNumbers, log.LogLevelNames>;

const logLevelMethods: Record<
    log.LogLevelNumbers,
    (typeof log)[log.LogLevelNames]
> = {
    [log.levels.ERROR]: log.error,
    [log.levels.WARN]: log.warn,
    [log.levels.INFO]: log.info,
    [log.levels.DEBUG]: log.debug,
    [log.levels.TRACE]: log.trace,
    [log.levels.SILENT]: () => {
        // noop
    },
};

export class Logger implements LoggerService {
    private level: log.LogLevelNumbers = log.levels.SILENT;

    constructor(
        private scopes: string[],
        defaultLevel?: log.LogLevelNumbers,
        private logConfigService?: LogConfigService
    ) {
        // Precedence:
        // 1. level in logging.yaml matching its scope
        // 2. defaultLevel constructor param
        // 3. defaultLogLevel in logging.yaml
        const levelName =
            this.logConfigService?.getScopeLevel(this.scope) ??
            (defaultLevel ? logLevelNames[defaultLevel] : undefined) ??
            this.logConfigService?.getDefaultLogLevel() ??
            'info';

        // Initialize loglevel with determined settings
        if (process.env.NODE_ENV === 'test') {
            this.level = log.levels.SILENT;
        } else {
            this.level =
                log.levels[levelName.toUpperCase() as keyof typeof log.levels];
        }
    }

    createChild(scope: string): Logger {
        return new Logger(
            [...this.scopes, scope],
            this.level,
            this.logConfigService
        );
    }

    private get scope(): string {
        return this.scopes.slice(-1)[0];
    }

    setLevel(level: log.LogLevelNumbers) {
        this.level = level;
    }

    getLevel(): number {
        return this.level;
    }

    isLevel(level: log.LogLevelNumbers) {
        return this.level <= level;
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

    private formatMessage(
        level: log.LogLevelNumbers,
        ...parts: unknown[]
    ): unknown[] {
        return [
            new Date().toISOString(),
            logLevelNames[level].toUpperCase(),
            `[${this.scope}] `,
            ...parts.map(part => this.stringify(part)),
        ];
    }

    private logLeveledMessage(
        level: log.LogLevelNumbers,
        ...messageParts: unknown[]
    ) {
        if (this.isLevel(level)) {
            logLevelMethods[level](
                ...this.formatMessage(level, ...messageParts)
            );
        }
    }

    error(message: unknown, ...optionalParams: unknown[]) {
        this.logLeveledMessage(log.levels.ERROR, message, ...optionalParams);
    }

    warn(message: unknown, ...optionalParams: unknown[]) {
        this.logLeveledMessage(log.levels.WARN, message, ...optionalParams);
    }

    log(message: unknown, ...optionalParams: unknown[]) {
        this.logLeveledMessage(log.levels.INFO, message, ...optionalParams);
    }

    info(message: unknown, ...optionalParams: unknown[]) {
        this.logLeveledMessage(log.levels.INFO, message, ...optionalParams);
    }

    debug(message: unknown, ...optionalParams: unknown[]) {
        this.logLeveledMessage(log.levels.DEBUG, message, ...optionalParams);
    }

    verbose(message: unknown, ...optionalParams: unknown[]) {
        this.logLeveledMessage(log.levels.TRACE, message, ...optionalParams);
    }

    trace(message: unknown, ...optionalParams: unknown[]) {
        this.logLeveledMessage(log.levels.TRACE, message, ...optionalParams);
    }
}
