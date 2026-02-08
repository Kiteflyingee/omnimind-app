# OmniMind Mobile - 神经中枢

OmniMind 是一款具备“深度进化能力”的移动端优先 AI 助手。它不仅是一个对话界面，更是一个集成了 **分层记忆系统**、**深度推理引擎** 与 **自主工具调度** 的智能中枢。

基于 Kimi-2.5 (k2-thinking) 大模型构建，本项目旨在提供最极致的 AI 交互体验与长效个性化记忆。

---

## ✨ 项目特色与设计哲学

### 1. 🧠 神经脉冲式视觉设计 (Neuro-Central Aesthetics)
*   **极致丝滑**：采用 Framer Motion 构建的脉冲式交互，消息气泡具有微小的位移与缩放反馈，模拟真实的神经突触传递。
*   **移动端优先**：针对 iOS/Android 沉浸式体验优化，支持超宽表格局部滚动，拒绝页面拉伸。
*   **毛玻璃美学**：全局玻璃拟态（Glassmorphism）设计，结合动态渐变背景，营造未来科技感。

### 2. 🗄️ 双层分层记忆引擎 (Hybrid Memory Engine)
OmniMind 解决了模型“转头就忘”的痛点：
*   **硬性契约 (Hard Rules)**：基于 SQLite。用于存储用户强制要求 AI 遵守的规则、身份设定或永久习惯，具有最高优先级。
*   **柔性事实 (Soft Facts)**：集成 Mem0 架构。自动提取对话中的事实片段，通过向量检索在后续对话中实现“记忆召回”。

### 3. 🔍 深度推理流 (Deep Thinking Stream)
*   **实时透明**：完整展示 Kimi 的“心路历程”。您可以实时看到 AI 如何拆解问题、权衡方案以及调用工具前的策略分析。
*   **交互式折叠**：支持思考过程的即时切换与历史回溯。历史对话中的思考默认展开，点击图标即可快速收缩，兼顾技术深度与阅读效率。

### 4. 🛠️ 自主执行与容错 (Resilient Tool-Use)
*   **多轮工具链**：AI 可自主决定调用搜索、存储、记忆检索等多种工具，并根据执行结果进行多轮自我修正。
*   **断点自愈 (History Repair)**：针对常见的 API 状态错误进行了深度加固。如果对话因网络故障或服务器重启而中断，系统会自动修复受损的历史序列，确保会话无感恢复。

### 5. ⚡ 零延迟端到端加速
*   **协议优化**：自研流式解析状态机，支持多部分（Reasoning + Content）并发渲染。
*   **网络加速**：通过后端直连模式（Env Bypass），彻底消除了 Next.js 代理导致的缓冲黑洞。

---

## 🚀 核心功能模块

-   **多模态交互**：支持高清图片分析，AI 可根据图片内容提取关键信息并存入长效记忆。
-   **全局搜索增强**：内置高性能搜索工具，结合 Kimi 的合规能力，提供最新信息的深度研判。
-   **记忆看板**：支持手动管理和删除已存储的硬性规则与记忆片段。
-   **响应式布局**：完美适配从 iPhone SE 到 13-inch iPad 的所有屏幕尺寸。

---

## 🛠️ 技术架构

-   **Frontend**: Next.js 15 (App Router) / Tailwind CSS 4 / Lucide Icons
-   **Backend**: Python 3.11+ / FastAPI / Async OpenAI SDK
-   **Database**: SQLite (Local) / Mem0 (Semantic Memory)
-   **Deployment**: Support for Nginx, PM2, and Docker (with Proxy)

---

## 📦 生产环境快速部署

### 方案 A：Docker (推荐)
```bash
# 自动处理依赖与地理代理
docker-compose up -d --build
```

### 方案 B：手动部署

#### 1. 部署前准备
- **环境**: 确保已按照 [技术架构](#技术架构) 安装 Node.js 和 Python。
- **配置**: 复制 [`.env.example`](./.env.example) 为 `.env.local` 并填写 API Key：
  ```bash
  cp .env.example .env.local
  ```

#### 2. 运行后端 (FastAPI)
```bash
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
pm2 start "venv/bin/python main.py" --name "omnimind-backend"
```

#### 3. 运行前端 (Next.js)
```bash
npm install && npm run build
pm2 start npm --name "omnimind-frontend" -- start
```

#### 4. 配置 Nginx (必需)
由于 AI 回复采用流式输出，必须使用 Nginx 反向代理并禁用缓冲。详细配置请参考下文。

*详细配置请参考 `.env.local` 环境变量说明。*

### ⚠️ 流式输出与 Nginx 生产环境配置

在生产环境中（使用 Nginx 作为反向代理时），如果不进行特殊配置，Nginx 会尝试缓冲后端的流式响应，导致 AI 回复出现“卡顿”或大块弹出的现象。

**必须**在 Nginx 的 `location /` 块中加入以下关键配置以禁用缓冲：

```nginx
# --- 核心流式配置 ---
proxy_buffering off;
proxy_set_header X-Accel-Buffering no;
proxy_read_timeout 300s;
# --------------------
```

我们提供了一个完整的 Nginx 配置文件模板，涵盖了前端、静态资源及后端转发：
👉 [查看完整 Nginx 配置模板 (nginx/omnimind.conf)](./nginx/omnimind.conf)

配置完成后，请运行 `nginx -t` 检查语法，并执行 `nginx -s reload` 生效。

---

## 📜 许可协议

MIT License. 极致交互，智启未来。