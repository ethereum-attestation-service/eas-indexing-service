FROM node:18-alpine as app
WORKDIR /app

COPY . .

COPY entrypoint.sh /app/entrypoint.sh
RUN apk update && apk add --no-cache postgresql-client
RUN chmod +x /app/entrypoint.sh
RUN yarn install
ENTRYPOINT ["/app/entrypoint.sh"]
EXPOSE 4000
