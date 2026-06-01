const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const { jsonrepair } = require('jsonrepair');
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

// ------------------ Extracción con IA ------------------
async function extraerConIA(html, tituloEvento) {
    const prompt = `
Eres un extractor de cartelera de cine. Del siguiente HTML de la página del evento "${tituloEvento}", extrae TODAS las funciones de cine.

IMPORTANTE: Si el evento tiene múltiples días y horarios, DEBES incluir cada función (cada combinación de día y horario) como un objeto separado en el array. No omitas ninguna.

Devuelve ÚNICAMENTE un array JSON. No incluyas ningún otro texto antes o después del array.

Cada objeto debe tener estos campos exactos:
{
  "titulo": "nombre de la película",
  "fecha": "día abreviado en mayúsculas, espacio, número, barra, mes en mayúsculas, barra, año (el año de la función, ej. 2026). NO USES EL AÑO DE LA PELÍCULA EN ESTE CAMPO.",
  "horario": "HH:MM",
  "director": "nombre del director o 'No especificado'",
  "duracion": "número de minutos o 'N/A'",
  "sinopsis": "texto completo de la sinopsis (si es muy larga, puedes resumirla ligeramente, pero conserva la información principal)",
  "anio": "año de la película (4 dígitos)"
}

Ejemplo:
[
  {
    "titulo": "Ejemplo Película",
    "fecha": "DOM 29/MAY/2026",
    "horario": "18:00",
    "director": "Director Ejemplo",
    "duracion": "120",
    "sinopsis": "Sinopsis de ejemplo.",
    "anio": "2025"
  }
]

Reglas estrictas:
- Respeta EXACTAMENTE el formato de fecha y horario.
- Si hay múltiples horarios para un mismo título, crea un objeto por cada horario.
- Si algún dato no está disponible, usa "" para sinopsis, "No especificado" para director, "N/A" para duración.
- Para el año de la película, si no está explícito, déjalo vacío ("").

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
                model: 'google/gemini-1.5-flash-8b:free',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.1,
                max_tokens: 8192,
                plugins: [{ id: "response-healing" }]
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Error HTTP ${response.status}: ${errorText}`);
            return [];
        }

        const data = await response.json();
        let text = data.choices[0].message.content;
        text = text.replace(/```json\s*/g, '').replace(/```\s*/g, '');
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
            console.error(`No se encontró array JSON. Respuesta: ${text.substring(0, 200)}`);
            return [];
        }
        let jsonStr = jsonMatch[0];
        jsonStr = jsonStr.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

        try {
            return JSON.parse(jsonStr);
        } catch (parseError) {
            console.warn(`JSON malformado, intentando reparar con jsonrepair...`);
            try {
                const repaired = jsonrepair(jsonStr);
                return JSON.parse(repaired);
            } catch (repairError) {
                console.error(`No se pudo reparar el JSON.`);
                return [];
            }
        }
    } catch (error) {
        console.error(`Error en IA para ${tituloEvento}:`, error.message);
        return [];
    }
}

// ------------------ Scraper principal ------------------
async function scrapeLugones() {
    console.log('Iniciando scraping con ScrapingAnt + OpenRouter (Gemini 1.5 Flash 8B)');

    const apiKey = process.env.SCRAPINGANT_API_KEY;
    if (!apiKey) {
        console.error('❌ No se encontró SCRAPINGANT_API_KEY.');
        return;
    }

    try {
        const mainUrl = `https://api.scrapingant.com/v2/general?url=${encodeURIComponent(BASE_URL)}&x-api-key=${apiKey}&browser=true`;
        const mainResponse = await axios.get(mainUrl, { responseType: 'text' });
        let html;
        if (typeof mainResponse.data === 'string') html = mainResponse.data;
        else if (mainResponse.data && typeof mainResponse.data.content === 'string') html = mainResponse.data.content;
        else throw new Error('Formato inesperado de la API');

        if (!html || html.trim() === '') throw new Error('HTML vacío');

        const $ = cheerio.load(html);
        const eventos = [];
        $('.list-item').each((i, el) => {
            const titulo = $(el).find('h2').text().trim();
            const linkElement = $(el).find('.buttons a.button[href*="/ver/"]');
            if (linkElement.length === 0) return;
            let url = linkElement.attr('href');
            if (url.startsWith('/')) url = 'https://complejoteatral.gob.ar' + url;

            const excluir = ['visita', 'guía', 'taller', 'concierto', 'espectáculo', 'teatro', 'muestra', 'exposición'];
            const esNoCine = excluir.some(p => titulo.toLowerCase().includes(p));
            if (!esNoCine) {
                eventos.push({ tituloEvento: titulo, url });
                console.log(`   Evento aceptado: ${titulo}`);
            } else {
                console.log(`   Evento descartado: ${titulo}`);
            }
        });

        console.log(`\n✅ Total eventos a procesar: ${eventos.length}`);

        let todasLasFunciones = [];

        for (let idx = 0; idx < eventos.length; idx++) {
            const evento = eventos[idx];
            console.log(`\n📌 Procesando: ${evento.tituloEvento} (${evento.url})`);
            try {
                const eventApiUrl = `https://api.scrapingant.com/v2/general?url=${encodeURIComponent(evento.url)}&x-api-key=${apiKey}&browser=true`;
                const eventResponse = await axios.get(eventApiUrl, { responseType: 'text' });
                let eventHtml;
                if (typeof eventResponse.data === 'string') eventHtml = eventResponse.data;
                else if (eventResponse.data && typeof eventResponse.data.content === 'string') eventHtml = eventResponse.data.content;
                else throw new Error('Formato inesperado');

                const htmlLimpio = limpiarHTML(eventHtml);
                let funciones = await extraerConIA(htmlLimpio, evento.tituloEvento);

                if (!funciones.length) {
                    console.log(`   No se extrajeron funciones.`);
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
                    console.log(`   🎬 ${f.titulo} — ${f.fecha} ${f.horario} (película: ${f.anio || 's/a'}) | Director: ${f.director} | Duración: ${f.duracion}`);
                    contador++;
                }
                console.log(`      ✅ ${contador} funciones extraídas`);
            } catch (err) {
                console.error(`      ❌ Error: ${err.message}`);
            }
            await new Promise(r => setTimeout(r, 1000));
        }

        await fs.writeFile(OUTPUT_FILE, JSON.stringify(todasLasFunciones, null, 2));
        console.log(`\n✅ Scraping completado. Se guardaron ${todasLasFunciones.length} funciones en ${OUTPUT_FILE}`);
    } catch (error) {
        console.error('❌ Error general:', error);
    }
}

scrapeLugones();