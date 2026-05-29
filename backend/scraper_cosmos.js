const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, 'peliculas_cosmos.json');

function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// Extraer datos de la página de detalle de una película
async function scrapeMovieDetails(page, peliculaId) {
    const url = `https://www.cinecosmos.uba.ar/?c=main&a=Detalle&idPelicula=${peliculaId}`;
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    // Esperar a que cargue la sinopsis
    await page.waitForSelector('.sinopsis, .description, .movie-description', { timeout: 5000 }).catch(() => null);
    const details = await page.evaluate(() => {
        // Sinopsis: intentar varios selectores comunes
        let sinopsis = 'Sin sinopsis disponible';
        const sinopsisElem = document.querySelector('.sinopsis, .description, .movie-description, .synopsis');
        if (sinopsisElem) sinopsis = sinopsisElem.innerText.trim();

        // Trailer: buscar iframe de YouTube
        let linkTrailer = '';
        const iframe = document.querySelector('iframe[src*="youtube"], iframe[src*="youtu.be"]');
        if (iframe && iframe.src) linkTrailer = iframe.src;

        return { sinopsis, linkTrailer };
    });
    return details;
}

async function scrapeCosmos() {
    console.log('🎬 Scraping Cine Cosmos UBA (con sinopsis y trailer)...');
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();

    try {
        // 1. Obtener lista de películas desde la página principal
        await page.goto('https://www.cinecosmos.uba.ar/index.php#cartelera', { waitUntil: 'networkidle2', timeout: 30000 });
        await page.waitForSelector('.card', { timeout: 10000 });

        const peliculasBase = await page.evaluate(() => {
            const cards = document.querySelectorAll('.card');
            const resultados = [];
            cards.forEach(card => {
                const tituloElem = card.querySelector('.card-title');
                const titulo = tituloElem ? tituloElem.innerText.trim() : '';
                if (!titulo) return;

                // Obtener ID desde el enlace del título
                const linkElem = card.querySelector('a');
                let peliculaId = null;
                if (linkElem && linkElem.href) {
                    const match = linkElem.href.match(/idPelicula=(\d+)/);
                    if (match) peliculaId = match[1];
                }
                if (!peliculaId) return;

                const directorElem = card.querySelector('.direccion');
                let director = 'No especificado';
                if (directorElem) {
                    director = directorElem.innerText.replace('Dirección:', '').trim();
                }

                let duracion = 'N/A';
                const lightTextElem = card.querySelector('.lightText');
                if (lightTextElem) {
                    const text = lightTextElem.innerText;
                    const match = text.match(/(\d+)\s*min/);
                    if (match) duracion = match[1];
                }

                const footerElem = card.querySelector('.card-footer .textoPeliFooter');
                let horarios = [];
                if (footerElem) {
                    const horariosText = footerElem.innerText;
                    const horariosLimpio = horariosText.replace(/^[A-Za-zÁÉÍÓÚÑ\s]+\|/, '').trim();
                    horarios = horariosLimpio.split(' - ').map(h => h.trim()).filter(h => /\d{1,2}:\d{2}/.test(h));
                }

                let poster = '';
                const imgElem = card.querySelector('.card-img-top');
                if (imgElem && imgElem.src) {
                    poster = imgElem.src;
                    if (poster.startsWith('/')) poster = 'https://www.cinecosmos.uba.ar' + poster;
                }

                if (horarios.length === 0) return;

                resultados.push({ titulo, director, duracion, horarios, poster, peliculaId });
            });
            return resultados;
        });

        console.log(`   Encontradas ${peliculasBase.length} películas base.`);

        // 2. Para cada película, obtener sinopsis y trailer de su página de detalle
        const funciones = [];
        const hoy = new Date();
        const diaSemana = capitalize(hoy.toLocaleDateString('es-AR', { weekday: 'long' }));
        const mes = capitalize(hoy.toLocaleDateString('es-AR', { month: 'long' }));
        const fechaFormateada = `${diaSemana} ${hoy.getDate()}/${mes}/${hoy.getFullYear()}`;

        for (let i = 0; i < peliculasBase.length; i++) {
            const p = peliculasBase[i];
            console.log(`   Procesando: ${p.titulo} (ID: ${p.peliculaId})`);
            const details = await scrapeMovieDetails(page, p.peliculaId);
            funciones.push({
                id_funcion: `cosmos_${p.peliculaId}_${Date.now()}_${i}`,
                titulo: p.titulo,
                director: p.director,
                duracion: p.duracion,
                cine: 'Cine Cosmos UBA',
                ciudad: 'CABA',
                fecha: fechaFormateada,
                idioma: 'Idioma original con subtítulos',
                horarios: p.horarios,
                seccion: 'cartelera',
                poster: p.poster,
                sinopsis: details.sinopsis,
                linkTrailer: details.linkTrailer
            });
            // Pequeña pausa entre detalles para no sobrecargar el servidor
            await new Promise(r => setTimeout(r, 500));
        }

        await fs.writeFile(OUTPUT_FILE, JSON.stringify(funciones, null, 2));
        console.log(`✅ Cosmos: ${funciones.length} funciones guardadas en ${OUTPUT_FILE}`);
        return funciones;
    } catch (error) {
        console.error('❌ Error en scraper de Cosmos:', error);
        return [];
    } finally {
        await browser.close();
    }
}

if (require.main === module) scrapeCosmos();
module.exports = { scrapeCosmos };