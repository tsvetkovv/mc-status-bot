FROM node:lts-slim AS base

# Install openssl for Prisma
RUN apt-get update && apt-get install -y fuse3 openssl sqlite3 ca-certificates python3 python3-pip curl wget                                                                                                       wget

# Create app directory
WORKDIR /usr/src

# Create a directory for the node user to install dependencies
RUN mkdir -p /usr/src/app && chown -R node:node /usr/src/app

FROM base AS builder

# Change to the node user
USER node

# Set working directory to the app directory
WORKDIR /usr/src/app

# Copy files required by npm install
COPY --chown=node:node package*.json ./

# Install app dependencies
RUN npm ci

# Bundle app source
COPY --chown=node:node . .

# Type check app
RUN npm run typecheck

FROM base AS runner

# Change to the node user
USER node

# Set working directory to the app directory
WORKDIR /usr/src/app

# Copy files required by npm install
COPY --chown=node:node package*.json ./

# Install only production app dependencies
RUN npm ci --omit=dev

# Copy Prisma files
COPY --chown=node:node prisma ./prisma/

# Ensure the SQLite directory is created and has the correct permissions
RUN mkdir -p /usr/src/app/data && chown -R node:node /usr/src/app/data

# Generate Prisma client
RUN npx prisma generate

# Ensure the SQLite volume is writable
VOLUME /usr/src/app/data

# Expose the port the app runs on
EXPOSE 3000

# Deploy Prisma migrations
RUN npx prisma migrate deploy

# Start the app
CMD ["npm", "run", "start:force"]
