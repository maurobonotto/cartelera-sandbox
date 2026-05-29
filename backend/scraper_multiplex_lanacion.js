// backend/scraper_multiplex_lanacion.js
const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, 'peliculas_multiplex.json');

// Lista de cines Multiplex (agregá más aquí cuando quieras)
const MULTIPLEX_CINES = [
    {
        slug: 'multiplex-lavalle-sa229',
        nombre: 'Multiplex Lavalle',
        ciudad: 'CABA'
    },
    // {
    //     slug: 'belgrano-multiplex-sa125',  // ejemplo para agregar otro
    //     nombre: 'Multiplex Belgrano',
    //     ciudad: 'CABA'
    // }
];

function formatearFechaDesdeTexto(fechaTexto, anioReferencia = new Date().getFullYear()) {
    const partes = fechaTexto.trim().split(/\s+/);
    if (partes.length < 2) return null;
    const fechaNum = partes[1];
    const [dia, mesNum] = fechaNum.split('/');
    if (!dia || !mesNum) return null;
    const mesesMap = { '01':'ENE','02':'FEB','03':'MAR','04':'ABR','05':'MAY','06':'JUN','07':'JUL','08':'AGO','09':'SEP','10':'OCT','11':'NOV','12':'DIC' };
    const mesAbr = mesesMap[mesNum.padStart(2,'0')];
    if (!mesAbr) return null;
    const diasAbr = { 'DOMINGO':'DOM','LUNES':'LUN','MARTES':'MAR','MIÉRCOLES':'MIÉ','JUEVES':'JUE','VIERNES':'VIE','SÁBADO':'SÁB' };
    let diaSemanaAbr = diasAbr[partes[0].toUpperCase()];
    if (!diaSemanaAbr) diaSemanaAbr = partes[0].substring(0,3).toUpperCase();
    return `${diaSemanaAbr} ${dia}/${mesAbr}/${anioReferencia}`;
}

async function scrapeMultiplex() {
    console.log('🎬 Scraping cines Multiplex desde La Nación');
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    let todasLasFunciones = [];

    for (const cine of MULTIPLEX_CINES) {
        const url = `https://www.lanacion.com.ar/cartelera-de-cine/sala/${cine.slug}`;
        console.log(`\n📽️ Procesando: ${cine.nombre} (${cine.ciudad})`);

        try {
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
            await page.waitForSelector('.listaPrincipal__item', { timeout: 10000 });

            const peliculas = await page.evaluate(() => {
                const items = document.querySelectorAll('.listaPrincipal__item');
                return Array.from(items).map(item => {
                    const link = item.querySelector('a');
                    const titulo = link?.querySelector('h3')?.innerText.trim() || '';
                    const poster = link?.querySelector('img')?.src || '';
                    const boton = item.querySelector('button.verHorarios');
                    const peliculaId = boton?.getAttribute('data-pelicula');
                    return { titulo, poster, peliculaId };
                }).filter(p => p.titulo && p.peliculaId);
            });
            console.log(`   ${peliculas.length} películas encontradas.`);

            for (let idx = 0; idx < peliculas.length; idx++) {
                const peli = peliculas[idx];
                console.log(`      Procesando [${idx+1}/${peliculas.length}]: ${peli.titulo.substring(0, 50)}`);

                await page.evaluate((peliculaId) => {
                    const boton = document.querySelector(`button.verHorarios[data-pelicula="${peliculaId}"]`);
                    if (boton) boton.click();
                }, peli.peliculaId);
                await page.waitForSelector('.modal', { timeout: 5000 });
                await new Promise(r => setTimeout(r, 800));

                // Usamos el selector que me pasaste
                const diasTitulos = await page.$$('.detalleFechas__container__articulo__titulo');
                console.log(`         Días encontrados: ${diasTitulos.length}`);

                if (diasTitulos.length === 0) {
                    await cerrarModal(page);
                    continue;
                }

                const horariosPorDia = [];
                for (let i = 0; i < diasTitulos.length; i++) {
                    try {
                        await diasTitulos[i].click();
                        await new Promise(r => setTimeout(r, 500));
                    } catch (err) {
                        continue;
                    }

                    const { fechaTexto, horarios } = await page.evaluate((idx) => {
                        const articulos = document.querySelectorAll('.detalleFechas__container__articulo');
                        if (articulos[idx]) {
                            const h5 = articulos[idx].querySelector('.detalleFechas__container__articulo__titulo');
                            const fechaTexto = h5 ? h5.innerText.trim() : null;
                            const textoCompleto = articulos[idx].innerText;
                            const horariosEncontrados = textoCompleto.match(/\b\d{1,2}:\d{2}\b/g) || [];
                            return { fechaTexto, horarios: horariosEncontrados };
                        }
                        return { fechaTexto: null, horarios: [] };
                    }, i);

                    if (fechaTexto && horarios.length > 0) {
                        horariosPorDia.push({ dia: fechaTexto, horarios });
                    }
                }

                await cerrarModal(page);

                let contador = 0;
                for (const item of horariosPorDia) {
                    const fechaLegible = formatearFechaDesdeTexto(item.dia);
                    if (!fechaLegible) continue;
                    for (const horario of item.horarios) {
                        todasLasFunciones.push({
                            id_funcion: `multiplex_${cine.slug}_${peli.peliculaId}_${fechaLegible.replace(/\//g, '-')}_${horario.replace(':', '')}`,
                            titulo: peli.titulo,
                            director: 'No especificado',
                            duracion: 'N/A',
                            cine: cine.nombre,
                            ciudad: cine.ciudad,
                            fecha: fechaLegible,
                            idioma: 'Subtitulada', // valor por defecto
                            horarios: [horario],
                            seccion: 'cartelera',
                            poster: peli.poster,
                            sinopsis: 'Sin sinopsis disponible',
                            linkTrailer: ''
                        });
                        contador++;
                    }
                }
                console.log(`         ${contador} horarios extraídos.`);
            }
        } catch (error) {
            console.error(`   ❌ Error en ${cine.nombre}:`, error.message);
        }
    }

    await fs.writeFile(OUTPUT_FILE, JSON.stringify(todasLasFunciones, null, 2));
    console.log(`\n✅ Multiplex completado. ${todasLasFunciones.length} funciones guardadas en ${OUTPUT_FILE}`);
    await browser.close();
}

async function cerrarModal(page) {
    await page.evaluate(() => {
        const cerrar = document.querySelector('.modal__cerrar');
        if (cerrar) cerrar.click();
    });
    await page.waitForSelector('.modal', { hidden: true, timeout: 3000 }).catch(() => {});
}

scrapeMultiplex();