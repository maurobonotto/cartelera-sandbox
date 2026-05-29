// backend/merge_peliculas.js
const fs = require('fs').promises;
const path = require('path');

// Gaumont genera por defecto backend/peliculas.json
const GAUMONT_FILE = path.join(__dirname, 'peliculas.json');
const COSMOS_FILE = path.join(__dirname, 'peliculas_cosmos.json');
const OUTPUT_FILE = path.join(__dirname, 'peliculas_final.json');

async function main() {
    console.log('🔄 Unificando carteleras...');
    let gaumont = [];
    try {
        const gaumontData = await fs.readFile(GAUMONT_FILE, 'utf8');
        gaumont = JSON.parse(gaumontData);
        console.log(`   Gaumont: ${gaumont.length} funciones.`);
    } catch (err) {
        console.error('   ⚠️ No se encontró peliculas.json (Gaumont). Ejecuta scraper_gaumont.js primero.');
    }

    let cosmos = [];
    try {
        const cosmosData = await fs.readFile(COSMOS_FILE, 'utf8');
        cosmos = JSON.parse(cosmosData);
        console.log(`   Cosmos: ${cosmos.length} funciones.`);
    } catch (err) {
        console.error('   ⚠️ No se encontró peliculas_cosmos.json. Ejecuta scraper_cosmos.js primero.');
    }

    const todas = [...gaumont, ...cosmos];
    await fs.writeFile(OUTPUT_FILE, JSON.stringify(todas, null, 2));
    // Opcional: reemplazar el peliculas.json original por el combinado
    await fs.copyFile(OUTPUT_FILE, path.join(__dirname, 'peliculas.json'));
    console.log(`✅ Unificación completada. Total funciones: ${todas.length}`);
}

main();