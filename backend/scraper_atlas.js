// backend/scraper_atlas.js - Sin errores de "detached node"
const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, 'peliculas_atlas.json');

const COMPLEJOS = [
    { codComplejo: 191, nombre: "Caballito", ciudad: "CABA" },
    { codComplejo: 192, nombre: "Catan", ciudad: "CABA" },
    { codComplejo: 194, nombre: "Alcorta", ciudad: "CABA" },
    { codComplejo: 195, nombre: "Patio Bullrich", ciudad: "CABA" },
    { codComplejo: 196, nombre: "Nordelta", ciudad: "Tigre" },
    { codComplejo: 197, nombre: "Flores", ciudad: "CABA" },
    { codComplejo: 198, nombre: "Liniers", ciudad: "CABA" }
];

function parseFechaSelector(texto) {
    const partes = texto.trim().split(' ');
    if (partes.length !== 2) return null;
    const dia = parseInt(partes[0]);
    const mesAbr = partes[1].toUpperCase();
    const mesesMap = { 'ENE':0,'FEB':1,'MAR':2,'ABR':3,'MAY':4,'JUN':5,'JUL':6,'AGO':7,'SEP':8,'OCT':9,'NOV':10,'DIC':11 };
    const mes = mesesMap[mesAbr];
    if (isNaN(dia) || mes === undefined) return null;
    const now = new Date();
    let year = now.getFullYear();
    let fecha = new Date(year, mes, dia);
    if (fecha < now) fecha.setFullYear(year + 1);
    return fecha;
}

function formatearFechaLegible(fechaISO) {
    const date = new Date(fechaISO);
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return `${dias[date.getDay()]} ${date.getDate()}/${meses[date.getMonth()]}/${date.getFullYear()}`;
}

async function obtenerPeliculasDesdeAPI(codComplejo) {
    const url = `https://www.atlascines.com/Funciones/GetPeliculasPorComplejo?codComplejo=${codComplejo}`;
    const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const peliculasMap = new Map();
    for (const func of data) {
        const p = func.cachePeliculas;
        if (!p) continue;
        if (!peliculasMap.has(p.codPelicula)) {
            peliculasMap.set(p.codPelicula, {
                codPelicula: p.codPelicula,
                titulo: p.titulo,
                duracion: p.duracion?.toString() || 'N/A',
                sinopsis: p.sinopsisCorta || p.sinopsis || 'Sin sinopsis',
                poster: p.filename ? `https://www.atlascines.com/images/posters/${p.filename}` : ''
            });
        }
    }
    return Array.from(peliculasMap.values());
}

