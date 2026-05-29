// backend/scraper_cinemark.js - Con scroll, fecha real para HOY y manejo robusto de errores por día
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

function obtenerFechaParaHOY() {
    const hoy = new Date();
    const diasSemana = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const diaSemana = diasSemana[hoy.getDay()];
    const diaNum = hoy.getDate();
    const mes = meses[hoy.getMonth()];
    const anio = hoy.getFullYear();
    return `${diaSemana} ${diaNum}/${mes}/${anio}`;
}

function convertirFechaCarrusel(textoDia, textoFecha) {
    const meses = {
        'ENE': 'Enero', 'FEB': 'Febrero', 'MAR': 'Marzo', 'ABR': 'Abril',
        'MAY': 'Mayo', 'JUN': 'Junio', 'JUL': 'Julio', 'AGO': 'Agosto',
        'SEP': 'Septiembre', 'OCT': 'Octubre', 'NOV': 'Noviembre', 'DIC': 'Diciembre'
    };
    if (textoDia.trim().toUpperCase() === 'HOY') {
        return obtenerFechaParaHOY();
    }
    let diaSemana = textoDia.trim();
    diaSemana = diaSemana.charAt(0).toUpperCase() + diaSemana.slice(1).toLowerCase();
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

// Extrae películas con scroll y espera a que se carguen
async function extraerFuncionesPorFecha(page, fechaDia, fechaTexto, cineNombre, cineCiudad, idCounter) {
    // Scroll suave para cargar todas las películas
    await page.evaluate(async () => {
        await new Promise((resolve) => {
            let totalHeight = 0;
            const distance = 400;
            const timer = setInterval(() => {
                const scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;
                if (totalHeight >= scrollHeight) {
                    clearInterval(timer);
                    resolve();
                }
            }, 200);
        });
    });
    await new Promise(r => setTimeout(r, 1500));
    
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
    console.log('🎬 Scraping Cinemark/Hoyts - Robusto por día, con scroll');
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

            await page.waitForFunction(() => !document.querySelector('.MuiSkeleton-root'), { timeout: 20000 }).catch(() => {});
            await page.waitForSelector('.mui-1vn7os0, .MuiGrid-item', { timeout: 15000 }).catch(() => {});
            await new Promise(r => setTimeout(r, 2000));

            // Obtener fechas del carrusel
            let fechas = await page.evaluate(() => {
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

            const existeHoy = fechas.some(f => f.dia.toUpperCase() === 'HOY');
            if (!existeHoy) {
                const hoy = new Date();
                const diaNum = hoy.getDate();
                const mesAbr = hoy.toLocaleString('es', { month: 'short' }).toUpperCase();
                fechas.unshift({ dia: 'HOY', fecha: `${diaNum}/${mesAbr}` });
                console.log(`   📅 Agregado manualmente el día HOY (se convertirá a fecha real)`);
            }

            if (fechas.length === 0) {
                console.log('   ⚠️ No se encontraron fechas.');
                continue;
            }

            console.log(`   📅 Fechas encontradas: ${fechas.map(f => `${f.dia} ${f.fecha}`).join(', ')}`);

            // Procesar cada fecha individualmente con manejo de errores
            for (let i = 0; i < fechas.length; i++) {
                const fecha = fechas[i];
                console.log(`   📍 Procesando (${i+1}/${fechas.length}): ${fecha.dia} ${fecha.fecha}`);
                try {
                    if (i > 0) {
                        // Hacer clic en la pestaña correspondiente
                        await page.evaluate((index) => {
                            const items = document.querySelectorAll('.date-carousel-item');
                            if (items[index]) items[index].click();
                        }, i);
                        // Esperar a que las películas se actualicen (detectar cambio en el DOM)
                        await page.waitForFunction(
                            () => !document.querySelector('.MuiSkeleton-root') && document.querySelectorAll('.mui-1vn7os0').length > 0,
                            { timeout: 15000 }
                        ).catch(() => console.log('      ⚠️ Timeout esperando contenido, continuando...'));
                        await new Promise(r => setTimeout(r, 2000));
                    }
                    
                    const { funcionesLista, nuevoIdCounter } = await extraerFuncionesPorFecha(page, fecha.dia, fecha.fecha, cine.nombre, cine.ciudad, idCounter);
                    todasFunciones.push(...funcionesLista);
                    idCounter = nuevoIdCounter;
                    console.log(`      ✅ ${funcionesLista.length} funciones extraídas.`);
                } catch (err) {
                    console.error(`      ❌ Error al procesar ${fecha.dia} ${fecha.fecha}:`, err.message);
                    // Continuar con el siguiente día
                }
            }

            console.log(`   ✅ Total funciones para ${cine.nombre}: ${todasFunciones.filter(f => f.cine === cine.nombre).length}`);

        } catch (error) {
            console.error(`   ❌ Error crítico en ${cine.nombre}:`, error.message);
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