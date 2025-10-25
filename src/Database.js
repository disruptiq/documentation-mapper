const sqlite3 = require('sqlite3').verbose();
const { MongoClient } = require('mongodb');
const path = require('path');

class Database {
  constructor(options = {}) {
    this.type = options.type || 'sqlite';
    this.logger = options.logger || console;
    this.connection = null;
    this.dbPath = path.join(process.cwd(), 'documentation.db');
  }

  async initialize() {
    this.logger.info(`Initializing ${this.type} database...`);

    if (this.type === 'sqlite') {
      await this.initializeSQLite();
    } else if (this.type === 'mongodb') {
      await this.initializeMongoDB();
    } else {
      throw new Error(`Unsupported database type: ${this.type}`);
    }
  }

  async initializeSQLite() {
    return new Promise((resolve, reject) => {
      this.connection = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          this.logger.error('Failed to connect to SQLite database:', err);
          reject(err);
          return;
        }

        this.logger.info('Connected to SQLite database');

        // Create tables
        const createTablesSQL = `
          CREATE TABLE IF NOT EXISTS packages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ecosystem TEXT NOT NULL,
            name TEXT NOT NULL,
            version TEXT NOT NULL,
            source TEXT,
            description TEXT,
            documentation TEXT,
            manifest_path TEXT,
            is_dev_dependency BOOLEAN DEFAULT 0,
            last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(ecosystem, name, version)
          );

          CREATE INDEX IF NOT EXISTS idx_packages_ecosystem_name ON packages(ecosystem, name);
          CREATE INDEX IF NOT EXISTS idx_packages_name ON packages(name);
        `;

        this.connection.exec(createTablesSQL, (err) => {
          if (err) {
            this.logger.error('Failed to create tables:', err);
            reject(err);
            return;
          }
          this.logger.info('SQLite tables created successfully');
          resolve();
        });
      });
    });
  }

  async initializeMongoDB() {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
    this.client = new MongoClient(uri);

    try {
      await this.client.connect();
      this.connection = this.client.db('documentation_mapper');
      this.logger.info('Connected to MongoDB');

      // Create indexes
      await this.connection.collection('packages').createIndex({ ecosystem: 1, name: 1, version: 1 }, { unique: true });
      await this.connection.collection('packages').createIndex({ name: 1 });

      this.logger.info('MongoDB indexes created');
    } catch (error) {
      this.logger.error('Failed to connect to MongoDB:', error);
      throw error;
    }
  }

  async storePackage(packageData) {
    if (this.type === 'sqlite') {
      return this.storePackageSQLite(packageData);
    } else {
      return this.storePackageMongoDB(packageData);
    }
  }

  async storePackageSQLite(packageData) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT OR REPLACE INTO packages
        (ecosystem, name, version, source, description, documentation, manifest_path, is_dev_dependency, last_updated)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const values = [
        packageData.ecosystem,
        packageData.name,
        packageData.version,
        packageData.source,
        packageData.description,
        JSON.stringify(packageData.documentation || {}),
        packageData.manifestPath,
        packageData.isDevDependency ? 1 : 0,
        packageData.lastUpdated
      ];

      this.connection.run(sql, values, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID });
        }
      });
    });
  }

  async storePackageMongoDB(packageData) {
    const result = await this.connection.collection('packages').updateOne(
      {
        ecosystem: packageData.ecosystem,
        name: packageData.name,
        version: packageData.version
      },
      {
        $set: {
          ...packageData,
          lastUpdated: new Date(packageData.lastUpdated)
        }
      },
      { upsert: true }
    );
    return result;
  }

  async getPackageDocumentation(name, version, ecosystem) {
    if (this.type === 'sqlite') {
      return this.getPackageDocumentationSQLite(name, version, ecosystem);
    } else {
      return this.getPackageDocumentationMongoDB(name, version, ecosystem);
    }
  }

  async getPackageDocumentationSQLite(name, version, ecosystem) {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM packages WHERE name = ? AND version = ? AND ecosystem = ?';
      this.connection.get(sql, [name, version, ecosystem], (err, row) => {
        if (err) {
          reject(err);
        } else if (row) {
          // Parse documentation JSON
          if (row.documentation) {
            try {
              row.documentation = JSON.parse(row.documentation);
            } catch (e) {
              this.logger.warn(`Failed to parse documentation JSON for ${name}@${version}`);
              row.documentation = {};
            }
          }
          resolve(row);
        } else {
          resolve(null);
        }
      });
    });
  }

  async getPackageDocumentationMongoDB(name, version, ecosystem) {
    return await this.connection.collection('packages').findOne({
      name,
      version,
      ecosystem
    });
  }

  async queryPackages(filters = {}) {
    if (this.type === 'sqlite') {
      return this.queryPackagesSQLite(filters);
    } else {
      return this.queryPackagesMongoDB(filters);
    }
  }

  async queryPackagesSQLite(filters) {
    return new Promise((resolve, reject) => {
      let sql = 'SELECT * FROM packages WHERE 1=1';
      const params = [];

      if (filters.package) {
        sql += ' AND name = ?';
        params.push(filters.package);
      }

      if (filters.version) {
        sql += ' AND version = ?';
        params.push(filters.version);
      }

      if (filters.ecosystem) {
        sql += ' AND ecosystem = ?';
        params.push(filters.ecosystem);
      }

      sql += ' ORDER BY name, version';

      this.connection.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          // Parse documentation for each row
          rows.forEach(row => {
            if (row.documentation) {
              try {
                row.documentation = JSON.parse(row.documentation);
              } catch (e) {
                row.documentation = {};
              }
            }
          });
          resolve(rows);
        }
      });
    });
  }

  async queryPackagesMongoDB(filters) {
    const query = {};
    if (filters.package) query.name = filters.package;
    if (filters.version) query.version = filters.version;
    if (filters.ecosystem) query.ecosystem = filters.ecosystem;

    const cursor = this.connection.collection('packages').find(query).sort({ name: 1, version: 1 });
    return await cursor.toArray();
  }

  async close() {
    if (this.type === 'sqlite' && this.connection) {
      this.connection.close();
    } else if (this.type === 'mongodb' && this.client) {
      await this.client.close();
    }
  }
}

module.exports = Database;