async function extraerHorarios(page, codPelicula, codComplejo) {
    const url = `https://atlascines.com/Peliculas?codPelicula=${codPelicula}`;
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    // Seleccionar complejo
    await page.waitForSelector('#complejoSelect', { timeout: 10000 });
    await page.select('#complejoSelect', codComplejo.toString());
    await page.evaluate(() => {
        const select = document.querySelector('#complejoSelect');
        if (select) select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Esperar a que aparezca el selector de fechas
    await page.waitForSelector('.date-item', { timeout: 15000 });
    
    // Obtener número de fechas activas
    const numFechas = await page.$$eval('.date-item:not(.disabled)', items => items.length);
    const resultados = [];

    for (let i = 0; i < numFechas; i++) {
        // Obtener el texto de la fecha en esta iteración
        const fechaInfo = await page.evaluate((idx) => {
            const items = document.querySelectorAll('.date-item:not(.disabled)');
            if (items[idx]) {
                const dateSpan = items[idx].querySelector('.date');
                return { dateText: dateSpan ? dateSpan.innerText : '' };
            }
            return { dateText: '' };
        }, i);

        if (!fechaInfo.dateText) continue;

        console.log(`       Procesando fecha: ${fechaInfo.dateText}`);

        // Hacer clic en la fecha usando evaluate (evita detached node)
        await page.evaluate((idx) => {
            const items = document.querySelectorAll('.date-item:not(.disabled)');
            if (items[idx]) items[idx].click();
        }, i);
        
        // Esperar a que se carguen los horarios
        try {
            await page.waitForFunction(
                () => {
                    const containers = document.querySelectorAll('.tecnologia-container');
                    if (containers.length === 0) return false;
                    let hasHorarios = false;
                    for (const c of containers) {
                        const horarios = c.querySelectorAll('.horarios .horario');
                        if (horarios.length > 0) {
                            hasHorarios = true;
                            break;
                        }
                    }
                    return hasHorarios;
                },
                { timeout: 15000 }
            ).catch(() => {
                console.log(`       ⚠️ No se cargaron horarios para ${fechaInfo.dateText}`);
            });
        } catch (e) {
            console.log(`       ⚠️ Error esperando horarios: ${e.message}`);
        }

        // Extraer horarios
        const horariosData = await page.evaluate(() => {
            const data = [];
            const containers = document.querySelectorAll('.tecnologia-container');
            for (const container of containers) {
                const chips = Array.from(container.querySelectorAll('.opciones .chip'));
                const esSubtitulada = chips.some(c => c.innerText.includes('SUBTITULADA'));
                const idioma = esSubtitulada ? 'Subtitulada' : 'Doblada';
                const botones = container.querySelectorAll('.horarios .horario');
                const horarios = Array.from(botones).map(btn => {
                    let hora = btn.innerText.trim();
                    hora = hora.replace(/AGOTADA|agotada|Agotada/g, '').trim();
                    return hora;
                }).filter(h => h && /^\d{1,2}:\d{2}/.test(h));
                if (horarios.length > 0) {
                    data.push({ idioma, horarios });
                }
            }
            return data;
        });

        if (horariosData.length === 0) {
            console.log(`       No se encontraron horarios para ${fechaInfo.dateText}`);
            continue;
        }

        const fechaDate = parseFechaSelector(fechaInfo.dateText);
        const fechaLegible = fechaDate ? formatearFechaLegible(fechaDate.toISOString()) : `Fecha no disponible (${fechaInfo.dateText})`;

        for (const item of horariosData) {
            resultados.push({
                fecha: fechaLegible,
                idioma: item.idioma,
                horarios: item.horarios.sort()
            });
        }
        console.log(`       Encontrados ${horariosData.length} grupos de horarios para ${fechaInfo.dateText}`);
    }
    return resultados;
}

async function scrapeAtlas() {
    console.log('🎬 Scraping Atlas Cines - corregido (sin detached node)');
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    let todasLasFunciones = [];

    for (const complejo of COMPLEJOS) {
        console.log(`\n📽️ Procesando complejo: ${complejo.nombre} (${complejo.codComplejo})`);
        try {
            const peliculas = await obtenerPeliculasDesdeAPI(complejo.codComplejo);
            console.log(`   ${peliculas.length} películas encontradas.`);

            for (const pelicula of peliculas) {
                console.log(`     Procesando: ${pelicula.titulo} (${pelicula.codPelicula})`);
                try {
                    const horarios = await extraerHorarios(page, pelicula.codPelicula, complejo.codComplejo);
                    if (horarios.length === 0) {
                        console.log(`       Sin horarios para este complejo.`);
                        continue;
                    }

                    for (const func of horarios) {
                        todasLasFunciones.push({
                            id_funcion: `atlas_${complejo.codComplejo}_${pelicula.codPelicula}_${func.fecha.replace(/\//g, '-')}_${func.idioma}`,
                            titulo: pelicula.titulo,
                            director: 'No especificado',
                            duracion: pelicula.duracion,
                            cine: `Atlas ${complejo.nombre}`,
                            ciudad: complejo.ciudad,
                            fecha: func.fecha,
                            idioma: func.idioma,
                            horarios: func.horarios,
                            seccion: 'cartelera',
                            poster: pelicula.poster,
                            sinopsis: pelicula.sinopsis,
                            linkTrailer: ''
                        });
                    }
                    console.log(`       ✅ ${horarios.length} funciones agregadas (total acumulado: ${todasLasFunciones.length})`);
                } catch (err) {
                    console.error(`       ❌ Error al procesar ${pelicula.titulo}: ${err.message}`);
                }
                await new Promise(r => setTimeout(r, 500));
            }
        } catch (error) {
            console.error(`   Error en complejo ${complejo.nombre}: ${error.message}`);
        }
        await new Promise(r => setTimeout(r, 1000));
    }

    await browser.close();
    await fs.writeFile(OUTPUT_FILE, JSON.stringify(todasLasFunciones, null, 2));
    console.log(`\n✅ Atlas completado. ${todasLasFunciones.length} funciones guardadas en ${OUTPUT_FILE}`);
}

if (require.main === module) {
    scrapeAtlas();
}

module.exports = { scrapeAtlas };