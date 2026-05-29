const fs = require('fs').promises;
const path = require('path');

const GAUMONT_FILE = path.join(__dirname, 'peliculas_gaumont.json');
const COSMOS_FILE = path.join(__dirname, 'peliculas_cosmos.json');
const CACODELPHIA_FILE = path.join(__dirname, 'peliculas_cacodelphia.json');
const ATLAS_FILE = path.join(__dirname, 'peliculas_atlas.json');
const CINEMARK_FILE = path.join(__dirname, 'peliculas_cinemark.json');
const OUTPUT_FILE = path.join(__dirname, 'peliculas.json');

// Normalización avanzada (sin dependencias)
function normalizarTitulo(titulo) {
    if (!titulo) return '';
    
    let t = titulo;
    
    // Eliminar contenido entre paréntesis, corchetes, llaves
    t = t.replace(/[\(\[].*?[\)\]]/g, '');
    // Eliminar después de guión o dos puntos
    t = t.replace(/\s*[-–—:].*$/, '');
    // Eliminar artículos al inicio
    t = t.replace(/^(the|a|an|la|el|los|las|le|un|una|unos|unas)\s+/i, '');
    
    // Normalizar
    t = t.toLowerCase();
    t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    t = t.replace(/[^a-z0-9\s]/g, '');
    t = t.trim().replace(/\s+/g, ' ');
    
    return t;
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
    console.log('🔄 Unificando carteleras (con normalización avanzada)...');
    
    const gaumont = await cargarFuente(GAUMONT_FILE, 'Gaumont');
    const cosmos = await cargarFuente(COSMOS_FILE, 'Cosmos');
    const cacodelphia = await cargarFuente(CACODELPHIA_FILE, 'Cacodelphia');
    const atlas = await cargarFuente(ATLAS_FILE, 'Atlas');
    const cinemark = await cargarFuente(CINEMARK_FILE, 'Cinemark');
    
    const todasFunciones = [...gaumont, ...cosmos, ...cacodelphia, ...atlas, ...cinemark];
    
    // Agrupar solo por título normalizado
    const mapa = new Map();
    for (const func of todasFunciones) {
        const clave = normalizarTitulo(func.titulo);
        if (!mapa.has(clave)) {
            mapa.set(clave, {
                tituloOriginal: func.titulo,
                funciones: []
            });
        }
        mapa.get(clave).funciones.push(func);
    }
    
    // Elegir el título más frecuente como canónico
    const resultado = [];
    for (const grupo of mapa.values()) {
        const frecuencias = new Map();
        for (const f of grupo.funciones) {
            const titulo = f.titulo;
            frecuencias.set(titulo, (frecuencias.get(titulo) || 0) + 1);
        }
        let tituloFinal = grupo.tituloOriginal;
        let maxFreq = 0;
        for (const [titulo, freq] of frecuencias) {
            if (freq > maxFreq) {
                maxFreq = freq;
                tituloFinal = titulo;
            }
        }
        
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