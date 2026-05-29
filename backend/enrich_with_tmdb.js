// backend/enrich_with_tmdb.js - Enriquece peliculas.json con datos de TMDB
// Versión mejorada: misma normalización que merge_peliculas.js y preserva datos locales de calidad
const fs = require('fs').promises;
const path = require('path');
const { getTMDBInfo } = require('./tmdb');

const INPUT_FILE = path.join(__dirname, 'peliculas.json');
const OUTPUT_FILE = path.join(__dirname, 'peliculas.json');

// ========== MISMA LÓGICA DE NORMALIZACIÓN QUE merge_peliculas.js ==========
const IGNORAR_SUFIJOS = [
    'sin salida', 'la pelicula', 'la película', 'el regreso',
    '2d', '3d', 'doblada', 'subtitulada', 'sub', 'cast'
];

function normalizarBase(titulo) {
    if (!titulo) return '';
    let t = titulo;
    t = t.replace(/[\(\[].*?[\)\]]/g, '');
    t = t.replace(/\s*[-–—:].*$/, '');
    t = t.replace(/^(the|a|an|la|el|los|las|le|un|una|unos|unas)\s+/i, '');
    t = t.toLowerCase();
    t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    t = t.replace(/[^a-z0-9\s]/g, '');
    t = t.trim().replace(/\s+/g, ' ');
    return t;
}

function eliminarSufijos(tituloBase) {
    let t = tituloBase;
    for (const sufijo of IGNORAR_SUFIJOS) {
        if (t.endsWith(sufijo)) {
            t = t.slice(0, -sufijo.length).trim();
        }
    }
    return t;
}

function normalizarTitulo(titulo) {
    let base = normalizarBase(titulo);
    base = eliminarSufijos(base);
    return base;
}
// ================================================================

async function getMovieDetailsFromTMDB(titulo, anio = null) {
    const { tmdb_id } = await getTMDBInfo(titulo, anio, null);
    if (!tmdb_id) return null;

    const API_KEY = process.env.TMDB_API_KEY;
    const url = `https://api.themoviedb.org/3/movie/${tmdb_id}?api_key=${API_KEY}&language=es&append_to_response=videos,credits`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        if (data.success === false) return null;
        return {
            tmdb_id: data.id,
            sinopsis: data.overview || 'Sin sinopsis disponible',
            linkTrailer: data.videos?.results?.find(v => v.type === 'Trailer')?.key
                ? `https://www.youtube.com/watch?v=${data.videos.results.find(v => v.type === 'Trailer').key}`
                : '',
            director: data.credits?.crew?.find(c => c.job === 'Director')?.name || 'No especificado',
            anio: data.release_date ? data.release_date.split('-')[0] : null,
            pais: data.production_countries?.map(c => c.name).join(', ') || 'No especificado',
            poster: data.poster_path ? `https://image.tmdb.org/t/p/w500${data.poster_path}` : null,
            duracion: data.runtime ? data.runtime.toString() : null
        };
    } catch (error) {
        console.error(`   Error obteniendo detalles de "${titulo}": ${error.message}`);
        return null;
    }
}

async function enrich() {
    console.log('🎨 Enriqueciendo cartelera con datos de TMDB (sobrescribe peliculas.json)...');

    let funciones;
    try {
        const data = await fs.readFile(INPUT_FILE, 'utf8');
        funciones = JSON.parse(data);
    } catch (err) {
        console.error('❌ No se pudo leer peliculas.json. Ejecutá primero el merge.');
        return;
    }

    // Agrupar por título normalizado (igual que en merge)
    const grupos = new Map();
    for (const f of funciones) {
        const clave = normalizarTitulo(f.titulo);
        if (!grupos.has(clave)) {
            grupos.set(clave, { tituloOriginal: f.titulo, funciones: [] });
        }
        grupos.get(clave).funciones.push(f);
    }

    console.log(`📋 ${grupos.size} películas únicas para enriquecer.`);
    let procesadas = 0;

    for (const [clave, grupo] of grupos.entries()) {
        procesadas++;
        console.log(`\n[${procesadas}/${grupos.size}] Buscando: ${grupo.tituloOriginal}`);
        const tmdbData = await getMovieDetailsFromTMDB(grupo.tituloOriginal);

        if (tmdbData) {
            console.log(`   ✅ Encontrado (ID: ${tmdbData.tmdb_id})`);
            for (const func of grupo.funciones) {
                // Solo actualizar si el campo actual es "pobre" (vacío, por defecto o marcador)
                if ((!func.sinopsis || func.sinopsis === 'Sin sinopsis') && tmdbData.sinopsis)
                    func.sinopsis = tmdbData.sinopsis;
                if ((!func.linkTrailer || func.linkTrailer === '') && tmdbData.linkTrailer)
                    func.linkTrailer = tmdbData.linkTrailer;
                if ((!func.director || func.director === 'No especificado') && tmdbData.director && tmdbData.director !== 'No especificado')
                    func.director = tmdbData.director;
                if ((!func.duracion || func.duracion === 'N/A') && tmdbData.duracion)
                    func.duracion = tmdbData.duracion;
                if ((!func.poster || func.poster === '') && tmdbData.poster)
                    func.poster = tmdbData.poster;
                // Opcional: podrías agregar campos nuevos como año o país si tu frontend los usa
                // if (!func.anio && tmdbData.anio) func.anio = tmdbData.anio;
            }
        } else {
            console.log(`   ⚠️ No encontrado en TMDB`);
        }
        // Pequeña pausa para no saturar la API
        await new Promise(r => setTimeout(r, 300));
    }

    // Reconstruir el array final (conservando el orden original, pero los grupos ya mantienen el orden interno)
    const nuevasFunciones = [];
    for (const grupo of grupos.values()) {
        nuevasFunciones.push(...grupo.funciones);
    }

    await fs.writeFile(OUTPUT_FILE, JSON.stringify(nuevasFunciones, null, 2));
    console.log(`\n✅ Enriquecimiento completado. Se actualizó ${INPUT_FILE}`);
}

enrich();