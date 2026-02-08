# Stage 1: Build
FROM node:20-alpine AS builder

ARG http_proxy
ARG https_proxy

# 设置国内镜像源
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apk/repositories && \
    apk add --no-cache libc6-compat python3 make g++

WORKDIR /app

# 拷贝依赖描述文件
COPY package.json package-lock.json* ./

# 极致优化 npm 安装
RUN npm config set registry https://registry.npmmirror.com && \
    npm ci --no-audit --prefer-offline

# 拷贝源代码 (注意：.env.local 会被 .dockerignore 忽略，这是正确的)
COPY . .

# 设置构建变量并执行编译
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED 1
RUN npm run build

# Stage 2: Runner
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

# 拷贝编译产物 (Standalone 模式)
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/config.yaml ./config.yaml

# 注意：.env.local 不再通过 COPY 复制，而是通过 docker-compose 的 volumes 挂载
# 这样更安全，且不会导致构建失败

EXPOSE 3000
ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]