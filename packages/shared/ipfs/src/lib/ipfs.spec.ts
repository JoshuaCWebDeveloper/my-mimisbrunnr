import { ipfs } from './ipfs.js';

describe('ipfs', () => {
    it('should work', () => {
        expect(ipfs()).toEqual('ipfs');
    });
});
