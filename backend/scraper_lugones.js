const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const OUTPUT_FILE = path.join(__dirname, 'peliculas_lugones.json');
const BASE_URL = 'https://complejoteatral.gob.ar/cine';

// ------------------ Validaciones (corregidas) ------------------
function validarFecha(fecha) {
    // Normalizar días: SAB -> SÁB, MIE -> MIÉ, etc.
    let fechaNorm = fecha
        .replace(/^SAB/, 'SÁB')
        .replace(/^MIE/, 'MIÉ')
        .replace(/^JUE/, 'JUE')
        .replace(/^VIE/, 'VIE')
        .replace(/^DOM/, 'DOM')
        .replace(/^LUN/, 'LUN')
        .replace(/^MAR/, 'MAR')
        .replace(/^MI[EÉ]/, 'MIÉ');
    
    const regex = /^(DOM|LUN|MAR|MIÉ|JUE|VIE|SÁB) (\d{1,2})\/(ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|NOV|DIC)\/(\d{4})$/;
    if (regex.test(fechaNorm)) return fechaNorm;
    console.warn(`Fecha inválida: ${fecha} (normalizada: ${fechaNorm})`);
    return null;
}

function validarHorario(horario) {
    const regex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
    if (regex.test(horario)) return horario;
    console.warn(`Horario inválido: ${horario}`);
    return null;
}

function validarAnio(anio) {
    const currentYear = new Date().getFullYear();
    const maxYear = currentYear + 2;
    const num = parseInt(anio, 10);
    if (!isNaN(num) && num >= 1900 && num <= maxYear) return String(num);
    if (anio && anio.match(/^\d{4}$/)) return anio;
    return '';
}

function validarDuracion(duracion) {
    const num = parseInt(duracion, 10);
    if (!isNaN(num) && num >= 1 && num <= 500) return String(num);
    return 'N/A';
}

function limpiarHTML(html) {
    const inicio = html.indexOf('<div>');
    const fin = html.indexOf('<div class="info">');
    if (inicio !== -1 && fin !== -1) return html.substring(inicio, fin);
    return html;
}

