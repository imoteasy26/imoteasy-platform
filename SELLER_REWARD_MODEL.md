# Seller Reward and Commission Model

## Status: calculation and payout disabled

The intended incentive is a seller bonus of 1% funded from a broker's agreed commission after a successfully completed transaction, but the calculation basis is not finalized. No active promise, payable amount, automated payout, or production collection is enabled by this model.

## Configurable calculation bases

A signed agreement may select exactly one approved basis:

1. Percentage of transaction price.
2. Percentage points deducted from the broker's agreed commission rate.
3. Percentage share of the broker's actual fee.

Do not select a default. The chosen basis, value, currency, rounding rule, cap/floor, eligibility conditions, and effective date must be present in the signed agreement. The final legal and accounting interpretation requires approval before implementation is enabled.

## Agreement source of truth

A commission agreement is scoped to the broker/agency, listing or transaction, counterparty, currency, rate/basis, effective period, and signature evidence. A seller reward agreement references the commission agreement, seller, broker, listing, transaction, and selected reward model. Agreement versions are immutable; amendments create a new version with new acceptance evidence.

A transaction can generate a proposed calculation only when all required agreements are accepted and the transaction is independently verified as completed. An accepted offer, verbal confirmation, draft contract, or broker-entered status alone is not completion proof.

## Financial data model

- `commission_agreements`: parties, basis, rate/value, currency, effective dates, agreement version, acceptance state.
- `seller_reward_agreements`: seller, broker/agency, listing/transaction scope, selected basis, terms/version, accepted state.
- `transaction_completion_verifications`: verifier, evidence reference, verification outcome, timestamp, and audit trail; never store raw legal documents in public buckets.
- `seller_reward_ledger`: append-only signed entries with agreement, transaction, calculation inputs, calculation version, amount, currency, approval, payment state, and idempotency reference.
- `seller_reward_events`: immutable proposal, approval, dispute, adjustment, reversal, and payout state changes.

Ledger corrections are compensating entries, not updates/deletes. The ledger does not contain client-writable balances.

## Approval and payout controls

1. Validate completion and source agreements.
2. Calculate from the agreement-selected basis and verifiable inputs.
3. Store a proposed ledger entry with input snapshot and calculation version.
4. Require authorized human approval and conflict-of-interest checks.
5. Track disputes and freezes; a disputed amount cannot be paid.
6. Create payout only after legal, tax, accounting, identity, and payment-provider approval.
7. Use idempotency, velocity checks, and reconciliation before any transfer.

The financial UI must label proposed, approved, disputed, and paid states distinctly. No user can approve their own payout unless an approved segregation-of-duties policy explicitly permits it.

## Required approvals before activation

- Legal review of consumer and broker contracts, disclosures, eligibility, and jurisdiction.
- Accounting/tax treatment and who is the payer/payee of record.
- Approved commission source, calculation basis, rounding, corrections, and dispute process.
- Identity/fraud controls and transaction completion evidence.
- Payment provider and payout permissions, idempotency, and reconciliation.
- Written authorization to enable any production calculation or payout.
