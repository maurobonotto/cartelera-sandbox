// backend/scraper_cosmos.js
const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, 'peliculas_cosmos.json');

async function scrapeCosmos() {
    console.log('🎬 Scraping Cine Cosmos UBA con Puppeteer...');
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();

    try {
        await page.goto('https://www.cinecosmos.uba.ar/index.php#cartelera', { waitUntil: 'networkidle2', timeout: 30000 });
        // Esperar a que aparezcan las tarjetas de películas
        await page.waitForSelector('.card', { timeout: 10000 });

        // Extraer datos de todas las tarjetas
        const peliculas = await page.evaluate(() => {
            const cards = document.querySelectorAll('.card');
            const resultados = [];

            cards.forEach(card => {
                // Título
                const tituloElem = card.querySelector('.card-title');
                const titulo = tituloElem ? tituloElem.innerText.trim() : '';

                if (!titulo) return;

                // Director
                const directorElem = card.querySelector('.direccion');
                let director = 'No especificado';
                if (directorElem) {
                    director = directorElem.innerText.replace('Dirección:', '').trim();
                }

                // Duración (buscar dentro de .lightText)
                const lightTextElem = card.querySelector('.lightText');
                let duracion = 'N/A';
                if (lightTextElem) {
                    const text = lightTextElem.innerText;
                    const match = text.match(/\/(\d+)\s*min/);
                    if (match) duracion = match[1];
                }

                // Horarios (dentro de .card-footer .textoPeliFooter)
                const footerElem = card.querySelector('.card-footer .textoPeliFooter');
                let horarios = [];
                if (footerElem) {
                    // El contenido puede tener un <span> con los días, luego el texto con horarios
                    const horariosText = footerElem.innerText;
                    // Limpiar: eliminar la parte de los días (antes del | o del texto de días)
                    const horariosLimpio = horariosText.replace(/^[A-Za-zÁÉÍÓÚÑ\s]+\|/, '').trim();
                    horarios = horariosLimpio.split(' - ').map(h => h.trim()).filter(h => /\d{1,2}:\d{2}/.test(h));
                }

                // Póster
                let poster = '';
                const imgElem = card.querySelector('.card-img-top');
                if (imgElem && imgElem.src) {
                    poster = imgElem.src;
                    if (poster.startsWith('/')) poster = 'https://www.cinecosmos.uba.ar' + poster;
                }

                if (horarios.length === 0) return;

                resultados.push({
                    titulo,
                    director,
                    duracion,
                    horarios,
                    poster
                });
            });
            return resultados;
        });

        console.log(`   Encontradas ${peliculas.length} películas con horarios.`);

        // Fecha actual (para el campo "fecha")
        const hoy = new Date();
        const fechaFormateada = `${hoy.toLocaleDateString('es-AR', { weekday: 'long' })} ${hoy.getDate()}/${hoy.toLocaleDateString('es-AR', { month: 'long' })}/${hoy.getFullYear()}`;

        const funciones = peliculas.map((p, idx) => ({
            id_funcion: `cosmos_${Date.now()}_${idx}`,
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
            sinopsis: 'Sin sinopsis disponible',
            linkTrailer: ''
        }));

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

if (require.main === module) {
    scrapeCosmos();
}

module.exports = { scrapeCosmos };