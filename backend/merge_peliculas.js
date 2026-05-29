const fs = require('fs').promises;
const path = require('path');

const GAUMONT_FILE = path.join(__dirname, 'peliculas_gaumont.json');
const COSMOS_FILE = path.join(__dirname, 'peliculas_cosmos.json');
const CACODELPHIA_FILE = path.join(__dirname, 'peliculas_cacodelphia.json');
const ATLAS_FILE = path.join(__dirname, 'peliculas_atlas.json');
const OUTPUT_FILE = path.join(__dirname, 'peliculas.json');

// Normaliza un título: minúsculas, sin acentos, sin caracteres especiales
function normalizarTitulo(titulo) {
    return titulo
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, '')
        .trim()
        .replace(/\s+/g, ' ');
}

async function cargarFuente(archivo, nombre) {
    try {
        const data = await fs.readFile(archivo, 'utf8');
        const funciones = JSON.parse(data);
        console.log(`   ${nombre}: ${funciones.length} funciones.`);
        return funciones;
    } catch (err) {
        console.error(`   ⚠️ No se encontró ${archivo}.`);
        return [];
    }
}

async function main() {
    console.log('🔄 Unificando carteleras (con fusión por título normalizado)...');
    
    const gaumont = await cargarFuente(GAUMONT_FILE, 'Gaumont');
    const cosmos = await cargarFuente(COSMOS_FILE, 'Cosmos');
    const cacodelphia = await cargarFuente(CACODELPHIA_FILE, 'Cacodelphia');
    const atlas = await cargarFuente(ATLAS_FILE, 'Atlas');
    
    const todasFunciones = [...gaumont, ...cosmos, ...cacodelphia, ...atlas];
    
    // Agrupar por título normalizado para fusionar películas repetidas
    const mapa = new Map();
    for (const func of todasFunciones) {
        const clave = normalizarTitulo(func.titulo);
        if (!mapa.has(clave)) {
            mapa.set(clave, {
                tituloOriginal: func.titulo,
                funciones: []
            });
        }
        const grupo = mapa.get(clave);
        grupo.funciones.push(func);
    }
    
    // Reconstruir array de funciones combinadas
    const resultado = [];
    for (const grupo of mapa.values()) {
        const tituloFinal = grupo.tituloOriginal;
        const funcionesCombinadas = grupo.funciones.map(f => ({
            ...f,
            titulo: tituloFinal
        }));
        resultado.push(...funcionesCombinadas);
    }
    
    await fs.writeFile(OUTPUT_FILE, JSON.stringify(resultado, null, 2));
    console.log(`✅ Unificación completada. Total funciones: ${resultado.length}`);
    console.log(`   (Se combinaron ${todasFunciones.length} funciones originales en ${resultado.length} registros)`);
}

main();