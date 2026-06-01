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

// Limpieza agresiva (elimina sinopsis largas, scripts, etc.)
function limpiarHTML(html) {
    let limpio = html.replace(/<div class="info">[\s\S]*?<\/div>/, '');
    limpio = limpio.replace(/<script[\s\S]*?<\/script>/gi, '');
    limpio = limpio.replace(/<style[\s\S]*?<\/style>/gi, '');
    // Eliminar párrafos de sinopsis largos que no contengan datos de funciones
    limpio = limpio.replace(/<p>([\s\S]*?)<\/p>/g, (match, content) => {
        if (content.length > 300 && !content.match(/jueves|viernes|sábado|domingo|lunes|martes|miércoles|horas?/i)) {
            return '';
        }
        return match;
    });
    const inicio = limpio.indexOf('<div>');
    const fin = limpio.indexOf('<div class="info">');
    if (inicio !== -1 && fin !== -1) return limpio.substring(inicio, fin);
    return limpio;
}

// Normalizar meses según el rango de fechas del evento
function normalizarMes(fecha, mesPrincipal, diaInicioRango, anioFuncion) {
    // mesPrincipal viene del info (ej. 'mayo' o 'junio')
    const meses = { 'ene': 'ENE', 'feb': 'FEB', 'mar': 'MAR', 'abr': 'ABR',
                    'may': 'MAY', 'jun': 'JUN', 'jul': 'JUL', 'ago': 'AGO',
                    'sep': 'SEP', 'oct': 'OCT', 'nov': 'NOV', 'dic': 'DIC' };
    const mesEsperado = meses[mesPrincipal.slice(0,3)];
    const partes = fecha.split('/');
    if (partes.length !== 3) return fecha;
    let mesActual = partes[1];
    let dia = parseInt(partes[0].split(' ')[1], 10);
    // Si el mes actual no coincide con el esperado y además el día es menor al inicio del rango
    if (mesActual !== mesEsperado && diaInicioRango && dia < diaInicioRango) {
        partes[1] = mesEsperado;
        return partes.join('/');
    }
    return fecha;
}

// Extracción con IA + reintentos
async function extraerConIA(html, tituloEvento, reintento = 0) {
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
            if (reintento < 2) {
                console.log(`   Reintentando (${reintento+1}/2)...`);
                return extraerConIA(html, tituloEvento, reintento+1);
            }
            return [];
        }
        let jsonStr = jsonMatch[0];
        jsonStr = jsonStr.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

        let parsed;
        try {
            parsed = JSON.parse(jsonStr);
        } catch (parseError) {
            console.warn(`JSON malformado, intentando reparar con jsonrepair...`);
            try {
                const repaired = jsonrepair(jsonStr);
                parsed = JSON.parse(repaired);
            } catch (repairError) {
                console.error(`No se pudo reparar el JSON.`);
                if (reintento < 2) {
                    console.log(`   Reintentando (${reintento+1}/2)...`);
                    return extraerConIA(html, tituloEvento, reintento+1);
                }
                return [];
            }
        }

        if (!Array.isArray(parsed)) {
            console.error(`La respuesta no es un array.`);
            if (reintento < 2) {
                console.log(`   Reintentando (${reintento+1}/2)...`);
                return extraerConIA(html, tituloEvento, reintento+1);
            }
            return [];
        }
        return parsed;
    } catch (error) {
        console.error(`Error en IA para ${tituloEvento}:`, error.message);
        if (reintento < 2) {
            console.log(`   Reintentando (${reintento+1}/2)...`);
            return extraerConIA(html, tituloEvento, reintento+1);
        }
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
        // Obtener mes y rango de fechas desde el primer .info (para normalización)
        let mesPrincipal = 'mayo';
        let anioGlobal = new Date().getFullYear();
        let diaInicioRango = null;
        const infoDiv = $('.info').first();
        if (infoDiv.length) {
            const textoRango = infoDiv.find('li').filter((i, el) => $(el).text().includes('Funciones:')).text();
            if (textoRango) {
                const matchMes = textoRango.match(/de\s+([a-z]+)/i);
                if (matchMes) mesPrincipal = matchMes[1].toLowerCase();
                const matchAnio = textoRango.match(/\b(20\d{2})\b/);
                if (matchAnio) anioGlobal = parseInt(matchAnio[1]);
                const matchInicio = textoRango.match(/del?\s*(\d+)/i);
                if (matchInicio) diaInicioRango = parseInt(matchInicio[1]);
            }
        }

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
                const eventResponse = await axios.get(eventApiUrl, { responseType: 'text', timeout: 60000 });
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

                // Normalizar meses según el rango del evento
                for (let f of funciones) {
                    if (f.fecha) {
                        const fechaNormalizada = normalizarMes(f.fecha, mesPrincipal, diaInicioRango, anioGlobal);
                        if (fechaNormalizada !== f.fecha) {
                            console.log(`   Corrigiendo mes: ${f.fecha} -> ${fechaNormalizada}`);
                            f.fecha = fechaNormalizada;
                        }
                    }
                }

                let contador = 0;
                for (let f of funciones) {
                    f.fecha = validarFecha(f.fecha);
                    f.horario = validarHorario(f.horario);
                    if (!f.fecha || !f.horario) continue;
                    f.anio = validarAnio(f.anio);
                    f.duracion = validarDuracion(f.duracion);
                    if (!f.director || f.director.trim() === '') f.director = 'No especificado';

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
                        sinopsis: '',
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