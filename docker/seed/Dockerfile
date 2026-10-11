# Copies the local data in .data/ into the deployed site's Upstash Redis:
# pulls the project's environment variables with the Vercel CLI, shows a dry
# run of the copy, then copies (scripts/seed-redis.mjs).
#
# Build and run with docker-compose.seed.yml (see README, "Copying local data
# to a deployed site"). Nothing private goes into the image: .data/ is
# mounted read-only when it runs, and the pulled variables stay inside the
# container and are deleted when it ends.
FROM node:22-alpine

# the Vercel CLI, pinned
RUN npm install --global vercel@60.1.3 && npm cache clean --force

WORKDIR /app
COPY scripts/seed-redis.mjs scripts/seed-redis.mjs
COPY docker/seed/entrypoint.sh /usr/local/bin/seed-entrypoint
# a Windows checkout may have given the script CRLF line endings
RUN sed -i 's/\r$//' /usr/local/bin/seed-entrypoint \
  && chmod +x /usr/local/bin/seed-entrypoint \
  && chown -R node:node /app

USER node
ENTRYPOINT ["seed-entrypoint"]
