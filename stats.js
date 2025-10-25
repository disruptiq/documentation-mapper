const Database = require('./src/Database');

async function showStats() {
  const db = new Database({ type: 'sqlite' });

  try {
    await db.initialize();
    const results = await db.queryPackages({});

    console.log(`Total packages stored: ${results.length}`);

    const ecosystems = {};
    results.forEach(p => {
      ecosystems[p.ecosystem] = (ecosystems[p.ecosystem] || 0) + 1;
    });

    console.log('By ecosystem:', ecosystems);

    // Show some examples
    console.log('\nSample packages:');
    results.slice(0, 5).forEach(p => {
      console.log(`- ${p.ecosystem}/${p.name}@${p.version}: ${p.description?.substring(0, 50)}...`);
    });

  } finally {
    await db.close();
  }
}

showStats().catch(console.error);
