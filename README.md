# Documentation Mapper

A tool to extract dependencies from codebases and fetch their documentation and descriptions from various package registries.

## Features

- **Multi-ecosystem support**: Works with JavaScript/TypeScript, Python, Rust, Ruby, Go, Java, .NET, and PHP projects
- **Dependency extraction**: Parses package.json, requirements.txt, Cargo.toml, Gemfile, pom.xml, go.mod, and more
- **Description fetching**: Automatically retrieves package descriptions from PyPI, npm, Crates.io, RubyGems, etc.
- **Documentation crawling**: Downloads version-specific documentation using basic HTML extraction or Firecrawl API
- **Database storage**: Stores all data in SQLite (default) or MongoDB
- **Query interface**: Search and retrieve stored documentation

## Installation

```bash
npm install
```

## Usage

### Process a dependency scan JSON file

```bash
# Process the example output and store documentation
node src/index.js scan example-output.json

# Use MongoDB instead of SQLite
node src/index.js scan example-output.json --db mongodb

# Save results to a file
node src/index.js scan example-output.json --output results.json
```

### Scan a repository directly

```bash
# Scan a local repository
node src/index.js scan /path/to/repo

# Scan current directory
node src/index.js scan .
```

### Query stored documentation

```bash
# Query all packages
node src/index.js query

# Find specific package
node src/index.js query --package express

# Filter by ecosystem
node src/index.js query --ecosystem npm

# Find specific version
node src/index.js query --package tokio --version 1.0
```

## Supported Ecosystems

- **npm**: JavaScript/TypeScript packages
- **pypi**: Python packages
- **rust**: Rust crates
- **ruby**: Ruby gems
- **go**: Go modules
- **java**: Maven packages
- **dotnet**: NuGet packages
- **php**: Composer/Packagist packages

## Database Options

The tool supports two database backends:

- **SQLite** (default): Lightweight, file-based database
- **MongoDB**: Requires MongoDB server, supports larger datasets

## Firecrawl Integration

For enhanced documentation crawling, set the `FIRECRAWL_API_KEY` environment variable:

```bash
export FIRECRAWL_API_KEY=your_api_key_here
node src/index.js scan example-output.json
```

Without the API key, the tool falls back to basic HTML text extraction.

## Rate Limiting & Error Handling

The tool includes several features to handle API rate limits and errors:

- **Smart delays**: Randomized delays (200-500ms) between requests to avoid detection
- **Browser headers**: Uses realistic browser User-Agent and headers for web requests
- **Retry logic**: Automatically retries failed requests up to 3 times with exponential backoff
- **GitHub fallback**: For npm packages, fetches documentation from GitHub repositories instead of npmjs.com to avoid 403 errors
- **Graceful degradation**: Continues processing other packages even if some fail

## Output Format

When processing dependencies, each package entry includes:

- Package name, version, ecosystem
- Description from the package registry
- Documentation content (if available)
- Source URLs and crawl timestamps
- Manifest file information

## Example

The `example-output.json` contains 55 dependencies from a sample repository scan. Running:

```bash
node src/index.js scan example-output.json
```

Will fetch descriptions and documentation for packages like:
- `tokio@1.0` (Rust)
- `express@^4.18.0` (npm)
- `rails@~> 7.0.4` (Ruby)
- `github.com/gin-gonic/gin@v1.9.1` (Go)
- And many more...

## Architecture

- `DocumentationMapper.js`: Main orchestration class
- `Database.js`: Database abstraction layer
- `PackageFetcher.js`: Registry API clients
- `DocumentationCrawler.js`: Documentation fetching (Firecrawl/basic)
- `DependencyScanner.js`: Repository manifest file parsing
