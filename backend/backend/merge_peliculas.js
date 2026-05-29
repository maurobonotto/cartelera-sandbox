// backend/merge_peliculas.js
const { scrapeCosmos } = require('./scraper_cosmos');
const fs = require('fs').promises;
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, 'peliculas.json');
const GAUMONT_OUTPUT = path.join(__dirname, 'peliculas_gaumont.json');

// Función para ejecutar el scraper de Gaumont (puedes llamar al script existente)
async function runGaumontScraper() {
    // Aquí puedes ejecutar el scraper de Gaumont como un proceso hijo o importar su función principal.
    // Para simplificar, asumiremos que el archivo peliculas_gaumont.json ya fue generado previamente.
    // En un entorno de integración, ejecutaríamos el scraper de Gaumont antes.
    try {
        const data = await fs.readFile(GAUMONT_OUTPUT, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('No se pudo leer peliculas_gaumont.json. Asegúrate de ejecutar scraper_gaumont.js primero.');
        return [];
    }
}

async function main() {
    console.log('🔄 Unificando carteleras...');
    // Ejecutar scraper de Cosmos (obtiene datos frescos)
    const cosmosData = await scrapeCosmos();
    // Cargar datos de Gaumont desde archivo existente (o ejecutar el scraper)
    const gaumontData = await runGaumontScraper();
    // Combinar
    const todasLasFunciones = [...gaumontData, ...cosmosData];
    await fs.writeFile(OUTPUT_FILE, JSON.stringify(todasLasFunciones, null, 2));
    console.log(`✅ Unificación completada. Total funciones: ${todasLasFunciones.length}`);
}

main();