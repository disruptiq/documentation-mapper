#!/bin/bash

# Script to set up local Firecrawl instance for documentation mapper

echo "Setting up local Firecrawl instance..."
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    echo "Visit: https://docs.docker.com/get-docker/"
    exit 1
fi

# Check if Docker Compose is available
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose is not available. Please install Docker Compose."
    exit 1
fi

# Clone Firecrawl repository
if [ ! -d "firecrawl-local" ]; then
    echo "📥 Cloning Firecrawl repository..."
    git clone https://github.com/mendableai/firecrawl.git firecrawl-local

    if [ $? -ne 0 ]; then
        echo "❌ Failed to clone Firecrawl repository"
        exit 1
    fi
else
    echo "📁 Firecrawl repository already exists"
fi

cd firecrawl-local

# Start Firecrawl with Docker Compose
echo "🐳 Starting Firecrawl with Docker Compose..."
echo "This may take a few minutes on first run..."
echo ""

if command -v docker-compose &> /dev/null; then
    docker-compose up -d
else
    docker compose up -d
fi

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Firecrawl is now running locally!"
    echo ""
    echo "🔧 Configure the documentation mapper to use local Firecrawl:"
    echo "   export FIRECRAWL_BASE_URL=http://localhost:3002"
    echo "   export FIRECRAWL_API_KEY=local_dev_key"  # or whatever key your local setup uses
    echo ""
    echo "🧪 Test the setup:"
    echo "   curl http://localhost:3002/health"
    echo ""
    echo "🛑 To stop Firecrawl:"
    echo "   cd firecrawl-local && docker-compose down"
    echo ""
    echo "📚 For more information, visit: https://github.com/mendableai/firecrawl"
else
    echo "❌ Failed to start Firecrawl"
    exit 1
fi
