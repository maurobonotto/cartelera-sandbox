const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, 'peliculas_lorca.json');
const URL = 'https://www.lanacion.com.ar/cartelera-de-cine/sala/lorca-sa110';

function formatearFechaDesdeTexto(fechaTexto, anioReferencia = new Date().getFullYear()) {
    const partes = fechaTexto.trim().split(/\s+/);
    if (partes.length < 2) return null;
    const fechaNum = partes[1];
    const [dia, mesNum] = fechaNum.split('/');
    if (!dia || !mesNum) return null;
    const mesesMap = {
        '01':'ENE','02':'FEB','03':'MAR','04':'ABR','05':'MAY','06':'JUN',
        '07':'JUL','08':'AGO','09':'SEP','10':'OCT','11':'NOV','12':'DIC'
    };
    const mesAbr = mesesMap[mesNum.padStart(2,'0')];
    if (!mesAbr) return null;
    const diasAbr = {
        'DOMINGO':'DOM','LUNES':'LUN','MARTES':'MAR','MIÉRCOLES':'MIÉ',
        'JUEVES':'JUE','VIERNES':'VIE','SÁBADO':'SÁB'
    };
    let diaSemanaAbr = diasAbr[partes[0].toUpperCase()];
    if (!diaSemanaAbr) diaSemanaAbr = partes[0].substring(0,3).toUpperCase();
    return `${diaSemanaAbr} ${dia}/${mesAbr}/${anioReferencia}`;
}

async function scrapeLorca() {
    console.log('🎬 Scraping Cine Lorca desde La Nación (con soporte múltiples horarios)');
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    try {
        await page.goto(URL, { waitUntil: 'networkidle2', timeout: 30000 });
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

        const todasLasFunciones = [];

        for (const peli of peliculas) {
            console.log(`   Procesando: ${peli.titulo}`);

            // Abrir modal
            await page.evaluate((peliculaId) => {
                const boton = document.querySelector(`button.verHorarios[data-pelicula="${peliculaId}"]`);
                if (boton) boton.click();
            }, peli.peliculaId);

            await page.waitForSelector('.modal', { timeout: 5000 });
            await new Promise(r => setTimeout(r, 800));

            // Obtener todos los elementos h5 de los días
            const diasH5 = await page.$$('.detalleFechas__container__articulo h5');
            console.log(`      Días encontrados: ${diasH5.length}`);

            const horariosPorDia = [];

            for (let i = 0; i < diasH5.length; i++) {
                // Hacer clic en el día actual
                await diasH5[i].click();
                await new Promise(r => setTimeout(r, 500));

                // Extraer el texto completo del bloque de horarios del artículo i
                const { fechaTexto, textoHorarios } = await page.evaluate((idx) => {
                    const articulos = document.querySelectorAll('.detalleFechas__container__articulo');
                    if (articulos[idx]) {
                        const h5 = articulos[idx].querySelector('h5');
                        const fechaTexto = h5 ? h5.innerText.trim() : null;
                        // Buscar el párrafo que contiene el strong (idioma) y los horarios
                        const p = articulos[idx].querySelector('p');
                        const textoHorarios = p ? p.innerText.trim() : '';
                        return { fechaTexto, textoHorarios };
                    }
                    return { fechaTexto: null, textoHorarios: '' };
                }, i);

                if (fechaTexto && textoHorarios) {
                    // Extraer idioma (subtitulada/doblada) y lista de horarios
                    const idiomaMatch = textoHorarios.match(/^([^:]+):/i);
                    let idioma = 'Sin especificar';
                    if (idiomaMatch) {
                        const idiomaRaw = idiomaMatch[1].trim().toLowerCase();
                        if (idiomaRaw.includes('subtitulada')) idioma = 'Subtitulada';
                        else if (idiomaRaw.includes('doblada')) idioma = 'Doblada';
                    }
                    // Extraer todos los horarios (formato HH:MM)
                    const horarios = textoHorarios.match(/\b\d{1,2}:\d{2}\b/g) || [];
                    if (horarios.length > 0) {
                        horariosPorDia.push({ dia: fechaTexto, idioma, horarios });
                    }
                }
            }

            // Cerrar modal
            await page.evaluate(() => {
                const cerrar = document.querySelector('.modal__cerrar');
                if (cerrar) cerrar.click();
            });
            await page.waitForSelector('.modal', { hidden: true, timeout: 3000 }).catch(() => {});

            // Procesar resultados
            let contador = 0;
            for (const item of horariosPorDia) {
                const fechaLegible = formatearFechaDesdeTexto(item.dia);
                if (!fechaLegible) continue;
                for (const horario of item.horarios) {
                    todasLasFunciones.push({
                        id_funcion: `lorca_ln_${peli.peliculaId}_${fechaLegible.replace(/\//g, '-')}_${horario.replace(':', '')}`,
                        titulo: peli.titulo,
                        director: 'No especificado',
                        duracion: 'N/A',
                        cine: 'Cine Lorca',
                        ciudad: 'CABA',
                        fecha: fechaLegible,
                        idioma: item.idioma,
                        horarios: [horario],
                        seccion: 'cartelera',
                        poster: peli.poster,
                        sinopsis: 'Sin sinopsis disponible',
                        linkTrailer: ''
                    });
                    contador++;
                }
            }
            console.log(`      ${contador} horarios extraídos.`);
            await new Promise(r => setTimeout(r, 300));
        }

        await fs.writeFile(OUTPUT_FILE, JSON.stringify(todasLasFunciones, null, 2));
        console.log(`✅ Cine Lorca completado. ${todasLasFunciones.length} funciones guardadas.`);
        return todasLasFunciones;
    } catch (error) {
        console.error('❌ Error:', error);
        return [];
    } finally {
        await browser.close();
    }
}

if (require.main === module) scrapeLorca();
module.exports = { scrapeLorca };