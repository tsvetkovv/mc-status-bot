FROM node:lts-slim AS base

# Install openssl for Prisma
RUN apt-get update && apt-get install -y fuse3 openssl sqlite3 ca-certificates python3 python3-pip curl wget                                                                                                       wget

# Create app directory
WORKDIR /usr/src

FROM base AS builder

# Files required by npm install
COPY package*.json ./

# Install app dependencies
RUN npm ci

# Bundle app source
COPY . .

# Type check app
RUN npm run typecheck

FROM base AS runner

# Files required by npm install
COPY package*.json ./

# Install only production app dependencies
RUN npm ci --omit=dev

# Copy Prisma files
COPY prisma ./prisma/

# Ensure the SQLite directory is created and has the correct permissions
RUN mkdir -p /usr/src/data && chown -R node:node /usr/src/data

# Bundle app source
COPY --chown=node:node . .

# Change to the node user
USER node

# Set the working directory to the app directory
WORKDIR /usr/src

# Generate Prisma client
RUN npx prisma generate

# Ensure the SQLite volume is writable
VOLUME /usr/src/data

# Expose the port the app runs on
EXPOSE 3000

# Deploy Prisma migrations
RUN npx prisma migrate deploy

# Start the app
CMD ["npm", "run", "start:force"]
