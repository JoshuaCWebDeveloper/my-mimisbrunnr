import { IpfsService } from './ipfs-service.js';
import { CID } from 'multiformats/cid';

class MimisbrunnrBackground {
    public utils = {
        CID,
    };

    constructor(public readonly ipfsService: IpfsService) {}
}

declare global {
    var MimisbrunnrBackground: MimisbrunnrBackground;
}

export const initDevtools = (ipfsService: IpfsService) => {
    // eslint-disable-next-line no-restricted-globals
    self.MimisbrunnrBackground = new MimisbrunnrBackground(ipfsService);
};
