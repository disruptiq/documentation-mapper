const fs = require('fs');
const path = require('path');
const winston = require('winston');
const Database = require('./Database');
const DependencyScanner = require('./DependencyScanner');
const PackageFetcher = require('./PackageFetcher');
const DocumentationCrawler = require('./DocumentationCrawler');

class DocumentationMapper {
  constructor(options = {}) {
    this.dbType = options.dbType || 'sqlite';
    this.configFile = options.configFile;
    this.skipDocs = options.skipDocs || false;
    this.logger = this.setupLogger();
    this.database = null;
    this.scanner = null;
    this.fetcher = null;
    this.crawler = null;
  }

  setupLogger() {
    return winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message }) => {
          return `${timestamp} [${level}]: ${message}`;
        })
      ),
      transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'documentation-mapper.log' })
      ]
    });
  }

  async initialize() {
    this.logger.info('Initializing DocumentationMapper...');

    // Initialize database
    this.database = new Database({
      type: this.dbType,
      logger: this.logger
    });
    await this.database.initialize();

    // Initialize components
    this.scanner = new DependencyScanner({ logger: this.logger });
    this.fetcher = new PackageFetcher({ logger: this.logger });
    this.crawler = new DocumentationCrawler({ logger: this.logger });

    this.logger.info('DocumentationMapper initialized successfully');
  }

  async loadDependenciesFromJSON(jsonFilePath) {
    this.logger.info(`Loading dependencies from JSON file: ${jsonFilePath}`);

    const content = fs.readFileSync(jsonFilePath, 'utf8');
    const data = JSON.parse(content);

    if (!data.dependencies || !Array.isArray(data.dependencies)) {
      throw new Error('Invalid JSON format: missing dependencies array');
    }

    return data.dependencies.map(dep => ({
      ecosystem: dep.ecosystem,
      name: dep.dependency.name,
      version: dep.dependency.version,
      source: dep.dependency.source,
      manifestPath: dep.manifest_path,
      isDevDependency: dep.metadata.dev_dependency
    }));
  }

  async scanRepository(repoPath) {
    this.logger.info(`Scanning repository: ${repoPath}`);
    return await this.scanner.scan(repoPath);
  }

  async processDependencies(dependencies) {
    this.logger.info(`Processing ${dependencies.length} dependencies`);

    const results = [];

    for (const dep of dependencies) {
      try {
        this.logger.info(`Processing ${dep.ecosystem}/${dep.name}@${dep.version}`);

        // Skip workspace packages (internal monorepo packages)
        if (dep.version === 'workspace:*' || dep.version?.includes('workspace:')) {
          this.logger.info(`Skipping workspace package: ${dep.name}@${dep.version}`);
          results.push({
            ecosystem: dep.ecosystem,
            name: dep.name,
            version: dep.version,
            description: `Internal workspace package: ${dep.name}`,
            documentation: { note: 'Workspace package - no external documentation available' },
            source: dep.source,
            manifestPath: dep.manifestPath,
            isDevDependency: dep.isDevDependency,
            lastUpdated: new Date().toISOString()
          });
          continue;
        }

        // Check if already exists in database
        const existing = await this.database.getPackageDocumentation(dep.name, dep.version, dep.ecosystem);
        if (existing) {
          this.logger.info(`Documentation already exists for ${dep.name}@${dep.version}`);
          results.push(existing);
          continue;
        }

        // Fetch package description
        const description = await this.fetcher.fetchDescription(dep);

        // Crawl documentation (skip if disabled)
        let documentation = { note: 'Documentation fetching disabled' };
        if (!this.skipDocs) {
          documentation = await this.crawler.crawlDocumentation(dep);
        }

        // Store in database
        const packageData = {
          ecosystem: dep.ecosystem,
          name: dep.name,
          version: dep.version,
          source: dep.source,
          description: description,
          documentation: documentation,
          manifestPath: dep.manifestPath,
          isDevDependency: dep.isDevDependency,
          lastUpdated: new Date().toISOString()
        };

        await this.database.storePackage(packageData);
        results.push(packageData);

        this.logger.info(`Successfully processed ${dep.name}@${dep.version}`);

        // Add randomized delay to be respectful to APIs (200-500ms)
        const delay = 200 + Math.random() * 300;
        await this.delay(delay);

      } catch (error) {
        this.logger.error(`Failed to process ${dep.name}@${dep.version}: ${error.message}`);
        results.push({
          ecosystem: dep.ecosystem,
          name: dep.name,
          version: dep.version,
          error: error.message
        });
      }
    }

    return results;
  }

  async queryDocumentation(filters = {}) {
    this.logger.info('Querying documentation with filters:', filters);
    return await this.database.queryPackages(filters);
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async close() {
    if (this.database) {
      await this.database.close();
    }
  }
}

module.exports = DocumentationMapper;
