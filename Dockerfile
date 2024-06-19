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

ADD prisma .
RUN npx prisma generate

VOLUME /usr/src/data

# Bundle app source
COPY . .

USER node

# Start the app
EXPOSE 3000

RUN npx prisma migrate deploy
CMD ["npm", "run", "start:force"]