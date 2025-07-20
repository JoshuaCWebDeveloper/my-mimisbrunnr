# Decentralized Storage Solutions for X.com Tag Lists

To meet all the requirements, we propose three distinct approaches. Each proposal uses a different decentralized architecture or system, but all ensure that X.com users can **store tag lists** and share them in a **secure, client-only, and low-cost decentralized** manner. We detail how each solution maps X handles to data, restricts updates to the owner, achieves decentralization, minimizes costs, works client-side, and guarantees security.

## Proposal 1: **IPFS/IPNS-Based Solution**

**Overview:** This approach uses the **InterPlanetary File System (IPFS)** for storing tag list data, combined with the **InterPlanetary Name System (IPNS)** for dynamic naming. Each user’s tag list is stored as an IPFS content object (e.g. a JSON file up to ~1 MB). The user’s X handle is linked to an IPNS address, which is essentially a public key that can point to different IPFS content over time. Only the corresponding private key (held by the user) can update that IPNS record[docs.dappling.network](https://docs.dappling.network/legacy-docs/learn/ipns#:~:text=Decentralization%20and%20Security). We leverage X’s OAuth login to verify identity and initialize the mapping. All functions—publishing the data, updating it, and verifying signatures—happen client-side in the user’s browser or app.

### Mapping X Handles to Tag Lists

Each X.com username is associated with a persistent **IPNS name** that acts as an address for that user’s tag list. When a user first onboards, the app has them **log in with X** (using X’s OAuth flow) to confirm their identity (obtaining their handle @username via the API)[developer.x.com](https://developer.x.com/en/docs/x-api/v1/accounts-and-users/manage-account-settings/api-reference/get-account-verify_credentials#:~:text=GET%20account%2Fverify_credentials). The client then generates a new cryptographic key pair (e.g. Ed25519) for that user. Using IPNS, the **public key** serves as the user’s decentralized identifier (IPNS key), and it is linked to their current tag list content.

-   The user **publishes their tag list file to IPFS**, getting a content hash (CID). Then, using their private key, they **sign an IPNS record** that maps their public key (IPNS name) to that CID. This IPNS publish operation broadcasts the signed record to the distributed IPFS network (via DHT and/or PubSub)[docs.dappling.network](https://docs.dappling.network/legacy-docs/learn/ipns#:~:text=Name%20Publishing)[docs.dappling.network](https://docs.dappling.network/legacy-docs/learn/ipns#:~:text=Like%20IPFS%2C%20IPNS%20benefits%20from,an%20extra%20layer%20of%20security).
-   The result is a stable address: `ipns://<publicKeyHash>` (or an IPNS hash string) which anyone can use to retrieve the content. Given only an X handle, the app must find the corresponding IPNS address. There are a few ways to achieve this in a decentralized manner:
    -   **Profile Link:** The user can add their IPNS address to their X profile (for example, in their bio or as a pinned post). This acts as a publicly visible mapping from handle to IPNS name. A user’s friend can discover the tag list by looking at that profile link (a one-time lookup on X, an allowed free service).
    -   **Deterministic Naming (Optional):** Alternatively, the app can derive a naming convention so that others can guess the IPNS hash from the handle. For instance, the app could use a hash of the username combined with a known salt or prefix as the key name. However, to avoid collisions or squatting, publishing still requires the user’s private key. The key pair itself is generated on signup (so it’s not simply derivable from the handle alone without authorization).
    -   **Shared Index (Optional enhancement):** The application could maintain (on IPFS) a community-curated index file mapping handles to IPNS addresses. This index would itself be decentralized (stored on IPFS) and updated by users (each user could append their mapping, signed by their key). Peers could cache and share this index. Importantly, **no centralized server** is required; the index could be updated via Git-like pull requests over IPFS or as a public git repository on a decentralized platform.

Using the above methods, when another user wants to subscribe to `@alice`’s tags, the client can resolve Alice’s IPNS address (by reading the link in Alice’s profile or from the index) and then fetch the content from IPFS. The mapping is human-friendly (just need the X handle) and **accessible globally on the IPFS/IPNS network without any central authority**.

### Authorization – Only Owner Can Update

IPNS inherently ensures that **only the owner of the private key can update the record** pointing a name to new content[docs.dappling.network](https://docs.dappling.network/legacy-docs/learn/ipns#:~:text=Decentralization%20and%20Security). In this design, the private key is generated and kept client-side (e.g. in local storage or a user-managed wallet). When `@alice` wants to update her tag list, her app signs a new IPNS record with her private key. The IPFS network will reject any IPNS update not signed by the correct key, so no malicious party can hijack or modify Alice’s mapping.



Furthermore, the initial creation of the mapping is protected by X OAuth verification. The app only generates and publishes a mapping for a user *after* confirming they are the legitimate handle owner (via OAuth login). This prevents an attacker from preemptively creating an IPNS record for someone else’s handle. In summary, **each tag list mapping is bound to the user’s cryptographic key**, and that key is only issued to the verified account owner.

### Decentralization

This solution relies on **fully decentralized infrastructure**: IPFS and its naming system IPNS. IPFS is a peer-to-peer content-addressable storage network; any user or node can host and retrieve files by content hash, with no centralized server[docs.dappling.network](https://docs.dappling.network/legacy-docs/learn/ipns#:~:text=IPNS%2C%20which%20stands%20for%20InterPlanetary,that%20may%20change%20over%20time). Likewise, IPNS is a decentralized naming layer that uses the IPFS DHT (Distributed Hash Table) to disseminate records. The handle-to-IPNS resolution uses either decentralized storage (if using an index on IPFS) or public data on X (which is a permitted external service). Once the IPNS address is known, data retrieval is entirely distributed. **No central authority** is needed to fetch or update tag lists: the IPFS network provides the data, and the IPNS record (signed by the user) provides the pointer to the latest version. This meets the decentralization requirement, as anyone anywhere can access the data via the IPFS network without hitting a central API or server.

### Low Cost Efficiency

This approach is effectively **free or near-zero cost at scale**. Storing and transferring data on IPFS does not incur fees to any one provider; instead, data is propagated by participating nodes. For a tag list ~1 MB in size, the storage and bandwidth costs are minimal and can be shared among users:

-   **No per-transaction fees:** Unlike blockchain solutions, publishing to IPNS or IPFS does not require paying cryptocurrency fees. A million users can publish and update their lists freely. The main cost is hosting the data, which users can do themselves (each client node caches content it retrieves). Popular content gets cached by many nodes, reducing load on any single node. Even if the application maintainers run some IPFS pinning nodes to ensure high availability, the cost would be low. 1 million users × 1 MB = ~1 TB of data; storing that on a few community-run IPFS nodes could be on the order of a few dollars per month in infrastructure costs (and this can be distributed across volunteers or interested parties).
-   **No special hardware or cloud required:** Each client contributes by storing their own data and possibly data of subscribed lists (depending on app settings). This **peer-to-peer caching** means the network usage scales efficiently with the number of users.
-   **Free X OAuth usage:** Verifying identity via X’s OAuth is free. The only calls to X’s API are during login (and possibly to fetch a profile link during discovery), which are minimal and can be done within free rate limits.

Overall, this solution can support millions of users with negligible direct costs. Most heavy lifting is done by user-run or community-run nodes, and the design avoids any service that would charge per user or per request.

### Client-Side Implementation

All core functionality runs on the client:

-   **Publishing:** After login, the user’s browser (or app) generates the key pair and uploads the tag list to IPFS directly. This can be done using a JavaScript IPFS client library or by calling a public IPFS node via its API from the frontend. The IPNS publish (signing the record) is done with JavaScript as well (e.g. using `ipfs.name.publish` in the IPFS JS API).
-   **Updating:** When the user edits their tags, the app recomputes the IPFS CID and re-signs the IPNS pointer, broadcasting the update from the client. No centralized backend is needed for coordination; the IPFS network handles the distribution of the new IPNS record.
-   **Lookup & Subscription:** When a user wants to get another’s list, their client uses either the IPFS DHT or a stored index to find the IPNS name for the given handle, then uses an IPFS library to resolve that IPNS address to a CID and fetch the content. This can all happen in-browser. The retrieval might use a public gateway under the hood (e.g. `https://ipfs.io/ipns/<name>`), but the user can choose a gateway or run a local node — either way, it doesn’t rely on any app-specific server.
-   **Verification:** The client is also responsible for verifying that the data is authentic (see Security section). This might involve checking a signature included in the file or simply trusting IPNS (which the IPFS library does automatically by verifying the IPNS record’s signature with the embedded public key).

The only part of the workflow that touches X’s centralized systems is the **OAuth login** and possibly reading a public profile field. This is explicitly allowed (“free services offered by X.com, such as OAuth”). Everything after that is done with open-source libraries in the user’s device. The solution requires **no custom backend**, fulfilling the client-side only requirement.

### Security and Verification

Security is a major strength of this solution:

-   **Authenticity:** The mapping from a handle to a tag list is self-authenticating. The IPNS record is signed with the user’s private key, which proves that it was published by the rightful owner[docs.dappling.network](https://docs.dappling.network/legacy-docs/learn/ipns#:~:text=An%20IPNS%20name%20is%20essentially,that%20information%20to%20the%20network)[docs.dappling.network](https://docs.dappling.network/legacy-docs/learn/ipns#:~:text=Decentralization%20and%20Security). When another client resolves an IPNS name, the IPFS network ensures the signature is valid (only then will it return the record). Thus, subscribers automatically get proof that “this tag list was published by whoever holds the private key for this IPNS address”. We link that key to the X handle via the initial OAuth verification, and optionally via an explicit proof (profile link or signed statement).
-   **Integrity:** IPFS content addressing (CID) guarantees that data isn’t tampered with. If an attacker tried to alter someone’s tag file in transit, the CID would not match and the client would reject it. Data is read-only once published to IPFS; updates produce a new CID. The IPNS pointer can be updated only by the key owner, but *even if* an attacker attempted to inject a bad CID, they could not forge the IPNS signature without the private key. This prevents malicious data injection.
-   **Account Takeover Protection:** An attacker cannot impersonate another user’s handle because they’d have to either steal their IPNS private key or trick the initial mapping process. The OAuth step and/or posting of the IPNS address to the real X profile thwarts impostors. For example, if Mallory tries to claim Alice’s handle, Mallory cannot complete the X OAuth flow as “Alice” (they don’t have Alice’s credentials). Mallory also cannot produce a fake IPNS record that will be trusted *and* have it associated with Alice’s real profile link.
-   **Public Verifiability:** All claims are publicly verifiable by anyone, independent of the original publisher. Given an X handle, anyone can retrieve the IPNS record and tag data and verify the signature. If we include an additional proof (like a signed message “This IPNS key belongs to @alice”), observers could verify that signature using the public key (which is either part of the IPNS address or can be obtained from the IPNS record) and see that it matches a proof posted on Alice’s X profile. This is similar to how Keybase verified social media accounts: users posted a signed proof on their profile which could be checked by anyone[nixintel.info](https://nixintel.info/security/verify-your-online-identities-with-keybase/#:~:text=Here%E2%80%99s%20the%20cryptographic%20proof%20for,If%20it%20can%E2%80%99t%2C%20it%20won%E2%80%99t)[nixintel.info](https://nixintel.info/security/verify-your-online-identities-with-keybase/#:~:text=But%20what%E2%80%99s%20to%20stop%20any,a%20genuine%20account%20holder%20would). In our case, the presence of the IPNS link or a signed statement on the X profile serves as a publicly auditable attestation that binds the X account to the IPNS key. Because the private key is needed to produce valid updates, and that key was confirmed to belong to the X user, the system is **secure against forgery or replay**. No attacker can replay an old IPNS update either, because IPNS records have sequence numbers and expiration – a stale record will be rejected by clients if a newer sequence is known[docs.dappling.network](https://docs.dappling.network/legacy-docs/learn/ipns#:~:text=Time).
-   **Open Standards and Tools:** IPFS/IPNS are open protocols with many implementations, so anyone can use standard tools (IPFS CLI, gateways, etc.) to resolve a handle’s tag list and verify signatures. We are not using any obscure or home-grown crypto: it’s using widely tested public-key infrastructure. This aligns with the requirement that data integrity and authenticity be checkable by anyone with open tools.

Overall, Proposal 1 meets every requirement: X handles are mapped to IPNS addresses (decentralized names) that anyone can resolve; only the rightful user’s key can push updates; everything runs on decentralized networks at minimal cost; and robust cryptographic security ensures authenticity and integrity of the tag lists.

## Proposal 2: **Blockchain Name Registry + Content Addressing**

**Overview:** In this approach, we utilize a **public blockchain** to maintain a global, tamper-proof registry mapping X.com usernames to their tag list references. A smart contract acts as a decentralized phonebook: given an X handle, it returns a content address (or an associated public key) for that user’s tag list. The tag list itself is stored off-chain (for example on IPFS or a similar storage network) to handle 1 MB files efficiently. Only the owner of the X account can register or update their handle’s entry in the smart contract, enforced by cryptographic proof of identity. This could be implemented on a low-cost blockchain or Layer-2 network (such as Polygon, Solana, etc.) to keep fees negligible. All interactions—identity verification via X, transaction signing, and data retrieval—happen on the client side using Web3 libraries. This design ensures **decentralization via the blockchain’s consensus**, **security via smart contract permissions**, and **low cost by minimizing on-chain data**.

### Mapping X Handles to Tag Lists

The mapping is achieved by a **smart contract registry** (a decentralized database running on blockchain). The contract would maintain a mapping like `username -> record`. The record could contain:

-   A pointer to the tag list data (e.g. an IPFS CID or a content hash on Arweave/Filecoin).
-   The public key or blockchain address that is authorized to update that username’s record.

**Registration flow:** When a user joins, the client (browser) will **log them in with X OAuth** to get their handle (ensuring they are the genuine account). Then the user generates or uses an existing **blockchain account** (e.g. an Ethereum key or Solana key) in the client. The user must prove ownership of the X handle to the blockchain contract. We can achieve this without a centralized server by using X as an identity oracle in a couple of ways:

-   **OAuth + Signed Transaction:** The app, after OAuth, can prompt the user to sign a blockchain transaction that includes their X handle. The user’s wallet (client-side) will sign it with their private key. The app then **submits this transaction to the blockchain network**, calling the registry contract’s “register” function with the handle and the content pointer. The contract can require that the transaction sender’s address is now bonded to that handle. However, to prevent someone else from squatting the handle, we ensure only the real user makes this call: since the app only reveals the ability to do so after OAuth, and the user’s address is included, the risk of impersonation is minimal (attackers would need to both forge X login and control the private key).
-   **Tweet/Proof Verification (fallback):** In scenarios where OAuth isn’t available or for additional assurance, the contract could rely on a **public proof**. For example, the user could post a unique code or their blockchain address on their X timeline (as a tweet or in profile). The contract might accept a hash of this proof and, with the help of a decentralized oracle or network participants, verify it. A simpler approach: require the transaction to include the URL/ID of a Tweet that contains a predefined verification string signed by the user’s blockchain address. Other users (or a script) can later audit that the tweet exists. While on-chain smart contracts cannot directly call the Twitter API, this design stays trustless by relying on publicly verifiable actions and community witnesses (similar to how Keybase did social proofs[nixintel.info](https://nixintel.info/security/verify-your-online-identities-with-keybase/#:~:text=Here%E2%80%99s%20what%20this%20looks%20like,Twitter%20account%20and%20this%20website)). This is a more complex variation; the primary method will assume OAuth for simplicity.

Once registered, the **username->CID** mapping is stored in the blockchain’s state. Now any user (or app) can query the blockchain (a read operation, which is free) to get the content address for a given X handle. For example, the app could call `registry.getRecord("alice")` to get Alice’s latest IPFS CID of her tag list. Because the registry is on a public blockchain, this lookup can be done by anyone using standard blockchain APIs or library calls – no centralized lookup service needed. The blockchain serves as the globally accessible source of truth for mappings.

### Authorization – Only Owner Can Update

The smart contract enforces that **only the rightful owner (and no one else) can create or modify the mapping for their handle**:

-   When a handle is first registered, it gets permanently associated with the user’s blockchain address (or public key) that performed the registration. The contract could store `ownerAddress` along with the handle’s record.
-   On any subsequent update (e.g. user publishes a new tag list CID because they updated their tags), the contract’s function `updateRecord(username, newCID)` will require that the transaction is signed by the same ownerAddress that initially registered that username. If not, the contract rejects the update. This means even if an attacker tries to call the contract to point @alice’s name to a different CID, it will fail unless they control Alice’s private key on the blockchain. The security here is as strong as the blockchain’s account security (e.g. Ethereum’s cryptography). Smart contracts regularly use this pattern to restrict write access; only the account with the correct key (the user’s key) can perform the state change[docs.dappling.network](https://docs.dappling.network/legacy-docs/learn/ipns#:~:text=Like%20IPFS%2C%20IPNS%20benefits%20from,an%20extra%20layer%20of%20security) (analogous to how IPNS required a key – here the “key” is an Ethereum account and the check is done by the contract).
-   The initial registration itself is secured by the verification process. Without it, someone could try to claim someone else’s handle if the contract allowed first-come-first-serve. To prevent that, we use the OAuth or proof workflow described above to ensure the *first* registration of a handle is done by the actual owner. We might incorporate a **signed attestation** in the registration transaction: for instance, the app could generate a message “Register @alice to 0x1234… (Alice’s Ethereum address)” and have the user sign it with their X credentials (perhaps by logging in and then signing a challenge off-chain). If X.com provided an OIDC ID token or some signature, the client could include that in the transaction metadata for others to verify off-chain. In practice, simpler is: the user logs in (so the app knows they are Alice) and then the user’s *blockchain account* calls `register("alice", CID)` once. The app won’t let an attacker even reach this step for a handle they don’t own. As an extra guard, we could have a **moderation contract or DAO** that can challenge fraudulent claims with evidence (like pointing out no proof of X ownership), but ideally OAuth prevents that upfront.
-   Because the user’s blockchain private key is separate from their X account, we ensure *two-factor control*: an attacker would need to compromise both the user’s X login and their crypto wallet to maliciously update the mapping. The user’s X credentials never leave the client and are not reused after the initial verification.

In sum, the blockchain acts as a **permissioned name system** where the permission is tied to the user’s cryptographic keys. No central operator can override this; not even the app developers can alter someone’s record without their key, since the contract does not allow arbitrary writes. This satisfies the requirement that only the account holder can mutate their list mapping.

### Decentralization

Using a blockchain for the name registry brings strong decentralization:

-   **Blockchain as a decentralized database:** The registry smart contract is replicated across all nodes of the blockchain network. There is no single point of failure or central authority controlling the data. Any node or blockchain explorer can query the state. For example, if we deploy on Ethereum or a similar chain, the mapping is secured by thousands of nodes in a consensus network. It’s **publicly accessible** and tamper-proof by design – no one (other than the authorized user) can change a record, and no centralized service is needed to read the data[decentralized-id.com](https://decentralized-id.com/web-3/ethereum/3box-ceramic/#:~:text=,and%20reusable%20across%20all%20applications).
-   **Content storage decentralized:** The tag list content itself is stored off-chain on a decentralized storage network. IPFS could be used here as in Proposal 1 (and indeed a hybrid of Proposal 1 and this one is possible). Alternatively, one might use **Arweave** (a permanent decentralized storage chain) or **Filecoin**. For concreteness, assume we use IPFS for data storage and the blockchain only holds the IPFS hash. This means anyone retrieving the data will go to the IPFS network, which, as discussed, is decentralized and peer-to-peer.
-   **Global accessibility:** To get a user’s tags, one only needs the blockchain’s public endpoint (which can be any node or a public RPC endpoint) to fetch the content pointer, then use any IPFS gateway or node to fetch the actual file. Both steps are globally available – for instance, many services provide free read access to blockchains (e.g. anyone can hit a public API or run their own light node). There is no dependence on *our* infrastructure. Even if our app’s website goes down, a user could independently query the chain and IPFS to find tag lists, using standard tools.
-   By using open blockchain and storage networks, we ensure **no central authority or server** is needed to maintain the handle mappings or the data, fulfilling the decentralization requirement. The design leverages existing decentralized infrastructure (the blockchain of choice, and IPFS) instead of a custom central database.

### Low Cost or Free

This proposal incurs a small cost for writing to the blockchain, but it is kept extremely low by design, and reading is free:

-   **Using a low-fee blockchain:** We would choose a network known for negligible fees and high scalability (for example, a Layer-2 like Polygon, an alternative L1 like Solana, or a rollup). On many of these networks, a single transaction costs a tiny fraction of a cent. For instance, as of 2025, a transaction on Solana might cost around 0.000005 SOL (on the order of **$0.0001 USD** or less)[ainvest.com](https://www.ainvest.com/news/solana-fixed-transaction-fee-remains-0-000005-sol-potential-inefficiencies-2503/#:~:text=Solana%27s%20Fixed%20Transaction%20Fee%20Remains,This%20static%20fee%20model). Similarly, Polygon’s fees are often <$0.001. This means a million users registering or updating might cost only a few hundred dollars in total spread across all users, which is manageable. Users could potentially cover their own fee (which would be on the order of $0.0001 – effectively free from a user perspective), or the app could sponsor the transaction using meta-transactions without significant burden.
-   **Off-chain storage to minimize costs:** We do not store the 1 MB of tag data directly on-chain (which would be expensive). Only a short reference (like a 46-byte IPFS hash or a 32-byte Arweave TX ID) is stored. Thus, the gas cost per update remains low. Frequent updates are not a problem because each update is a small transaction. Even if a power user updates their list 100 times, at $0.0001 per update that’s $0.01.
-   **Scaling to millions of users:** The cost scales sub-linearly in practice. After initial registrations, not every user updates every month. If we estimate, say, 1 million users and 100k updates per month, at ~$1e-4 per update, that’s ~$10 total monthly cost – *“a few dollars at most”* per million users, which meets the requirement. In the worst case of one update per user per month (1M tx), it might be $100-$200, which can be optimized or subsidized if needed.
-   **No centralized server costs:** All operations (blockchain and IPFS) use community-run infrastructure. We avoid needing our own servers for data storage or authentication (OAuth is via X’s servers). The smart contract deployment itself is a one-time cost. The marginal cost per user is extremely low.
-   **Optional optimization – batch updates or state channels:** If needed, we could aggregate multiple updates into one transaction using batch techniques or use state channels/off-chain updates that settle on-chain occasionally (though likely unnecessary given low fees). But overall, the design already uses minimal on-chain footprint.

In summary, by using a blockchain with trivial fees and off-chain storage for bulk data, this solution can handle large user volumes at negligible cost, satisfying the low-cost requirement.

### Client-Side Only Implementation

All crucial steps can be done on the client (with the aid of standard blockchain endpoints and X’s OAuth):

-   **User Authentication:** The client uses X OAuth (in-browser redirect or pop-up) to get the user’s handle securely. For example, using X’s OAuth 2.0 PKCE flow, the JavaScript app obtains an access token and then calls X’s API for the account info[developer.x.com](https://developer.x.com/en/docs/x-api/v1/accounts-and-users/manage-account-settings/api-reference/get-account-verify_credentials#:~:text=GET%20account%2Fverify_credentials). This requires no backend server; the token can be received via a redirect URI on the front-end.
-   **Blockchain Transactions:** The user’s browser can interact with the blockchain through a Web3 provider. For instance, if targeting an EVM chain, the app could use a library like ethers.js or web3.js. If the user has a wallet extension (e.g. MetaMask for Ethereum or Phantom for Solana), the transaction prompt will appear for the user to sign. If not, the app can generate a temporary keypair in-browser (similar to Proposal 1’s key generation) and use it to sign the transaction. The signed transaction is then sent directly to a public blockchain node (via JSON-RPC or a library) from the front-end. No centralized intermediary is needed; many blockchain providers offer public RPC endpoints, or the app can instruct the user to connect to their own node.
-   **Data Storage & Retrieval:** When uploading the tag list to IPFS or another storage, the client does it directly. For IPFS, the app could use a JS IPFS client or call a pinning service’s API *from the front-end*. Pinning services (like web3.storage or Estuary) often have client-side SDKs and free tiers. Importantly, this step doesn’t require trust in a server; even if using a service, the content hash ensures integrity. Alternatively, the client might use the user’s browser to push the file to the IPFS network via a gateway.
-   **No Application Server:** The contract address and ABI (interface) can be hard-coded or fetched from a known source so that the client knows how to call it. Since the logic is on-chain, we don’t need a traditional API server to handle user data. All state changes go through the blockchain, and all data queries either hit the blockchain or IPFS.
-   **Workflow:** The typical workflow on the client is: (1) User clicks “Sign in with X”, completes OAuth in a popup –> client gets username. (2) Client prompts “Connect your wallet” or generates a key –> obtains a blockchain address. (3) Client craft a transaction `register(username, CID)` –> user signs –> client broadcasts to blockchain. (4) When user updates tags, client directly does: add file to IPFS –> get CID –> craft `update(username, newCID)` tx –> user signs –> broadcast. (5) When viewing others’ lists: client calls `getRecord(username)` using a blockchain call (which any web3 library can do from front-end) –> gets CID –> uses IPFS JS client or fetch from gateway to retrieve the file.
-   **Alternative Identity Verification:** If OAuth cannot be done in a purely static front-end (due to needing to keep consumer secrets, etc.), an alternative is the user provides the URL of a tweet as proof. The client can then fetch that tweet via X’s web API (since reading a public tweet can be done client-side with no auth, or using a token if needed) and verify the code. This fallback can be done in-app without a dedicated backend (just using fetch or X’s API endpoints). The second and third proposals can explore such variations.

In all cases, we **do not rely on any custom backend services** for normal operation. The blockchain and storage networks are the “backend”. The client contains the logic to interface with these networks, sign transactions, and verify data. This satisfies the requirement that all core functions (publishing, authenticating, updating, verifying) are client-side.

### Security and Public Verifiability

This solution provides strong security through a combination of blockchain guarantees and cryptography:

-   **Tamper-Proof Name Records:** The blockchain registry is append-only and tamper-resistant. It’s **impossible for an attacker to alter someone else’s mapping** without the correct key. The blockchain’s consensus (PoS/PoW validators) collectively enforce the contract rules. Even the app developer cannot override this; once deployed, the smart contract code (if designed to be immutable) ensures security properties are permanent. Every update leaves a historical trace on-chain, so there’s an auditable log of changes for each username (helpful for auditing or detecting any suspicious activity).
-   **Identity Binding and Verification:** Tying the X handle to a blockchain key is the crux of security. We leverage X’s OAuth (which is secure and grants us the real username) and/or a public proof on X (which is signed by the user or posted by them). Because of this, when we see an on-chain record “alice -> CID, owner=0x1234…”, we (or anyone) can trust that 0x1234 is indeed controlled by the real @alice. For example, if using the tweet verification method: the tweet might say “Verifying I control @alice for DecenTags app. Code: Xyz123. My address: 0x1234…”. Anyone can independently check X.com for that tweet to confirm the link (this is an **open verification** step that doesn’t rely on our app—just the public web or X’s API)[nixintel.info](https://nixintel.info/security/verify-your-online-identities-with-keybase/#:~:text=Here%E2%80%99s%20the%20cryptographic%20proof%20for,If%20it%20can%E2%80%99t%2C%20it%20won%E2%80%99t). Once the binding is established, every update from 0x1234 is inherently attributed to @alice.
-   **Data Authenticity:** The content hash in the registry is like a signed pointer. It’s set by the user’s on-chain transaction, which is signed by their private key. This is effectively a signature that “this CID is the latest tag list for @alice”. The data itself on IPFS can optionally be signed as well (the user could include a signature or HMAC inside the file to double-confirm authorship), but it’s not strictly necessary because the chain record itself is the authorization. When someone fetches the CID from IPFS, they know it came from the user because only that user’s transaction put it there. For additional integrity, the tag list file can include metadata such as the username and a timestamp, plus the user’s blockchain address or public key, all signed by the user’s key. This way, even off-chain, if someone somehow got a wrong CID, the file’s internal signature would not verify and could be rejected. However, since IPFS CIDs are content-addressed, tampering with the file would change the CID and no longer match what’s in the blockchain, providing a natural integrity check.
-   **No Forgery / No Replay:** An attacker who tries to create or update a mapping without the proper credentials will simply fail. They cannot forge the X OAuth process (they’d need the user’s password and 2FA to get a token) and cannot forge the blockchain signature (need the user’s private key). Replay attacks (reusing an old update) are mitigated because the smart contract can include a version or timestamp – but even simpler, if someone tried to “replay” an old CID by calling update with an old value, it’s not really harmful (the contract would just set the pointer to a value that possibly was already in history). The history is visible, and the user can always override with a new update. We can also design the contract to ignore updates that don’t actually change the CID to avoid pointless replays.
-   **Public Auditability:** The entire mapping database is public on the blockchain. Anyone can query it or even download the entire contract state. This means any third-party can audit which handles are registered, what their latest CID is, and who the owner key is. They can also inspect past events (every registration and update emits an event log). This satisfies the requirement that all claims (like “user X updated their list at time Y”) are easily and publicly verifiable. Tools like blockchain explorers or analytics can be used to monitor updates by handle. Additionally, because the mapping is on an open ledger, **data discovery by handle is straightforward** – you literally use the handle as a key in the contract call. Open standards (like Ethereum’s name registry standards, e.g. ENS, or the concept of Decentralized Identifiers) could be used here. In fact, our contract could implement an interface similar to ENS so that standard wallet software or libraries could resolve usernames to data. We are essentially building an open naming standard for X handles.
-   **Resistance to Takeover:** If X.com were to be compromised, it doesn’t directly let an attacker into this system unless they also get the user’s blockchain keys. Conversely, if the blockchain or storage has issues, the X account remains a source of truth to re-establish things. The user’s control of their handle on X and their control of their private key are both required – this two-factor approach means even a stolen X OAuth token alone couldn’t change the on-chain record (and a stolen wallet alone doesn’t give the attacker the username verification). This layered security is **provably secure against forgery** – an impersonator would need to defeat cryptographic signatures that are openly verifiable. The combination of **OAuth identity proof and blockchain signature** is very robust.
-   We also adhere to **open standards**: The use of a blockchain and possibly ENS-like interfaces means anyone with a web3 library can resolve and verify the data. The content is on IPFS, so any IPFS client can fetch it and check the CID against the one in the contract. There’s no proprietary protocol in use, just standard Web3 and IPFS.

By fulfilling the mapping, exclusivity of updates, decentralization, cost-efficiency, client-side operation, and strong security, the blockchain+IPFS solution in Proposal 2 offers a compelling alternative approach that meets all requirements. It uses a different architecture (consensus-based name registry) providing an extra degree of transparency and auditability due to on-chain records.

## Proposal 3: **Decentralized Identity (DID) and P2P Database Solution**

**Overview:** This proposal builds on emerging **decentralized identity (DID)** standards and a peer-to-peer database for storing tag lists. Each user is represented by a **Decentralized Identifier (DID)** that is cryptographically linked to their X.com account. For example, the user might have a DID document containing their public keys and an attestation that this DID is owned by @username. The tag list is stored in a decentralized data network (such as **Ceramic Network’s mutable streams**, **OrbitDB** on IPFS, or **GUN** database) under that DID. These systems allow dynamic, frequent updates and **cryptographically enforce that only the DID owner (and thus the X user) can modify the data**. They function like distributed databases where each user’s data is a separate document or log, identified by their DID. This approach emphasizes interoperability and standardization: anyone can use the DID to verify identity claims and use open protocols to fetch the data. Everything from DID creation to data updates happens client-side, ensuring no centralized components.

### Mapping X Handles to Tag Lists

We achieve handle-to-list mapping by using the **X handle in the DID setup** or via a discovery mechanism:

-   **DID Creation and Linkage:** When a user starts, the client generates a DID for them. There are various DID methods available that don’t require a central authority. For instance, **did:key** can be generated from a key pair instantly (the DID is basically a fingerprint of a public key). Or we might use **did:pkh (public key hash)** which ties a DID to a blockchain address. Alternatively, we could use a social-specific DID method (if one exists for X) – for example, a community-driven **did:twitter** method where the DID document is verified via a tweet proof. In any case, we produce a DID and record an **association with the X handle**. This could mean the DID Document (a public JSON describing the DID) contains an entry like “alsoKnownAs: x.com/@alice” or a Verifiable Credential stating “DID X is controlled by X handle” that the user signs and maybe even posts publicly. The user would prove this link by using X OAuth or posting a verification code on X (similar to earlier proposals) and then embedding that proof in their DID Document or in the data itself.
-   **Decentralized Naming of Data:** Instead of a traditional username directory, the DID itself serves as the key to find the user’s tags. In practice, the DID (which might look like `did:peer:abc123...` or `did:pkh:eth:0xabc...`) can be resolved to a DID Document using standard DID resolvers. The DID Document could include a **service endpoint** URI for the tag list. For example, the DID Document might have a section: `"service": [{ "id": "Tags", "type": "DecentralizedStorage", "serviceEndpoint": "ceramic://kjzl6c..."}]` or an OrbitDB address. Anyone who has the DID can get this document and learn where to fetch the tag list data. If we use a method like **did:web** (where the DID Document could be hosted at a well-known URL), we might even host a DID document on a decentralized web (like on IPFS, pinned by handle) – but since X handles are not domain names, did:web would require X.com’s involvement, which we skip.
-   **Discovery by Handle:** The challenge is how does one get the DID from just the X handle. We solve this via **verifiable public claims**. For example, after generating DID `D`, the user posts on X: “My decentralized ID is D” (with D being the DID URI or a shortened fingerprint). Or the app might use X’s profile metadata: if X has a concept of verified links or allows adding a link in bio, the DID or a profile link to the DID could be placed there. Some platforms allow adding a proof as a profile field (for instance, Keybase used to put a proof in your bio). Assuming the user can share their DID on their profile, anyone who knows the X handle can retrieve that DID (by viewing the profile once). This is exactly how a person can verify someone’s PGP or DID via a social media proof[nixintel.info](https://nixintel.info/security/verify-your-online-identities-with-keybase/#:~:text=Here%E2%80%99s%20what%20this%20looks%20like,Twitter%20account%20and%20this%20website).
-   Another approach is **searchable DIDs** via a third-party index: The decentralized identity community often has “identity hubs” or indexers. For instance, Ceramic’s IDX (Identity Index) allows linking various accounts. A user could publish in an identity index: “Twitter: @alice is associated to DID:abc”. This index could be a public Ceramic document that can be queried by handle. Because it’s on a decentralized network, anyone can run a node to query it.
-   In summary, the mapping flow might be: given @alice, the app either (a) looks up in a known public credential registry (or hits a distributed index) to find a DID, or (b) checks X.com for a proof of Alice’s DID, or (c) asks Alice (if the user is adding by a link). Once the DID is obtained, everything else (resolving DID to data) is straightforward and decentralized. For usability, our app could automate the Twitter lookup for a DID proof in the background, which is using a free service (public Twitter data) and not a custom server.

### Only Allow Account Holder to Mutate the List

The core of this solution is that **updates are bound to the user’s cryptographic identity (DID)**, ensuring only they can change their tag list:

-   **Data Networks with Identity:** Networks like **Ceramic** or **OrbitDB** have the concept of an identity or key that authors a piece of content. For example, in Ceramic, data is stored in **streams**; to update a stream, you must present a valid signature from the controller DID’s private key. If Alice’s DID controls a Ceramic stream (document) that holds her tag list, then by design no one else can update that stream – nodes will reject any update not signed by Alice’s key. Similarly, **OrbitDB** is a peer-to-peer database that can be set to use a given Ethereum account or DID as the identity; only entries signed by that identity’s private key are accepted into the database log[medium.com](https://medium.com/3box/idx-a-devkit-for-open-identity-48edc88e8e85#:~:text=data%20from%20the%203Box%20Labs,team)[news.ycombinator.com](https://news.ycombinator.com/item?id=22918467#:~:text=web%20news,user%20controls%20their%20own%20data). **Gun DB** (if used) has a SEA (Security, Encryption, and Authentication) module where each user’s data nodes can be signed by their key, and writes require the correct signature.
-   **Client-side Key Control:** The user’s private key (for their DID) is generated and kept on the client (it could be derived from a mnemonic or stored in browser localStorage or a wallet extension). Because the DID’s private key is never shared, the user is the sole party capable of producing valid update signatures. Even if the data is stored on some nodes across the network, those nodes can’t alter it – they only replicate what the user signed. For example, if the tag list is stored in an OrbitDB address, all peers will verify each new entry’s signature against Alice’s public key and only accept it if valid.
-   **Immutability of history:** Many of these databases (Ceramic, OrbitDB) maintain an append-only log of changes. That means not only can others not forge an update, but they also can’t hide or rewrite history without detection. If someone tried to fork or replay old data, honest nodes and clients would see inconsistent signatures or sequence numbers. In Ceramic, updates are anchored and linked, so a replay attack (feeding an old state as “new”) would fail the integrity checks.
-   **Mapping Security:** The DID itself is secured to the X account by the initial verification. So the only way an attacker could attempt to mutate someone’s list is by (a) stealing their DID private key (which is equivalent to stealing their entire identity – something we mitigate by encouraging the user to keep it safe, possibly allowing integration with hardware wallets or secure storage), or (b) falsely claiming to be that user with a different DID (prevented by the fact that others will only trust the DID that was publicly proved by the X handle). Essentially, once @alice is linked to DID:abc, no other DID can pretend to be Alice because observers will look for Alice’s proof.
-   This meets the requirement by **cryptographic access control**: only the legitimate user’s keys can effect changes. There is no admin or central party that can override this; the networks in use are trustless regarding writes (they use signature checks). Even the user’s friends who replicate the data cannot insert false data without the key. We have effectively a personal “data vault” for each user, locked by their key.

### Decentralization

This design uses decentralized identity and storage protocols throughout:

-   **DID System:** Decentralized Identifiers are an open standard (W3C) that by nature are not tied to any central authority. Depending on the DID method, the DID resolution might involve a blockchain (e.g. did:pkh uses the blockchain as its root of trust), a P2P network (did:peer, did:key use none or very lightweight networks), or just user-provided data. The key point is that proving control of a DID is done via cryptography, not via a central registry. For example, did:pkh:eth:0x123 uses the Ethereum chain as a backend – any Ethereum node can verify that DID’s control by a signature. Did:key is self-contained. If using Ceramic’s **did:3 (3ID)** or **did:plc** (from ATproto/Bluesky), those are systems where a consortium or network manages DIDs in a decentralized way (Bluesky’s PLC is federated; Ceramic’s 3ID is anchored on Ethereum).
-   **Decentralized Data Network:** We store and propagate tag lists through a P2P or decentralized network rather than a server. **Ceramic Network** is a good example: it’s a decentralized event streaming network where documents (streams) are stored among many nodes, and updates are gossiped through the network[decentralized-id.com](https://decentralized-id.com/web-3/ethereum/3box-ceramic/#:~:text=,and%20reusable%20across%20all%20applications)[decentralized-id.com](https://decentralized-id.com/web-3/ethereum/3box-ceramic/#:~:text=,type%20of%20application%20is%20ComposeDB). There is no central server for Ceramic data; any participant can run a node that follows the streams they care about. **OrbitDB** uses IPFS pubsub under the hood – peers subscribe to database address topics and share updates; the data can be persisted in IPFS as well. **Gun** uses a peer-to-peer graph sync (often relayed by volunteer super-peers, but any peer can do it). In all cases, data availability is distributed. Users might initially connect to a bootstrap peer network (like known public Ceramic nodes or a list of known OrbitDB peers), but these aren’t authorities—just entry points. The system is tolerant to nodes going down; data can be fetched from multiple sources.
-   **No Central Name Server:** Because we resolve identities via public proofs or standard DID resolution, we are not querying a central server to translate @username. We either query the X network (which is a separate centralized service but only for the initial identity linkage which is allowed) or we query a decentralized identity index (like Ceramic’s index or Ethereum). For instance, if using an Ethereum address as the DID, then any Ethereum node can serve as the “naming service” (we might use ENS or a simple contract as in Proposal 2, or even skip a contract – the handle could be encoded in a verifiable credential). For a fully decentralized lookup, one could conceive using something like a distributed hash table keyed by handle containing the DID (similar to how IPNS could be extended), or using a service like **DID Discovery** which can be decentralized if multiple nodes index the same data.
-   **Open Networks and Interoperability:** A big advantage of this approach is that it aligns with wider decentralized identity and data frameworks. That means our solution isn’t a silo: for example, the **Ceramic network** can be used by many apps, and our tag list documents could be read or even updated by other apps (if authorized by the same DID) – enabling portability. The data and identity live on public networks (like Ethereum + IPFS or Ceramic), not on any company’s servers. Anyone can run the necessary nodes to resolve DIDs and fetch data, ensuring the data is accessible “by anyone, anywhere” as required.
-   Therefore, this proposal is fully decentralized in terms of identity (no central authority assigns identities, the user’s control of their key does) and in terms of data storage (many nodes share the data, and anyone can join to retrieve or host it).

### Low Cost or Free

This solution is designed to incur minimal costs:

-   **No per-user fees:** Creating a DID like did:key or did:peer is free (it’s just math on the client). Even if using a blockchain-backed DID, we can often piggyback on existing infrastructure with negligible cost. For instance, did:pkh (based on an Ethereum address) doesn’t require any transaction; it’s simply using an existing address as an identifier. If we use Ceramic, the current Ceramic mainnet might have some minor costs for anchoring to Ethereum, but those are often batched and can be covered by Ceramic’s network or a one-time app fee. In many cases, writing a small document in Ceramic is free to the user (the infrastructure may be subsidized by node operators, similar to how IPFS is free). OrbitDB and Gun are completely free – they rely on users/devs volunteering nodes.
-   **Storage and bandwidth:** The tag lists (1 MB per user) are stored in decentralized fashion. On Ceramic, storing 1 MB as a stream might be split into multiple entries, but it’s essentially just data passed around – no one entity is charging for it. On IPFS/OrbitDB, users who care about the data will pin or cache it. If a million users each store 1 MB, that’s 1 TB network-wide; distributed across thousands of nodes, the impact per node is minor. Gun DB might leverage users’ browsers to store parts of the graph. In any case, **no centralized storage bills** accrue.
-   **Optional community infrastructure:** We could set up community-run indexing nodes (e.g. a Ceramic node with an index on the “X-Tags” schema to allow handle lookup). These would likely be run by volunteers or us in a decentralized manner. The cost of running an indexer for, say, a million small records is modest (a single modest server could handle that, or it could be distributed). Even if it costs a few dollars, it’s not per user – it’s a fixed cost for the network’s benefit.
-   **Frequent update efficiency:** The data networks chosen are optimized for frequent updates. Ceramic’s protocol streams events and only anchors a summary on chain occasionally (with many documents aggregated), so the per-update cost is tiny and mostly off-chain. OrbitDB and Gun are real-time and only use p2p message passing for updates, which is free apart from bandwidth. So if users update often (say several times a day), there’s no penalty or fee – just more gossip traffic which is easily handled by modern networks. There might be a slight increase in storage (each update adds a log entry), but even if each update was, say, 1 KB log entry, 1 million users \* 30 updates = 30 million KB = ~30 GB of new data per month network-wide, which is not a big deal spread out.
-   **User-side costs:** The user only needs an internet connection. They don’t have to purchase any token or subscription. Even identity proofs via X are free (posting a tweet or using OAuth doesn’t cost money).
-   **No licensing costs:** All technologies used (DIDs, IPFS, Ceramic, OrbitDB, Gun, etc.) are open-source and free to use. We are not tying into a paid service. Thus, scaling to a million or more users does not introduce proportional costs. This meets the requirement that even at scale the cost stays a few dollars at most (for infrastructure maintenance), effectively **near-zero cost per additional user**.

### Client-Side Implementation

The entire flow of identity creation, data publishing, and verification can be done on the client:

-   **DID Generation:** The user’s browser generates the cryptographic keys needed for their DID. For example, using the DID libraries, the client can produce a did:key (which is just generating, say, an Ed25519 key pair and encoding it). If using did:pkh (Ethereum-based DID), the user’s browser can generate an Ethereum key (or use one they already have in Metamask, etc.). No server is needed for this; it’s similar to how one might create a cryptocurrency wallet locally.
-   **Identity Proof via X:** The app can use X OAuth to retrieve the handle as in prior proposals. Then the client can either prompt the user with a message: “Please tweet the following code to link your account” or automatically use the X API (with the user’s token) to post a tweet or update their profile with the DID. If user consent is given, this could even be automated: e.g., the client calls X’s POST status API to tweet “Verifying my decentralized ID: did:example:abc123...” (Since the user is already OAuth-authenticated, this API call can be made directly from the front-end using the OAuth token). Alternatively, the app just shows instructions and waits for the user to confirm they’ve posted it. This process again doesn’t need our server—OAuth token allows client to act on user’s behalf to create the proof.
-   **Publishing Tag List:** Depending on the chosen data network, the client would interact with it via its JavaScript libraries:
    -   For Ceramic: the app could include the Ceramic JS SDK. The client connects to a Ceramic node (could be a community node or the app can spin up a lightweight in-browser node). The client authenticates to Ceramic with the user’s DID (using the private key to create a DID session). Then it creates a new **stream (document)** for the tag list with an initial content (the list JSON). Whenever the user updates tags, the client commits an update to that stream. These operations are signed locally and sent to the Ceramic network. The existence of a Ceramic node endpoint doesn’t centralize anything – the user could choose any node or run one; the network ensures data is propagated. If offline, the update will sync when back online.
    -   For OrbitDB: the client can instantiate an OrbitDB database (e.g. a key-value store or document store) with a unique address (possibly derived from the DID). The OrbitDB library uses an IPFS instance under the hood (which can be an in-browser IPFS node started by the app). The user’s DID or blockchain account can be used as the identity for OrbitDB’s access control. When the user updates, they add a new entry to the DB (signed by them). OrbitDB will use IPFS PubSub to broadcast this to any peers listening.
    -   For Gun: the client can connect to a Gun peer (could be another user’s browser or a community relay) and write to a path like `users/alice/tags` with their data. Gun’s SEA will sign the data with the user’s private key. That data is then relayed peer-to-peer. When the user updates, they overwrite that node with new data (Gun keeps historical versions in its graph as well).
-   **Subscription/Reading:** When one user wants to fetch another’s tags, their client will need the target’s DID (obtained via handle lookup as discussed). Then:
    -   For Ceramic: the client uses the DID to resolve the Ceramic stream (maybe via a known deterministic stream ID or via an index query by DID). If the DID Document had a service endpoint (like a Ceramic stream ID), the client can directly load that stream from the network. The client either connects to a Ceramic node or asks one via HTTP for the stream content. Because Ceramic content is signed and anchored, the user can trust it even if fetched through some node. The client could also run a read-only ceramic instance in-browser that connects to peers. Ceramic supports queries by DID if an **indexer** is used (ComposeDB allows GraphQL queries by fields, e.g., find document where “owner = DID and schema = TagList”).
    -   For OrbitDB: the client needs the OrbitDB address of the target’s database. That could be derived from the DID or shared via the DID Document (we could put the orbitdb address as a service or part of the proof tweet). Once it has the address (which looks like `/orbitdb/QmXyz/usernameTags`), the client starts an IPFS instance and opens that OrbitDB address. The IPFS DHT/PubSub will help find peers who have that DB. The entries can then be fetched and verified. Because each entry is signed, the client only accepts valid ones. If the target user is online, they might directly serve it; if not, any network peer with the data can serve it.
    -   For Gun: the client needs to connect to the Gun mesh (could connect to known community relay peers which aggregate data). It can then query the path for the user’s tags. Gun will propagate the data from whoever has it (some peers might store data for offline users). Gun’s data is signed, so the client can verify it’s indeed from the user’s key.
-   **No Dedicated Backend:** All these interactions either use the blockchain/identity network, the P2P database network, or X’s public APIs. We do not run a custom server to intermediate. Even complex tasks like indexing can be offloaded to either decentralized indexers or done locally: for example, the app could download a chunk of index data from IPFS and search it locally for the handle (still no central server query).
-   The user experience can be seamless: they log in with X (client-side popup), then the app behind the scenes registers/announces their DID and opens their data store. When they add tags, it’s immediately broadcast. When they subscribe to someone, the app looks up that someone’s identifier and pulls the data. All cryptographic checks (signatures on data and identity proofs) happen within the app using libraries. This approach fully conforms to the client-only mandate.

### Security and Verification

This proposal is **security-centric**, leveraging cryptography at every layer (identity and data):

-   **DID Cryptography:** The binding of X handle to DID is made secure through **verifiable credentials or proofs**. If using an OAuth token, the client might create a **Verifiable Credential (VC)** stating “Holder of DID X is @alice on X.com”, signed by some authority. Ideally, X.com itself could sign such a statement (if X provided an OIDC ID Token, that JWT could serve as a proof of identity[security.stackexchange.com](https://security.stackexchange.com/questions/256958/what-can-attacker-do-with-openid-connect-id-token#:~:text=id_token%3F%20security,be%20enough%20to%20identify%20him)). Since the instructions say we can use any free X services, we might use X’s OAuth response plus a user action (like posting a code) as a combined attestation. This credential can be stored publicly (on Ceramic or IPFS) so that anyone can audit it. For example, a public credential might include the tweet ID of Alice’s verification post and the DID, all signed by Alice’s DID key (and optionally countersigned by a known verifier if we had one). Anyone can check the tweet and the signature to confirm the link.
-   **Data Authenticity and Integrity:** In decentralized data networks like Ceramic or OrbitDB, **data is self-verifying**. Each update in Ceramic is signed by the DID’s private key and is anchored on chain (which gives an immutable timestamp and ordering). OrbitDB includes the signer’s public key and signature in each database entry. That means when Bob fetches Alice’s tag list, he doesn’t have to trust the source blindly; he checks the signature on the data against Alice’s public key (which he got from her DID Document or known identity). If it matches, he knows Alice indeed produced that data[nixintel.info](https://nixintel.info/security/verify-your-online-identities-with-keybase/#:~:text=But%20what%E2%80%99s%20to%20stop%20any,a%20genuine%20account%20holder%20would). If an attacker attempted to inject false data, the signature check would fail. If an attacker tried to impersonate Alice with a different DID, Bob wouldn’t have a valid proof that that DID is Alice, so he’d ignore it.
-   **Prevention of Unauthorized Changes:** The security model ensures **no one except the legitimate user** can update their list. If Mallory tries to submit an update to Alice’s Ceramic stream, she can’t because she lacks Alice’s DID private key – the network nodes will reject the update as unauthorized. If Mallory tries to create a fake DID claiming to be Alice, she would fail the verification since she can’t produce the proof of X account ownership that the real Alice did. Essentially, **possession of the private key + a valid social proof** is required to be recognized as a given handle. This is very similar to how PGP or Keybase proofs work: only the true account holder can place the verifying message in the account, and only the true DID holder can sign the data. The combination is unforgeable[nixintel.info](https://nixintel.info/security/verify-your-online-identities-with-keybase/#:~:text=But%20what%E2%80%99s%20to%20stop%20any,a%20genuine%20account%20holder%20would).
-   **Replay Attacks:** Because each update in systems like Ceramic has an incrementing version or timestamp (and anchored by a hash chain), an old update cannot be replayed over a new one without detection. The DID Document or profile can also list the current version of the data (or a hash of it). If someone malicious tried to propagate an outdated tag list as if it were current, the genuine user’s latest signature (or anchor on chain) would supersede it. Subscribers could also check timestamps if included, to ensure they have the newest data.
-   **Public Auditability & Standards:** All components are publicly auditable. DIDs and VCs are based on open standards (W3C DID and VC). Anyone can resolve a DID using open libraries and get the public verification material. Anyone can inspect the user’s proof on X (the tweet or profile link) to see that the linkage is legit. The data logs (Ceramic streams or OrbitDB logs) are mostly public – for instance, Ceramic streams can be fetched by anyone who knows the stream ID, and they come with an **audit trail** of signed commits. This means an auditor could list all updates a user made and verify each signature and anchor (fulfilling the requirement that the system is easily discoverable and auditable by handle). The user’s handle is essentially discoverable via the proofs, and then the DID leads to their data.
-   **Open Tools:** We deliberately use open frameworks so that verifying these claims doesn’t require our app. For example, a developer could use the Ceramic CLI to retrieve Alice’s document and check its contents. Or use an OrbitDB client to replicate the database if they know the address. Or use a DID resolver library to confirm the binding between a DID and the Twitter handle via the VC. There’s no obscurity or proprietary tech – it’s leveraging community-driven solutions for decentralized identity and storage.
-   **Security of Keys:** One consideration is key management on the client side. Storing private keys in the browser can be risky if not handled properly. To mitigate this, our app can integrate with browser wallet extensions (many now support generic signing, or something like DIDs in the future) so the key could be stored securely by a wallet. Or use Web Crypto APIs to encrypt the key with a passphrase. Even offering the user a backup of a mnemonic phrase could be part of onboarding (similar to creating a crypto wallet). This is an implementation detail, but important for security – however, it does not undermine any requirement; it simply ensures the user doesn’t lose access or get hacked. We also ensure that if a key is lost or rotated, the DID methods often support updating the DID Document with a new key (especially if using a more advanced DID method like did:ion or Ceramic’s did:3 which allow key rotation).
-   **No Central Trust Needed:** This design is **provably secure without trusting a central server or even the app developer**. Once the system is set up, the authenticity checks rely on cryptographic proofs and public data. If the app developer disappeared, users could still use their keys and the decentralized networks to continue sharing tag lists. New apps could read the same data given the users’ DIDs. This means the solution is future-proof and does not hinge on a single maintainer, aligning with the requirement that it be secure and auditable independent of the original publisher/maintainer.

In conclusion, Proposal 3 provides a **highly decentralized and standard-based solution**: it uses the concept of self-sovereign identities linked to X.com accounts and stores data in a decentralized manner. It meets all requirements by allowing discovery of tag lists by handle (via DIDs and proofs), ensuring only the rightful user can update (via signature checks), being decentralized (no central server, based on p2p networks and blockchain/DID systems), incurring minimal costs (mostly free operations), running entirely on the client (using JS SDKs for DID and data networks), and offering robust security (cryptographic verification and public auditing of every claim). This approach, while more cutting-edge, highlights how using decentralized identity frameworks can elegantly solve the problem of trust and authenticity in a client-only application.

---

Each of the above proposals meets the specified requirements in a different way: **Proposal 1** uses IPFS/IPNS and leverages the inherent security of signed mutable pointers; **Proposal 2** uses a blockchain as a decentralized name registry with smart-contract-enforced ownership; and **Proposal 3** employs decentralized identity and data protocols to achieve a self-sovereign, interoperable solution. All three are designed to be **secure against unauthorized changes or forgeries, decentralized and censorship-resistant, low-cost at scale, and usable with only client-side logic plus X’s free services**. Each proposal also explicitly details how it maps X handles to data and ensures only the handle’s owner can mutate that data, thus fully addressing the requirements for the decentralized tag list app.



**Sources:**

-   X OAuth for identity confirmation[developer.x.com](https://developer.x.com/en/docs/x-api/v1/accounts-and-users/manage-account-settings/api-reference/get-account-verify_credentials#:~:text=GET%20account%2Fverify_credentials). X API allows verifying the authenticated user’s account, which we use to link the X handle with our decentralized identity.
-   IPNS (part of IPFS) for mutable decentralized naming[docs.dappling.network](https://docs.dappling.network/legacy-docs/learn/ipns#:~:text=Decentralization%20and%20Security)[docs.dappling.network](https://docs.dappling.network/legacy-docs/learn/ipns#:~:text=An%20IPNS%20name%20is%20essentially,that%20information%20to%20the%20network) – only the holder of the private key can update an IPNS record, ensuring authoritative updates.
-   Keybase’s method of social media proofs, analogous to our approach for verification[nixintel.info](https://nixintel.info/security/verify-your-online-identities-with-keybase/#:~:text=Here%E2%80%99s%20what%20this%20looks%20like,Twitter%20account%20and%20this%20website)[nixintel.info](https://nixintel.info/security/verify-your-online-identities-with-keybase/#:~:text=But%20what%E2%80%99s%20to%20stop%20any,a%20genuine%20account%20holder%20would), demonstrating how posting a signed statement on a profile proves account ownership and how only the true owner’s private keys can generate verifiable proofs.
-   Cost and performance references for decentralized tech: e.g., Solana transaction fees are extremely low (on the order of fractions of a cent) enabling cost-effective scaling[ainvest.com](https://www.ainvest.com/news/solana-fixed-transaction-fee-remains-0-000005-sol-potential-inefficiencies-2503/#:~:text=Solana%27s%20Fixed%20Transaction%20Fee%20Remains,This%20static%20fee%20model). Ceramic Network’s documentation on being a decentralized data network for Web3, highlighting its event-stream approach to distributed, authenticated data[decentralized-id.com](https://decentralized-id.com/web-3/ethereum/3box-ceramic/#:~:text=,and%20reusable%20across%20all%20applications)[decentralized-id.com](https://decentralized-id.com/web-3/ethereum/3box-ceramic/#:~:text=,type%20of%20application%20is%20ComposeDB).

Citations

[

![](https://www.google.com/s2/favicons?domain=https://docs.dappling.network&sz=32)

IPNS | dAppling documentation

https://docs.dappling.network/legacy-docs/learn/ipns

](https://docs.dappling.network/legacy-docs/learn/ipns#:~:text=Decentralization%20and%20Security)[

![](https://www.google.com/s2/favicons?domain=https://developer.x.com&sz=32)

GET account/verify_credentials | Docs | Twitter Developer Platform

https://developer.x.com/en/docs/x-api/v1/accounts-and-users/manage-account-settings/api-reference/get-account-verify_credentials

](https://developer.x.com/en/docs/x-api/v1/accounts-and-users/manage-account-settings/api-reference/get-account-verify_credentials#:~:text=GET%20account%2Fverify_credentials)[

![](https://www.google.com/s2/favicons?domain=https://docs.dappling.network&sz=32)

IPNS | dAppling documentation

https://docs.dappling.network/legacy-docs/learn/ipns

](https://docs.dappling.network/legacy-docs/learn/ipns#:~:text=Name%20Publishing)[

![](https://www.google.com/s2/favicons?domain=https://docs.dappling.network&sz=32)

IPNS | dAppling documentation

https://docs.dappling.network/legacy-docs/learn/ipns

](https://docs.dappling.network/legacy-docs/learn/ipns#:~:text=Like%20IPFS%2C%20IPNS%20benefits%20from,an%20extra%20layer%20of%20security)[

![](https://www.google.com/s2/favicons?domain=https://docs.dappling.network&sz=32)

IPNS | dAppling documentation

https://docs.dappling.network/legacy-docs/learn/ipns

](https://docs.dappling.network/legacy-docs/learn/ipns#:~:text=IPNS%2C%20which%20stands%20for%20InterPlanetary,that%20may%20change%20over%20time)[

![](https://www.google.com/s2/favicons?domain=https://docs.dappling.network&sz=32)

IPNS | dAppling documentation

https://docs.dappling.network/legacy-docs/learn/ipns

](https://docs.dappling.network/legacy-docs/learn/ipns#:~:text=An%20IPNS%20name%20is%20essentially,that%20information%20to%20the%20network)[

![](https://www.google.com/s2/favicons?domain=https://nixintel.info&sz=32)

Nixintel Open Source Intelligence & Investigations Verify Your Online Identities With Keybase

https://nixintel.info/security/verify-your-online-identities-with-keybase/

](https://nixintel.info/security/verify-your-online-identities-with-keybase/#:~:text=Here%E2%80%99s%20the%20cryptographic%20proof%20for,If%20it%20can%E2%80%99t%2C%20it%20won%E2%80%99t)[

![](https://www.google.com/s2/favicons?domain=https://nixintel.info&sz=32)

Nixintel Open Source Intelligence & Investigations Verify Your Online Identities With Keybase

https://nixintel.info/security/verify-your-online-identities-with-keybase/

](https://nixintel.info/security/verify-your-online-identities-with-keybase/#:~:text=But%20what%E2%80%99s%20to%20stop%20any,a%20genuine%20account%20holder%20would)[

![](https://www.google.com/s2/favicons?domain=https://docs.dappling.network&sz=32)

IPNS | dAppling documentation

https://docs.dappling.network/legacy-docs/learn/ipns

](https://docs.dappling.network/legacy-docs/learn/ipns#:~:text=Time)[

![](https://www.google.com/s2/favicons?domain=https://nixintel.info&sz=32)

Nixintel Open Source Intelligence & Investigations Verify Your Online Identities With Keybase

https://nixintel.info/security/verify-your-online-identities-with-keybase/

](https://nixintel.info/security/verify-your-online-identities-with-keybase/#:~:text=Here%E2%80%99s%20what%20this%20looks%20like,Twitter%20account%20and%20this%20website)[

![](https://www.google.com/s2/favicons?domain=https://docs.dappling.network&sz=32)

IPNS | dAppling documentation

https://docs.dappling.network/legacy-docs/learn/ipns

](https://docs.dappling.network/legacy-docs/learn/ipns#:~:text=Like%20IPFS%2C%20IPNS%20benefits%20from,an%20extra%20layer%20of%20security)[

![](https://www.google.com/s2/favicons?domain=https://decentralized-id.com&sz=32)

Ceramic - 3box | Verifiable Credentials and Self Sovereign Identity Web Directory

https://decentralized-id.com/web-3/ethereum/3box-ceramic/

](https://decentralized-id.com/web-3/ethereum/3box-ceramic/#:~:text=,and%20reusable%20across%20all%20applications)[

![](https://www.google.com/s2/favicons?domain=https://www.ainvest.com&sz=32)

Solana's Fixed Transaction Fee Remains 0.000005 SOL, Despite ...

https://www.ainvest.com/news/solana-fixed-transaction-fee-remains-0-000005-sol-potential-inefficiencies-2503/

](https://www.ainvest.com/news/solana-fixed-transaction-fee-remains-0-000005-sol-potential-inefficiencies-2503/#:~:text=Solana%27s%20Fixed%20Transaction%20Fee%20Remains,This%20static%20fee%20model)[

![](https://www.google.com/s2/favicons?domain=https://medium.com&sz=32)

IDX: A Devkit for Open Identity. The future of Web3 identity has arrived

https://medium.com/3box/idx-a-devkit-for-open-identity-48edc88e8e85

](https://medium.com/3box/idx-a-devkit-for-open-identity-48edc88e8e85#:~:text=data%20from%20the%203Box%20Labs,team)[

OrbitDB: Peer-to-peer databases for the decentralized web

https://news.ycombinator.com/item?id=22918467

](https://news.ycombinator.com/item?id=22918467#:~:text=web%20news,user%20controls%20their%20own%20data)[

![](https://www.google.com/s2/favicons?domain=https://decentralized-id.com&sz=32)

Ceramic - 3box | Verifiable Credentials and Self Sovereign Identity Web Directory

https://decentralized-id.com/web-3/ethereum/3box-ceramic/

](https://decentralized-id.com/web-3/ethereum/3box-ceramic/#:~:text=,type%20of%20application%20is%20ComposeDB)[

![](https://www.google.com/s2/favicons?domain=https://security.stackexchange.com&sz=32)

What can attacker do with OpenID Connect id_token?

https://security.stackexchange.com/questions/256958/what-can-attacker-do-with-openid-connect-id-token

](https://security.stackexchange.com/questions/256958/what-can-attacker-do-with-openid-connect-id-token#:~:text=id_token%3F%20security,be%20enough%20to%20identify%20him)

All Sources

[

![](https://www.google.com/s2/favicons?domain=https://docs.dappling.network&sz=32)

docs.dappling

](https://docs.dappling.network/legacy-docs/learn/ipns#:~:text=Decentralization%20and%20Security)[

![](https://www.google.com/s2/favicons?domain=https://developer.x.com&sz=32)

developer.x

](https://developer.x.com/en/docs/x-api/v1/accounts-and-users/manage-account-settings/api-reference/get-account-verify_credentials#:~:text=GET%20account%2Fverify_credentials)[

![](https://www.google.com/s2/favicons?domain=https://nixintel.info&sz=32)

nixintel

](https://nixintel.info/security/verify-your-online-identities-with-keybase/#:~:text=Here%E2%80%99s%20the%20cryptographic%20proof%20for,If%20it%20can%E2%80%99t%2C%20it%20won%E2%80%99t)[

![](https://www.google.com/s2/favicons?domain=https://decentralized-id.com&sz=32)

decentralized-id

](https://decentralized-id.com/web-3/ethereum/3box-ceramic/#:~:text=,and%20reusable%20across%20all%20applications)[

![](https://www.google.com/s2/favicons?domain=https://www.ainvest.com&sz=32)

ainvest

](https://www.ainvest.com/news/solana-fixed-transaction-fee-remains-0-000005-sol-potential-inefficiencies-2503/#:~:text=Solana%27s%20Fixed%20Transaction%20Fee%20Remains,This%20static%20fee%20model)[

![](https://www.google.com/s2/favicons?domain=https://medium.com&sz=32)

medium

](https://medium.com/3box/idx-a-devkit-for-open-identity-48edc88e8e85#:~:text=data%20from%20the%203Box%20Labs,team)[

news.ycombinator

](https://news.ycombinator.com/item?id=22918467#:~:text=web%20news,user%20controls%20their%20own%20data)[

![](https://www.google.com/s2/favicons?domain=https://security.stackexchange.com&sz=32)

security...kexchange

](https://security.stackexchange.com/questions/256958/what-can-attacker-do-with-openid-connect-id-token#:~:text=id_token%3F%20security,be%20enough%20to%20identify%20him)
