const axios = require('axios');

class PackageFetcher {
  constructor(options = {}) {
    this.logger = options.logger;
    this.cache = new Map();
  }

  async fetchDescription(dependency) {
    const { ecosystem, name, version, source } = dependency;
    const cacheKey = `${ecosystem}:${name}:${version}`;

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    let description = '';

    try {
      switch (ecosystem) {
        case 'npm':
          description = await this.fetchNPMDescription(name, version);
          break;
        case 'python':
        case 'pypi':
          description = await this.fetchPyPIDescription(name, version);
          break;
        case 'rust':
          description = await this.fetchCratesDescription(name, version);
          break;
        case 'java':
          description = await this.fetchMavenDescription(name, version);
          break;
        case 'ruby':
          description = await this.fetchRubyGemsDescription(name, version);
          break;
        case 'go':
          description = await this.fetchGoDescription(name, version);
          break;
        case 'dotnet':
          description = await this.fetchNuGetDescription(name, version);
          break;
        case 'php':
          description = await this.fetchPackagistDescription(name, version);
          break;
        default:
          this.logger.warn(`Unsupported ecosystem: ${ecosystem}`);
          description = `Package from ${ecosystem} ecosystem`;
      }

      this.cache.set(cacheKey, description);
      return description;

    } catch (error) {
      this.logger.error(`Failed to fetch description for ${name}@${version}: ${error.message}`);
      return `Failed to fetch description: ${error.message}`;
    }
  }

  async fetchNPMDescription(name, version) {
    try {
      // First get package info
      const packageUrl = `https://registry.npmjs.org/${encodeURIComponent(name)}`;
      const response = await axios.get(packageUrl, {
        timeout: 10000,
        headers: {
          'User-Agent': 'DocumentationMapper/1.0',
          'Accept': 'application/json'
        }
      });

      if (response.data && response.data.versions && response.data.versions[version]) {
        const versionData = response.data.versions[version];
        return versionData.description || response.data.description || 'No description available';
      } else {
        // Fallback to latest if specific version not found
        return response.data.description || 'No description available';
      }
    } catch (error) {
      throw new Error(`NPM fetch failed: ${error.message}`);
    }
  }

  async fetchPyPIDescription(name, version) {
    try {
      // PyPI JSON API
      const url = `https://pypi.org/pypi/${encodeURIComponent(name)}/${encodeURIComponent(version)}/json`;
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'DocumentationMapper/1.0',
          'Accept': 'application/json'
        }
      });

      const info = response.data.info;
      return info.summary || info.description || 'No description available';
    } catch (error) {
      // Try without version
      try {
        const url = `https://pypi.org/pypi/${encodeURIComponent(name)}/json`;
        const response = await axios.get(url, {
          timeout: 10000,
          headers: {
            'User-Agent': 'DocumentationMapper/1.0',
            'Accept': 'application/json'
          }
        });
        const info = response.data.info;
        return info.summary || info.description || 'No description available';
      } catch (fallbackError) {
        throw new Error(`PyPI fetch failed: ${error.message}`);
      }
    }
  }

  async fetchCratesDescription(name, version) {
    try {
      // Crates.io API
      const url = `https://crates.io/api/v1/crates/${encodeURIComponent(name)}`;
      const response = await axios.get(url, { timeout: 10000 });

      return response.data.crate.description || response.data.crate.description ||
             'No description available';
    } catch (error) {
      throw new Error(`Crates.io fetch failed: ${error.message}`);
    }
  }

  async fetchMavenDescription(name, version) {
    try {
      // For Maven, name is in format groupId:artifactId
      const [groupId, artifactId] = name.split(':');
      if (!groupId || !artifactId) {
        return 'Invalid Maven coordinate format';
      }

      // Maven Central search API
      const searchUrl = `https://search.maven.org/solrsearch/select?q=g:"${groupId}"+AND+a:"${artifactId}"&rows=1&wt=json`;
      const response = await axios.get(searchUrl, { timeout: 10000 });

      if (response.data.response.docs && response.data.response.docs.length > 0) {
        // Could fetch POM file for description, but for now return basic info
        return `Maven package ${groupId}:${artifactId} version ${version}`;
      }

      return 'Maven package description not available';
    } catch (error) {
      throw new Error(`Maven fetch failed: ${error.message}`);
    }
  }

  async fetchRubyGemsDescription(name, version) {
    try {
      const url = `https://rubygems.org/api/v1/gems/${encodeURIComponent(name)}.json`;
      const response = await axios.get(url, { timeout: 10000 });

      return response.data.info || response.data.summary || 'No description available';
    } catch (error) {
      throw new Error(`RubyGems fetch failed: ${error.message}`);
    }
  }

  async fetchGoDescription(name, version) {
    try {
      // Go modules don't have centralized descriptions like others
      // Could try to fetch from GitHub if it's a github.com package
      if (name.startsWith('github.com/')) {
        return await this.fetchGitHubGoDescription(name, version);
      }

      return `Go module ${name}@${version}`;
    } catch (error) {
      throw new Error(`Go fetch failed: ${error.message}`);
    }
  }

  async fetchGitHubGoDescription(name, version) {
    try {
      // Extract owner/repo from name
      const parts = name.split('/');
      if (parts.length >= 3) {
        const owner = parts[1];
        const repo = parts[2];
        const url = `https://api.github.com/repos/${owner}/${repo}`;

        const response = await axios.get(url, {
          timeout: 10000,
          headers: {
            'User-Agent': 'DocumentationMapper/1.0'
          }
        });

        return response.data.description || 'No description available';
      }

      return `GitHub Go module ${name}`;
    } catch (error) {
      return `GitHub Go module ${name}`;
    }
  }

  async fetchNuGetDescription(name, version) {
    try {
      // NuGet API
      const url = `https://api.nuget.org/v3/registration5-semver1/${name.toLowerCase()}/index.json`;
      const response = await axios.get(url, { timeout: 10000 });

      if (response.data.items && response.data.items.length > 0) {
        // Find the specific version
        for (const item of response.data.items) {
          if (item.catalogEntry.version === version) {
            return item.catalogEntry.description || 'No description available';
          }
        }

        // Fallback to latest
        const latestItem = response.data.items[response.data.items.length - 1];
        return latestItem.catalogEntry.description || 'No description available';
      }

      return 'NuGet package description not available';
    } catch (error) {
      throw new Error(`NuGet fetch failed: ${error.message}`);
    }
  }

  async fetchPackagistDescription(name, version) {
    try {
      const url = `https://repo.packagist.org/p2/${encodeURIComponent(name)}.json`;
      const response = await axios.get(url, { timeout: 10000 });

      const packages = response.data.packages;
      if (packages && packages[name]) {
        const versions = packages[name];
        if (versions[version]) {
          return versions[version].description || 'No description available';
        }

        // Find latest version
        const versionKeys = Object.keys(versions);
        const latestVersion = versionKeys[versionKeys.length - 1];
        return versions[latestVersion].description || 'No description available';
      }

      return 'Packagist package description not available';
    } catch (error) {
      throw new Error(`Packagist fetch failed: ${error.message}`);
    }
  }
}

module.exports = PackageFetcher;
