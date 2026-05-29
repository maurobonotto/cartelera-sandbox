const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

const BASE_URL = 'https://www.cinegaumont.ar';
const OUTPUT_FILE = path.join(__dirname, 'peliculas.json');
const BACKUP_FILE = path.join(__dirname, 'peliculas.backup.json');

// Configuración de TMDB (igual que antes)
const TMDB_API_KEY = process.env.TMDB_API_KEY || '62dff612c354dd50dbff40ca176b461c';
const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';
const MIN_SIMILARITY_SCORE = 70;
const POPULARITY_WEIGHT = 0.33;
const SIMILARITY_EXACT = 100;
const SIMILARITY_PARTIAL = 80;
const BONUS_YEAR = 100;
const BONUS_DIRECTOR = 200;

const MAX_RETRIES = 3;
const RETRY_DELAY = 5000;
const wait = (ms) => new Promise(r => setTimeout(r, ms));

// ---------- Funciones auxiliares ----------
function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatearFecha(isoDate) {
    const date = new Date(isoDate);
    const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const diaSemana = capitalize(dias[date.getDay()]);
    const diaNumero = date.getDate();
    const mes = capitalize(meses[date.getMonth()]);
    const anio = date.getFullYear();
    return `${diaSemana} ${diaNumero}/${mes}/${anio}`;
}

function normalizarTexto(str) {
    if (!str) return '';
    return str
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');
}

// Obtener director desde TMDB (por ID)
async function getDirectorFromTMDB(movieId) {
    try {
        const url = `https://api.themoviedb.org/3/movie/${movieId}/credits?api_key=${TMDB_API_KEY}`;
        const response = await fetch(url);
        if (!response.ok) return null;
        const data = await response.json();
        const director = data.crew?.find(member => member.job === 'Director');
        return director ? normalizarTexto(director.name) : null;
    } catch (error) {
        console.error(`   ❌ Error obteniendo director para ID ${movieId}: ${error.message}`);
        return null;
    }
}

// Buscar póster en TMDB (versión mejorada)
async function getPosterFromTMDB(movieTitle, year = null, directorName = null) {
    if (!TMDB_API_KEY) return '';
    try {
        let url = `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(movieTitle)}&api_key=${TMDB_API_KEY}&language=es&include_adult=false&region=AR&with_original_language=es`;
        if (year) url += `&year=${year}`;
        const response = await fetch(url);
        if (!response.ok) return '';
        const data = await response.json();
        if (!data.results || data.results.length === 0) return '';

        const tituloNormalizado = normalizarTexto(movieTitle);
        const directorNormalizado = directorName ? normalizarTexto(directorName) : null;

        const candidates = [];
        for (const movie of data.results.slice(0, 10)) {
            if (!movie.poster_path) continue;
            const tmdbTitleNorm = normalizarTexto(movie.title);
            const tmdbOriginalTitleNorm = normalizarTexto(movie.original_title || '');
            let similarity = 0;
            if (tmdbTitleNorm === tituloNormalizado || tmdbOriginalTitleNorm === tituloNormalizado) {
                similarity = SIMILARITY_EXACT;
            } else if (tmdbTitleNorm.includes(tituloNormalizado) || tituloNormalizado.includes(tmdbTitleNorm) ||
                       tmdbOriginalTitleNorm.includes(tituloNormalizado) || tituloNormalizado.includes(tmdbOriginalTitleNorm)) {
                similarity = SIMILARITY_PARTIAL;
            }

            let yearMatch = false;
            if (year && movie.release_date) {
                const releaseYear = movie.release_date.substring(0,4);
                if (releaseYear === year.toString()) yearMatch = true;
            }

            let directorMatch = false;
            if (directorNormalizado) {
                const tmdbDirector = await getDirectorFromTMDB(movie.id);
                if (tmdbDirector && tmdbDirector === directorNormalizado) directorMatch = true;
            }

            let score = (movie.popularity || 0) * POPULARITY_WEIGHT + similarity;
            if (yearMatch) score += BONUS_YEAR;
            if (directorMatch) score += BONUS_DIRECTOR;
            candidates.push({ ...movie, score });
        }
        candidates.sort((a, b) => b.score - a.score);

        if (candidates.length > 0 && candidates[0].score >= MIN_SIMILARITY_SCORE) {
            const best = candidates[0];
            console.log(`   ✅ TMDB: "${best.title}" (${best.release_date ? best.release_date.substring(0,4) : '?'}) score=${Math.round(best.score)}`);
            return `${TMDB_IMAGE_BASE_URL}${best.poster_path}`;
        }
        return '';
    } catch (error) {
        console.error(`   ❌ Error en TMDB: ${error.message}`);
        return '';
    }
}

