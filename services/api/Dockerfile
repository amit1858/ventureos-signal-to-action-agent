# Signal-to-Action Agent - API Dockerfile
# Multi-stage build for a slim production image

FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Generate synthetic data (for demo purposes; in production, use real data)
RUN python data/generate_synthetic_data.py

# Expose port
EXPOSE 8000

# Run the FastAPI server
# Note: On Windows ARM64, we use plain uvicorn without [standard] extras
CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
