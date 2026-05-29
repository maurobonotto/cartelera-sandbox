const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

const BASE_URL = 'https://www.cinegaumont.ar';
const OUTPUT_FILE = path.join(__dirname, 'peliculas.json');
const BACKUP_FILE = path.join(__dirname, 'peliculas.backup.json');

// ================= CONFIGURACIÓN DE TMDB =================
// 🔑 Tu API key (ya incluida)
const TMDB_API_KEY = '62dff612c354dd50dbff40ca176b461c';
const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';
// =========================================================

const MAX_RETRIES = 3;
const RETRY_DELAY = 5000;
const wait = (ms) => new Promise(r => setTimeout(r, ms));

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

// Búsqueda en TMDB con filtros: año, región AR, idioma original español
async function getPosterFromTMDB(movieTitle, year = null) {
    if (!TMDB_API_KEY) {
        console.warn('   ⚠️ TMDB_API_KEY no configurada');
        return '';
    }
    try {
        // Construimos la URL con los parámetros
        let url = `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(movieTitle)}&api_key=${TMDB_API_KEY}&language=es&include_adult=false&region=AR&with_original_language=es`;
        if (year) {
            url += `&year=${year}`;
        }
        const response = await fetch(url);
        if (!response.ok) {
            console.warn(`   ⚠️ Error ${response.status} en TMDB para "${movieTitle}"`);
            return '';
        }
        const data = await response.json();
        if (data.results && data.results.length > 0) {
            // Filtrar los que tienen póster y ordenar por popularidad
            const candidates = data.results
                .filter(m => m.poster_path)
                .sort((a, b) => b.popularity - a.popularity);
            
            let best = null;
            // Si tenemos año, buscar coincidencia exacta de año de lanzamiento
            if (year) {
                best = candidates.find(m => m.release_date && m.release_date.startsWith(year));
            }
            if (!best && candidates.length > 0) {
                best = candidates[0];
            }
            if (best && best.poster_path) {
                return `${TMDB_IMAGE_BASE_URL}${best.poster_path}`;
            }
        }
        console.warn(`   ⚠️ No se encontró póster en TMDB para: "${movieTitle}"${year ? ` (${year})` : ''}`);
        return '';
    } catch (error) {
        console.error(`   ❌ Error al consultar TMDB: ${error.message}`);
        return '';
    }
}

async function getMoviesList(page) {
    console.log('📋 Obteniendo lista de películas...');
    await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 45000 });
    await page.waitForSelector('.swiper-slide .name', { timeout: 20000 });

    const movies = await page.evaluate(() => {
        const items = document.querySelectorAll('.swiper-slide');
        return Array.from(items).map(item => {
            const titleElem = item.querySelector('.name');
            const linkElem = item.querySelector('.play-btn, .add-btn');
            return {
                titulo: titleElem ? titleElem.innerText.trim() : 'Sin título',
                url: linkElem ? linkElem.href : '',
            };
        }).filter(m => m.url.includes('filmid='));
    });
    console.log(`   ✅ Encontradas ${movies.length} películas.`);
    return movies;
}

async function scrapeMovieDetails(page, movie, filmId) {
    console.log(`\n🎬 Procesando: ${movie.titulo}`);
    await page.goto(movie.url, { waitUntil: 'networkidle2', timeout: 30000 });
    await wait(1500);

    const details = await page.evaluate(() => {
        const sinopsis = document.querySelector('.movie-info-box .description')?.innerText.trim() || 'Sin sinopsis';
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
        const trailerElem = document.querySelector('.video-player iframe');
        let linkTrailer = trailerElem ? trailerElem.src : '';
        let director = 'No especificado';
        const sideItems = document.querySelectorAll('.movie-side-info-box ul li');
        for (const item of sideItems) {
            const strong = item.querySelector('strong');
            if (strong && strong.innerText.includes('Dirección')) {
                director = item.innerText.replace(strong.innerText, '').trim();
                break;
            }
        }
        return { sinopsis, duracion, anio, director, linkTrailer };
    });

    // Horarios desde la API (sin cambios)
    let funcionesRaw = [];
    try {
        const apiUrl = `https://www.cinegaumont.com.ar/films/${filmId}/tree`;
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
        id_funcion: `${filmId}_${idx+1}`,
        titulo: movie.titulo,
        director: details.director,
        duracion: details.duracion,
        cine: g.cine,
        ciudad: g.ciudad,
        fecha: g.fecha,
        idioma: g.idioma,
        horarios: g.horarios,
        seccion: 'cartelera',
        poster: '',
        sinopsis: details.sinopsis,
        linkTrailer: details.linkTrailer
    }));
    
    return { funciones: funcionesPlanos, anio: details.anio };
}

async function main() {
    console.log('🚀 SCRAPER GAUMONT + TMDB (con año, país AR e idioma español)');
    
    if (!TMDB_API_KEY || TMDB_API_KEY === '') {
        console.error('❌ Error: TMDB_API_KEY no está definida.');
        return;
    }

    for (let intento = 1; intento <= MAX_RETRIES; intento++) {
        const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
        const page = await browser.newPage();
        try {
            const movies = await getMoviesList(page);
            if (movies.length === 0) throw new Error('No se encontraron películas');
            
            let todasLasFunciones = [];
            for (const movie of movies) {
                const idMatch = movie.url.match(/filmid=(\d+)/);
                if (!idMatch) continue;
                const filmId = parseInt(idMatch[1]);
                
                const { funciones, anio } = await scrapeMovieDetails(page, movie, filmId);
                
                console.log(`   🖼️ Buscando póster en TMDB para: ${movie.titulo}${anio ? ` (${anio})` : ''} [AR, español]`);
                const posterUrl = await getPosterFromTMDB(movie.titulo, anio);
                if (posterUrl) {
                    console.log(`   ✅ Póster encontrado.`);
                } else {
                    console.log(`   ⚠️ No se encontró póster.`);
                }
                
                const funcionesConPoster = funciones.map(func => ({
                    ...func,
                    poster: posterUrl
                }));
                
                todasLasFunciones.push(...funcionesConPoster);
                await wait(500);
            }
            
            await fs.writeFile(OUTPUT_FILE, JSON.stringify(todasLasFunciones, null, 2));
            await fs.writeFile(BACKUP_FILE, JSON.stringify(todasLasFunciones, null, 2));
            console.log(`\n🎉 ¡ÉXITO! ${todasLasFunciones.length} funciones guardadas en ${OUTPUT_FILE}`);
            await browser.close();
            return;
        } catch (err) {
            console.error(`Intento ${intento} falló: ${err.message}`);
            await browser.close();
            if (intento < MAX_RETRIES) {
                console.log(`Reintentando en ${RETRY_DELAY/1000} segundos...`);
                await wait(RETRY_DELAY);
            } else {
                console.log('❌ Todos los intentos fallaron. Usando backup si existe...');
                try {
                    const backup = await fs.readFile(BACKUP_FILE, 'utf8');
                    await fs.writeFile(OUTPUT_FILE, backup);
                    console.log(`✅ Se restauró el backup.`);
                } catch (backupErr) {
                    console.error('No hay backup disponible.');
                }
            }
        }
    }
}

main();