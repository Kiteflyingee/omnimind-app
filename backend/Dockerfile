FROM python:3.11-slim

ARG http_proxy
ARG https_proxy

WORKDIR /app

# Install system dependencies (e.g. for psutil or sqlite)
RUN sed -i 's/deb.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list.d/debian.sources \
    && sed -i 's/security.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list.d/debian.sources

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -i https://pypi.tuna.tsinghua.edu.cn/simple -r requirements.txt 

# Copy backend code
COPY . .

# Expose port
EXPOSE 8000

# Run the application
CMD ["python", "main.py"]
