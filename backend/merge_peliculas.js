const fs = require('fs').promises;
const path = require('path');

const GAUMONT_INPUT = path.join(__dirname, 'peliculas.json');      // el que genera scraper_gaumont.js
const COSMOS_INPUT = path.join(__dirname, 'peliculas_cosmos.json');
const OUTPUT = path.join(__dirname, 'peliculas_final.json');

async function main() {
    const gaumont = await fs.readFile(GAUMONT_INPUT, 'utf8').then(JSON.parse).catch(() => []);
    const cosmos = await fs.readFile(COSMOS_INPUT, 'utf8').then(JSON.parse).catch(() => []);
    const todas = [...gaumont, ...cosmos];
    await fs.writeFile(OUTPUT, JSON.stringify(todas, null, 2));
    console.log(`✅ Unificadas: ${todas.length} funciones (Gaumont: ${gaumont.length}, Cosmos: ${cosmos.length})`);
    // Opcional: reemplazar el archivo original
    await fs.copyFile(OUTPUT, path.join(__dirname, 'peliculas.json'));
}
main();