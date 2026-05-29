const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

const BASE_URL = 'https://www.cinegaumont.ar';
const OUTPUT_FILE = path.join(__dirname, 'peliculas.json');
const BACKUP_FILE = path.join(__dirname, 'peliculas.backup.json');
const MAX_RETRIES = 3;
const RETRY_DELAY = 5000;

const wait = (ms) => new Promise(r => setTimeout(r, ms));

// Capitalizar primera letra
function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// Formatear fecha ISO a string legible con mayúscula inicial
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

async function getMoviesList(page) {
    console.log('📋 Obteniendo lista de películas...');
    await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 45000 });
    await page.waitForSelector('.swiper-slide .name', { timeout: 20000 });

    const movies = await page.evaluate(() => {
        const items = document.querySelectorAll('.swiper-slide');
        return Array.from(items).map(item => {
            const titleElem = item.querySelector('.name');
            const linkElem = item.querySelector('.play-btn, .add-btn');
            const posterElem = item.querySelector('.slide-inner');
            let posterUrl = '';
            if (posterElem) {
                const bgStyle = posterElem.getAttribute('data-background') || posterElem.style.backgroundImage;
                const match = bgStyle.match(/url\(["']?(.*?)["']?\)/);
                if (match && match[1]) posterUrl = match[1];
            }
            return {
                titulo: titleElem ? titleElem.innerText.trim() : 'Sin título',
                url: linkElem ? linkElem.href : '',
                poster: posterUrl
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
        let poster = '';
        const posterImg = document.querySelector('.movie-poster img');
        if (posterImg && posterImg.src) poster = posterImg.src;
        else {
            const metaOg = document.querySelector('meta[property="og:image"]');
            if (metaOg) poster = metaOg.content;
        }
        
        const sinopsis = document.querySelector('.movie-info-box .description')?.innerText.trim() || 'Sin sinopsis';
        const duracionElem = document.querySelector('.movie-info-box .features .year');
        let duracion = 'N/A';
        if (duracionElem) {
            const match = duracionElem.innerText.match(/(\d+)\s*min/);
            if (match) duracion = match[1];
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
        return { poster, sinopsis, duracion, director, linkTrailer };
    });

    // Obtener horarios desde API
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
        console.error(`   ❌ Error en API: ${err.message}`);
        return [];
    }

    // Ordenar por fechaISO ascendente (de hoy hacia adelante)
    funcionesRaw.sort((a, b) => new Date(a.fechaISO) - new Date(b.fechaISO));
    
    // Agrupar por fechaLegible + cine + idioma
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
    
    // Convertir a array de funciones planas
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
        poster: details.poster || movie.poster,
        sinopsis: details.sinopsis,
        linkTrailer: details.linkTrailer
    }));
    
    console.log(`   ✅ ${funcionesPlanos.length} funciones generadas (ordenadas por fecha).`);
    return funcionesPlanos;
}

async function main() {
    console.log('🚀 SCRAPER GAUMONT CON FECHAS ORDENADAS Y MAYÚSCULAS');
    
    for (let intento = 1; intento <= MAX_RETRIES; intento++) {
        const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
        const page = await browser.newPage();
        try {
            const movies = await getMoviesList(page);
            if (movies.length === 0) throw new Error('No se encontraron películas');
            
            let todas = [];
            for (const movie of movies) {
                const idMatch = movie.url.match(/filmid=(\d+)/);
                if (!idMatch) continue;
                const filmId = parseInt(idMatch[1]);
                const funciones = await scrapeMovieDetails(page, movie, filmId);
                todas.push(...funciones);
                await wait(500);
            }
            
            await fs.writeFile(OUTPUT_FILE, JSON.stringify(todas, null, 2));
            await fs.writeFile(BACKUP_FILE, JSON.stringify(todas, null, 2));
            console.log(`\n🎉 ÉXITO! ${todas.length} funciones guardadas en ${OUTPUT_FILE}`);
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
                    console.log(`✅ Se restauró el backup. El frontend usará datos no actualizados.`);
                } catch (backupErr) {
                    console.error('No hay backup disponible.');
                }
            }
        }
    }
}

main();