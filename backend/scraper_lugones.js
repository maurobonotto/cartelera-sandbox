const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs').promises;
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const OpenAI = require('openai');
require('dotenv').config();

const OUTPUT_FILE = path.join(__dirname, 'peliculas_lugones.json');
const BASE_URL = 'https://complejoteatral.gob.ar/cine';

const USE_GITHUB_MODELS = !!process.env.GITHUB_ACTIONS;
let openai, genAI, modelGemini;

if (USE_GITHUB_MODELS) {
    openai = new OpenAI({
        baseURL: "https://models.github.ai/inference/chat/completions",
        apiKey: process.env.GITHUB_TOKEN,
    });
    console.log('Usando GitHub Models (ejecución en GitHub Actions)');
} else {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    modelGemini = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
    console.log('Usando Gemini (ejecución local)');
}

function validarFecha(fecha) {
    const regex = /^(DOM|LUN|MAR|MIÉ|JUE|VIE|SÁB) (\d{1,2})\/(ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|NOV|DIC)\/(\d{4})$/;
    if (regex.test(fecha)) return fecha;
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
- No incluyas texto adicional fuera del JSON.
- Si algún dato no está disponible, usa "" para sinopsis, "No especificado" para director, "N/A" para duración.
- Para el año, si no está explícito, déjalo vacío ("").

HTML:
${html}
`;
    try {
        let text;
        if (USE_GITHUB_MODELS) {
            const response = await openai.chat.completions.create({
                model: "mistralai/ministral-3b",
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.1,
            });
            text = response.choices[0].message.content;
        } else {
            const result = await modelGemini.generateContent(prompt);
            text = result.response.text();
        }
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (!jsonMatch) throw new Error('No se encontró JSON');
        return JSON.parse(jsonMatch[0]);
    } catch (error) {
        console.error(`Error en IA para ${tituloEvento}:`, error.message);
        return [];
    }
}

async function scrapeLugones() {
    console.log('Iniciando scraping de Sala Lugones con axios+cheerio');
    try {
        const response = await axios.get(BASE_URL, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 30000
        });
        const $ = cheerio.load(response.data);
        const eventosUrls = [];
        $('a[href*="/ver/"]').each((i, el) => {
            let href = $(el).attr('href');
            if (href && !href.startsWith('http')) {
                href = `https://complejoteatral.gob.ar${href}`;
            }
            if (href && href.includes('/ver/')) {
                let tituloEvento = '';
                const parent = $(el).closest('.list-item');
                if (parent.length) {
                    tituloEvento = parent.find('h2').first().text().trim();
                } else {
                    tituloEvento = $(el).closest('div').find('h2').first().text().trim();
                }
                if (!tituloEvento) {
                    tituloEvento = $(el).text().trim();
                }
                eventosUrls.push({ tituloEvento, url: href });
            }
        });
        const unicos = [];
        const seen = new Set();
        for (const ev of eventosUrls) {
            if (!seen.has(ev.url)) {
                seen.add(ev.url);
                unicos.push(ev);
            }
        }
        console.log(`   ${unicos.length} eventos encontrados.`);
        let todasLasFunciones = [];
        for (const evento of unicos) {
            console.log(`\nProcesando: ${evento.tituloEvento}`);
            try {
                const eventResponse = await axios.get(evento.url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    },
                    timeout: 30000
                });
                const html = eventResponse.data;
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
    }
}

scrapeLugones();