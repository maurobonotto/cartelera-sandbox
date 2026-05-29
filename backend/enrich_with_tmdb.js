// backend/enrich_with_tmdb.js - Enriquece peliculas.json con datos de TMDB
const fs = require('fs').promises;
const path = require('path');
const { getTMDBInfo } = require('./tmdb');

const INPUT_FILE = path.join(__dirname, 'peliculas.json');
const OUTPUT_FILE = path.join(__dirname, 'peliculas.json'); // Sobrescribe el mismo

function normalizarTitulo(titulo) {
    if (!titulo) return '';
    let t = titulo;
    t = t.replace(/[\(\[].*?[\)\]]/g, '');
    t = t.replace(/\s*[-–—:].*$/, '');
    t = t.toLowerCase();
    t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    t = t.replace(/[^a-z0-9\s]/g, '');
    return t.trim().replace(/\s+/g, ' ');
}

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
    
    // Agrupar por título normalizado
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
                if (tmdbData.sinopsis) func.sinopsis = tmdbData.sinopsis;
                if (tmdbData.linkTrailer) func.linkTrailer = tmdbData.linkTrailer;
                if (tmdbData.director && tmdbData.director !== 'No especificado') func.director = tmdbData.director;
                if (tmdbData.duracion) func.duracion = tmdbData.duracion;
                if (tmdbData.poster) func.poster = tmdbData.poster;
                // Opcional: si querés agregar año, país, etc., podés agregarlos como campos nuevos
                // pero el frontend actual no los muestra.
            }
        } else {
            console.log(`   ⚠️ No encontrado en TMDB`);
        }
        await new Promise(r => setTimeout(r, 300));
    }
    
    // Reconstruir array
    const nuevasFunciones = [];
    for (const grupo of grupos.values()) {
        nuevasFunciones.push(...grupo.funciones);
    }
    
    await fs.writeFile(OUTPUT_FILE, JSON.stringify(nuevasFunciones, null, 2));
    console.log(`\n✅ Enriquecimiento completado. Se actualizó ${INPUT_FILE}`);
}

enrich();