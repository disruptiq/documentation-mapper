const fs = require('fs');
const path = require('path');
const glob = require('glob');

class DependencyScanner {
  constructor(options = {}) {
    this.logger = options.logger;
  }

  async scan(repoPath) {
    this.logger.info(`Scanning repository at: ${repoPath}`);

    const dependencies = [];

    // Scan for common dependency files
    const manifestFiles = await this.findManifestFiles(repoPath);

    for (const file of manifestFiles) {
      try {
        const deps = await this.parseManifestFile(file);
        dependencies.push(...deps);
      } catch (error) {
        this.logger.warn(`Failed to parse ${file}: ${error.message}`);
      }
    }

    return dependencies;
  }

  async findManifestFiles(repoPath) {
    const patterns = [
      'package.json',
      'package-lock.json',
      'yarn.lock',
      'requirements.txt',
      'pyproject.toml',
      'Pipfile',
      'Pipfile.lock',
      'Cargo.toml',
      'Cargo.lock',
      'Gemfile',
      'Gemfile.lock',
      'pom.xml',
      'build.gradle',
      'composer.json',
      'go.mod',
      'go.sum',
      '*.csproj',
      '*.fsproj',
      '*.vbproj'
    ];

    const files = [];

    for (const pattern of patterns) {
      const matches = glob.sync(pattern, {
        cwd: repoPath,
        absolute: true,
        nodir: true
      });
      files.push(...matches);
    }

    return [...new Set(files)]; // Remove duplicates
  }

  async parseManifestFile(filePath) {
    const ext = path.extname(filePath);
    const filename = path.basename(filePath);

    switch (filename) {
      case 'package.json':
        return this.parsePackageJson(filePath);
      case 'requirements.txt':
        return this.parseRequirementsTxt(filePath);
      case 'pyproject.toml':
        return this.parsePyprojectToml(filePath);
      case 'Cargo.toml':
        return this.parseCargoToml(filePath);
      case 'Gemfile':
        return this.parseGemfile(filePath);
      case 'pom.xml':
        return this.parsePomXml(filePath);
      case 'composer.json':
        return this.parseComposerJson(filePath);
      case 'go.mod':
        return this.parseGoMod(filePath);
      default:
        if (filename.endsWith('.csproj')) {
          return this.parseCsproj(filePath);
        }
        return [];
    }
  }

  async parsePackageJson(filePath) {
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const dependencies = [];

    // Regular dependencies
    if (content.dependencies) {
      for (const [name, version] of Object.entries(content.dependencies)) {
        dependencies.push({
          ecosystem: 'npm',
          name,
          version: version.replace(/^[^\d]*/, ''), // Remove ^,~ etc.
          source: 'registry',
          manifestPath: filePath,
          isDevDependency: false
        });
      }
    }

    // Dev dependencies
    if (content.devDependencies) {
      for (const [name, version] of Object.entries(content.devDependencies)) {
        dependencies.push({
          ecosystem: 'npm',
          name,
          version: version.replace(/^[^\d]*/, ''),
          source: 'registry',
          manifestPath: filePath,
          isDevDependency: true
        });
      }
    }

    return dependencies;
  }

  async parseRequirementsTxt(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const dependencies = [];

    const lines = content.split('\n').filter(line => line.trim() && !line.startsWith('#'));

    for (const line of lines) {
      // Parse lines like "package==1.0.0" or "package>=1.0.0"
      const match = line.match(/^([a-zA-Z0-9\-_.]+)([><=~!]+)(.+)$/);
      if (match) {
        const [, name, , version] = match;
        dependencies.push({
          ecosystem: 'pypi',
          name,
          version,
          source: 'pypi',
          manifestPath: filePath,
          isDevDependency: false
        });
      } else {
        // Just package name
        dependencies.push({
          ecosystem: 'pypi',
          name: line.trim(),
          version: '*',
          source: 'pypi',
          manifestPath: filePath,
          isDevDependency: false
        });
      }
    }

    return dependencies;
  }

