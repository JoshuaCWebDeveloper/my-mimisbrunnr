import { registerAs } from '@nestjs/config';
import {
    IsString,
    IsNumber,
    IsOptional,
    Min,
    Max,
    validateSync,
} from 'class-validator';
import { plainToClass, Transform, Type } from 'class-transformer';

export class IpfsConfig {
    @IsString()
    apiUrl!: string;

    @IsOptional()
    @IsString()
    gatewayUrl?: string;

    @IsOptional()
    bootstrapNodes?: string[];
}

export class OrbitDbConfig {
    @IsString()
    logName!: string;

    @IsString()
    dataDir!: string;
}

export class ServiceConfig {
    @Transform(({ value }) => parseInt(value, 10))
    @IsNumber()
    @Min(1)
    @Max(65535)
    port!: number;

    @IsString()
    logConfig!: string;

    @Transform(({ value }) => parseInt(value, 10))
    @IsNumber()
    @Min(1000)
    healthCheckInterval!: number;
}

export class SecurityConfig {
    @Transform(({ value }) => parseInt(value, 10))
    @IsNumber()
    @Min(1)
    apiRpm!: number;

    @Transform(({ value }) => parseInt(value, 10))
    @IsNumber()
    @Min(1)
    pinAddMaxPerIpPerDay!: number;

    @Transform(({ value }) => parseInt(value, 10))
    @IsNumber()
    @Min(1)
    pinAddBurst!: number;

    @Transform(({ value }) => parseInt(value, 10))
    @IsNumber()
    @Min(1)
    dagGetBurst!: number;

    @Transform(({ value }) => parseInt(value, 10))
    @IsNumber()
    @Min(1)
    pubsubPubBurst!: number;

    @Transform(({ value }) => parseInt(value, 10))
    @IsNumber()
    @Min(1)
    pubsubSubBurst!: number;
}

export class OperationalConfig {
    @Transform(({ value }) => parseInt(value, 10))
    @IsNumber()
    @Min(60000) // Minimum 1 minute
    storageCleanupInterval!: number; // 1 hour

    @Transform(({ value }) => parseInt(value, 10))
    @IsNumber()
    @Min(1)
    maxLogEntriesPinned!: number;

    @Transform(({ value }) => parseInt(value, 10))
    @IsNumber()
    @Min(3600) // Minimum 1 hour
    ipnsRepublishPeriod!: number; // 4 hours
}

export class ExtensionConfig {
    @IsOptional()
    @IsString()
    id?: string;
}

export class AppConfiguration {
    @Type(() => IpfsConfig)
    ipfs!: IpfsConfig;

    @Type(() => OrbitDbConfig)
    orbitdb!: OrbitDbConfig;

    @Type(() => ServiceConfig)
    service!: ServiceConfig;

    @Type(() => SecurityConfig)
    security!: SecurityConfig;

    @Type(() => OperationalConfig)
    operational!: OperationalConfig;

    @Type(() => ExtensionConfig)
    extension!: ExtensionConfig;
}

export type RootConfiguration = {
    app: AppConfiguration;
};

export default registerAs('app', () => {
    const config = {
        ipfs: {
            apiUrl: process.env.IPFS_API_URL ?? 'http://kubo:5001',
            gatewayUrl: process.env.IPFS_GATEWAY_URL,
            bootstrapNodes: process.env.IPFS_BOOTSTRAP_NODES
                ? process.env.IPFS_BOOTSTRAP_NODES.split(',')
                : [],
        },
        orbitdb: {
            logName: process.env.ORBITDB_LOG_NAME ?? 'xcom-taglist-discovery',
            dataDir: process.env.ORBITDB_DATA_DIR ?? '/app/data/orbitdb',
        },
        service: {
            port: process.env.SERVICE_PORT ?? '3000',
            logConfig: process.env.SERVICE_LOG_CONFIG ?? 'logging.yaml',
            healthCheckInterval:
                process.env.SERVICE_HEALTH_CHECK_INTERVAL ?? '30000',
        },
        security: {
            apiRpm: process.env.SECURITY_API_RPM ?? '60',
            pinAddMaxPerIpPerDay:
                process.env.SECURITY_PIN_ADD_MAX_PER_IP_PER_DAY ?? '2000',
            pinAddBurst: process.env.SECURITY_PIN_ADD_BURST ?? '30',
            dagGetBurst: process.env.SECURITY_DAG_GET_BURST ?? '60',
            pubsubPubBurst: process.env.SECURITY_PUBSUB_PUB_BURST ?? '60',
            pubsubSubBurst: process.env.SECURITY_PUBSUB_SUB_BURST ?? '60',
        },
        operational: {
            storageCleanupInterval:
                process.env.OPERATIONAL_STORAGE_CLEANUP_INTERVAL ?? '3600000',
            maxLogEntriesPinned:
                process.env.OPERATIONAL_MAX_LOG_ENTRIES_PINNED ?? '1000',
            ipnsRepublishPeriod:
                process.env.OPERATIONAL_IPNS_REPUBLISH_PERIOD ?? '14400',
        },
        extension: {
            id: process.env.EXTENSION_ID,
        },
    };

    // Create and validate each section individually
    const ipfsConfig = plainToClass(IpfsConfig, config.ipfs, {
        enableImplicitConversion: true,
    });
    const orbitdbConfig = plainToClass(OrbitDbConfig, config.orbitdb, {
        enableImplicitConversion: true,
    });
    const serviceConfig = plainToClass(ServiceConfig, config.service, {
        enableImplicitConversion: true,
    });
    const securityConfig = plainToClass(SecurityConfig, config.security, {
        enableImplicitConversion: true,
    });
    const operationalConfig = plainToClass(
        OperationalConfig,
        config.operational,
        { enableImplicitConversion: true }
    );
    const extensionConfig = plainToClass(ExtensionConfig, config.extension, {
        enableImplicitConversion: true,
    });

    // Validate each section
    const allErrors = [
        ...validateSync(ipfsConfig, { skipMissingProperties: false }),
        ...validateSync(orbitdbConfig, { skipMissingProperties: false }),
        ...validateSync(serviceConfig, { skipMissingProperties: false }),
        ...validateSync(securityConfig, { skipMissingProperties: false }),
        ...validateSync(operationalConfig, { skipMissingProperties: false }),
        ...validateSync(extensionConfig, { skipMissingProperties: false }),
    ];

    if (allErrors.length > 0) {
        throw new Error(
            `Configuration validation failed: ${JSON.stringify(
                allErrors,
                null,
                2
            )}`
        );
    }

    // Return the validated configuration
    const validatedConfig = new AppConfiguration();
    validatedConfig.ipfs = ipfsConfig;
    validatedConfig.orbitdb = orbitdbConfig;
    validatedConfig.service = serviceConfig;
    validatedConfig.security = securityConfig;
    validatedConfig.operational = operationalConfig;
    validatedConfig.extension = extensionConfig;

    return validatedConfig;
});
