# WarStock

This project uses a Vercel serverless function to fetch `scores.json` from a
private GitHub repository. Set `GITHUB_TOKEN` in your Vercel project settings so
`/api/scores` can authenticate to GitHub and return the latest scores to the
frontend.

## Checking the Token

A helper route `/api/check-token` is included to verify that the environment
variable is available. It returns `{ "tokenPresent": true }` when the
`GITHUB_TOKEN` environment variable is defined.

## Running the Backend

Install dependencies with:

```bash
pip install -r requirements.txt
```

The news feed uses public RSS endpoints and does **not** require an API key. If
the app cannot reach those feeds due to network restrictions, it falls back to a
sample feed bundled in `backend/sample_news.xml` so scoring still works.
