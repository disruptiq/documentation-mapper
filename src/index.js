#!/usr/bin/env node

const { Command } = require('commander');
const path = require('path');
const fs = require('fs');
const DocumentationMapper = require('./DocumentationMapper');

const program = new Command();

program
  .name('documentation-mapper')
  .description('Extract dependencies and fetch documentation from codebase scans')
  .version('1.0.0');

program
  .command('scan')
  .description('Scan a repository or process a dependency scan JSON file')
  .argument('<input>', 'Path to repository directory or JSON file')
  .option('-d, --db <type>', 'Database type: sqlite or mongodb', 'sqlite')
  .option('-c, --config <file>', 'Configuration file path')
  .option('-o, --output <file>', 'Output file for results')
  .action(async (input, options) => {
    try {
      const mapper = new DocumentationMapper({
        dbType: options.db,
        configFile: options.config
      });

      await mapper.initialize();

      let dependencies = [];

      // Check if input is a JSON file or a directory
      if (fs.existsSync(input) && fs.statSync(input).isFile() && path.extname(input) === '.json') {
        console.log(`Processing dependency scan file: ${input}`);
        dependencies = await mapper.loadDependenciesFromJSON(input);
      } else if (fs.existsSync(input) && fs.statSync(input).isDirectory()) {
        console.log(`Scanning repository: ${input}`);
        dependencies = await mapper.scanRepository(input);
      } else {
        throw new Error(`Invalid input: ${input} is not a valid file or directory`);
      }

      console.log(`Found ${dependencies.length} dependencies`);

      const results = await mapper.processDependencies(dependencies);

      if (options.output) {
        fs.writeFileSync(options.output, JSON.stringify(results, null, 2));
        console.log(`Results saved to ${options.output}`);
      }

      console.log('Documentation mapping completed successfully!');
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

program
  .command('query')
  .description('Query stored documentation')
  .option('-d, --db <type>', 'Database type: sqlite or mongodb', 'sqlite')
  .option('-p, --package <name>', 'Package name to query')
  .option('-v, --version <version>', 'Specific version')
  .option('-e, --ecosystem <type>', 'Ecosystem filter (npm, pypi, etc.)')
  .action(async (options) => {
    try {
      const mapper = new DocumentationMapper({
        dbType: options.db
      });

      await mapper.initialize();

      const results = await mapper.queryDocumentation({
        package: options.package,
        version: options.version,
        ecosystem: options.ecosystem
      });

      console.log(JSON.stringify(results, null, 2));
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

program.parse();
