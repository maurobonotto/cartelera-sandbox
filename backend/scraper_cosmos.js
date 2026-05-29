const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, 'peliculas_cosmos.json');

function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// Mapeo de días abreviados a número de día (0=domingo, 1=lunes, ...)
const diasAbrMap = {
    'lu': 1, 'ma': 2, 'mi': 3, 'ju': 4, 'vi': 5, 'sá': 6, 'do': 0
};

function getFechaProximoDia(numDia) {
    const hoy = new Date();
    const diaHoy = hoy.getDay();
    let diff = numDia - diaHoy;
    if (diff < 0) diff += 7;
    const fecha = new Date(hoy);
    fecha.setDate(hoy.getDate() + diff);
    return fecha;
}

function formatearFechaDesdeDate(date) {
    const diaSemana = capitalize(date.toLocaleDateString('es-AR', { weekday: 'long' }));
    const diaNumero = date.getDate();
    const mes = capitalize(date.toLocaleDateString('es-AR', { month: 'long' }));
    const anio = date.getFullYear();
    return `${diaSemana} ${diaNumero}/${mes}/${anio}`;
}

async function scrapeCosmos() {
    console.log('🎬 Scraping Cine Cosmos UBA (sin TMDB)');
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();

    try {
        await page.goto('https://www.cinecosmos.uba.ar/index.php#cartelera', { waitUntil: 'networkidle2', timeout: 30000 });
        await page.waitForSelector('.card', { timeout: 10000 });

        const peliculasBase = await page.evaluate((diasMap) => {
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
                let pais = 'No especificado';
                const lightTextElem = card.querySelector('.lightText');
                if (lightTextElem) {
                    const text = lightTextElem.innerText;
                    const durMatch = text.match(/(\d+)m/);
                    if (durMatch) duracion = durMatch[1];
                    const paisMatch = text.match(/^([A-Za-zÁÉÍÓÚÑ\s]+)\s*\//);
                    if (paisMatch) pais = paisMatch[1].trim();
                }

                const footerElem = card.querySelector('.card-footer .textoPeliFooter');
                let horarios = [];
                let diasSemana = [];
                if (footerElem) {
                    let footerText = footerElem.innerText;
                    const partes = footerText.split('|');
                    if (partes.length >= 2) {
                        const diasRaw = partes[0].trim().toLowerCase();
                        diasSemana = diasRaw.split(/\s+/).filter(d => diasMap[d]);
                        const horariosRaw = partes[1].trim();
                        horarios = horariosRaw.split(' - ').map(h => h.trim()).filter(h => /\d{1,2}:\d{2}/.test(h));
                    } else {
                        horarios = footerText.split(' - ').map(h => h.trim()).filter(h => /\d{1,2}:\d{2}/.test(h));
                        if (horarios.length) diasSemana = ['lu','ma','mi','ju','vi','sá','do'];
                    }
                }

                let poster = '';
                const imgElem = card.querySelector('.card-img-top');
                if (imgElem && imgElem.src) {
                    poster = imgElem.src;
                    if (poster.startsWith('/')) poster = 'https://www.cinecosmos.uba.ar' + poster;
                }

                if (horarios.length === 0 || diasSemana.length === 0) return;

                resultados.push({ titulo, director, duracion, pais, horarios, diasSemana, poster });
            });
            return resultados;
        }, diasAbrMap);

        console.log(`   Encontradas ${peliculasBase.length} películas con horarios.`);

        const funciones = [];

        for (let i = 0; i < peliculasBase.length; i++) {
            const p = peliculasBase[i];
            console.log(`   Procesando: ${p.titulo} (${p.pais}, ${p.duracion} min)`);
            const posterFinal = p.poster; // sin TMDB

            for (const diaAbr of p.diasSemana) {
                const diaNum = diasAbrMap[diaAbr];
                if (diaNum === undefined) continue;
                const fecha = getFechaProximoDia(diaNum);
                const fechaFormateada = formatearFechaDesdeDate(fecha);
                for (const horario of p.horarios) {
                    funciones.push({
                        id_funcion: `cosmos_${Date.now()}_${i}_${diaAbr}_${horario.replace(':', '')}`,
                        titulo: p.titulo,
                        director: p.director,
                        duracion: p.duracion,
                        pais: p.pais,
                        cine: 'Cine Cosmos UBA',
                        ciudad: 'CABA',
                        fecha: fechaFormateada,
                        idioma: 'Idioma original con subtítulos',
                        horarios: [horario],
                        seccion: 'cartelera',
                        poster: posterFinal,
                        sinopsis: 'Sin sinopsis disponible',
                        linkTrailer: ''
                    });
                }
            }
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