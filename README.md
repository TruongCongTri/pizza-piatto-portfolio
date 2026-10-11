This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.js`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Past pizza classes

The shop's past classes, taken from its Facebook posts, are in `scripts/past-classes.json`, with their photos in `public/classes/`. Classes live in the site's database, so a new copy of the site (for example after the first deploy) starts without them. Add them with:

```bash
node scripts/import-past-classes.mjs https://your-domain   # default: http://localhost:3000
```

It signs in to the Class Desk with `ADMIN_PASSWORD` (from the environment or `.env.local`) and skips classes that are already there, so it is safe to run again.

## Copying local data to a deployed site

Locally, classes, bookings and class bookings live in `.data/` (JSON files). That folder is left out of git on purpose, since it holds guests' names and phone numbers, so a deployed site starts empty. On Vercel the data lives in Upstash Redis instead:

1. In the Vercel project, add **Upstash Redis** (Storage → Marketplace). It sets `KV_REST_API_URL` and `KV_REST_API_TOKEN`; a region near the shop (Singapore) is best.
2. Fetch those values locally: `vercel env pull .env.production.local` (or put `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` in that file by hand).
3. Copy the data:

```bash
node scripts/seed-redis.mjs --dry-run   # what it would copy
node scripts/seed-redis.mjs             # copy everything in .data/
node scripts/seed-redis.mjs --no-samples --only=workshops   # e.g. real classes only
```

4. Redeploy, so the deployment picks up the new environment variables.

The script writes records by id, so running it again is safe, and it deletes nothing. Class photos are files in `public/classes/` and deploy with the site.

### With Docker

Steps 2 and 3 can run in a container instead, with nothing to install but Docker. The image holds only the copy script and the Vercel CLI: `.data/` is mounted read-only, and the pulled variables never leave the container.

```bash
cp .env.seed.example .env.seed   # fill in VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID
docker compose -f docker-compose.seed.yml run --rm --build seed
```

It pulls the project's variables, shows the dry run, then copies. Set `DRY_RUN_ONLY=1` in `.env.seed` to stop after the dry run, and `SEED_ARGS` (or arguments after `seed`) for options such as `--no-samples`.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
