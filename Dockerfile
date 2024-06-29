# base node image
FROM node:20-bookworm-slim as base

# set for base and all layer that inherit from it
ENV NODE_ENV production

# Install openssl for Prisma
RUN apt-get update && apt-get install -y fuse3 openssl sqlite3 ca-certificates python3 python3-pip curl wget logrotate cron

# Create logrotate configuration
RUN mkdir -p /etc/logrotate.d
RUN echo "/myapp/logs/logs.log {\n\
    su root root\n\
    daily\n\
    rotate 7\n\
    delaycompress\n\
    compress\n\
    notifempty\n\
    missingok\n\
    copytruncate\n\
}" > /etc/logrotate.d/myapp

# Add cron job to run logrotate daily
RUN echo "0 0 * * * /usr/sbin/logrotate /etc/logrotate.conf" | crontab -


# Install all node_modules, including dev dependencies
FROM base as deps

WORKDIR /myapp

ADD package.json package-lock.json ./
RUN npm install --include=dev

# Setup production node_modules
FROM base as production-deps

WORKDIR /myapp

COPY --from=deps /myapp/node_modules /myapp/node_modules
ADD package.json package-lock.json ./
RUN npm prune --omit=dev

# Build the app
FROM base as build

ARG COMMIT_SHA
ENV COMMIT_SHA=$COMMIT_SHA

WORKDIR /myapp

COPY --from=deps /myapp/node_modules /myapp/node_modules

ADD prisma .
RUN npx prisma generate

COPY . .

# Finally, build the production image with minimal footprint
FROM base

ENV DATA_DIR="/sqlite/data"
ENV DATABASE_FILENAME="sqlite.db"
ENV DATABASE_PATH="$DATA_DIR/$DATABASE_FILENAME"
ENV DATABASE_URL="file:$DATABASE_PATH"
ENV PORT="3000"
ENV NODE_ENV="production"
# For WAL support: https://github.com/prisma/prisma-engines/issues/4675#issuecomment-1914383246
ENV PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK="1"

# add shortcut for connecting to database CLI
RUN echo "#!/bin/sh\nset -x\nsqlite3 \$DATABASE_URL" > /usr/local/bin/database-cli && chmod +x /usr/local/bin/database-cli

WORKDIR /myapp

COPY --from=production-deps /myapp/node_modules /myapp/node_modules
COPY --from=build /myapp/node_modules/.prisma /myapp/node_modules/.prisma

COPY --from=build /myapp/package.json /myapp/package.json
COPY --from=build /myapp/prisma /myapp/prisma
COPY --from=build /myapp/src /myapp/src

VOLUME /sqlite
COPY . .

EXPOSE ${PORT}

RUN chmod +x /myapp/docker-entry-point.sh

ENTRYPOINT ["/myapp/docker-entry-point.sh"]
