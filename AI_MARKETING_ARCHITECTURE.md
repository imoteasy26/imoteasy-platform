# AI Marketing Operating System Architecture

## Status and scope

This document defines the P2 architecture. The current P1 milestone does not run agents, generate marketing content, connect channels, or publish externally. Any future AI implementation must pass P0/P1 acceptance gates first.

Reference architecture: [eve Marketing Team](https://vercel.com/templates/eve/eve-marketing-team). The production design should evaluate `eve` for durable multi-agent orchestration and Vercel Connect for user-authorized third-party access. Credentials remain in managed connectors, never in application tables or prompts.

## Agent roles

- **Marketing Director:** translates broker goals into prioritized, bounded tasks and routes work to specialists.
- **Brand Strategist:** maintains approved broker positioning, audience, differentiation, and messaging rules.
- **Content Creator:** drafts property descriptions, ads, articles, social posts, and campaign concepts using authorized listing facts.
- **Social Media Agent:** formats approved material for supported channel queues; unsupported Facebook Groups publishing stays a manual package.
- **SEO Agent:** optimizes broker/listing content for local search and reports measurable search performance.
- **Performance Analyst:** reports only observed channel and funnel metrics, with source, period, and attribution model.

A lead agent coordinates specialist runs; specialists do not receive unrestricted tools or data. Each run is tied to an organization, broker, campaign/task, creator, prompt/model version, usage event, and output asset.

## Broker-scoped context

Every run uses an explicit organization and broker authorization context. Context assembly allowlists only that broker's approved brand profile, authorized listings, images, marketing goals, and connected-channel metadata. RLS and server-side membership checks protect reads. A broker can never select another organization's ID to broaden context.

Property facts are taken from canonical listing fields. Generated copy must not invent property features, availability, pricing, legal claims, comparable sales, or transaction outcomes. Unknown facts remain omitted or explicitly marked for confirmation.

## Data model

- `marketing_brand_profiles`: organization/broker scope, positioning, audiences, voice, approved/disallowed claims, review state, editor, version.
- `marketing_campaigns`: objective, listing scope, target segment, channels, planned dates, budget assumptions, state, owner.
- `marketing_agent_runs`: run/task IDs, orchestration state, agent role, model/prompt version, usage, error class, timestamps, and parent run.
- `marketing_tasks`: assigned specialist, input references, status, creator, assignee, due date, and audit timestamps.
- `marketing_assets`: draft content or generated media metadata, listing/campaign links, source facts, version, and authoring run.
- `marketing_approval_requests`: asset/action, requested reviewer, decision, comments, version/hash, and immutable decision history.
- `marketing_channel_connections`: Vercel Connect connector reference and authorized channel metadata; no provider token fields.
- `marketing_publishing_records`: approved asset, channel, publisher, scheduled/published status, external ID, timestamps, and result.
- `marketing_performance_facts`: measured reach, impressions, clicks, visits, inquiries, viewings, offers, and attribution references, with source and collection time.
- `broker_usage_events`: model/resource consumption, units, period, provider/model, run/task, and idempotency key.
- `marketing_monthly_reports`: period, organization/broker, metrics, unavailable-metric reasons, attribution model/version, and report-generation run.

## Workflow and approval

1. Broker defines a marketing objective and listing scope.
2. Marketing Director creates bounded specialist tasks.
3. Specialist generates an asset draft and records source facts.
4. Broker reviews, edits, approves, or rejects a specific immutable draft version.
5. A separately authorized publishing action may queue content only to a supported connected business channel.
6. Publishing result and available channel metrics are recorded.
7. Attribution links clicks/inquiries/viewings/outcomes where permitted.
8. Monthly report includes measured results and clearly labels unavailable data.

Approval is bound to the exact asset version and destination. Editing after approval invalidates the approval. No publishing action, direct message, spend, or irreversible external write occurs without explicit broker authorization. Scheduled publication requires an approved, revocable queue record.

## Privacy and security

RLS applies to all organization-scoped rows. Channel access uses managed short-lived authorization, not static tokens. Data minimization, retention limits, consent, opt-outs, provider terms, and audit history apply to prompts and outputs. Private seller/buyer records, private listing details, and legal documents are excluded from broad marketing context by default.

## Measurement rules

Monthly reporting covers content created, campaigns, reach, impressions, clicks, listing visits, qualified inquiries, viewings, offers, completed deals, attributed outcomes, and AI cost. Each metric carries source, date range, coverage, and attribution model. If an API does not supply a metric, show “not measured”; do not estimate it as observed performance.

## P2 exit criteria

- Tenant-isolation tests cover prompt assembly, asset reads, approval actions, and connected channels.
- Unsupported publishing and unsolicited personal messages are impossible in the action registry.
- Human approval is required for every external publish and tied to immutable content/version.
- Provider authorization, revocation, retention, consent, and failure states are reviewed.
- Usage limits are checked server-side and usage events are idempotent.
- Reports distinguish measured from unavailable metrics and explain attribution.
