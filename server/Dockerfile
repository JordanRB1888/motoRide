FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY index.js ./index.js
# El arranque de la observabilidad. Va listado aparte porque esta imagen copia
# fichero a fichero en vez de la carpeta entera, y `index.js` lo importa antes
# que nada: si falta, el proceso no llega ni a escuchar.
COPY instrumentacion.js ./instrumentacion.js
COPY maintenance.js ./maintenance.js
COPY domain ./domain
COPY routes ./routes
COPY services ./services
COPY migrations ./migrations
COPY scripts ./scripts

EXPOSE 4000
CMD ["node", "index.js"]
