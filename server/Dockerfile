# FFmpeg is the reason this image is not node:alpine — Debian ships a
# build with libass, which is what burns the .ass captions in.
FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY src ./src

ENV NODE_ENV=production PORT=8080 WORK_DIR=/tmp/uniqueness
EXPOSE 8080
CMD ["node", "src/index.js"]