  async parsePyprojectToml(filePath) {
    // Basic TOML parsing - would need a proper TOML parser for production
    const content = fs.readFileSync(filePath, 'utf8');
    const dependencies = [];

    // Very basic parsing - look for [tool.poetry.dependencies] section
    const lines = content.split('\n');
    let inDependenciesSection = false;

    for (const line of lines) {
      if (line.includes('[tool.poetry.dependencies]')) {
        inDependenciesSection = true;
        continue;
      } else if (line.startsWith('[') && inDependenciesSection) {
        inDependenciesSection = false;
      }

      if (inDependenciesSection && line.includes('=')) {
        const [name, version] = line.split('=').map(s => s.trim().replace(/"/g, ''));
        if (name && name !== 'python') {
          dependencies.push({
            ecosystem: 'pypi',
            name,
            version: version || '*',
            source: 'pypi',
            manifestPath: filePath,
            isDevDependency: false
          });
        }
      }
    }

    return dependencies;
  }

  async parseCargoToml(filePath) {
    // Basic TOML parsing for Cargo.toml
    const content = fs.readFileSync(filePath, 'utf8');
    const dependencies = [];

    const lines = content.split('\n');
    let inDependenciesSection = false;

    for (const line of lines) {
      if (line.includes('[dependencies]')) {
        inDependenciesSection = true;
        continue;
      } else if (line.startsWith('[') && inDependenciesSection) {
        inDependenciesSection = false;
      }

      if (inDependenciesSection && line.includes('=')) {
        const [name, version] = line.split('=').map(s => s.trim().replace(/"/g, ''));
        if (name) {
          dependencies.push({
            ecosystem: 'rust',
            name,
            version: version || '*',
            source: 'crates.io',
            manifestPath: filePath,
            isDevDependency: false
          });
        }
      }
    }

    return dependencies;
  }

  async parseGemfile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const dependencies = [];

    const lines = content.split('\n');

    for (const line of lines) {
      // Look for gem declarations
      const gemMatch = line.match(/gem\s+['"]([^'"]+)['"](?:\s*,\s*['"]([^'"]+)['"])?/);
      if (gemMatch) {
        const [, name, version] = gemMatch;
        dependencies.push({
          ecosystem: 'ruby',
          name,
          version: version || '>= 0',
          source: 'rubygems.org',
          manifestPath: filePath,
          isDevDependency: false
        });
      }
    }

    return dependencies;
  }

  async parsePomXml(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const dependencies = [];

    // Basic XML parsing - look for dependency tags
    const dependencyMatches = content.match(/<dependency>[\s\S]*?<\/dependency>/g);

    if (dependencyMatches) {
      for (const dep of dependencyMatches) {
        const groupIdMatch = dep.match(/<groupId>([^<]+)<\/groupId>/);
        const artifactIdMatch = dep.match(/<artifactId>([^<]+)<\/artifactId>/);
        const versionMatch = dep.match(/<version>([^<]+)<\/version>/);

        if (groupIdMatch && artifactIdMatch) {
          const name = `${groupIdMatch[1]}:${artifactIdMatch[1]}`;
          const version = versionMatch ? versionMatch[1] : 'latest';

          dependencies.push({
            ecosystem: 'java',
            name,
            version,
            source: 'maven_central',
            manifestPath: filePath,
            isDevDependency: false
          });
        }
      }
    }

    return dependencies;
  }

  async parseComposerJson(filePath) {
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const dependencies = [];

    // Regular dependencies
    if (content.require) {
      for (const [name, version] of Object.entries(content.require)) {
        if (name !== 'php') {
          dependencies.push({
            ecosystem: 'php',
            name,
            version,
            source: 'packagist.org',
            manifestPath: filePath,
            isDevDependency: false
          });
        }
      }
    }

    // Dev dependencies
    if (content['require-dev']) {
      for (const [name, version] of Object.entries(content['require-dev'])) {
        dependencies.push({
          ecosystem: 'php',
          name,
          version,
          source: 'packagist.org',
          manifestPath: filePath,
          isDevDependency: true
        });
      }
    }

    return dependencies;
  }

  async parseGoMod(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const dependencies = [];

    const lines = content.split('\n');

    for (const line of lines) {
      if (line.startsWith('require') || line.includes('=>')) {
        const requireMatch = line.match(/require\s+\(([\s\S]*?)\)/);
        if (requireMatch) {
          // Multi-line require block
          const block = requireMatch[1];
          const depLines = block.split('\n').filter(l => l.trim());

          for (const depLine of depLines) {
            const depMatch = depLine.trim().match(/^([^@\s]+)\s+([^@\s]+)/);
            if (depMatch) {
              const [, name, version] = depMatch;
              dependencies.push({
                ecosystem: 'go',
                name,
                version,
                source: 'goproxy',
                manifestPath: filePath,
                isDevDependency: false
              });
            }
          }
        } else {
          // Single line require
          const depMatch = line.match(/require\s+([^@\s]+)\s+([^@\s]+)/);
          if (depMatch) {
            const [, name, version] = depMatch;
            dependencies.push({
              ecosystem: 'go',
              name,
              version,
              source: 'goproxy',
              manifestPath: filePath,
              isDevDependency: false
            });
          }
        }
      }
    }

    return dependencies;
  }

  async parseCsproj(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const dependencies = [];

    // Look for PackageReference tags
    const packageMatches = content.match(/<PackageReference[^>]*>[\s\S]*?<\/PackageReference>/g);

    if (packageMatches) {
      for (const pkg of packageMatches) {
        const includeMatch = pkg.match(/Include="([^"]+)"/);
        const versionMatch = pkg.match(/Version="([^"]+)"/);

        if (includeMatch) {
          const name = includeMatch[1];
          const version = versionMatch ? versionMatch[1] : 'latest';

          dependencies.push({
            ecosystem: 'dotnet',
            name,
            version,
            source: '.net_nuget',
            manifestPath: filePath,
            isDevDependency: false
          });
        }
      }
    }

    return dependencies;
  }
}

module.exports = DependencyScanner;
