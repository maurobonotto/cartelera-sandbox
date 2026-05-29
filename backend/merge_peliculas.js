const fs = require('fs').promises;
const path = require('path');

const GAUMONT_FILE = path.join(__dirname, 'peliculas_gaumont.json');
const COSMOS_FILE = path.join(__dirname, 'peliculas_cosmos.json');
const CACODELPHIA_FILE = path.join(__dirname, 'peliculas_cacodelphia.json');
const OUTPUT_FILE = path.join(__dirname, 'peliculas.json');

// Normaliza un título: minúsculas, sin acentos, sin caracteres especiales, espacios simples
function normalizarTitulo(titulo) {
    return titulo
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // elimina acentos
        .replace(/[^a-z0-9\s]/g, '') // elimina puntuación
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
    
    const todasFunciones = [...gaumont, ...cosmos, ...cacodelphia];
    
    // Agrupar por título normalizado
    const mapa = new Map(); // clave = título normalizado, valor = objeto con título original y lista de funciones
    for (const func of todasFunciones) {
        const clave = normalizarTitulo(func.titulo);
        if (!mapa.has(clave)) {
            // Conservamos el título original más legible (podríamos priorizar Gaumont, pero usamos el que aparece primero)
            mapa.set(clave, {
                tituloOriginal: func.titulo,
                funciones: []
            });
        }
        const grupo = mapa.get(clave);
        grupo.funciones.push(func);
    }
    
    // Reconstruir array de funciones únicas por película, combinando los horarios
    const resultado = [];
    for (const grupo of mapa.values()) {
        // Usamos el título original del primer elemento (puede mejorarse)
        const tituloFinal = grupo.tituloOriginal;
        // Combinar todas las funciones (sin modificar su estructura, solo cambiar título si es necesario)
        const funcionesCombinadas = grupo.funciones.map(f => ({
            ...f,
            titulo: tituloFinal   // uniformizamos el título
        }));
        resultado.push(...funcionesCombinadas);
    }
    
    await fs.writeFile(OUTPUT_FILE, JSON.stringify(resultado, null, 2));
    console.log(`✅ Unificación completada. Total funciones: ${resultado.length}`);
    console.log(`   (Se combinaron ${todasFunciones.length} funciones originales en ${resultado.length} registros)`);
}

main();