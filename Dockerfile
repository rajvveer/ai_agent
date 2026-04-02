FROM node:20-alpine

# Install Python for ML scripts (Phase 9+)
RUN apk add --no-cache python3 py3-pip

WORKDIR /app

# Install Node.js dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy server code
COPY server/ ./server/
COPY tsconfig.json ./
COPY drizzle.config.ts ./

# Expose port
EXPOSE 3000

# Run migrations then start the monolith
CMD ["sh", "-c", "npm run db:push && npm run start"]
