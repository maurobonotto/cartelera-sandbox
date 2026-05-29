const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

const BASE_URL = 'https://www.cinegaumont.ar';
const OUTPUT_FILE = path.join(__dirname, 'peliculas.json');

const wait = (ms) => new Promise(r => setTimeout(r, ms));

// Obtener lista de películas desde el slider principal
async function getMoviesList(page) {
    console.log('📋 Obteniendo lista de películas...');
    await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForSelector('.swiper-slide .name', { timeout: 15000 });

    const movies = await page.evaluate(() => {
        const items = document.querySelectorAll('.swiper-slide');
        const result = [];
        for (const item of items) {
            const titleElem = item.querySelector('.name');
            const linkElem = item.querySelector('.play-btn, .add-btn');
            const taglineElem = item.querySelector('.tagline');
            const posterElem = item.querySelector('.slide-inner');
            
            if (titleElem && linkElem) {
                let posterUrl = '';
                if (posterElem) {
                    const bgStyle = posterElem.getAttribute('data-background') || posterElem.style.backgroundImage;
                    const urlMatch = bgStyle.match(/url\(["']?(.*?)["']?\)/);
                    if (urlMatch && urlMatch[1]) posterUrl = urlMatch[1];
                }
                result.push({
                    titulo: titleElem.innerText.trim(),
                    url: linkElem.href,
                    genero: taglineElem ? taglineElem.innerText.trim() : 'N/A',
                    poster: posterUrl
                });
            }
        }
        return result;
    });
    console.log(`   ✅ Encontradas ${movies.length} películas.`);
    return movies;
}

// Extraer detalles de la página individual y combinar con API de horarios
async function scrapeMovieDetails(page, movie, filmId) {
    console.log(`\n🎬 Procesando: ${movie.titulo}`);
    await page.goto(movie.url, { waitUntil: 'networkidle2', timeout: 30000 });
    await wait(1500);

    const details = await page.evaluate(() => {
        const sinopsisElem = document.querySelector('.movie-info-box .description');
        const sinopsis = sinopsisElem ? sinopsisElem.innerText.trim() : 'Sin sinopsis disponible.';
        
        const duracionElem = document.querySelector('.movie-info-box .features .year');
        let duracion = 'N/A';
        if (duracionElem) {
            const duracionText = duracionElem.innerText;
            const match = duracionText.match(/(\d+)\s*min/);
            if (match) duracion = match[1];
        }
        
        const trailerElem = document.querySelector('.video-player iframe');
        let linkTrailer = '';
        if (trailerElem && trailerElem.src) linkTrailer = trailerElem.src;
        
        let director = 'No especificado';
        const sideInfoItems = document.querySelectorAll('.movie-side-info-box ul li');
        for (const item of sideInfoItems) {
            const strong = item.querySelector('strong');
            if (strong && strong.innerText.includes('Dirección')) {
                director = item.innerText.replace(strong.innerText, '').trim();
                break;
            }
        }
        
        return { sinopsis, duracion, director, linkTrailer };
    });

    // Obtener horarios desde la API
    console.log(`   ⏰ Consultando API de horarios (film ID: ${filmId})...`);
    let funcionesPlanos = [];
    try {
        const apiUrl = `https://www.cinegaumont.com.ar/films/${filmId}/tree`;
        const response = await page.evaluate(async (url) => {
            const res = await fetch(url);
            return await res.json();
        }, apiUrl);
        
        if (response && response.days) {
            for (const [fecha, cines] of Object.entries(response.days)) {
                for (const cine of cines) {
                    const cineNombre = `${cine.name} (CABA)`;
                    for (const formato of cine.formats) {
                        const idioma = formato.formatDescription || 'Sin especificar';
                        for (const funcion of formato.performances) {
                            funcionesPlanos.push({
                                cine: cineNombre,
                                ciudad: 'CABA',
                                fecha: fecha,
                                idioma: idioma,
                                horarios: [funcion.showTime]
                            });
                        }
                    }
                }
            }
            console.log(`   ✅ ${funcionesPlanos.length} funciones generadas.`);
        } else {
            console.log(`   ⚠️ No se encontraron funciones en la API.`);
        }
    } catch (error) {
        console.error(`   ❌ Error al consultar API: ${error.message}`);
    }

    // Generar un objeto por cada función (mismo formato que cartelera_prueba.json)
    const resultados = [];
    let contador = 1;
    for (const func of funcionesPlanos) {
        resultados.push({
            id_funcion: `${filmId}_${contador++}`,
            titulo: movie.titulo,
            director: details.director,
            duracion: details.duracion,
            cine: func.cine,
            ciudad: func.ciudad,
            fecha: func.fecha,
            idioma: func.idioma,
            horarios: func.horarios,
            seccion: "cartelera",
            poster: movie.poster,
            sinopsis: details.sinopsis,
            linkTrailer: details.linkTrailer
        });
    }
    return resultados;
}

async function main() {
    console.log('🚀 INICIANDO SCRAPER PARA CINE GAUMONT (formato plano)');
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();

    try {
        const movies = await getMoviesList(page);
        if (movies.length === 0) throw new Error('No se encontraron películas');

        let todasLasFunciones = [];
        for (const movie of movies) {
            const filmIdMatch = movie.url.match(/filmid=(\d+)/);
            if (!filmIdMatch) {
                console.log(`   ⚠️ No se pudo extraer ID de: ${movie.url}`);
                continue;
            }
            const filmId = parseInt(filmIdMatch[1]);
            
            try {
                const funciones = await scrapeMovieDetails(page, movie, filmId);
                todasLasFunciones.push(...funciones);
                await wait(500);
            } catch (err) {
                console.error(`   ❌ Error en ${movie.titulo}: ${err.message}`);
            }
        }

        await fs.writeFile(OUTPUT_FILE, JSON.stringify(todasLasFunciones, null, 2));
        console.log(`\n🎉 ¡EXITO! Se guardaron ${todasLasFunciones.length} funciones en ${OUTPUT_FILE}`);
        console.log(`   Ahora modificá app.js para que cargue 'backend/peliculas.json'`);
    } catch (error) {
        console.error('💥 Error fatal:', error);
    } finally {
        await browser.close();
    }
}

main();