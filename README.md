# WarStock

This project uses a Vercel serverless function to fetch `scores.json` from a
private GitHub repository. Set `GITHUB_TOKEN` in your Vercel project settings so
`/api/scores` can authenticate to GitHub and return the latest scores to the
frontend.

## Checking the Token

A helper route `/api/check-token` is included to verify that the environment
variable is available. It returns `{ "tokenPresent": true }` when the
`GITHUB_TOKEN` environment variable is defined.