// ========== OBTENER LISTA DE PELÍCULAS DESDE LA API ==========
async function getMoviesListFromAPI() {
    console.log('📋 Obteniendo lista de películas desde la API /films...');
    try {
        const response = await fetch('https://www.cinegaumont.com.ar/films');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        // data es un array de objetos con id y name
        if (!Array.isArray(data)) throw new Error('La respuesta no es un array');
        console.log(`   ✅ Encontradas ${data.length} películas.`);
        // Construir objeto con ID y título (y también construir URL de detalle)
        return data.map(film => ({
            id: film.id,
            titulo: film.name,
            url: `https://www.cinegaumont.ar/pelicula.aspx?filmid=${film.id}`
        }));
    } catch (error) {
        console.error('   ❌ Error al obtener la lista desde la API:', error.message);
        return [];
    }
}

// ========== OBTENER DETALLES DE LA PÁGINA INDIVIDUAL ==========
async function scrapeMovieDetails(page, movie) {
    console.log(`\n🎬 Procesando: ${movie.titulo}`);
    await page.goto(movie.url, { waitUntil: 'networkidle2', timeout: 30000 });
    await wait(1500);

    const details = await page.evaluate(() => {
        // Sinopsis
        const sinopsisElem = document.querySelector('.movie-info-box .description');
        const sinopsis = sinopsisElem ? sinopsisElem.innerText.trim() : 'Sin sinopsis';
        
        // Duración y año
        const yearElem = document.querySelector('.movie-info-box .features .year');
        let duracion = 'N/A';
        let anio = null;
        if (yearElem) {
            const text = yearElem.innerText;
            const matchDur = text.match(/(\d+)\s*min/);
            if (matchDur) duracion = matchDur[1];
            const matchYear = text.match(/\b(19|20)\d{2}\b/);
            if (matchYear) anio = matchYear[0];
        }
        
        // Trailer
        const trailerElem = document.querySelector('.video-player iframe');
        let linkTrailer = trailerElem ? trailerElem.src : '';
        
        // Director
        let director = 'No especificado';
        const sideItems = document.querySelectorAll('.movie-side-info-box ul li');
        for (const item of sideItems) {
            const strong = item.querySelector('strong');
            if (strong && strong.innerText.includes('Dirección')) {
                director = item.innerText.replace(strong.innerText, '').trim();
                break;
            }
        }
        
        // Póster (si la página lo tiene)
        let poster = '';
        const posterImg = document.querySelector('.movie-poster img');
        if (posterImg && posterImg.src) poster = posterImg.src;
        else {
            const metaOg = document.querySelector('meta[property="og:image"]');
            if (metaOg) poster = metaOg.content;
        }
        
        return { sinopsis, duracion, anio, director, linkTrailer, poster };
    });
    return details;
}

