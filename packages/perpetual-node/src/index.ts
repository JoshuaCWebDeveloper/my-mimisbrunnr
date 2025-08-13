import * as protocol from '@my-mimisbrunnr/protocol';

export * from './lib/perpetual-node.js';

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

for (let i = 0; i < Infinity; i++) {
    await wait(2000);
    // eslint-disable-next-line no-console
    console.log(`Perpetual Node heartbeat ${i}`);
    // eslint-disable-next-line no-console
    console.log(protocol);
}
