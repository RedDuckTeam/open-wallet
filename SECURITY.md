# Security Policy

OpenWallet is a non-custodial wallet: a bug here can cost people their funds.
Reports are welcome and taken seriously.

## Reporting a vulnerability

**Do not open a public issue for a security problem.**

Use GitHub's [private vulnerability
reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
on this repository (Security → Report a vulnerability). If that isn't
available to you, contact the maintainers privately and ask for a secure
channel before sending details.

Please include:

- what an attacker can do, and what they need to start (a connected dApp? a
  malicious RPC? physical access to an unlocked browser?)
- the smallest set of steps that reproduces it
- affected version or commit

You can expect an acknowledgement within a few working days, an assessment of
severity and a fix plan after triage, and credit in the advisory unless you
prefer otherwise. Please give us a reasonable window to ship a fix before
disclosing publicly.

## Scope

In scope — anything that lets an attacker:

- extract or infer a private key, seed phrase, or the vault password
- get a transaction, User Operation, or signature approved that the user did
  not intend, or that differs from what the approval screen showed
- bypass the origin/connection checks in the dApp bridge, or the approval flow
  entirely
- read wallet state across an isolation boundary (page → content script →
  background)
- break the key-lifetime guarantees described in
  [docs/architecture.md](docs/architecture.md) ("Security invariants")

Out of scope:

- vulnerabilities in third-party services the wallet talks to (RPC providers,
  bundlers, paymasters, indexers, price APIs) — report those to them. What _is_
  in scope is us trusting their responses more than we should.
- the privacy cost of features the user explicitly opted into, and which are
  documented as such (NFT autodetection, NFT media loading)
- phishing, social engineering, or a compromised machine
- anything requiring a malicious build of the extension itself

## Known accepted risks

These are deliberate trade-offs, documented so a report doesn't get filed as a
surprise:

- **Unlock survives a service-worker restart.** The vault password is held in
  `chrome.storage.session` — memory-only, cleared when the browser closes and
  unreadable from content scripts. Without it, Manifest V3 evicts the
  background worker and locks the wallet every few minutes. Auto-lock clears
  it on schedule. See `apps/extension/src/platform/session.ts`.
- **Provider endpoints are stored unencrypted.** Bundler, paymaster and RPC
  URLs usually embed a provider API key. They are rate-limit credentials, not
  fund-moving secrets, and putting them behind the password would stop the
  wallet reading its own configuration while locked.
- **NFT media loads from third-party hosts** when enabled, which discloses the
  viewer's IP to them. Both the media and the autodetection toggles exist to
  turn this off.

## Supported versions

This project has not cut a stable release yet. Fixes land on `main`.
