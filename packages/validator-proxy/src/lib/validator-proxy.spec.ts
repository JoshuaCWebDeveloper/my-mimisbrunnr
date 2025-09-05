import { validatorProxy } from './validator-proxy.js';

describe('validatorProxy', () => {
    it('should work', () => {
        expect(validatorProxy()).toEqual('validator-proxy');
    });
});
