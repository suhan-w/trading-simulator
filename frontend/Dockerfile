FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci 2>/dev/null || npm install

COPY . .

# Optional: --build-arg VITE_API_URL=https://api.example.com (omit for same-origin /api behind nginx)
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

# Optional: pass CACHEBUST=$(date +%s) from docker compose so this layer reruns if COPY was stale.
# Also exposed to Vite so each image gets a unique client-visible bundle id (avoids "nothing changed" confusion).
ARG CACHEBUST
ENV VITE_COWRIE_BUNDLE_STAMP=$CACHEBUST
RUN echo "cowrie CACHEBUST=${CACHEBUST:-none}" > /dev/null

RUN npm run build

FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
