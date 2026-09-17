# Security

TrustBridge custodies funds in a Soroban smart contract. This document records
the threat model, the controls that exist, and the things that are deliberately
**not** production-ready.

> **Status: prototype on Stellar Testnet.** Testnet XLM has no value. Do not
> point this at mainnet or connect a wallet holding real funds without the
> changes listed under [Before mainnet](#before-mainnet).

---

## Reporting a vulnerability

Open a private security advisory on the repository, or email the maintainer.
Please do not open a public issue for an exploitable finding. Include the
contract ID, the transaction hash, and the minimal steps to reproduce.

---

## Key management

| Key | Where it lives | Committed? |
|---|---|---|
| Deployer / admin secret | `tools/chain/.deployer.json` or `TB_DEPLOYER_SECRET` | **No** — gitignored, and `npm run lint` fails the build if a `S…` strkey appears in any trackable file |
| Test party secrets | `tools/chain/.test-accounts.json` | **No** — gitignored |
| End-user keys | Never leave the user's wallet extension | N/A |
| Contract IDs, admin *public* key | `chain-config.json`, `assets/js/chain/config.generated.js` | Yes — public data by design |

The frontend never sees a private key. Every write is built, simulated, then
handed to the wallet as an XDR for signing; TrustBridge only ever receives the
signed envelope back.

CI needs **no secrets**: deployment validation performs read-only simulations
with a throwaway keypair as the source account.

### The "testnet dev key" wallet adapter

For demos on machines with no wallet extension, the connect dialog offers a dev
key. It is:

- **testnet only** — the adapter refuses to initialise when the configured
  network is `public`;
- **memory only** — never written to `localStorage`, never restorable across a
  reload (session restore explicitly skips the `devkey` adapter);
- **clearly labelled** — behind an "Advanced" disclosure with a warning.

It still produces real signatures against real Testnet. Treat any key pasted
there as compromised.

---

## Contract security controls

Implemented in `contracts/escrow/src/lib.rs` and
`contracts/resolution/src/lib.rs`, and covered by 72 Rust tests.

### Authorisation

Every mutating entry point authorises a *specific* address with
`require_auth()` — never "whoever called". `role_of()` rejects any address that
is neither the buyer nor the seller with `Error::Unauthorized`.

- `fund`, `cancel` — buyer only
- `start_work`, `submit_work` — seller only
- `approve`, `withdraw_approval`, `raise_dispute` — buyer or seller, and only
  their *own* approval flag
- `resolve_dispute`, `set_resolution`, `upgrade` — admin only
- `record_resolution` (resolution contract) — the registered escrow contract
  only, enforced by `require_auth()` on that contract's address, which only a
  genuine cross-contract call can satisfy

### The dual-approval invariant

`release` returns `Error::ApprovalsMissing` unless
`buyer_approved && seller_approved`. This check has no bypass: the admin path
goes through the same function and the same guard. Tested by
`admin_cannot_bypass_the_dual_approval_gate` and asserted live on-chain in
`tools/chain/integration-test.js`.

### Double-spend and double-refund protection

- `balance` is drained to zero and the status moved to a terminal value **in the
  same invocation** as the transfer, so a replay sees nothing to move.
- `release` rejects when `balance <= 0` (`NothingToRelease`) or when the escrow
  is already settled (`AlreadySettled`).
- `resolve_dispute` rejects when there is no open dispute (`NoOpenDispute`),
  when `refund > balance` (`RefundExceedsBalance`), and when `balance <= 0`.
- The resolution contract independently refuses a second record for the same
  escrow (`AlreadyRecorded`), so a duplicate settlement fails in two places.

### Arithmetic

All balance mutations use `checked_add`/`checked_sub`, and the release profile
sets `overflow-checks = true`. Fee arithmetic rounds **down**, so the platform
can never over-charge, and `fee + net == gross` is asserted in tests.

### State machine

`transition()` is the single declaration of legal moves; anything else is
`Error::InvalidState`. Approvals additionally freeze while a dispute is open, so
a late approval cannot reopen a payout that Trust & Safety is adjudicating.

### Input validation

Amount `> 0`, buyer `!=` seller, deadline in the future, dispute reason code
within range, refund within `0..=balance`, and a resolution must move something.

### Cross-contract failure containment

The escrow never lets the secondary contract hold its funds hostage. Both
cross-contract calls use the fallible `try_*` client; on any failure the escrow
emits `resolution_call_failed`, treats the fee as zero, and settles normally.
Tested by `escrow_survives_a_broken_resolution_contract`.

### Upgradeability

`upgrade(new_wasm_hash)` uses `env.deployer().update_current_contract_wasm` and
is admin-gated. Storage is additive by convention: `Escrow` fields are appended
and `Status` discriminants are never renumbered, because the frontend maps
status by integer.

**Residual risk:** the admin is a single key with the power to upgrade the
contract and to adjudicate disputes. See [Before mainnet](#before-mainnet).

---

## Frontend security controls

### Content Security Policy

Served by `serve.js`, `netlify.toml` and `vercel.json`, all kept identical:

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data:;
connect-src 'self' <stellar rpc/horizon/friendbot origins>;
form-action 'none'; frame-ancestors 'none'; base-uri 'self'
```

- `script-src 'self'` with **no inline `<script>` anywhere** — enforced by
  `npm run lint`. The Stellar SDK is vendored into `assets/vendor/`, not loaded
  from a CDN, and contains no `eval`/`new Function`.
- `connect-src` allows only the Stellar endpoints the dApp needs. This is why a
  misconfigured RPC URL fails loudly instead of silently exfiltrating.
- `frame-ancestors 'none'` + `X-Frame-Options: DENY` prevent clickjacking a
  signature prompt.

Also set: `X-Content-Type-Options: nosniff`, `Referrer-Policy:
strict-origin-when-cross-origin`, `Permissions-Policy` denying camera,
microphone, geolocation and payment.

### Network guard

`wallets.connect()` compares the wallet's reported network passphrase against
the configured one and refuses to connect on a mismatch. `rpc.assertNetwork()`
does the same for the RPC endpoint. A user cannot accidentally sign a mainnet
transaction against testnet contract IDs.

### Never assume success

`tx.run()` treats a transaction as successful only after
`getTransaction` returns `SUCCESS`. A confirmation timeout is surfaced as a
*pending* transaction with its hash, an explorer link and a Refresh action —
never as a success, and never as a silent failure.

### Output encoding

All dynamic values are escaped through `TB.utils.esc()` before entering
`innerHTML`. Addresses and hashes are additionally rendered into fixed-shape
chips rather than interpolated into attributes.

### No secrets in client storage

`localStorage` holds: the simulated demo state, the connected wallet's
**public** key and adapter id, a cache of on-chain escrows, and transaction
history. No secret, no signed XDR, no session token.

---

## Known limitations

These are deliberate for a prototype and would each be a finding in a real audit.

1. **Simulated-mode passwords are plain text.** The non-blockchain demo
   accounts live in `localStorage` with plain passwords because there is no
   server. Anyone with the browser has them. The on-chain path does not use
   them at all.
2. **Single admin key.** One keypair can upgrade the contract and settle every
   dispute.
3. **No rate limiting or anti-spam.** Anyone can create escrows.
4. **Dispute evidence is not stored.** File names and sizes are recorded; the
   contents are never uploaded, so evidence is not verifiable.
5. **No formal audit.** The contracts have 72 tests and a live integration
   suite, which is not the same as an audit.
6. **The XLM SAC is trusted.** Funds are held as the native Stellar Asset
   Contract token; a token-level failure is out of scope.
7. **Event history is bounded.** Soroban RPC retains a limited ledger window,
   so the event feed reconstructs recent history only.

---

## Before mainnet

- [ ] Independent audit of both contracts.
- [ ] Replace the single admin with a multisig or a threshold/timelocked
      arbitration contract; separate the *upgrade* authority from the *dispute
      resolution* authority.
- [ ] Add a timelock and an event to `upgrade`, so users can exit before a
      contract changes underneath them.
- [ ] Add a deadline-based escape hatch: if a counterparty vanishes, the funds
      must not be locked forever.
- [ ] Move the simulated-mode auth to a real backend with hashed passwords, or
      remove it entirely.
- [ ] Pin an RPC provider with an SLA and add a fallback endpoint.
- [ ] Store dispute evidence content-addressed, with the hash on-chain.
- [ ] Fuzz the refund/release arithmetic and add invariant tests
      (`refunded + released + balance == funded`, already asserted per-case).
- [ ] Re-run the CSP against any newly added third-party origin.

---

## Verifying the security claims yourself

```bash
npm run lint            # secrets, eval, inline scripts, native dialogs
npm run contracts:test  # 72 Rust tests, incl. every authorisation boundary
npm run chain:verify    # 20 live checks against the deployed contracts
npm run chain:test      # 33 live assertions, incl. rejected one-approval release
npm run test:chain      # 91 frontend assertions, incl. wallet/contract/network failures
```

The dual-approval gate, the refund cap and the double-refund guard are each
asserted **on-chain** in `tools/chain/integration-test.js`, so the guarantees
are demonstrated against the deployed bytecode rather than a local mock.
