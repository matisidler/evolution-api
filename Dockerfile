FROM node:18-alpine3.16 AS builder

# Declare build arguments
ARG SERVER_TYPE
ARG SERVER_PORT
ARG AUTHENTICATION_API_KEY
ARG AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES
ARG AUTHENTICATION_JWT_EXPIRIN_IN
ARG AUTHENTICATION_TYPE
ARG CACHE_LOCAL_ENABLED
ARG CACHE_REDIS_ENABLED
ARG CACHE_REDIS_PREFIX_KEY
ARG CACHE_REDIS_SAVE_INSTANCES
ARG CACHE_REDIS_TTL
ARG CACHE_REDIS_URI
ARG CHATWOOT_ENABLED
ARG CHATWOOT_IMPORT_DATABASE_PLACEHOLDER_MEDIA_MESSAGE
ARG CHATWOOT_MESSAGE_DELETE
ARG CLEAN_STORE_CHATS
ARG CLEAN_STORE_CLEANING_INTERVAL
ARG CLEAN_STORE_CONTACTS
ARG CLEAN_STORE_MESSAGE_UP
ARG CLEAN_STORE_MESSAGES
ARG CONFIG_SESSION_PHONE_CLIENT
ARG CONFIG_SESSION_PHONE_NAME
ARG CORS_CREDENTIALS
ARG CORS_METHODS
ARG CORS_ORIGIN
ARG DATABASE_CONNECTION_URI
ARG DATABASE_ENABLED
ARG DATABASE_PROVIDER
ARG DATABASE_URL
ARG DATABASE_SAVE_DATA_CHATS
ARG DATABASE_SAVE_DATA_CONTACTS
ARG DATABASE_SAVE_DATA_HISTORIC
ARG DATABASE_SAVE_DATA_INSTANCE
ARG DATABASE_SAVE_DATA_LABELS
ARG DATABASE_SAVE_DATA_NEW_MESSAGE
ARG DATABASE_SAVE_IS_ON_WHATSAPP
ARG DATABASE_SAVE_IS_ON_WHATSAPP_DAYS
ARG DATABASE_SAVE_MESSAGE_UPDATE
ARG DEL_INSTANCE
ARG LANGUAGE
ARG LOG_BAILEYS
ARG LOG_COLOR
ARG LOG_LEVEL
ARG PORT
ARG QRCODE_COLOR
ARG QRCODE_LIMIT
ARG RABBITMQ_ENABLED
ARG REDIS_ENABLED
ARG S3_ACCESS_KEY
ARG S3_BUCKET
ARG S3_ENABLED
ARG S3_ENDPOINT
ARG S3_REGION
ARG S3_SECRET_KEY
ARG S3_USE_SSL
ARG SERVER_URL
ARG STORE_CHATS
ARG STORE_CONTACTS
ARG STORE_MESSAGE_UP
ARG STORE_MESSAGES
ARG WEBHOOK_EVENTS_APPLICATION_STARTUP
ARG WEBHOOK_EVENTS_CALL
ARG WEBHOOK_EVENTS_CHAMA_AI_ACTION
ARG WEBHOOK_EVENTS_CHATS_DELETE
ARG WEBHOOK_EVENTS_CHATS_SET
ARG WEBHOOK_EVENTS_CHATS_UPDATE
ARG WEBHOOK_EVENTS_CHATS_UPSERT
ARG WEBHOOK_EVENTS_CONNECTION_UPDATE
ARG WEBHOOK_EVENTS_CONTACTS_SET
ARG WEBHOOK_EVENTS_CONTACTS_UPDATE
ARG WEBHOOK_EVENTS_CONTACTS_UPSERT
ARG WEBHOOK_EVENTS_ERRORS
ARG WEBHOOK_EVENTS_GROUP_PARTICIPANTS_UPDATE
ARG WEBHOOK_EVENTS_GROUPS_UPDATE
ARG WEBHOOK_EVENTS_GROUPS_UPSERT
ARG WEBHOOK_EVENTS_MESSAGES_DELETE
ARG WEBHOOK_EVENTS_MESSAGES_SET
ARG WEBHOOK_EVENTS_MESSAGES_UPDATE
ARG WEBHOOK_EVENTS_MESSAGES_UPSERT
ARG WEBHOOK_EVENTS_NEW_JWT_TOKEN
ARG WEBHOOK_EVENTS_PRESENCE_UPDATE
ARG WEBHOOK_EVENTS_QRCODE_UPDATED
ARG WEBHOOK_EVENTS_SEND_MESSAGE
ARG WEBHOOK_EVENTS_TYPEBOT_CHANGE_STATUS
ARG WEBHOOK_EVENTS_TYPEBOT_START
ARG WEBHOOK_GLOBAL_ENABLED
ARG WEBHOOK_GLOBAL_WEBHOOK_BY_EVENTS
ARG WEBSOCKET_ENABLED
ARG CHATWOOT_IMPORT_DATABASE_CONNECTION_URI
ARG DATABASE_CONNECTION_CLIENT_NAME
ARG CHATSELL_URL
ARG CHATSELL_TOKEN
RUN apk update && \
    apk add git ffmpeg wget curl bash

# Print environment variables
RUN echo "DATABASE_PROVIDER: ${DATABASE_PROVIDER}"
RUN echo "DATABASE_URL: ${DATABASE_URL}"

LABEL version="2.1.1" description="Api to control whatsapp features through http requests." 
LABEL maintainer="Davidson Gomes" git="https://github.com/DavidsonGomes"
LABEL contact="contato@atendai.com"

WORKDIR /evolution

COPY ./package.json ./tsconfig.json ./

RUN npm install -f

COPY ./src ./src
COPY ./public ./public
COPY ./prisma ./prisma
COPY ./manager ./manager
# COPY ./.env.example ./.env
COPY ./runWithProvider.js ./
COPY ./tsup.config.ts ./

COPY ./Docker ./Docker

RUN chmod +x ./Docker/scripts/* && dos2unix ./Docker/scripts/*

RUN ./Docker/scripts/generate_database.sh

RUN npm run build

FROM node:18-alpine3.16 AS final

RUN apk update && \
    apk add tzdata ffmpeg bash

ENV TZ=America/Sao_Paulo

WORKDIR /evolution

COPY --from=builder /evolution/package.json ./package.json
COPY --from=builder /evolution/package-lock.json ./package-lock.json

COPY --from=builder /evolution/node_modules ./node_modules
COPY --from=builder /evolution/dist ./dist
COPY --from=builder /evolution/prisma ./prisma
COPY --from=builder /evolution/manager ./manager
COPY --from=builder /evolution/public ./public
COPY --from=builder /evolution/Docker ./Docker
COPY --from=builder /evolution/runWithProvider.js ./runWithProvider.js
COPY --from=builder /evolution/tsup.config.ts ./tsup.config.ts

ENV DOCKER_ENV=true

ENTRYPOINT ["npm", "run", "start:prod"]