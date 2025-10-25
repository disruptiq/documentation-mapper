const axios = require('axios');

class DocumentationCrawler {
  constructor(options = {}) {
    this.logger = options.logger;
    this.firecrawlApiKey = process.env.FIRECRAWL_API_KEY;
    // Allow configurable Firecrawl base URL for local instances
    this.firecrawlBaseUrl = process.env.FIRECRAWL_BASE_URL || 'https://api.firecrawl.dev';
    this.cache = new Map();
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async crawlDocumentation(dependency) {
    const { ecosystem, name, version, source } = dependency;
    const cacheKey = `${ecosystem}:${name}:${version}`;

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      let documentation = {};

      // Try firecrawl first if API key is available
      if (this.firecrawlApiKey) {
        documentation = await this.crawlWithFirecrawl(dependency);
      } else {
        // Fallback to basic documentation fetching
        documentation = await this.fetchBasicDocumentation(dependency);
      }

      this.cache.set(cacheKey, documentation);
      return documentation;

    } catch (error) {
      this.logger.error(`Failed to crawl documentation for ${name}@${version}: ${error.message}`);
      return {
        error: error.message,
        crawled_at: new Date().toISOString()
      };
    }
  }

  async crawlWithFirecrawl(dependency) {
    const { ecosystem, name, version } = dependency;

    // Get documentation URL based on ecosystem
    const docUrl = await this.getDocumentationUrl(dependency);

    if (!docUrl) {
      return { note: 'No documentation URL available for this ecosystem/package' };
    }

    try {
      const response = await axios.post(`${this.firecrawlBaseUrl}/v1/scrape`, {
        url: docUrl,
        formats: ['markdown'],
        onlyMainContent: true
      }, {
        headers: {
          'Authorization': `Bearer ${this.firecrawlApiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      if (response.data.success) {
        return {
          url: docUrl,
          content: response.data.data.markdown,
          crawled_at: new Date().toISOString(),
          source: 'firecrawl'
        };
      } else {
        throw new Error(response.data.error || 'Firecrawl request failed');
      }

    } catch (error) {
      this.logger.warn(`Firecrawl failed for ${name}@${version}, falling back to basic fetch: ${error.message}`);
      return await this.fetchBasicDocumentation(dependency);
    }
  }

  async fetchBasicDocumentation(dependency) {
    const { ecosystem, name, version } = dependency;
    const docUrl = await this.getDocumentationUrl(dependency);

    if (!docUrl) {
      return { note: 'No documentation URL available for this ecosystem/package' };
    }

    // Retry logic for rate limiting
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await axios.get(docUrl, {
          timeout: 10000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate, br',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Cache-Control': 'max-age=0'
          }
        });

        // Extract basic text content (very simplistic)
        const content = this.extractTextFromHTML(response.data);

        return {
          url: docUrl,
          content: content.substring(0, 5000), // Limit content length
          crawled_at: new Date().toISOString(),
          source: 'basic_fetch',
          note: 'Basic HTML text extraction - consider using Firecrawl API for better results'
        };

      } catch (error) {
        if (error.response && error.response.status === 403 && attempt < 3) {
          // Wait longer between retries for 403 errors
          this.logger.warn(`403 error on attempt ${attempt} for ${name}@${version}, retrying in ${attempt * 2} seconds...`);
          await this.delay(attempt * 2000);
          continue;
        }

        return {
          url: docUrl,
          error: `Failed to fetch documentation: ${error.message}`,
          crawled_at: new Date().toISOString()
        };
      }
    }
  }

  async getDocumentationUrl(dependency) {
    const { ecosystem, name, version } = dependency;

    switch (ecosystem) {
      case 'npm':
        // Try to get GitHub repository URL from npm registry
        try {
          const registryUrl = `https://registry.npmjs.org/${encodeURIComponent(name)}`;
          const response = await axios.get(registryUrl, {
            timeout: 5000,
            headers: {
              'User-Agent': 'DocumentationMapper/1.0',
              'Accept': 'application/json'
            }
          });

          if (response.data && response.data.repository && response.data.repository.url) {
            let repoUrl = response.data.repository.url;
            // Convert git+https://github.com/user/repo.git to https://github.com/user/repo
            repoUrl = repoUrl.replace(/^git\+/, '').replace(/\.git$/, '');
            if (repoUrl.includes('github.com')) {
              return repoUrl;
            }
          }
        } catch (error) {
          this.logger.warn(`Failed to get repository URL for ${name}: ${error.message}`);
        }

        // Fallback to npm docs (but this might get 403)
        return `https://www.npmjs.com/package/${encodeURIComponent(name)}`;

      case 'python':
      case 'pypi':
        return `https://pypi.org/project/${encodeURIComponent(name)}/${encodeURIComponent(version)}/`;

      case 'rust':
        return `https://docs.rs/${encodeURIComponent(name)}/${encodeURIComponent(version)}/`;

      case 'java':
        // For Maven, try Maven Central or project website
        return `https://mvnrepository.com/artifact/${encodeURIComponent(name.replace(':', '/'))}/${encodeURIComponent(version)}`;

      case 'ruby':
        return `https://rubygems.org/gems/${encodeURIComponent(name)}/versions/${encodeURIComponent(version)}`;

      case 'go':
        if (name.startsWith('github.com/')) {
          return `https://${name}`;
        }
        return `https://pkg.go.dev/${encodeURIComponent(name)}@${encodeURIComponent(version)}`;

      case 'dotnet':
        return `https://www.nuget.org/packages/${encodeURIComponent(name)}/${encodeURIComponent(version)}`;

      case 'php':
        return `https://packagist.org/packages/${encodeURIComponent(name)}`;

      default:
        return null;
    }
  }

  extractTextFromHTML(html) {
    // Very basic HTML text extraction - remove tags
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}

module.exports = DocumentationCrawler;
