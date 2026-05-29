const fs = require('fs').promises;
const path = require('path');

const GAUMONT_FILE = path.join(__dirname, 'peliculas_gaumont.json');
const COSMOS_FILE = path.join(__dirname, 'peliculas_cosmos.json');
const CACODELPHIA_FILE = path.join(__dirname, 'peliculas_cacodelphia.json');
const ATLAS_FILE = path.join(__dirname, 'peliculas_atlas.json');
const CINEMARK_FILE = path.join(__dirname, 'peliculas_cinemark.json');
const OUTPUT_FILE = path.join(__dirname, 'peliculas.json');

// Palabras que se ignoran al final del título (solo las conflictivas)
const IGNORAR_SUFIJOS = [
    'sin salida', 'la pelicula', 'la película', 'el regreso', 
    '2d', '3d', 'doblada', 'subtitulada', 'sub', 'cast'
];

// Normalización base (sin eliminar sufijos todavía)
function normalizarBase(titulo) {
    if (!titulo) return '';
    let t = titulo;
    // Eliminar contenido entre paréntesis o corchetes
    t = t.replace(/[\(\[].*?[\)\]]/g, '');
    // Eliminar después de guión o dos puntos
    t = t.replace(/\s*[-–—:].*$/, '');
    // Eliminar artículos al inicio
    t = t.replace(/^(the|a|an|la|el|los|las|le|un|una|unos|unas)\s+/i, '');
    // Pasar a minúsculas y normalizar acentos
    t = t.toLowerCase();
    t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    t = t.replace(/[^a-z0-9\s]/g, '');
    t = t.trim().replace(/\s+/g, ' ');
    return t;
}

// Eliminar sufijos conocidos al final
function eliminarSufijos(tituloBase) {
    let t = tituloBase;
    for (const sufijo of IGNORAR_SUFIJOS) {
        if (t.endsWith(sufijo)) {
            t = t.slice(0, -sufijo.length).trim();
        }
    }
    return t;
}

// Normalización completa para agrupar
function normalizarTitulo(titulo) {
    let base = normalizarBase(titulo);
    base = eliminarSufijos(base);
    return base;
}

// Función de similitud Jaccard
function similitudJaccard(a, b) {
    const palabrasA = new Set(a.split(' '));
    const palabrasB = new Set(b.split(' '));
    const interseccion = new Set([...palabrasA].filter(x => palabrasB.has(x)));
    const union = new Set([...palabrasA, ...palabrasB]);
    return interseccion.size / union.size;
}

// Determinar si dos títulos se refieren a la misma película
function mismaPelicula(tituloA, tituloB) {
    const a = normalizarTitulo(tituloA);
    const b = normalizarTitulo(tituloB);
    
    if (a === b) return true;
    if (a.includes(b) || b.includes(a)) return true;
    
    // Si la longitud es muy diferente, ver si el más corto está contenido en el más largo
    const minLen = Math.min(a.length, b.length);
    let prefijoLen = 0;
    for (let i = 0; i < minLen; i++) {
        if (a[i] === b[i]) prefijoLen++;
        else break;
    }
    if (prefijoLen >= 8) return true;
    
    const jaccard = similitudJaccard(a, b);
    if (jaccard >= 0.7) return true;
    
    return false;
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
    console.log('🔄 Unificando carteleras (con fusión inteligente de títulos)...');
    
    const gaumont = await cargarFuente(GAUMONT_FILE, 'Gaumont');
    const cosmos = await cargarFuente(COSMOS_FILE, 'Cosmos');
    const cacodelphia = await cargarFuente(CACODELPHIA_FILE, 'Cacodelphia');
    const atlas = await cargarFuente(ATLAS_FILE, 'Atlas');
    const cinemark = await cargarFuente(CINEMARK_FILE, 'Cinemark');
    
    const todasFunciones = [...gaumont, ...cosmos, ...cacodelphia, ...atlas, ...cinemark];
    
    // Agrupar usando mismaPelicula
    const grupos = [];
    for (const func of todasFunciones) {
        let encontrado = false;
        for (const grupo of grupos) {
            if (mismaPelicula(grupo.tituloReferencia, func.titulo)) {
                grupo.funciones.push(func);
                // Si el título nuevo es más largo, actualizar referencia (para elegir el más completo)
                if (func.titulo.length > grupo.tituloReferencia.length) {
                    grupo.tituloReferencia = func.titulo;
                }
                encontrado = true;
                break;
            }
        }
        if (!encontrado) {
            grupos.push({
                tituloReferencia: func.titulo,
                funciones: [func]
            });
        }
    }
    
    // Elegir el título más frecuente como canónico
    const resultado = [];
    for (const grupo of grupos) {
        const frecuencias = new Map();
        let mejorPoster = '';
        for (const f of grupo.funciones) {
            frecuencias.set(f.titulo, (frecuencias.get(f.titulo) || 0) + 1);
            if (f.poster && f.poster.startsWith('http') && !mejorPoster) {
                mejorPoster = f.poster;
            }
        }
        let tituloFinal = grupo.tituloReferencia;
        let maxFreq = 0;
        for (const [titulo, freq] of frecuencias) {
            if (freq > maxFreq) {
                maxFreq = freq;
                tituloFinal = titulo;
            }
        }
        
        const funcionesCombinadas = grupo.funciones.map(f => ({
            ...f,
            titulo: tituloFinal,
            poster: mejorPoster || f.poster
        }));
        resultado.push(...funcionesCombinadas);
    }
    
    await fs.writeFile(OUTPUT_FILE, JSON.stringify(resultado, null, 2));
    console.log(`✅ Unificación completada. Total funciones: ${resultado.length}`);
    console.log(`   (Se combinaron ${todasFunciones.length} funciones originales en ${resultado.length} registros)`);
}

main();