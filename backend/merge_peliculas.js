const fs = require('fs').promises;
const path = require('path');

const GAUMONT_FILE = path.join(__dirname, 'peliculas_gaumont.json');
const COSMOS_FILE = path.join(__dirname, 'peliculas_cosmos.json');
const OUTPUT_FILE = path.join(__dirname, 'peliculas.json');

async function main() {
    console.log('🔄 Unificando carteleras...');
    let gaumont = [];
    try {
        const data = await fs.readFile(GAUMONT_FILE, 'utf8');
        gaumont = JSON.parse(data);
        console.log(`   Gaumont: ${gaumont.length} funciones.`);
    } catch (err) {
        console.error('   ⚠️ No se encontró peliculas_gaumont.json. Ejecuta scraper_gaumont.js primero.');
    }

    let cosmos = [];
    try {
        const data = await fs.readFile(COSMOS_FILE, 'utf8');
        cosmos = JSON.parse(data);
        console.log(`   Cosmos: ${cosmos.length} funciones.`);
    } catch (err) {
        console.error('   ⚠️ No se encontró peliculas_cosmos.json. Ejecuta scraper_cosmos.js primero.');
    }

    const todas = [...gaumont, ...cosmos];
    await fs.writeFile(OUTPUT_FILE, JSON.stringify(todas, null, 2));
    console.log(`✅ Unificación completada. Total funciones: ${todas.length}`);
}

main();