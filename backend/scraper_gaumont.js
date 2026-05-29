const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');
const { getPosterFromTMDB } = require('./tmdb');  // Importamos la función común

const BASE_URL = 'https://www.cinegaumont.ar';
const OUTPUT_FILE = path.join(__dirname, 'peliculas_gaumont.json');
const BACKUP_FILE = path.join(__dirname, 'peliculas_gaumont.backup.json');

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

// Obtener lista de películas desde la API /films (obtiene todas las películas, sin detalles)
async function getMoviesListFromAPI() {
    console.log('📋 Obteniendo lista de películas desde la API /films...');
    try {
        const response = await fetch('https://www.cinegaumont.com.ar/films');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!Array.isArray(data)) throw new Error('La respuesta no es un array');
        console.log(`   ✅ Encontradas ${data.length} películas.`);
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

// Obtener detalles desde la página individual (sinopsis, duración, año, director, trailer, póster)
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

    // Horarios desde la API tree
    let funcionesRaw = [];
    try {
        const apiUrl = `https://www.cinegaumont.com.ar/films/${movie.id}/tree`;
        const response = await page.evaluate(async (url) => {
            const res = await fetch(url);
            return await res.json();
        }, apiUrl);

        if (response && response.days) {
            for (const [fechaISO, cines] of Object.entries(response.days)) {
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
    } catch (err) {
        console.error(`   ❌ Error en API de Gaumont: ${err.message}`);
        return [];
    }

    // Ordenar y agrupar funciones
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

    const funcionesPlanos = Array.from(grupos.values()).map((g, idx) => ({
        id_funcion: `${movie.id}_${idx + 1}`,
        titulo: movie.titulo,
        director: details.director,
        duracion: details.duracion,
        cine: g.cine,
        ciudad: g.ciudad,
        fecha: g.fecha,
        idioma: g.idioma,
        horarios: g.horarios,
        seccion: 'cartelera',
        poster: '', // se asignará más tarde (TMDB)
        sinopsis: details.sinopsis,
        linkTrailer: details.linkTrailer
    }));

    return { funciones: funcionesPlanos, anio: details.anio, director: details.director, posterOriginal: details.poster };
}

// Función principal
async function main() {
    console.log('🚀 SCRAPER GAUMONT (con TMDB centralizado)');
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();

    try {
        const movies = await getMoviesListFromAPI();
        if (movies.length === 0) throw new Error('No se encontraron películas en la API');

        let todasLasFunciones = [];
        for (const movie of movies) {
            const { funciones, anio, director, posterOriginal } = await scrapeMovieDetails(page, movie);
            if (funciones.length === 0) {
                console.log(`   ⚠️ No hay funciones para "${movie.titulo}".`);
                continue;
            }

            // Buscar póster en TMDB (usamos título, año y director)
            console.log(`   🖼️ Buscando póster en TMDB para: ${movie.titulo}${anio ? ` (${anio})` : ''} | Director: ${director}`);
            const tmdbPoster = await getPosterFromTMDB(movie.titulo, anio, director);
            const posterFinal = tmdbPoster || posterOriginal; // fallback al póster de la página si TMDB no da

            const funcionesConPoster = funciones.map(func => ({
                ...func,
                poster: posterFinal
            }));

            todasLasFunciones.push(...funcionesConPoster);
            await wait(500);
        }

        await fs.writeFile(OUTPUT_FILE, JSON.stringify(todasLasFunciones, null, 2));
        await fs.writeFile(BACKUP_FILE, JSON.stringify(todasLasFunciones, null, 2));
        console.log(`\n🎉 ¡ÉXITO! ${todasLasFunciones.length} funciones guardadas en ${OUTPUT_FILE}`);
    } catch (err) {
        console.error('💥 Error en el scraper de Gaumont:', err);
        // Intentar restaurar backup
        try {
            const backup = await fs.readFile(BACKUP_FILE, 'utf8');
            await fs.writeFile(OUTPUT_FILE, backup);
            console.log(`✅ Se restauró el backup.`);
        } catch (backupErr) {
            console.error('No hay backup disponible.');
        }
    } finally {
        await browser.close();
    }
}

main();