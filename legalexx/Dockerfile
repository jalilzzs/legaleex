FROM node:18-slim

# تثبيت المتصفح والتبعيات اللازمة لكي تعمل مكتبة Puppeteer وتوليد الـ PDF بدون أخطاء
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-noto-color-emoji \
    libnss3 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# نسخ الملفات وتثبيت الحزم
COPY . .
RUN npm run install:all || (npm install && npm --prefix server install && npm --prefix client install)
RUN npm --prefix client run build

ENV PORT=4000
EXPOSE 4000

CMD ["npm", "--prefix", "server", "start"]
