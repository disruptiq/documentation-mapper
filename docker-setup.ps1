# PowerShell script to set up local Firecrawl instance for documentation mapper

Write-Host "Setting up local Firecrawl instance..." -ForegroundColor Green
Write-Host ""

# Check if Docker is installed
try {
    $dockerVersion = docker --version 2>$null
    Write-Host "✓ Docker found: $dockerVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker is not installed. Please install Docker first." -ForegroundColor Red
    Write-Host "Visit: https://docs.docker.com/get-docker/"
    exit 1
}

# Check if Docker Compose is available
try {
    $composeVersion = docker-compose --version 2>$null
    if ($composeVersion) {
        Write-Host "✓ Docker Compose found: $composeVersion" -ForegroundColor Green
        $composeCommand = "docker-compose"
    } else {
        $composeVersion = docker compose version 2>$null
        if ($composeVersion) {
            Write-Host "✓ Docker Compose (plugin) found: $composeVersion" -ForegroundColor Green
            $composeCommand = "docker compose"
        } else {
            throw "No Docker Compose found"
        }
    }
} catch {
    Write-Host "❌ Docker Compose is not available. Please install Docker Compose." -ForegroundColor Red
    exit 1
}

# Clone Firecrawl repository
if (!(Test-Path "firecrawl-local")) {
    Write-Host "📥 Cloning Firecrawl repository..." -ForegroundColor Yellow
    git clone https://github.com/mendableai/firecrawl.git firecrawl-local

    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Failed to clone Firecrawl repository" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "📁 Firecrawl repository already exists" -ForegroundColor Blue
}

Set-Location firecrawl-local

# Start Firecrawl with Docker Compose
Write-Host "🐳 Starting Firecrawl with Docker Compose..." -ForegroundColor Yellow
Write-Host "This may take a few minutes on first run..." -ForegroundColor Yellow
Write-Host ""

& $composeCommand up -d

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ Firecrawl is now running locally!" -ForegroundColor Green
    Write-Host ""
    Write-Host "🔧 Configure the documentation mapper to use local Firecrawl:" -ForegroundColor Cyan
    Write-Host "   `$env:FIRECRAWL_BASE_URL='http://localhost:3002'" -ForegroundColor White
    Write-Host "   `$env:FIRECRAWL_API_KEY='local_dev_key'  # if required by your local setup" -ForegroundColor White
    Write-Host ""
    Write-Host "🧪 Test the setup:" -ForegroundColor Cyan
    Write-Host "   curl http://localhost:3002/health" -ForegroundColor White
    Write-Host ""
    Write-Host "🛑 To stop Firecrawl:" -ForegroundColor Cyan
    Write-Host "   cd firecrawl-local; $composeCommand down" -ForegroundColor White
    Write-Host ""
    Write-Host "📚 For more information, visit: https://github.com/mendableai/firecrawl" -ForegroundColor Blue
} else {
    Write-Host "❌ Failed to start Firecrawl" -ForegroundColor Red
    exit 1
}
