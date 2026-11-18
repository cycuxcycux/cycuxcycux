# Cycuxio

> Built with Arc Studio - money-powered apps in minutes

This is the **project memory** - what Arc Studio remembers about building this app. It helps future agents (or humans) understand and extend the project.

---

## What This App Does

Cycuxio is an agent office on Arc Testnet where AI agents hire, verify, and pay each other.
- Identity: ERC-8004 IdentityRegistry. Agent registration files are `data:` URIs built in `src/lib/agentCard.ts`.
- Roster, task lineage and reputation bridge: `contracts/CycuxioOffice.sol` (reviewed, deployed).
- Settlement: ERC-8183 AgenticCommerce escrow in USDC (create, record, set budget, approve, fund, accept, deliver, approve or reject).
- Reputation: scores are derived from job outcomes by `CycuxioOffice.rateTask` (Completed = 100, Rejected or Expired = 0 only when the agent accepted and the evaluator is not the client).
- Validation: ERC-8004 ValidationRegistry. An agent is "Validated" when a non-owner validator scored it 70 or higher.
- Not built: x402 per-call payments and live A2A message transport. The registration file only advertises an A2A endpoint and x402 support.

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity 0.8.28 + Foundry. Sources in `contracts/`, unit tests in `contracts/test/*.t.sol`. Build with `bun run contracts:build` (`forge build`), test with `bun run contracts:test` (`forge test`).
- Wallet: injected (MetaMask, etc.)
- Chain: Arc Testnet (Chain ID: 5042002, imported from `viem/chains`)
- Token: USDC (6 decimals) (Address: 0x3600000000000000000000000000000000000000, Chain: Arc Testnet)
- Toasts: Sonner

## Key Files

- `src/App.tsx` - Tabs (Office, Tasks, Validation, My agents) and hire flow wiring
- `src/hooks/useOffice.tsx` - single onchain read model (roster, tasks, reputation, validation)
- `src/hooks/useTx.ts` - simulate, send and confirm contract writes on Arc Testnet
- `src/lib/chain.ts` - addresses and ABIs for the registries, escrow and office
- `contracts/CycuxioOffice.sol` - roster, task ledger, outcome reputation
- `src/components/` - UI components
- `src/config.ts` - wagmi config (chains, connectors, transports)

## Share links

- Starter apps already ship `getShareBase`, `buildShareLink` and `installShareSync` in `src/lib/share.ts`; import them instead of rewriting them.
- Keep shareable state in the URL path or query, not in the `#fragment`.
- Never put a secret (private key, claim secret, seed phrase, session token, API key) in the URL path or query, encoded or not: every in-app path and query is mirrored to the visitor's studio.arc.io address bar and browser history and reaches servers. A bearer claim secret goes only in the `#fragment` appended to the share link (`` `${await buildShareLink('/claim')}#${secret}` ``) and is read from `location.hash` on load. A link to the app's own share URL shown inside the app must be copy-only or open in a new tab with `target="_blank" rel="noopener noreferrer"`.
- Build every link a user copies or sends with `buildShareLink()` from `src/lib/share.ts`.
- Keep the `installShareSync()` call in `src/main.tsx` when editing it; it keeps the Studio address bar in step with in-app navigation.
- Navigate inside the app with relative links.

## Deployed contracts (Arc Testnet)

- CycuxioOffice: 0xc32e97c7210d217b123c5cf20d308e4957acfe9e (env `VITE_CYCUXIO_OFFICE`)
- Uses ERC-8004 identity 0x8004A818BFB912233c491871b3d84c89A494BD9e, reputation 0x8004B663056A597Dffe9eCcC1965A193B7388713, validation 0x8004Cb1BF31DAf7788923b405b754f57acEB4272, ERC-8183 escrow 0x0747EEf0706327138c69792bF28Cd525089e4583

## Decisions

- The identity registry holds hundreds of thousands of agents and is not enumerable, so Cycuxio keeps its own roster in CycuxioOffice instead of scanning the registry.
- Public RPC rejects getLogs ranges above a few thousand blocks, so the app reads state through getters and multicall, never event scans.
- Graphite dark theme with an amber brand accent (#f2b84b), Space Grotesk and DM Sans, tokens in `src/index.css`.

## Bitcoin Monitor agent (server/)

- `server/index.ts` is a Node http server (run with `bun run start`): serves `dist/`, `/.well-known/agent-card.json`, `/a2a` (A2A 0.3 JSON-RPC, `message/send` only), `/health`.
- `server/market.ts` reads Coinbase Exchange public BTC-USD ticker and 1-minute candles. `server/watch.ts` samples every 10 minutes and keeps 24 hours in memory (lost on restart).
- Vercel through Arc Studio is static only and cannot run `server/`. A backend host (Hugging Face Docker Space) is required for the A2A endpoint.
- `server/main-agent.ts` is the main agent: an A2A client that calls the monitor's `/a2a` every 10 minutes (status at `/main-agent`).
- `src/components/EndpointEditor.tsx` probes an endpoint's agent card, then calls `setAgentURI` to connect it to an ERC-8004 registration.

## To Run

```bash
bun install
bun run dev
```
