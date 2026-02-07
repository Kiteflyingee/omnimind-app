# OmniMind Mobile - 神经中枢

OmniMind 是一款具备“永久记忆”能力的移动端优先 AI 助手，基于 Kimi-2.5 推理模型构建，支持多模态输入与分层记忆机制。

## 核心特性

- **分层记忆**：使用 SQLite 存储“硬性契约”，Mem0 存储“柔性事实”。
- **推理展示**：支持 Kimi-2.5 的完整推理链（Reasoning）流式输出。
- **视觉优化**：神经脉冲式交互设计，极致丝滑的流式文字渲染。
- **多模态支持**：支持图片上传与 OCR 记忆提取。

---

## 快速开始

### 1. 配置环境变量

在项目根目录创建 `.env.local` 文件：

```text
# AI 模型配置
QWEN_API_KEY=your_qwen_key
MOONSHOT_API_KEY=your_moonshot_key

# 记忆服务配置 (可选)
MEM0_API_KEY=your_mem0_key
```

### 2. 安装与运行

```bash
npm install
npm run dev
```

---

## 生产环境部署 (Nginx + PM2)

### 1. 项目打包
在服务器上执行编译：
```bash
npm run build
```

### 2. 使用 PM2 守护进程
确保已安装 PM2 (`npm install pm2 -g`)：
```bash
pm2 start npm --name "omnimind" -- start
```

### 3. Nginx 配置 (核心)
由于项目依赖流式输出（Streaming），Nginx 必须关闭代理缓冲。编辑 Nginx 配置文件：

```nginx
server {
    listen 80;
    server_name your_domain.com;

    client_max_body_size 10M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        
        # 针对 AI 流式输出的优化配置
        proxy_buffering off;
        proxy_read_timeout 300s;
        proxy_set_header X-Accel-Buffering no;
    }

    # 静态资源缓存
    location /_next/static {
        proxy_pass http://127.0.0.1:3000;
        expires 365d;
        access_log off;
    }
}
```

### 4. 数据库权限
SQLite 数据库文件需要写权限：
```bash
chmod 666 omnimind.db
```

---

## 技术架构

- **前端**：Next.js 15 (App Router) + Tailwind CSS 4 + Framer Motion
- **后端**：Python 3.14 + FastAPI + OpenAPI (v1 compatible)
- **核心逻辑**：基于 Kimi Formula API 的自主多轮工具调度引擎
- **数据库**：SQLite
- **AI 引擎**：Kimi-k2.5 / Kimi-k2-thinking