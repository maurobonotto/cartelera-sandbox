const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, 'peliculas_cosmos.json');

function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// Obtener lista de películas desde la página principal (solo IDs y títulos)
async function getMoviesList(page) {
    await page.goto('https://www.cinecosmos.uba.ar/index.php#cartelera', { waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForSelector('.card', { timeout: 10000 });

    const movies = await page.evaluate(() => {
        const cards = document.querySelectorAll('.card');
        const result = [];
        cards.forEach(card => {
            const link = card.querySelector('a');
            if (!link) return;
            const href = link.href;
            const match = href.match(/idPelicula=(\d+)/);
            if (!match) return;
            const id = match[1];
            const tituloElem = card.querySelector('.card-title');
            const titulo = tituloElem ? tituloElem.innerText.trim() : 'Sin título';
            result.push({ id, titulo });
        });
        return result;
    });
    console.log(`   Encontradas ${movies.length} películas en cartelera.`);
    return movies;
}

// Extraer datos de la página de detalle de una película
async function scrapeMovieDetails(page, movie) {
    console.log(`   Procesando: ${movie.titulo}`);
    const url = `https://www.cinecosmos.uba.ar/?c=main&a=Detalle&idPelicula=${movie.id}`;
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForSelector('body', { timeout: 5000 });

    const details = await page.evaluate(() => {
        // Director: buscar en algún elemento que contenga "Dirección"
        let director = 'No especificado';
        const dirElem = document.querySelector('.direccion, .director, [class*="direc"]');
        if (dirElem) {
            director = dirElem.innerText.replace('Dirección:', '').trim();
        } else {
            // Buscar en toda la página un patrón "Dirección: ..."
            const bodyText = document.body.innerText;
            const match = bodyText.match(/Dirección:\s*([^\n]+)/);
            if (match) director = match[1].trim();
        }

        // Duración
        let duracion = 'N/A';
        const bodyText = document.body.innerText;
        const durMatch = bodyText.match(/(\d+)\s*min/);
        if (durMatch) duracion = durMatch[1];

        // Sinopsis
        let sinopsis = 'Sin sinopsis disponible';
        const sinopsisSelectors = ['.sinopsis', '.description', '.movie-description', '.synopsis', '.texto-sinopsis', '#sinopsis', '.content p'];
        for (const sel of sinopsisSelectors) {
            const elem = document.querySelector(sel);
            if (elem && elem.innerText.trim().length > 50) {
                sinopsis = elem.innerText.trim();
                break;
            }
        }
        if (sinopsis === 'Sin sinopsis disponible') {
            const meta = document.querySelector('meta[name="description"]');
            if (meta && meta.content) sinopsis = meta.content;
        }

        // Trailer
        let linkTrailer = '';
        const iframe = document.querySelector('iframe[src*="youtube"], iframe[src*="youtu.be"]');
        if (iframe && iframe.src) linkTrailer = iframe.src;

        // Póster (imagen grande de la página de detalle, si existe)
        let poster = '';
        const posterImg = document.querySelector('.card-img-top, .movie-poster img, .poster img');
        if (posterImg && posterImg.src) poster = posterImg.src;
        if (poster && poster.startsWith('/')) poster = 'https://www.cinecosmos.uba.ar' + poster;

        // Horarios (en la página de detalle, a veces están en un bloque específico)
        let horarios = [];
        const horariosElem = document.querySelector('.horarios, .schedule, .showtimes');
        if (horariosElem) {
            const horariosText = horariosElem.innerText;
            const matches = horariosText.match(/\d{1,2}:\d{2}/g);
            if (matches) horarios = [...new Set(matches)];
        }
        // Si no se encontraron, buscar en toda la página
        if (horarios.length === 0) {
            const allTimes = document.body.innerText.match(/\d{1,2}:\d{2}/g);
            if (allTimes) horarios = [...new Set(allTimes)];
        }

        return { director, duracion, sinopsis, linkTrailer, poster, horarios };
    });

    // Fecha actual (para el campo "fecha")
    const hoy = new Date();
    const diaSemana = capitalize(hoy.toLocaleDateString('es-AR', { weekday: 'long' }));
    const mes = capitalize(hoy.toLocaleDateString('es-AR', { month: 'long' }));
    const fechaFormateada = `${diaSemana} ${hoy.getDate()}/${mes}/${hoy.getFullYear()}`;

    // Si no se encontraron horarios en la página de detalle, intentamos obtenerlos de la página principal (como fallback)
    let finalHorarios = details.horarios;
    if (finalHorarios.length === 0) {
        // Volver a la página principal y extraer horarios de la tarjeta
        await page.goto('https://www.cinecosmos.uba.ar/index.php#cartelera', { waitUntil: 'networkidle2', timeout: 30000 });
        const horariosFromCard = await page.evaluate((id) => {
            const card = document.querySelector(`.card a[href*="idPelicula=${id}"]`)?.closest('.card');
            if (!card) return [];
            const footer = card.querySelector('.card-footer .textoPeliFooter');
            if (!footer) return [];
            let horariosText = footer.innerText;
            horariosText = horariosText.replace(/^[A-Za-zÁÉÍÓÚÑ\s]+\|/, '').trim();
            return horariosText.split(' - ').map(h => h.trim()).filter(h => /\d{1,2}:\d{2}/.test(h));
        }, movie.id);
        finalHorarios = horariosFromCard;
    }

    if (finalHorarios.length === 0) {
        console.log(`   ⚠️ No se encontraron horarios para "${movie.titulo}", se omite.`);
        return null;
    }

    // Generar una entrada por cada horario (formato plano)
    const funciones = finalHorarios.map((horario, idx) => ({
        id_funcion: `cosmos_${movie.id}_${Date.now()}_${idx}`,
        titulo: movie.titulo,
        director: details.director,
        duracion: details.duracion,
        cine: 'Cine Cosmos UBA',
        ciudad: 'CABA',
        fecha: fechaFormateada,
        idioma: 'Idioma original con subtítulos', // Podría extraerse de la página si existe
        horarios: [horario],
        seccion: 'cartelera',
        poster: details.poster,
        sinopsis: details.sinopsis,
        linkTrailer: details.linkTrailer
    }));

    console.log(`   ✅ ${funciones.length} funciones agregadas.`);
    return funciones;
}

async function main() {
    console.log('🚀 Scraping Cine Cosmos UBA (modo Gaumont)');
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();

    try {
        const movies = await getMoviesList(page);
        if (movies.length === 0) throw new Error('No se encontraron películas en la cartelera');

        let todasLasFunciones = [];
        for (const movie of movies) {
            const funciones = await scrapeMovieDetails(page, movie);
            if (funciones) todasLasFunciones.push(...funciones);
            // Pequeña pausa entre películas
            await new Promise(r => setTimeout(r, 500));
        }

        await fs.writeFile(OUTPUT_FILE, JSON.stringify(todasLasFunciones, null, 2));
        console.log(`✅ Cosmos: ${todasLasFunciones.length} funciones guardadas en ${OUTPUT_FILE}`);
    } catch (error) {
        console.error('❌ Error en scraper de Cosmos:', error);
    } finally {
        await browser.close();
    }
}

if (require.main === module) {
    main();
}

module.exports = { /* si se necesita exportar algo */ };