import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import configuration from './configuration.js';
import { TypedConfigService } from './typed-config.service.js';

@Module({
    imports: [
        NestConfigModule.forRoot({
            load: [configuration],
            isGlobal: true,
            envFilePath: ['.local.env', '.env'],
            cache: true,
        }),
    ],
    providers: [TypedConfigService],
    exports: [TypedConfigService],
})
export class ConfigModule {}
