const fs = require('fs').promises;
const path = require('path');

const GAUMONT_FILE = path.join(__dirname, 'peliculas_gaumont.json');
const COSMOS_FILE = path.join(__dirname, 'peliculas_cosmos.json');
const CACODELPHIA_FILE = path.join(__dirname, 'peliculas_cacodelphia.json');
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

    let cacodelphia = [];
    try {
        const data = await fs.readFile(CACODELPHIA_FILE, 'utf8');
        cacodelphia = JSON.parse(data);
        console.log(`   Cacodelphia: ${cacodelphia.length} funciones.`);
    } catch (err) {
        console.error('   ⚠️ No se encontró peliculas_cacodelphia.json. Ejecuta scraper_cacodelphia.js primero.');
    }

    const todas = [...gaumont, ...cosmos, ...cacodelphia];
    await fs.writeFile(OUTPUT_FILE, JSON.stringify(todas, null, 2));
    console.log(`✅ Unificación completada. Total funciones: ${todas.length}`);
}

main();