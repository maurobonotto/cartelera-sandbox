// backend/scraper_cinemark.js - Versión final con nombres y ubicaciones exactas
const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, 'peliculas_cinemark.json');

// Lista definitiva de cines AMBA con nombres comerciales exactos y ciudades correctas
const CINES = [
    // CABA
    { slug: 'abasto', nombre: 'Hoyts Abasto', ciudad: 'CABA' },
    { slug: 'caballito', nombre: 'Cinemark Caballito', ciudad: 'CABA' },
    { slug: 'palermo', nombre: 'Cinemark Palermo', ciudad: 'CABA' },
    { slug: 'dot', nombre: 'Hoyts DOT', ciudad: 'CABA' },
    { slug: 'puertomadero', nombre: 'Cinemark Puerto Madero', ciudad: 'CABA' },
    // Gran Buenos Aires
    { slug: 'soleil', nombre: 'Cinemark Soleil', ciudad: 'Boulogne' },
    { slug: 'altoavellaneda', nombre: 'Cinemark Avellaneda', ciudad: 'Avellaneda' },
    { slug: 'malvinasargentinas', nombre: 'Cinemark Malvinas Argentinas', ciudad: 'Malvinas Argentinas' },
    { slug: 'moreno', nombre: 'Cinemark Moreno', ciudad: 'Moreno' },
    { slug: 'moron', nombre: 'Hoyts Plaza Oeste Morón', ciudad: 'Morón' },
    { slug: 'quilmes', nombre: 'Cinemark Quilmes', ciudad: 'Quilmes' },
    { slug: 'sanjusto', nombre: 'Cinemark San Justo', ciudad: 'San Justo' },
    { slug: 'temperley', nombre: 'Cinemark Temperley', ciudad: 'Temperley' },
    { slug: 'tortugas', nombre: 'Cinemark Tortugas', ciudad: 'Tortuguitas' },
    { slug: 'unicenter', nombre: 'Hoyts Unicenter', ciudad: 'Martínez' }
];

function formatearFecha(date) {
    const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const diaSemana = dias[date.getDay()].charAt(0).toUpperCase() + dias[date.getDay()].slice(1);
    const diaNumero = date.getDate();
    const mes = meses[date.getMonth()].charAt(0).toUpperCase() + meses[date.getMonth()].slice(1);
    const anio = date.getFullYear();
    return `${diaSemana} ${diaNumero}/${mes}/${anio}`;
}

async function scrapeCinemark() {
    console.log('🎬 Scraping Cinemark/Hoyts - AMBA (nombres y ubicaciones exactas)');
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();

    const context = browser.defaultBrowserContext();
    await context.overridePermissions('https://www.cinemark.com.ar', ['geolocation']);
    console.log('✅ Geolocalización permitida.');

    const todasFunciones = [];
    let idCounter = 1;
    const hoy = new Date();
    const fechaLegible = formatearFecha(hoy);

    for (const cine of CINES) {
        const url = `https://www.cinemark.com.ar/cartelera/${cine.slug}`;
        console.log(`\n🏢 Procesando: ${cine.nombre} (${cine.ciudad})`);
        console.log(`   URL: ${url}`);

        try {
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
            await new Promise(r => setTimeout(r, 2000));

            // Cerrar aviso de cookies
            try {
                const botonAcepto = await page.$('button:has-text("ACEPTO")');
                if (botonAcepto) {
                    await botonAcepto.click();
                    console.log('   ✅ Cookies aceptadas.');
                } else {
                    await page.click('.MuiBackdrop-root').catch(() => {});
                }
                await new Promise(r => setTimeout(r, 1500));
            } catch (e) {}

            // Esperar a que desaparezcan los skeletons
            await page.waitForFunction(
                () => !document.querySelector('.MuiSkeleton-root'),
                { timeout: 20000 }
            ).catch(() => console.log('   ⚠️ Timeout skeletons, continuando...'));

            // Esperar tarjetas de películas
            await page.waitForSelector('.mui-1vn7os0, .MuiGrid-item', { timeout: 15000 }).catch(() => {
                console.log('   ⚠️ No se encontraron tarjetas.');
                return;
            });

            await new Promise(r => setTimeout(r, 2000));

            // Extraer datos
            const peliculas = await page.evaluate(() => {
                const results = [];
                const movieCards = document.querySelectorAll('.mui-1vn7os0');
                
                for (const card of movieCards) {
                    const titleEl = card.querySelector('h1.mui-1v7o5yb');
                    const title = titleEl ? titleEl.innerText.trim() : null;
                    if (!title) continue;

                    let horariosContainer = card.nextElementSibling;
                    while (horariosContainer && !horariosContainer.classList.contains('mui-1af0m59')) {
                        horariosContainer = horariosContainer.nextElementSibling;
                    }
                    if (!horariosContainer) continue;

                    const hourElements = horariosContainer.querySelectorAll('p.mui-aiec9m');
                    const horarios = Array.from(hourElements).map(el => el.innerText.trim().replace('hs', ''));

                    if (horarios.length > 0) {
                        results.push({ title, horarios });
                    }
                }
                return results;
            });

            if (peliculas.length === 0) {
                console.log('   ⚠️ No se encontraron películas.');
                const html = await page.content();
                await fs.writeFile(`debug_${cine.slug}.html`, html);
            } else {
                console.log(`   ✅ ${peliculas.length} películas encontradas.`);
                for (const peli of peliculas) {
                    todasFunciones.push({
                        id_funcion: `cinemark_${cine.slug}_${idCounter++}`,
                        titulo: peli.title,
                        director: 'No especificado',
                        duracion: 'N/A',
                        cine: cine.nombre,
                        ciudad: cine.ciudad,
                        fecha: fechaLegible,
                        idioma: 'Doblada/Subtitulada',
                        horarios: peli.horarios,
                        seccion: 'cartelera',
                        poster: '',
                        sinopsis: 'Sin sinopsis disponible',
                        linkTrailer: ''
                    });
                }
            }
        } catch (error) {
            console.error(`   ❌ Error en ${cine.nombre}:`, error.message);
            const html = await page.content().catch(() => '');
            if (html) await fs.writeFile(`error_${cine.slug}.html`, html);
        }
        await new Promise(r => setTimeout(r, 1500));
    }

    await browser.close();
    await fs.writeFile(OUTPUT_FILE, JSON.stringify(todasFunciones, null, 2));
    console.log(`\n✅ Scraping completado. ${todasFunciones.length} funciones guardadas en ${OUTPUT_FILE}`);
}

scrapeCinemark();