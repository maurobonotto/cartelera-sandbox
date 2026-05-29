// backend/scraper_cinemark.js - Hace clic en cada fecha para obtener horarios reales
const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, 'peliculas_cinemark.json');

const CINES = [
    { slug: 'abasto', nombre: 'Hoyts Abasto', ciudad: 'CABA' },
    { slug: 'caballito', nombre: 'Cinemark Caballito', ciudad: 'CABA' },
    { slug: 'palermo', nombre: 'Cinemark Palermo', ciudad: 'CABA' },
    { slug: 'dot', nombre: 'Hoyts DOT', ciudad: 'CABA' },
    { slug: 'puertomadero', nombre: 'Cinemark Puerto Madero', ciudad: 'CABA' },
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

function convertirFechaCarrusel(textoDia, textoFecha) {
    const meses = {
        'ENE': 'Enero', 'FEB': 'Febrero', 'MAR': 'Marzo', 'ABR': 'Abril',
        'MAY': 'Mayo', 'JUN': 'Junio', 'JUL': 'Julio', 'AGO': 'Agosto',
        'SEP': 'Septiembre', 'OCT': 'Octubre', 'NOV': 'Noviembre', 'DIC': 'Diciembre'
    };
    let diaSemana = textoDia.trim();
    if (diaSemana === 'HOY') diaSemana = 'Hoy';
    else diaSemana = diaSemana.charAt(0).toUpperCase() + diaSemana.slice(1).toLowerCase();
    
    const partes = textoFecha.split('/');
    if (partes.length === 2) {
        const diaNum = partes[0];
        const mesAbr = partes[1].toUpperCase();
        const mes = meses[mesAbr] || mesAbr;
        const anio = new Date().getFullYear();
        return `${diaSemana} ${diaNum}/${mes}/${anio}`;
    }
    return `${diaSemana} ${textoFecha}`;
}

// Extraer películas y horarios del DOM actual
async function extraerFuncionesPorFecha(page, fechaDia, fechaTexto, cineNombre, cineCiudad, idCounter) {
    const funciones = await page.evaluate(() => {
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
            
            const bloques = horariosContainer.querySelectorAll('.mui-30g0zv');
            const horariosPorIdioma = new Map();
            
            bloques.forEach(bloque => {
                let idioma = 'Doblada';
                const idiomaElem = bloque.querySelector('.mui-1xj2a7k');
                if (idiomaElem) {
                    const idiomaText = idiomaElem.innerText.trim().toUpperCase();
                    if (idiomaText.includes('SUBTITULADA')) idioma = 'Subtitulada';
                    else if (idiomaText.includes('CASTELLANO')) idioma = 'Doblada';
                }
                
                const hourElements = bloque.querySelectorAll('.mui-19midw5 .mui-aiec9m');
                const horariosBloque = Array.from(hourElements).map(el => el.innerText.trim().replace('hs', ''));
                
                if (horariosBloque.length > 0) {
                    if (!horariosPorIdioma.has(idioma)) horariosPorIdioma.set(idioma, []);
                    horariosPorIdioma.set(idioma, [...horariosPorIdioma.get(idioma), ...horariosBloque]);
                }
            });
            
            if (horariosPorIdioma.size > 0) {
                for (const [idioma, horarios] of horariosPorIdioma.entries()) {
                    results.push({
                        titulo: title,
                        idioma: idioma,
                        horarios: [...new Set(horarios)].sort()
                    });
                }
            }
        }
        return results;
    });
    
    const fechaLegible = convertirFechaCarrusel(fechaDia, fechaTexto);
    const funcionesLista = [];
    for (const f of funciones) {
        funcionesLista.push({
            id_funcion: `cinemark_${cineNombre.replace(/\s/g, '_')}_${idCounter++}`,
            titulo: f.titulo,
            director: 'No especificado',
            duracion: 'N/A',
            cine: cineNombre,
            ciudad: cineCiudad,
            fecha: fechaLegible,
            idioma: f.idioma,
            horarios: f.horarios,
            seccion: 'cartelera',
            poster: '',
            sinopsis: 'Sin sinopsis disponible',
            linkTrailer: ''
        });
    }
    return { funcionesLista, nuevoIdCounter: idCounter };
}

async function scrapeCinemark() {
    console.log('🎬 Scraping Cinemark/Hoyts - Fechas reales con clic');
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();

    const context = browser.defaultBrowserContext();
    await context.overridePermissions('https://www.cinemark.com.ar', ['geolocation']);
    console.log('✅ Geolocalización permitida.');

    let todasFunciones = [];
    let idCounter = 1;

    for (const cine of CINES) {
        const url = `https://www.cinemark.com.ar/cartelera/${cine.slug}`;
        console.log(`\n🏢 Procesando: ${cine.nombre} (${cine.ciudad})`);
        console.log(`   URL: ${url}`);

        try {
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
            await new Promise(r => setTimeout(r, 2000));

            // Cerrar cookies
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

            // Esperar contenido
            await page.waitForFunction(() => !document.querySelector('.MuiSkeleton-root'), { timeout: 20000 }).catch(() => {});
            await page.waitForSelector('.mui-1vn7os0, .MuiGrid-item', { timeout: 15000 }).catch(() => {});
            await new Promise(r => setTimeout(r, 2000));

            // Obtener todas las fechas del carrusel
            const fechas = await page.evaluate(() => {
                const items = document.querySelectorAll('.date-carousel-item');
                return Array.from(items).map(item => {
                    const diaElem = item.querySelector('h3, p:first-child');
                    const fechaElem = item.querySelector('p:last-child');
                    return {
                        dia: diaElem ? diaElem.innerText.trim() : '',
                        fecha: fechaElem ? fechaElem.innerText.trim() : ''
                    };
                }).filter(f => f.dia && f.fecha);
            });

            if (fechas.length === 0) {
                console.log('   ⚠️ No se encontraron fechas.');
                continue;
            }

            console.log(`   📅 Fechas encontradas: ${fechas.map(f => `${f.dia} ${f.fecha}`).join(', ')}`);

            // Procesar la primera fecha (ya visible)
            console.log(`   📍 Procesando: ${fechas[0].dia} ${fechas[0].fecha}`);
            const { funcionesLista: funcionesPrimera, nuevoIdCounter: id1 } = await extraerFuncionesPorFecha(page, fechas[0].dia, fechas[0].fecha, cine.nombre, cine.ciudad, idCounter);
            todasFunciones.push(...funcionesPrimera);
            idCounter = id1;

            // Procesar el resto de las fechas (haciendo clic)
            for (let i = 1; i < fechas.length; i++) {
                console.log(`   📍 Procesando: ${fechas[i].dia} ${fechas[i].fecha}`);
                // Hacer clic en la pestaña correspondiente usando evaluate (más robusto)
                await page.evaluate((index) => {
                    const items = document.querySelectorAll('.date-carousel-item');
                    if (items[index]) items[index].click();
                }, i);
                
                // Esperar a que los horarios se actualicen (esperar a que aparezcan nuevos .mui-aiec9m)
                await new Promise(r => setTimeout(r, 3000));
                // También podemos esperar a que algún elemento específico cambie, pero timeout es suficiente
                
                const { funcionesLista, nuevoIdCounter } = await extraerFuncionesPorFecha(page, fechas[i].dia, fechas[i].fecha, cine.nombre, cine.ciudad, idCounter);
                todasFunciones.push(...funcionesLista);
                idCounter = nuevoIdCounter;
            }

            console.log(`   ✅ Total funciones para ${cine.nombre}: ${todasFunciones.filter(f => f.cine === cine.nombre).length}`);

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