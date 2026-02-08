#!/bin/bash

# ==========================================
# OmniMind PM2 一键启动脚本 (带代理配置)
# ==========================================

# 1. 配置代理地址 (请根据实际情况修改)
PROXY_URL="http://127.0.0.1:7890"

# 4. 启动后端 (使用 venv 环境 & 注入代理)
echo "Starting Backend with proxy..."
cd backend
# 仅在后端启动时注入环境变量
HTTP_PROXY="$PROXY_URL" \
HTTPS_PROXY="$PROXY_URL" \
NO_PROXY="localhost,127.0.0.1" \
pm2 start main.py --name "omnimind-backend" --interpreter ../venv/bin/python --update-env
cd ..

# 5. 启动前端 (不使用代理)
echo "Starting Frontend..."
# 确保前端已经 build 过
if [ ! -d ".next/standalone" ]; then
    echo "Warning: .next/standalone not found. Make sure to run 'npm run build' first."
fi

pm2 start "node .next/standalone/server.js" --name "omnimind-frontend" --update-env

# 6. 保存状态
pm2 save

echo "------------------------------------------"
echo "Deployment complete!"
echo "Use 'pm2 status' to check service status."
echo "Use 'pm2 logs' to check for errors."
echo "------------------------------------------"
