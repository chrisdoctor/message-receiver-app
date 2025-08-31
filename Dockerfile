# Use Node.js LTS as base
FROM node:20

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the code
COPY . .

# Build the typescript code
RUN npm run build

# Ensuring spool and db directories exist
RUN mkdir -p ./data/bin ./sqlite-db ./report

# Copy .env file
COPY .env .env

# Start the receiver app
CMD ["node", "dist/receiver/cli/app-runner.js"]