// ------------------ Extracción con OpenRouter (corregido) ------------------
async function extraerConIA(html, tituloEvento) {
    const prompt = `
Eres un extractor de cartelera de cine. Del siguiente HTML de la página del evento "${tituloEvento}", extrae TODAS las funciones de cine.

Devuelve ÚNICAMENTE un array JSON. Cada objeto debe tener estos campos exactos:
{
  "titulo": "nombre de la película",
  "fecha": "día abreviado en mayúsculas, espacio, número, barra, mes en mayúsculas, barra, año. Ejemplo: DOM 29/MAY/2026",
  "horario": "HH:MM (dos dígitos para hora, dos para minutos)",
  "director": "nombre del director o 'No especificado'",
  "duracion": "número de minutos como string, o 'N/A'",
  "sinopsis": "texto completo de la sinopsis",
  "anio": "año de la película (4 dígitos)"
}

Reglas estrictas:
- Respeta EXACTAMENTE el formato de fecha y horario.
- Si hay múltiples horarios para un mismo título, crea un objeto por cada horario.
- No incluyas texto adicional fuera del JSON. Nada de explicaciones, solo el array.
- Si algún dato no está disponible, usa "" para sinopsis, "No especificado" para director, "N/A" para duración.
- Para el año, si no está explícito, déjalo vacío ("").

HTML:
${html}
`;

    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
    if (!OPENROUTER_API_KEY) {
        console.error(`   No se encontró OPENROUTER_API_KEY.`);
        return [];
    }

    try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'openrouter/free',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.1,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Error HTTP ${response.status}: ${errorText}`);
            return [];
        }

        const data = await response.json();
        let text = data.choices[0].message.content;
        
        // Limpiar posibles respuestas no JSON (extraer el primer array)
        let jsonMatch = text.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
            // Intento alternativo: buscar un array que comience con [
            jsonMatch = text.match(/(\[\s*\{[\s\S]*\}\s*\])/);
            if (!jsonMatch) {
                console.error(`Respuesta no contiene JSON: ${text.substring(0, 200)}`);
                return [];
            }
        }
        
        return JSON.parse(jsonMatch[0]);
    } catch (error) {
        console.error(`Error en IA para ${tituloEvento}:`, error.message);
        return [];
    }
}

// ------------------ Scraper principal ------------------
async function scrapeLugones() {
    console.log('Iniciando scraping con Puppeteer Stealth + OpenRouter');
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    try {
        await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 60000 });
        await new Promise(r => setTimeout(r, 5000));
        await page.waitForSelector('.list-item', { timeout: 30000 });

        const eventos = await page.evaluate(() => {
            const items = document.querySelectorAll('.list-item');
            return Array.from(items).map(item => {
                const tituloEvento = item.querySelector('h2')?.innerText.trim() || '';
                const link = item.querySelector('.buttons a.button[href*="/ver/"]')?.getAttribute('href');
                if (!link) return null;
                let url = link.startsWith('http') ? link : `https://complejoteatral.gob.ar${link}`;
                return { tituloEvento, url };
            }).filter(e => e !== null);
        });
        console.log(`   ${eventos.length} eventos encontrados.`);

        let todasLasFunciones = [];

        for (const evento of eventos) {
            console.log(`\nProcesando: ${evento.tituloEvento}`);
            try {
                await page.goto(evento.url, { waitUntil: 'networkidle2', timeout: 60000 });
                await new Promise(r => setTimeout(r, 2000));
                const html = await page.content();
                const htmlLimpio = limpiarHTML(html);
                let funciones = await extraerConIA(htmlLimpio, evento.tituloEvento);

                if (!funciones.length) {
                    console.log(`   No se extrajeron funciones para ${evento.tituloEvento}`);
                    continue;
                }

                let contador = 0;
                for (let f of funciones) {
                    f.fecha = validarFecha(f.fecha);
                    f.horario = validarHorario(f.horario);
                    if (!f.fecha || !f.horario) continue;
                    f.anio = validarAnio(f.anio);
                    f.duracion = validarDuracion(f.duracion);
                    if (!f.director || f.director.trim() === '') f.director = 'No especificado';
                    if (!f.sinopsis) f.sinopsis = '';

                    const idBase = `lugones_${evento.tituloEvento.replace(/\s/g, '_')}_${f.titulo.replace(/\s/g, '_')}_${f.fecha.replace(/\//g, '-')}`;
                    const idFuncion = `${idBase}_${f.horario.replace(':', '')}`;
                    todasLasFunciones.push({
                        id_funcion: idFuncion,
                        titulo: f.titulo,
                        director: f.director,
                        duracion: f.duracion,
                        cine: 'Sala Leopoldo Lugones',
                        ciudad: 'CABA',
                        fecha: f.fecha,
                        idioma: 'Sin especificar',
                        horarios: [f.horario],
                        seccion: 'cartelera',
                        poster: null,
                        sinopsis: f.sinopsis,
                        linkTrailer: '',
                        anio: f.anio
                    });
                    console.log(`   ${f.titulo} — ${f.fecha} ${f.horario} (${f.anio || 's/a'}) | Director: ${f.director} | Duración: ${f.duracion}`);
                    contador++;
                }
                console.log(`      ✅ ${contador} funciones extraídas`);
            } catch (err) {
                console.error(`      Error en evento ${evento.tituloEvento}: ${err.message}`);
            }
            await new Promise(r => setTimeout(r, 1000));
        }

        await fs.writeFile(OUTPUT_FILE, JSON.stringify(todasLasFunciones, null, 2));
        console.log(`\n✅ Scraping completado. Se guardaron ${todasLasFunciones.length} funciones en ${OUTPUT_FILE}`);
        return todasLasFunciones;
    } catch (error) {
        console.error('❌ Error general:', error);
        return [];
    } finally {
        await browser.close();
    }
}

scrapeLugones();