ARG PARENT_VERSION=2.10.1-node24.11.1
ARG PORT=3000
ARG PORT_DEBUG=9229
ARG SERVICE_VERSION
ARG ACCESS_CODE
ARG ACCESS_CODE_HASH
ARG BACKEND_API_URL
ARG JWT_SECRET
ARG FEATURE_SHOW_COST_USAGE
ARG FEATURE_SHOW_POLICY_DOCUMENTS

FROM defradigital/node-development:${PARENT_VERSION} AS development
ARG PARENT_VERSION
LABEL uk.gov.defra.ffc.parent-image=defradigital/node-development:${PARENT_VERSION}

ENV TZ="Europe/London"

ARG PORT
ARG PORT_DEBUG
ENV PORT=${PORT}
EXPOSE ${PORT} ${PORT_DEBUG}

COPY --chown=node:node --chmod=755 package*.json ./
RUN npm install
COPY --chown=node:node --chmod=755 . .
RUN npm run build:frontend

CMD [ "npm", "run", "docker:dev" ]

FROM development AS production_build

ENV NODE_ENV=production

RUN npm run build:frontend

FROM defradigital/node:${PARENT_VERSION} AS production
ARG PARENT_VERSION
ARG SERVICE_VERSION
ARG ACCESS_CODE
ARG ACCESS_CODE_HASH
ARG BACKEND_API_URL
ARG JWT_SECRET
ARG FEATURE_SHOW_COST_USAGE
ARG FEATURE_SHOW_POLICY_DOCUMENTS
ARG REDIS_HOST
ARG REDIS_PORT
LABEL uk.gov.defra.ffc.parent-image=defradigital/node:${PARENT_VERSION}

ENV TZ="Europe/London"
ENV SERVICE_VERSION=${SERVICE_VERSION}
ENV ACCESS_CODE=${ACCESS_CODE}
ENV ACCESS_CODE_HASH=${ACCESS_CODE_HASH}
ENV BACKEND_API_URL=${BACKEND_API_URL}
ENV JWT_SECRET=${JWT_SECRET}
ENV FEATURE_SHOW_COST_USAGE=${FEATURE_SHOW_COST_USAGE}
ENV FEATURE_SHOW_POLICY_DOCUMENTS=${FEATURE_SHOW_POLICY_DOCUMENTS}
ENV REDIS_HOST=${REDIS_HOST}
ENV REDIS_PORT=${REDIS_PORT}

# Add curl to template.
# CDP PLATFORM HEALTHCHECK REQUIREMENT
USER root
RUN apk add --no-cache curl
USER node

COPY --from=production_build /home/node/package*.json ./
COPY --from=production_build /home/node/src ./src/
COPY --from=production_build /home/node/.public/ ./.public/

RUN npm ci --omit=dev

ARG PORT
ENV PORT=${PORT}
EXPOSE ${PORT}

CMD [ "node", "src" ]
