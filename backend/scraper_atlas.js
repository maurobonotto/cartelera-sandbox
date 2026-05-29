// backend/scraper_atlas.js - Versión robusta que captura todas las fechas
const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, 'peliculas_atlas.json');

// Lista completa de complejos (extraída del HTML de Atlas)
const COMPLEJOS = [
    { codComplejo: 191, nombre: "Caballito", ciudad: "CABA" },
    { codComplejo: 192, nombre: "Catan", ciudad: "CABA" },
    { codComplejo: 194, nombre: "Alcorta", ciudad: "CABA" },
    { codComplejo: 195, nombre: "Patio Bullrich", ciudad: "CABA" },
    { codComplejo: 196, nombre: "Nordelta", ciudad: "Tigre" },
    { codComplejo: 197, nombre: "Flores", ciudad: "CABA" },
    { codComplejo: 198, nombre: "Liniers", ciudad: "CABA" }
];

// Función para convertir fecha del selector "29 MAY" a objeto Date
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

// Obtener lista de películas desde la API
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

// Extraer horarios para una película y complejo (con manejo robusto de fechas)
async function extraerHorarios(page, codPelicula, codComplejo) {
    const url = `https://atlascines.com/Peliculas?codPelicula=${codPelicula}`;
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    // 1. Seleccionar complejo
    await page.waitForSelector('#complejoSelect', { timeout: 10000 });
    await page.select('#complejoSelect', codComplejo.toString());
    await page.evaluate(() => {
        const select = document.querySelector('#complejoSelect');
        if (select) select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // 2. Esperar a que aparezca el selector de fechas
    await page.waitForSelector('.date-item', { timeout: 15000 });

    // 3. Obtener todas las fechas activas (no deshabilitadas)
    const fechasActivas = await page.$$eval('.date-item:not(.disabled)', items =>
        items.map((item, idx) => ({
            index: idx,
            dateText: item.querySelector('.date')?.innerText || ''
        }))
    );

    if (fechasActivas.length === 0) return [];

    console.log(`       Fechas disponibles: ${fechasActivas.map(f => f.dateText).join(', ')}`);

    // 4. Extraer horarios para la fecha actualmente activa (sin hacer clic)
    const resultados = [];

    // Función auxiliar para extraer horarios de la página actual
    const extraerHorariosActuales = async () => {
        return await page.evaluate(() => {
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
    };

    // Para cada fecha, hacer clic (excepto la primera que ya está activa) y extraer
    for (let i = 0; i < fechasActivas.length; i++) {
        const fecha = fechasActivas[i];
        console.log(`       Procesando fecha: ${fecha.dateText} (índice ${fecha.index})`);

        if (i > 0) {
            // Hacer clic en la fecha (no en la primera porque ya está activa)
            await page.evaluate((idx) => {
                const items = document.querySelectorAll('.date-item:not(.disabled)');
                if (items[idx]) items[idx].click();
            }, i);
            // Esperar a que se actualicen los horarios (máximo 10 segundos)
            try {
                await page.waitForFunction(
                    () => document.querySelectorAll('.tecnologia-container .horarios .horario').length > 0,
                    { timeout: 10000 }
                );
            } catch (e) {
                console.log(`       ⚠️ No se encontraron horarios después del clic para ${fecha.dateText}`);
                // Puede que no haya funciones ese día, continuar
            }
            // Pequeña pausa adicional para estabilidad
            await new Promise(r => setTimeout(r, 1000));
        } else {
            // Para la primera fecha, ya está cargada; esperamos a que los horarios existan
            try {
                await page.waitForFunction(
                    () => document.querySelectorAll('.tecnologia-container .horarios .horario').length > 0,
                    { timeout: 10000 }
                );
            } catch (e) {
                console.log(`       ⚠️ No se encontraron horarios para la fecha inicial ${fecha.dateText}`);
            }
        }

        // Extraer horarios actuales
        const horariosData = await extraerHorariosActuales();
        if (horariosData.length === 0) {
            console.log(`       No se encontraron horarios para ${fecha.dateText}`);
            continue;
        }

        const fechaDate = parseFechaSelector(fecha.dateText);
        const fechaLegible = fechaDate ? formatearFechaLegible(fechaDate.toISOString()) : `Fecha no disponible (${fecha.dateText})`;
        console.log(`       Encontrados ${horariosData.length} grupos de horarios para ${fecha.dateText} -> ${fechaLegible}`);

        for (const item of horariosData) {
            resultados.push({
                fecha: fechaLegible,
                idioma: item.idioma,
                horarios: item.horarios.sort()
            });
        }
    }

    return resultados;
}

async function scrapeAtlas() {
    console.log('🎬 Scraping Atlas Cines - Versión robusta (cada fecha por separado)');
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