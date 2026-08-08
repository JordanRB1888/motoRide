FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY index.js ./index.js

EXPOSE 4000
CMD ["node", "index.js"]
