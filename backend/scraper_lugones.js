const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();

const OUTPUT_FILE = path.join(__dirname, 'peliculas_lugones.json');
const BASE_URL = 'https://complejoteatral.gob.ar/cine';

// ------------------ Validaciones ------------------
function validarFecha(fecha) {
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
    console.warn(`Fecha inválida: ${fecha}`);
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

// ------------------ Extracción con IA (OpenRouter + response-healing) ------------------
async function extraerConIA(html, tituloEvento) {
    const prompt = `
Eres un extractor de cartelera de cine. Del siguiente HTML de la página del evento "${tituloEvento}", extrae TODAS las funciones de cine.

Devuelve ÚNICAMENTE un array JSON. No incluyas ningún otro texto antes o después del array.

Cada objeto debe tener estos campos exactos:
{
  "titulo": "nombre de la película",
  "fecha": "día abreviado en mayúsculas, espacio, número, barra, mes en mayúsculas, barra, año. Ejemplo: DOM 29/MAY/2026",
  "horario": "HH:MM (dos dígitos para hora, dos para minutos)",
  "director": "nombre del director o 'No especificado'",
  "duracion": "número de minutos como string, o 'N/A'",
  "sinopsis": "texto completo de la sinopsis",
  "anio": "año de la película (4 dígitos)"
}

Ejemplo de respuesta esperada:
[
  {
    "titulo": "Ejemplo Película",
    "fecha": "DOM 29/MAY/2026",
    "horario": "18:00",
    "director": "Director Ejemplo",
    "duracion": "120",
    "sinopsis": "Esta es una sinopsis de ejemplo.",
    "anio": "2026"
  }
]

Reglas estrictas:
- Respeta EXACTAMENTE el formato de fecha y horario.
- Si hay múltiples horarios para un mismo título, crea un objeto por cada horario.
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
                plugins: [{ id: "response-healing" }]   // ← repara JSON automáticamente
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Error HTTP ${response.status}: ${errorText}`);
            return [];
        }

        const data = await response.json();
        let text = data.choices[0].message.content;
        
        // Limpiar bloques de código markdown
        text = text.replace(/```json\s*/g, '').replace(/```\s*/g, '');
        
        // Extraer array JSON
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
            console.error(`No se encontró array JSON en la respuesta. Respuesta: ${text.substring(0, 200)}`);
            return [];
        }
        
        let jsonStr = jsonMatch[0];
        // Limpiar caracteres de control no válidos
        jsonStr = jsonStr.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
        
        return JSON.parse(jsonStr);
    } catch (error) {
        console.error(`Error en IA para ${tituloEvento}:`, error.message);
        return [];
    }
}

// ------------------ Scraper principal (con ScrapingAnt y filtrado de eventos) ------------------
async function scrapeLugones() {
    console.log('Iniciando scraping con ScrapingAnt + OpenRouter + Filtro de eventos');

    const apiKey = process.env.SCRAPINGANT_API_KEY;
    if (!apiKey) {
        console.error('❌ No se encontró SCRAPINGANT_API_KEY. Revisa los secrets de GitHub.');
        return;
    }

    try {
        // 1. Descargar página principal con ScrapingAnt
        const mainUrl = `https://api.scrapingant.com/v2/general?url=${encodeURIComponent(BASE_URL)}&x-api-key=${apiKey}&browser=true`;
        const mainResponse = await axios.get(mainUrl);
        const html = mainResponse.data.content;   // ← usar .content

        // 2. Cargar HTML con cheerio y extraer eventos de cine (filtrar no deseados)
        const $ = cheerio.load(html);
        const eventos = [];

        $('.list-item').each((i, el) => {
            const titulo = $(el).find('h2').text().trim();
            const linkElement = $(el).find('.buttons a.button[href*="/ver/"]');
            if (linkElement.length === 0) return;

            let url = linkElement.attr('href');
            if (url.startsWith('/')) url = 'https://complejoteatral.gob.ar' + url;

            // Palabras que indican que NO es un evento de cine
            const palabrasExcluir = ['visita', 'guía', 'taller', 'concierto', 'espectáculo', 'teatro', 'muestra'];
            const esNoCine = palabrasExcluir.some(p => titulo.toLowerCase().includes(p));

            // También podemos incluir solo aquellos que parezcan ciclos de cine (opcional)
            const palabrasCine = ['CINE', 'PELÍCULA', 'CICLO', 'JUSTA', 'TAXI', 'ADJANI', 'GARDEL', 'VARDA', '1926', 'EXPRESIONISMO'];
            const esCine = palabrasCine.some(p => titulo.toUpperCase().includes(p));

            if (!esNoCine && esCine) {
                eventos.push({ tituloEvento: titulo, url: url });
            } else {
                console.log(`   Evento descartado (no cine): ${titulo}`);
            }
        });

        console.log(`   ${eventos.length} eventos de cine encontrados.`);

        let todasLasFunciones = [];

        for (let idx = 0; idx < eventos.length; idx++) {
            const evento = eventos[idx];
            console.log(`\nProcesando evento ${idx+1}: ${evento.tituloEvento} (${evento.url})`);
            try {
                // Descargar HTML del evento con ScrapingAnt
                const eventApiUrl = `https://api.scrapingant.com/v2/general?url=${encodeURIComponent(evento.url)}&x-api-key=${apiKey}&browser=true`;
                const eventResponse = await axios.get(eventApiUrl);
                const eventHtml = eventResponse.data.content;
                const htmlLimpio = limpiarHTML(eventHtml);

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
            // Pequeña pausa entre eventos para no saturar la API
            await new Promise(r => setTimeout(r, 1000));
        }

        await fs.writeFile(OUTPUT_FILE, JSON.stringify(todasLasFunciones, null, 2));
        console.log(`\n✅ Scraping completado. Se guardaron ${todasLasFunciones.length} funciones en ${OUTPUT_FILE}`);
    } catch (error) {
        console.error('❌ Error general:', error);
    }
}

scrapeLugones();