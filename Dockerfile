FROM node:20-alpine3.20
WORKDIR /app
ENV NODE_ENV=production


# Set environment variables
ENV DB_PASSWORD=${DB_PASSWORD}
ENV DB_USER=${DB_USER}
ENV DB_NAME=${DB_NAME}
ENV DB_HOST=${DB_HOST}
ENV DB_PORT=${DB_PORT}
ENV INFURA_API_KEY=${INFURA_API_KEY}
ENV ALCHEMY_ARBITRUM_API_KEY=${ALCHEMY_ARBITRUM_API_KEY}
ENV ALCHEMY_SEPOLIA_API_KEY=${ALCHEMY_SEPOLIA_API_KEY}
ENV ALCHEMY_OPTIMISM_GOERLI_API_KEY=${ALCHEMY_OPTIMISM_GOERLI_API_KEY}
ENV CHAIN_ID=${CHAIN_ID}

# Copy project files
COPY . .

COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Install dependencies
RUN apk update && apk add --no-cache postgresql-client

# Install Node dependencies
RUN yarn install

# Generate Prisma client
ENTRYPOINT ["/app/entrypoint.sh"]
EXPOSE 4000
