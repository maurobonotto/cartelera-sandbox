// backend/scraper_cinemark.js - Basado en la estructura real (título y horarios dentro del mismo contenedor)
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
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return `${dias[hoy.getDay()]} ${hoy.getDate()}/${meses[hoy.getMonth()]}/${hoy.getFullYear()}`;
}

function convertirFechaCarrusel(textoDia, textoFecha) {
    const mesesAbr = { 'ENE':'Enero', 'FEB':'Febrero', 'MAR':'Marzo', 'ABR':'Abril', 'MAY':'Mayo', 'JUN':'Junio', 'JUL':'Julio', 'AGO':'Agosto', 'SEP':'Septiembre', 'OCT':'Octubre', 'NOV':'Noviembre', 'DIC':'Diciembre' };
    if (textoDia.toUpperCase() === 'HOY') return obtenerFechaParaHOY();
    let diaSemana = textoDia.trim();
    diaSemana = diaSemana.charAt(0).toUpperCase() + diaSemana.slice(1).toLowerCase();
    const [dia, mesAbr] = textoFecha.split('/');
    const mes = mesesAbr[mesAbr.toUpperCase()] || mesAbr;
    return `${diaSemana} ${dia}/${mes}/${new Date().getFullYear()}`;
}

async function scrollHastaFondo(page) {
    let prevHeight = 0;
    let igual = 0;
    while (igual < 4) {
        const newHeight = await page.evaluate(() => document.body.scrollHeight);
        if (newHeight === prevHeight) igual++;
        else { igual = 0; prevHeight = newHeight; }
        await page.evaluate(() => window.scrollBy(0, window.innerHeight));
        await new Promise(r => setTimeout(r, 1500));
    }
}

async function extraerFunciones(page, fechaDia, fechaTexto, cine, ciudad, idCounter) {
    await scrollHastaFondo(page);
    
    const resultados = await page.evaluate(() => {
        const results = [];
        // 1. Buscar todos los títulos (están en h1.mui-1v7o5yb dentro de cada contenedor)
        const titulosElements = document.querySelectorAll('h1.mui-1v7o5yb');
        for (const tituloEl of titulosElements) {
            const titulo = tituloEl.innerText.trim();
            if (!titulo) continue;
            
            // 2. Subir al contenedor padre que engloba tanto el título como los horarios
            //    Normalmente es un div con clase mui-1af0m59 (o el ancestro más cercano que contenga los horarios)
            let contenedorPadre = tituloEl.closest('.mui-1af0m59');
            if (!contenedorPadre) {
                // Si no se encuentra, buscar el ancestro que tenga un div con horarios
                contenedorPadre = tituloEl.closest('[class*="MuiBox-root"]');
            }
            if (!contenedorPadre) continue;
            
            // 3. Dentro de ese contenedor, buscar el div que contiene los horarios (clase mui-13wu688)
            let horariosContainer = contenedorPadre.querySelector('.mui-13wu688');
            if (!horariosContainer) {
                // Fallback: buscar cualquier div con muchos horarios
                horariosContainer = contenedorPadre.querySelector('[class*="showtimes"], [class*="hours"]');
            }
            if (!horariosContainer) continue;
            
            // 4. Extraer todos los horarios (cada uno está en un p.mui-aiec9m)
            const horas = horariosContainer.querySelectorAll('.mui-aiec9m');
            if (horas.length === 0) continue;
            
            // 5. Determinar el idioma (puede haber bloques de idioma dentro del mismo contenedor)
            //    Buscar indicadores de subtitulada (por ejemplo, dentro de .mui-ct48ax o similar)
            let idioma = 'Doblada';
            const idiomaIndicador = contenedorPadre.querySelector('.mui-ct48ax .mui-134451d, [class*="language"]');
            if (idiomaIndicador && idiomaIndicador.innerText.toUpperCase().includes('SUBTITULADA')) {
                idioma = 'Subtitulada';
            }
            
            const horariosList = Array.from(horas).map(h => h.innerText.replace('hs', '').trim());
            results.push({
                titulo,
                idioma,
                horarios: [...new Set(horariosList)].sort()
            });
        }
        return results;
    });
    
    const fechaLegible = convertirFechaCarrusel(fechaDia, fechaTexto);
    const lista = [];
    for (const r of resultados) {
        lista.push({
            id_funcion: `cinemark_${cine.replace(/\s/g, '_')}_${idCounter++}`,
            titulo: r.titulo,
            director: 'No especificado',
            duracion: 'N/A',
            cine: cine,
            ciudad: ciudad,
            fecha: fechaLegible,
            idioma: r.idioma,
            horarios: r.horarios,
            seccion: 'cartelera',
            poster: '',
            sinopsis: '',
            linkTrailer: ''
        });
    }
    console.log(`   Extraídas ${lista.length} funciones (estructura con contenedor padre)`);
    return { lista, nuevoId: idCounter };
}

async function scrapeCinemark() {
    console.log('🎬 Scraping Cinemark - Versión definitiva (contenedor padre)');
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    let todas = [];
    let id = 1;

    for (const cine of CINES) {
        const url = `https://www.cinemark.com.ar/cartelera/${cine.slug}`;
        console.log(`\n🏢 ${cine.nombre} (${cine.ciudad})`);
        try {
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
            await page.waitForSelector('.date-carousel-item', { timeout: 15000 });
            await new Promise(r => setTimeout(r, 2000));
            try { await page.click('button:has-text("ACEPTO")'); } catch(e) {}

            let fechas = await page.evaluate(() => {
                const items = document.querySelectorAll('.date-carousel-item');
                return Array.from(items).map(i => ({
                    dia: (i.querySelector('h3, p:first-child')?.innerText || '').trim(),
                    fecha: (i.querySelector('p:last-child')?.innerText || '').trim()
                })).filter(f => f.dia && f.fecha);
            });
            const hoy = new Date();
            const hoyNum = hoy.getDate();
            const mesAbr = hoy.toLocaleString('es', { month: 'short' }).toUpperCase();
            if (!fechas.some(f => f.dia.toUpperCase() === 'HOY')) {
                fechas.unshift({ dia: 'HOY', fecha: `${hoyNum}/${mesAbr}` });
                console.log(`   Agregado HOY`);
            }
            console.log(`   Fechas: ${fechas.map(f=>`${f.dia} ${f.fecha}`).join(', ')}`);

            for (let i = 0; i < fechas.length; i++) {
                console.log(`   Día ${i+1}/${fechas.length}: ${fechas[i].dia}`);
                if (i > 0) {
                    await page.evaluate(idx => document.querySelectorAll('.date-carousel-item')[idx]?.click(), i);
                    await page.waitForFunction(() => !document.querySelector('.MuiSkeleton-root'), { timeout: 20000 });
                    await new Promise(r => setTimeout(r, 2500));
                }
                const { lista, nuevoId } = await extraerFunciones(page, fechas[i].dia, fechas[i].fecha, cine.nombre, cine.ciudad, id);
                todas.push(...lista);
                id = nuevoId;
            }
        } catch (err) {
            console.error(`   Error: ${err.message}`);
        }
        await new Promise(r => setTimeout(r, 1500));
    }
    await browser.close();
    await fs.writeFile(OUTPUT_FILE, JSON.stringify(todas, null, 2));
    console.log(`\n✅ Scraping completado. ${todas.length} funciones guardadas.`);
}

scrapeCinemark();