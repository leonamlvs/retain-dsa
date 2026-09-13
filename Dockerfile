# syntax=docker/dockerfile:1
FROM node:24.19.0-alpine AS base
WORKDIR /workspace
RUN corepack enable

FROM base AS dependencies
COPY package.json yarn.lock .yarnrc.yml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/api-client/package.json packages/api-client/package.json
RUN yarn install --immutable

FROM dependencies AS development
COPY . .
EXPOSE 3000
CMD ["sh", "-c", "yarn install --immutable && yarn generate:db && yarn db:migrate && yarn workspace @retain/api dev"]

FROM dependencies AS build
COPY . .
RUN yarn generate:db && yarn build

FROM base AS production
ENV NODE_ENV=production
COPY --from=dependencies /workspace/node_modules ./node_modules
COPY --from=build /workspace/apps/api/dist ./apps/api/dist
COPY --from=build /workspace/apps/web/dist ./apps/web/dist
COPY --from=build /workspace/apps/api/prisma ./apps/api/prisma
COPY package.json ./
COPY prisma.config.ts ./
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy --config ./prisma.config.ts && exec node apps/api/dist/main.js"]
