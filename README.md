# BlockPunchKick

## Auto Deploy to Vercel

This repository is configured to auto-deploy with GitHub Actions via `.github/workflows/vercel-deploy.yml`.

### Trigger behavior
- Push to `main` → deploys to **production** on Vercel.
- Pull request targeting `main` → deploys a **preview** build on Vercel.

### Required GitHub repository secrets
Add the following secrets in **Settings → Secrets and variables → Actions**:
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

You can obtain `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` from your Vercel project settings, or by running `vercel link` locally and checking `.vercel/project.json`.
