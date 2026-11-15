FROM node:20-slim

# Chromium + fonts (Arabic glyphs) for Puppeteer PDF generation
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-noto-core \
    fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

# Use the system Chromium instead of downloading another copy
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production

WORKDIR /app
COPY . .
RUN npm install --include=dev && npm --prefix server install && npm --prefix client install --include=dev
RUN npm --prefix client run build

EXPOSE 4000
CMD ["npm", "--prefix", "server", "start"]
