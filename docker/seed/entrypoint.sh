#!/bin/sh
# 1. vercel env pull: the project's variables (the Upstash credentials) into
#    a file that lives only in this container
# 2. a dry run of the copy, then (unless DRY_RUN_ONLY=1) the copy itself
#
# Environment (from .env.seed):
#   VERCEL_TOKEN        an access token (vercel.com/account/tokens)
#   VERCEL_ORG_ID       the team or account id that owns the project
#   VERCEL_PROJECT_ID   the project id (Project Settings, or .vercel/project.json)
#   VERCEL_ENVIRONMENT  production (default), preview or development
#   SEED_ARGS           extra options for the copy, e.g. "--no-samples" or "--only=workshops"
#   DRY_RUN_ONLY        1 to stop after the dry run
# Arguments given to the container are passed to the copy as well.
set -eu

missing=""
for name in VERCEL_TOKEN VERCEL_ORG_ID VERCEL_PROJECT_ID; do
  eval "value=\${$name:-}"
  [ -n "$value" ] || missing="$missing $name"
done
if [ -n "$missing" ]; then
  echo "Missing:$missing (set them in .env.seed; see .env.seed.example)" >&2
  exit 1
fi

if [ ! -d /app/.data ]; then
  echo "No data to copy: mount the project's .data/ folder at /app/.data" >&2
  exit 1
fi

ENV_FILE=/tmp/.env.production.local
trap 'rm -f "$ENV_FILE"' EXIT

echo "==> Pulling the ${VERCEL_ENVIRONMENT:-production} environment variables from Vercel"
vercel env pull "$ENV_FILE" \
  --environment="${VERCEL_ENVIRONMENT:-production}" \
  --yes \
  --token="$VERCEL_TOKEN"

if ! grep -Eq '^(UPSTASH_REDIS_REST_URL|KV_REST_API_URL)=.+' "$ENV_FILE"; then
  echo "The project has no Upstash Redis variables yet: add Upstash Redis to it" >&2
  echo "(Vercel: Storage -> Marketplace -> Upstash), then run this again." >&2
  exit 1
fi

echo "==> Dry run: what would be copied"
# SEED_ARGS is split into words on purpose (it can hold several options)
# shellcheck disable=SC2086
node scripts/seed-redis.mjs --env="$ENV_FILE" --dry-run ${SEED_ARGS:-} "$@"

if [ "${DRY_RUN_ONLY:-0}" = "1" ]; then
  echo "==> DRY_RUN_ONLY=1: nothing copied"
  exit 0
fi

echo "==> Copying"
# shellcheck disable=SC2086
node scripts/seed-redis.mjs --env="$ENV_FILE" ${SEED_ARGS:-} "$@"
echo "==> Done. Redeploy on Vercel if this is the first time the Upstash variables were added."
