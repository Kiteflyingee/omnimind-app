FROM python:3.11-slim

WORKDIR /app

# Install system dependencies (e.g. for psutil or sqlite)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY . .

# Expose port
EXPOSE 8000

# Run the application
CMD ["python", "main.py"]
