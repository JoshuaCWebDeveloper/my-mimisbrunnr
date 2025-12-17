import { BaseDatabase as BaseOrbitDbDatabase } from '@orbitdb/core';

export interface EventsDatabase extends BaseOrbitDbDatabase {
    add: <T>(data: T) => Promise<string>;
}
declare module '@orbitdb/core' {
    export * from '@orbitdb/core-types';

    export { EventsDatabase };
}

export * from '@orbitdb/core-types';

export { EventsDatabase };
