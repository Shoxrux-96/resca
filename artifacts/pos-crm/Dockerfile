FROM node:20-alpine AS build

WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml /repo/
COPY lib /repo/lib
COPY artifacts/pos-crm /repo/artifacts/pos-crm

RUN corepack enable && pnpm -C /repo/artifacts/pos-crm install --frozen-lockfile

ENV NODE_ENV=production
ENV PORT=3000
ENV BASE_PATH=/

RUN pnpm -C /repo/artifacts/pos-crm build


FROM nginx:1.27-alpine

COPY artifacts/pos-crm/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/artifacts/pos-crm/dist/public /usr/share/nginx/html

EXPOSE 80

