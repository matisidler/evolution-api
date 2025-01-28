FROM node:18-alpine3.16 AS builder

# Declare build arguments
ARG DATABASE_PROVIDER
ARG DATABASE_URL

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