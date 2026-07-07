FROM oven/bun:1-alpine AS build

WORKDIR /app

COPY package.json bun.lock tsconfig.json tsconfig.build.json ./
COPY src ./src

RUN bun install --frozen-lockfile
RUN bun run build

FROM oven/bun:1-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV MCP_PORT=3000

COPY --from=build /app/dist ./dist
COPY package.json ./

USER bun
EXPOSE 3000

CMD ["bun", "dist/http.js"]
