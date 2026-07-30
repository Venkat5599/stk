FROM node:22-bookworm-slim AS build
RUN corepack enable
WORKDIR /app
COPY pnpm-workspace.yaml package.json ./
COPY server/package.json server/
RUN pnpm install --frozen-lockfile=false --filter @stk/server
COPY tsconfig.base.json ./
COPY server ./server
RUN pnpm --filter @stk/server build

FROM node:22-bookworm-slim
WORKDIR /app
COPY --from=build /app ./
ENV NODE_ENV=production
CMD ["node", "server/dist/index.js"]
