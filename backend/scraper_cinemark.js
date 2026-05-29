// backend/scraper_cinemark.js
const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');
const { getPosterFromTMDB } = require('./tmdb');

const OUTPUT_FILE = path.join(__dirname, 'peliculas_cinemark.json');
const HOME_URL = 'https://www.cinemark.com.ar/';

function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatearFecha(date) {
    const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const diaSemana = capitalize(dias[date.getDay()]);
    const diaNumero = date.getDate();
    const mes = capitalize(meses[date.getMonth()]);
    const anio = date.getFullYear();
    return `${diaSemana} ${diaNumero}/${mes}/${anio}`;
}

async function getMoviesList(page) {
    console.log('📋 Obteniendo lista de películas desde la página principal...');
    await page.goto(HOME_URL, { waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForSelector('.default-card', { timeout: 10000 });

    const movies = await page.evaluate(() => {
        const cards = document.querySelectorAll('.default-card');
        const results = [];
        cards.forEach(card => {
            const titleElem = card.querySelector('.MuiTypography-h3');
            const title = titleElem ? titleElem.innerText.trim() : '';
            if (!title) return;

            const linkElem = card.closest('a');
            let slug = '';
            if (linkElem && linkElem.href) {
                const match = linkElem.href.match(/\/pelicula\/([^\/]+)/);
                if (match) slug = match[1];
            }
            if (!slug) return;

            const duracionElem = card.querySelector('.MuiChip-label');
            let duracion = 'N/A';
            if (duracionElem) {
                const durText = duracionElem.innerText;
                const horas = durText.match(/(\d+)h/);
                const minutos = durText.match(/(\d+)m/);
                let total = 0;
                if (horas) total += parseInt(horas[1]) * 60;
                if (minutos) total += parseInt(minutos[1]);
                if (total) duracion = total.toString();
            }

            const posterElem = card.querySelector('img');
            const poster = posterElem ? posterElem.src : '';

            results.push({ title, slug, duracion, poster });
        });
        return results;
    });
    console.log(`   ✅ Encontradas ${movies.length} películas.`);
    return movies;
}

async function scrapeHorarios(page, slug) {
    const url = `https://www.cinemark.com.ar/pelicula/${slug}`;
    console.log(`   Navegando a: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Esperar un poco más a que carguen los horarios (puede que se carguen después)
    await page.waitForTimeout(3000);
    
    // Esperar a que aparezca algún elemento que contenga horarios
    try {
        await page.waitForSelector('.mui-30g0zv, .MuiBox-root[data-testid="sessions"] .MuiBox-root', { timeout: 15000 });
    } catch (e) {
        console.log(`   ⚠️ No se encontraron horarios para ${slug}`);
        // Guardar HTML para depuración
        const html = await page.content();
        await fs.writeFile(`debug_${slug}.html`, html);
        console.log(`   🔍 Se guardó debug_${slug}.html para inspección`);
        return [];
    }

    const funciones = await page.evaluate(() => {
        const resultados = [];
        
        // Intentar varios selectores posibles para los bloques de funciones
        let bloques = document.querySelectorAll('.mui-30g0zv');
        if (bloques.length === 0) {
            bloques = document.querySelectorAll('[data-testid="sessions"] .MuiBox-root .MuiBox-root');
        }
        if (bloques.length === 0) {
            bloques = document.querySelectorAll('.MuiBox-root .MuiBox-root');
        }
        
        // Obtener nombre del cine principal
        let cinePrincipal = 'Cinemark';
        const cineElem = document.querySelector('[data-testid="sessions"] .MuiTypography-h2 span');
        if (cineElem) cinePrincipal = cineElem.innerText.trim();
        
        // Obtener fecha activa
        let fecha = new Date();
        const fechaElem = document.querySelector('.date-carousel-item.MuiBox-root.mui-14kdikd .mui-72xrrh');
        if (fechaElem) {
            const fechaStr = fechaElem.innerText.trim();
            const partes = fechaStr.split('/');
            if (partes.length === 2) {
                fecha = new Date(new Date().getFullYear(), parseInt(partes[1]) - 1, parseInt(partes[0]));
            }
        }
        const fechaFormateada = `${fecha.toLocaleDateString('es-AR', { weekday: 'long' })} ${fecha.getDate()}/${fecha.toLocaleDateString('es-AR', { month: 'long' })}/${fecha.getFullYear()}`;
        
        // Extraer horarios de cada bloque
        bloques.forEach(bloque => {
            // Buscar formato e idioma dentro del bloque
            let formato = '';
            let idioma = '';
            
            // Primero buscar en .mui-tp7fb9
            const formatoContainer = bloque.querySelector('.mui-tp7fb9');
            if (formatoContainer) {
                const formatElem = formatoContainer.querySelector('p:first-child');
                if (formatElem) formato = formatElem.innerText.trim();
                const idiomaElem = formatoContainer.querySelector('.mui-1xj2a7k');
                if (idiomaElem) idioma = idiomaElem.innerText.trim().replace('·', '').trim();
            } else {
                // Buscar cualquier párrafo que pueda contener formato o idioma
                const parrafos = bloque.querySelectorAll('p');
                parrafos.forEach(p => {
                    const texto = p.innerText.trim();
                    if (texto.includes('2D') || texto.includes('3D') || texto.includes('4D') || texto.includes('DBOX') || texto.includes('XD')) {
                        formato = texto;
                    } else if (texto === 'CASTELLANO' || texto === 'SUBTITULADA') {
                        idioma = texto;
                    }
                });
            }
            
            if (idioma === 'CASTELLANO') idioma = 'Doblada';
            else if (idioma === 'SUBTITULADA') idioma = 'Subtitulada';
            
            // Buscar horarios dentro del bloque
            let horarios = [];
            const horariosElements = bloque.querySelectorAll('.mui-19midw5 .mui-aiec9m, .mui-19midw5 p, .MuiTypography-body2');
            if (horariosElements.length === 0) {
                // Buscar cualquier texto que parezca hora
                const textoBloque = bloque.innerText;
                const horaRegex = /\b(\d{1,2}:\d{2})\b/g;
                let match;
                while ((match = horaRegex.exec(textoBloque)) !== null) {
                    horarios.push(match[1]);
                }
            } else {
                horarios = Array.from(horariosElements).map(el => el.innerText.trim().replace('hs', '')).filter(h => h.match(/\d{1,2}:\d{2}/));
            }
            
            if (horarios.length > 0) {
                resultados.push({
                    cine: cinePrincipal,
                    fecha: fechaFormateada,
                    formato: formato,
                    idioma: idioma || (horarios.length > 0 ? 'Doblada' : ''),
                    horarios: [...new Set(horarios)]
                });
            }
        });
        
        // Si no se encontraron resultados, hacer un último intento: buscar cualquier hora en toda la página
        if (resultados.length === 0) {
            const allText = document.body.innerText;
            const horas = allText.match(/\b(\d{1,2}:\d{2})\b/g) || [];
            if (horas.length > 0) {
                resultados.push({
                    cine: cinePrincipal,
                    fecha: fechaFormateada,
                    formato: '',
                    idioma: 'Doblada',
                    horarios: [...new Set(horas)]
                });
            }
        }
        
        return resultados;
    });
    
    return funciones;
}

async function scrapeCinemark() {
    console.log('🎬 Scraping Cinemark (con espera mejorada)');
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();

    try {
        const movies = await getMoviesList(page);
        if (movies.length === 0) throw new Error('No se encontraron películas');

        const todasFunciones = [];
        let idCounter = 1;

        for (const movie of movies) {
            console.log(`\n🎬 Procesando: ${movie.title}`);
            const horariosRaw = await scrapeHorarios(page, movie.slug);
            if (horariosRaw.length === 0) {
                console.log(`   ⚠️ Sin horarios, omitida.`);
                continue;
            }

            const tmdbPoster = await getPosterFromTMDB(movie.title);
            const posterFinal = tmdbPoster || movie.poster;

            for (const f of horariosRaw) {
                todasFunciones.push({
                    id_funcion: `cinemark_${movie.slug}_${idCounter++}`,
                    titulo: movie.title,
                    director: 'No especificado',
                    duracion: movie.duracion,
                    cine: f.cine,
                    ciudad: 'CABA',
                    fecha: f.fecha,
                    idioma: f.idioma,
                    horarios: f.horarios,
                    seccion: 'cartelera',
                    poster: posterFinal,
                    sinopsis: 'Sin sinopsis disponible',
                    linkTrailer: ''
                });
            }
            console.log(`   ✅ ${horariosRaw.length} grupos de funciones generados.`);
            await new Promise(r => setTimeout(r, 500));
        }

        await fs.writeFile(OUTPUT_FILE, JSON.stringify(todasFunciones, null, 2));
        console.log(`✅ Cinemark: ${todasFunciones.length} funciones guardadas en ${OUTPUT_FILE}`);
        return todasFunciones;
    } catch (error) {
        console.error('❌ Error en scraper de Cinemark:', error);
        return [];
    } finally {
        await browser.close();
    }
}

if (require.main === module) scrapeCinemark();
module.exports = { scrapeCinemark };