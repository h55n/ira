FROM node:20-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY public ./public
ENV PORT=7860
ENV NODE_ENV=production
EXPOSE 7860
CMD ["node", "src/server.js"]
