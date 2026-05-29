const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');
const { getPosterFromTMDB } = require('./tmdb');

const OUTPUT_FILE = path.join(__dirname, 'peliculas_cosmos.json');

function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

async function scrapeCosmos() {
    console.log('🎬 Scraping Cine Cosmos UBA (con póster mejorado por TMDB)');
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();

    try {
        await page.goto('https://www.cinecosmos.uba.ar/index.php#cartelera', { waitUntil: 'networkidle2', timeout: 30000 });
        await page.waitForSelector('.card', { timeout: 10000 });

        const peliculasBase = await page.evaluate(() => {
            const cards = document.querySelectorAll('.card');
            const resultados = [];
            cards.forEach(card => {
                const tituloElem = card.querySelector('.card-title');
                const titulo = tituloElem ? tituloElem.innerText.trim() : '';
                if (!titulo) return;

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
                    let horariosText = footerElem.innerText;
                    horariosText = horariosText.replace(/^[A-Za-zÁÉÍÓÚÑ\s]+\|/, '').trim();
                    horarios = horariosText.split(' - ').map(h => h.trim()).filter(h => /\d{1,2}:\d{2}/.test(h));
                }

                let poster = '';
                const imgElem = card.querySelector('.card-img-top');
                if (imgElem && imgElem.src) {
                    poster = imgElem.src;
                    if (poster.startsWith('/')) poster = 'https://www.cinecosmos.uba.ar' + poster;
                }

                if (horarios.length === 0) return;

                resultados.push({ titulo, director, duracion, horarios, poster });
            });
            return resultados;
        });

        console.log(`   Encontradas ${peliculasBase.length} películas con horarios.`);

        const hoy = new Date();
        const diaSemana = capitalize(hoy.toLocaleDateString('es-AR', { weekday: 'long' }));
        const mes = capitalize(hoy.toLocaleDateString('es-AR', { month: 'long' }));
        const fechaFormateada = `${diaSemana} ${hoy.getDate()}/${mes}/${hoy.getFullYear()}`;

        const funciones = [];
        for (let i = 0; i < peliculasBase.length; i++) {
            const p = peliculasBase[i];
            console.log(`   Procesando: ${p.titulo}`);
            // Buscar póster en TMDB usando título y director
            const tmdbPoster = await getPosterFromTMDB(p.titulo, null, p.director);
            const posterFinal = tmdbPoster || p.poster; // si TMDB no da, usar el original

            funciones.push({
                id_funcion: `cosmos_${Date.now()}_${i}`,
                titulo: p.titulo,
                director: p.director,
                duracion: p.duracion,
                cine: 'Cine Cosmos UBA',
                ciudad: 'CABA',
                fecha: fechaFormateada,
                idioma: 'Idioma original con subtítulos',
                horarios: p.horarios,
                seccion: 'cartelera',
                poster: posterFinal,
                sinopsis: 'Sin sinopsis disponible',
                linkTrailer: ''
            });
            // Pequeña pausa entre llamadas a TMDB
            await new Promise(r => setTimeout(r, 300));
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