FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY index.js ./index.js
COPY maintenance.js ./maintenance.js
COPY domain ./domain
COPY routes ./routes
COPY services ./services
COPY migrations ./migrations
COPY scripts ./scripts

EXPOSE 4000
CMD ["node", "index.js"]
