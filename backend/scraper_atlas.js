// backend/scraper_atlas.js
const fs = require('fs').promises;
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, 'peliculas_atlas.json');

// Lista de complejos de Atlas Cines (obtenida del HTML del selector)
// Formato: { codComplejo, nombre, ciudad }
const COMPLEJOS = [
    { codComplejo: 191, nombre: "Caballito", ciudad: "CABA" },
    { codComplejo: 192, nombre: "Catan", ciudad: "CABA" },
    { codComplejo: 194, nombre: "Alcorta", ciudad: "CABA" },
    { codComplejo: 195, nombre: "Patio Bullrich", ciudad: "CABA" },
    { codComplejo: 196, nombre: "Nordelta", ciudad: "Tigre" },
    { codComplejo: 197, nombre: "Flores", ciudad: "CABA" },
    { codComplejo: 198, nombre: "Liniers", ciudad: "CABA" }
];

// Función para capitalizar primera letra
function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// Formatear fecha ISO a legible (ej: "Jueves 29/Mayo/2026")
function formatearFecha(fechaISO) {
    const date = new Date(fechaISO);
    const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const diaSemana = capitalize(dias[date.getDay()]);
    const diaNumero = date.getDate();
    const mes = capitalize(meses[date.getMonth()]);
    const anio = date.getFullYear();
    return `${diaSemana} ${diaNumero}/${mes}/${anio}`;
}

// Obtener funciones de un complejo específico
async function getFuncionesByComplejo(codComplejo) {
    const url = `https://www.atlascines.com/Funciones/GetPeliculasPorComplejo?codComplejo=${codComplejo}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status} para complejo ${codComplejo}`);
    return response.json();
}

async function scrapeAtlas() {
    console.log('🎬 Scraping Cines Atlas (todas las salas)');
    let todasLasFunciones = [];
    let contadorFunciones = 0;

    for (const complejo of COMPLEJOS) {
        console.log(`   Procesando complejo: ${complejo.nombre} (${complejo.codComplejo})`);
        try {
            const funciones = await getFuncionesByComplejo(complejo.codComplejo);
            if (!funciones || funciones.length === 0) {
                console.log(`      ⚠️ No se encontraron funciones.`);
                continue;
            }

            for (const func of funciones) {
                const pelicula = func.cachePeliculas;
                if (!pelicula) continue;

                // Construir URL del póster (formato estándar de Atlas)
                let posterUrl = '';
                if (pelicula.filename) {
                    posterUrl = `https://www.atlascines.com/images/posters/${pelicula.filename}`;
                } else if (pelicula.codPelicula) {
                    posterUrl = `https://www.atlascines.com/images/posters/200_${pelicula.codPelicula}.jpg`;
                }

                // Fecha y horario
                const fechaISO = func.fecha; // "2026-05-29T00:00:00"
                const fechaLegible = formatearFecha(fechaISO);
                const horario = func.horaComienzo; // "16:00"

                // Idioma: si la película es subtitulada, lo indicamos; si no, asumimos doblada
                let idioma = pelicula.subtitulada ? 'Subtitulada' : 'Doblada';

                todasLasFunciones.push({
                    id_funcion: `atlas_${func.codFuncion}_${Date.now()}`,
                    titulo: pelicula.titulo,
                    director: 'No especificado', // Atlas no proporciona director
                    duracion: pelicula.duracion?.toString() || 'N/A',
                    cine: `Atlas ${complejo.nombre}`,
                    ciudad: complejo.ciudad,
                    fecha: fechaLegible,
                    idioma: idioma,
                    horarios: [horario],
                    seccion: 'cartelera',
                    poster: posterUrl,
                    sinopsis: pelicula.sinopsisCorta || pelicula.sinopsis || 'Sin sinopsis disponible',
                    linkTrailer: pelicula.urlTrailer || ''
                });
                contadorFunciones++;
            }
            console.log(`      ✅ ${funciones.length} funciones agregadas.`);
        } catch (error) {
            console.error(`      ❌ Error en complejo ${complejo.nombre}: ${error.message}`);
        }
        // Pequeña pausa entre complejos para no sobrecargar el servidor
        await new Promise(r => setTimeout(r, 300));
    }

    // Guardar archivo JSON
    await fs.writeFile(OUTPUT_FILE, JSON.stringify(todasLasFunciones, null, 2));
    console.log(`✅ Atlas: ${contadorFunciones} funciones guardadas en ${OUTPUT_FILE}`);
    return todasLasFunciones;
}

if (require.main === module) {
    scrapeAtlas();
}

module.exports = { scrapeAtlas };