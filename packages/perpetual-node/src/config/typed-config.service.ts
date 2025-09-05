import { Injectable } from '@nestjs/common';
import { ConfigService, NoInferType, Path, PathValue } from '@nestjs/config';
import { RootConfiguration } from './configuration.js';

@Injectable()
export class TypedConfigService {
    constructor(
        private configService: ConfigService<RootConfiguration, true>
    ) {}

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    get<T = RootConfiguration, P extends Path<T> = any>(
        propertyPath: P
    ): PathValue<T, P>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    get<T = any>(
        propertyPath: keyof RootConfiguration,
        defaultValue: NoInferType<T>
    ): T;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    get<T = RootConfiguration, P extends Path<T> = any>(
        propertyPath: P,
        defaultValue: NoInferType<PathValue<T, P>>
    ): PathValue<T, P>;
    get(
        key: keyof RootConfiguration,
        defaultValue?: RootConfiguration[keyof RootConfiguration]
    ) {
        return defaultValue
            ? this.configService.get(key, defaultValue, { infer: true })
            : this.configService.get(key, { infer: true });
    }
}
