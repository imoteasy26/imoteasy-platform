# Investor Intelligence Architecture

## Status

This is the P3 target architecture. Investor intelligence is not part of the first P1 implementation. Until sufficient data sources exist, the product must show “insufficient data” rather than imply a fair market value.

## Investor profile and criteria

An investor profile records investment approach and consent settings. Criteria support budget, cities/neighborhoods, property types, minimum/maximum asking price, minimum area, expected rental income, target gross and net yields, maximum renovation cost, strategy, and required discount against comparable offers. Criteria are versioned so an alert can show which profile matched.

Watchlists link investors to canonical listings/opportunities and retain saved date, status, and price history. Alerts are opt-in and separately configurable for:

1. New investment opportunities.
2. Property price drops.
3. Potentially underpriced properties.

Alerts identify the criteria, listing version, evidence snapshot, and confidence available at creation.

## Data provenance

Store these as distinct facts:

- asking prices from active listings;
- verified transaction prices with source and verification level;
- estimated market ranges with methodology and as-of date;
- user-entered assumptions such as rent, vacancy, renovation, taxes, furnishing, and maintenance.

Never substitute asking-price comparisons for verified transaction evidence without labeling the limitation. Every opportunity score stores source references, inputs, calculation date, algorithm version, confidence, and reasons.

## Yield calculations

Gross yield:

$$\text{Gross yield} = \frac{\text{annual gross rent}}{\text{acquisition price}} \times 100$$

Net yield:

$$\text{Net yield} = \frac{\text{annual net rental income}}{\text{total acquisition cost}} \times 100$$

Total acquisition cost supports purchase price, acquisition fees, taxes, renovation, and furnishing. Net rental income supports operating expenses and investor-configured vacancy, maintenance, and rent assumptions. Show each input and distinguish verified, estimated, and user-entered values. Results are estimates, not guarantees.

## Transparent scoring

A score may use asking price, comparable properties, price per square meter, listing price history, condition, location, expected rent, renovation, expenses, data quality, and confidence. The model is versioned and decomposable into visible factor contributions. It must not label a property “below true market value” without enough comparable transaction records. If the sample is sparse, stale, or non-comparable, return an unavailable/insufficient-data state and suppress the underpriced alert.

## Suggested data structures

- `investor_profiles`
- `investment_criteria` and criteria versions
- `investor_watchlists` / `investor_watchlist_items`
- `investment_opportunities`
- `market_comparables` with source, verification, geography, and transaction date
- `opportunity_score_versions` and factor-level evidence
- `investment_assumptions` and yield snapshots
- `investor_alerts` and delivery outcomes
- `portfolio_assets` and recorded cash-flow facts

All investor-owned data is RLS-scoped to its user/authorized organization. Market observations require provenance and licensing review. Investor alert preferences and marketing consent are separate.

## P3 validation gates

- Validate calculations against reviewed examples and rounding rules.
- Show source and age for every comparable and score input.
- Test sparse-data, missing-rent, outlier, and stale-comparable cases.
- Confirm investor privacy, alert opt-outs, and tenant isolation.
- Label estimates clearly and prohibit guaranteed-return language.
