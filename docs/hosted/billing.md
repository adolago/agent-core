# Hosted Billing

The hosted service includes plan metadata and entitlement enforcement for gateway usage. Plan limits are evaluated on each gateway request using usage records for the current month.

## Plan catalog

Default plans are:

- Free: 2,000 requests / 250,000 tokens per month
- Pro: 100,000 requests / 20,000,000 tokens per month
- Enterprise: unlimited

Plans can be updated per workspace through the API.

## Billing portal

To connect a billing portal, set:

- `HOSTED_BILLING_PORTAL_URL`

The hosted service returns the configured portal URL via `POST /api/billing/portal`. Plan selection and entitlement limits live in the database; external billing systems can synchronize plan changes by calling `POST /api/workspaces/:workspaceId/plan`.