// ========== OBTENER HORARIOS DESDE LA API TREE ==========
async function getSchedules(filmId) {
    try {
        const url = `https://www.cinegaumont.com.ar/films/${filmId}/tree`;
        const response = await fetch(url);
        if (!response.ok) return [];
        const data = await response.json();
        const funcionesRaw = [];
        if (data && data.days) {
            for (const [fechaISO, cines] of Object.entries(data.days)) {
                const fechaLegible = formatearFecha(fechaISO);
                for (const cine of cines) {
                    const cineNombre = `${cine.name} (CABA)`;
                    for (const formato of cine.formats) {
                        const idioma = formato.formatDescription || 'Sin especificar';
                        for (const funcion of formato.performances) {
                            funcionesRaw.push({
                                fechaISO: fechaISO,
                                fechaLegible: fechaLegible,
                                cine: cineNombre,
                                ciudad: 'CABA',
                                idioma: idioma,
                                horario: funcion.showTime
                            });
                        }
                    }
                }
            }
        }
        // Ordenar y agrupar
        funcionesRaw.sort((a, b) => new Date(a.fechaISO) - new Date(b.fechaISO));
        const grupos = new Map();
        for (const f of funcionesRaw) {
            const key = `${f.fechaLegible}|${f.cine}|${f.idioma}`;
            if (!grupos.has(key)) {
                grupos.set(key, {
                    fecha: f.fechaLegible,
                    cine: f.cine,
                    ciudad: f.ciudad,
                    idioma: f.idioma,
                    horarios: []
                });
            }
            grupos.get(key).horarios.push(f.horario);
        }
        return Array.from(grupos.values()).map((g, idx) => ({
            id_funcion: `${filmId}_${idx+1}`,
            fecha: g.fecha,
            cine: g.cine,
            ciudad: g.ciudad,
            idioma: g.idioma,
            horarios: g.horarios
        }));
    } catch (error) {
        console.error(`   ❌ Error obteniendo horarios para film ${filmId}: ${error.message}`);
        return [];
    }
}

// ========== FUNCIÓN PRINCIPAL ==========
async function main() {
    console.log('🚀 SCRAPER GAUMONT V3 (lista desde API + detalles por página + horarios)');
    
    // 1. Obtener lista de películas desde la API
    const movies = await getMoviesListFromAPI();
    if (movies.length === 0) {
        console.error('❌ No se encontraron películas en la API.');
        return;
    }

    let browser;
    try {
        browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
        const page = await browser.newPage();
        
        let todasLasFunciones = [];
        for (const movie of movies) {
            // Obtener detalles desde la página individual
            const details = await scrapeMovieDetails(page, movie);
            // Obtener horarios desde API tree
            const funciones = await getSchedules(movie.id);
            
            if (funciones.length === 0) {
                console.log(`   ⚠️ No hay funciones para "${movie.titulo}".`);
                continue;
            }
            
            // Buscar póster en TMDB si no se obtuvo de la página
            let posterUrl = details.poster;
            if (!posterUrl) {
                console.log(`   🖼️ Buscando póster en TMDB para: ${movie.titulo}${details.anio ? ` (${details.anio})` : ''} | Director: ${details.director}`);
                posterUrl = await getPosterFromTMDB(movie.titulo, details.anio, details.director);
                if (posterUrl) console.log(`   ✅ Póster asignado desde TMDB.`);
                else console.log(`   ⚠️ No se asignó póster (se mostrará sin imagen).`);
            } else {
                console.log(`   🖼️ Usando póster de la página individual.`);
            }
            
            // Construir entradas planas
            for (const func of funciones) {
                todasLasFunciones.push({
                    id_funcion: func.id_funcion,
                    titulo: movie.titulo,
                    director: details.director,
                    duracion: details.duracion,
                    cine: func.cine,
                    ciudad: func.ciudad,
                    fecha: func.fecha,
                    idioma: func.idioma,
                    horarios: func.horarios,
                    seccion: 'cartelera',
                    poster: posterUrl,
                    sinopsis: details.sinopsis,
                    linkTrailer: details.linkTrailer
                });
            }
            console.log(`   ✅ ${funciones.length} funciones agregadas.`);
            await wait(500);
        }
        
        await browser.close();
        browser = null;
        
        // Guardar archivos
        await fs.writeFile(OUTPUT_FILE, JSON.stringify(todasLasFunciones, null, 2));
        await fs.writeFile(BACKUP_FILE, JSON.stringify(todasLasFunciones, null, 2));
        console.log(`\n🎉 ¡ÉXITO! ${todasLasFunciones.length} funciones guardadas en ${OUTPUT_FILE}`);
        
    } catch (err) {
        console.error('💥 Error en el scraper:', err);
        if (browser) await browser.close();
        // Intentar restaurar backup
        try {
            const backup = await fs.readFile(BACKUP_FILE, 'utf8');
            await fs.writeFile(OUTPUT_FILE, backup);
            console.log(`✅ Se restauró el backup.`);
        } catch (backupErr) {
            console.error('No hay backup disponible.');
        }
    }
}

main();