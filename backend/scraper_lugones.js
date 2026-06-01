const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const { jsonrepair } = require('jsonrepair');
require('dotenv').config();

const OUTPUT_FILE = path.join(__dirname, 'peliculas_lugones.json');
const BASE_URL = 'https://complejoteatral.gob.ar/cine';

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

// Limpieza agresiva para reducir tokens
function limpiarHTML(html) {
    // Eliminar bloque .info (precios, dirección, etc.)
    let limpio = html.replace(/<div class="info">[\s\S]*?<\/div>/, '');
    // Eliminar párrafos de sinopsis largos (más de 300 caracteres)
    limpio = limpio.replace(/<p>([\s\S]*?)<\/p>/g, (match, content) => {
        if (content.length > 300) return '<p>[resumen omitido]</p>';
        return match;
    });
    // Eliminar la palabra SINOPSIS y todo lo que la sigue hasta el próximo título
    limpio = limpio.replace(/SINOPSIS[\s\S]*?(?=<h2|<strong|<div class="info"|$)/gi, '');
    // Eliminar scripts y estilos
    limpio = limpio.replace(/<script[\s\S]*?<\/script>/gi, '');
    limpio = limpio.replace(/<style[\s\S]*?<\/style>/gi, '');
    
    const inicio = limpio.indexOf('<div>');
    const fin = limpio.indexOf('<div class="info">');
    if (inicio !== -1 && fin !== -1) return limpio.substring(inicio, fin);
    return limpio;
}

async function extraerConIA(html, tituloEvento) {
    const prompt = `
Eres un extractor de cartelera de cine. Del siguiente HTML de la página del evento "${tituloEvento}", extrae TODAS las funciones de cine.

NO EXTRAIGAS LA SINOPSIS. Omite ese campo.

Devuelve ÚNICAMENTE un array JSON. No incluyas texto adicional.

Cada objeto debe tener estos campos:
{
  "titulo": "nombre de la película",
  "fecha": "día abreviado en mayúsculas, espacio, número, barra, mes en mayúsculas, barra, año (año de la función, ej. 2026). NO USES EL AÑO DE LA PELÍCULA AQUÍ.",
  "horario": "HH:MM",
  "director": "nombre del director o 'No especificado'",
  "duracion": "número de minutos o 'N/A'",
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
    "anio": "2025"
  }
]

Reglas:
- Respeta EXACTAMENTE el formato de fecha y horario.
- Si hay múltiples horarios para un título, crea un objeto por cada horario.
- Usa "No especificado" si falta director, "N/A" si falta duración.
- El año de la película déjalo vacío ("") si no aparece.

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

async function scrapeLugones() {
    console.log('Iniciando scraping con ScrapingAnt + openrouter/free (sin sinopsis)');

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
        else throw new Error('Formato inesperado');

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
                    // Sinopsis vacía (la completará TMDB después)
                    const sinopsis = '';

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
                        sinopsis: sinopsis,
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