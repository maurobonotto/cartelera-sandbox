// backend/scraper_cacodelphia.js (sin TMDB)
const fs = require('fs').promises;
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, 'peliculas_cacodelphia.json');
const CINE_ID = 86; // CineArte Cacodelphia

function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// Formatear fecha ISO a legible (ej: "Jueves 29/Mayo/2026")
function formatearFecha(isoDate) {
    const date = new Date(isoDate);
    const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const diaSemana = capitalize(dias[date.getDay()]);
    const diaNumero = date.getDate();
    const mes = capitalize(meses[date.getMonth()]);
    const anio = date.getFullYear();
    return `${diaSemana} ${diaNumero}/${mes}/${anio}`;
}

// Obtener lista de películas desde nowPlaying
async function getMoviesList() {
    console.log('📋 Obteniendo lista de películas desde nowPlaying...');
    const url = `https://apiv2.gaf.adro.studio/nowPlaying/${CINE_ID}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const movies = data.data || [];
    console.log(`   ✅ Encontradas ${movies.length} películas.`);
    return movies;
}

// Obtener detalles y horarios de una película usando su pref
async function getMovieDetails(pref) {
    const url = `https://apiv2.gaf.adro.studio/movie/${CINE_ID}/${pref}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return data.data; // { movie: {...}, showtimes: [...] }
}

async function scrapeCacodelphia() {
    console.log('🎬 Scraping Cine Arte Cacodelphia (API directa, sin TMDB)');
    try {
        const moviesList = await getMoviesList();
        if (moviesList.length === 0) throw new Error('No se encontraron películas');

        let todasLasFunciones = [];
        let idCounter = 1;

        for (const movieSummary of moviesList) {
            const pref = movieSummary.pref;
            if (!pref) continue;
            console.log(`   Procesando: ${movieSummary.nombre}`);
            const details = await getMovieDetails(pref);
            const movie = details.movie;
            const showtimes = details.showtimes || [];

            if (showtimes.length === 0) {
                console.log(`   ⚠️ Sin horarios para "${movie.nombre}", omitida.`);
                continue;
            }

            // Poster original de la API (sin TMDB)
            let posterUrl = movie.poster;
            if (posterUrl && posterUrl.startsWith('/')) {
                posterUrl = `https://apiv2.gaf.adro.studio${posterUrl}`;
            }
            const posterFinal = posterUrl; // sin buscar en TMDB

            const duracion = movie.Duracion || 'N/A';
            const director = 'No especificado';
            const sinopsis = movie.descripcion || 'Sin sinopsis disponible';
            const linkTrailer = movie.urlTrailer || '';

            for (const st of showtimes) {
                const fechaISO = st.fechaHora.date;
                const fechaLegible = formatearFecha(fechaISO);
                const horario = fechaISO.split(' ')[1].slice(0, 5);
                const idiomaBase = st.lenguaje === 'Subt' ? 'Subtitulada' : (st.lenguaje === 'Esp' ? 'Doblada' : st.lenguaje || 'Sin especificar');
                const formato = st.formato || '2D';
                const idiomaCompleto = `${idiomaBase} / ${formato}`;

                todasLasFunciones.push({
                    id_funcion: `cacodelphia_${movie.id}_${idCounter++}`,
                    titulo: movie.nombre,
                    director: director,
                    duracion: duracion,
                    cine: 'Cine Arte Cacodelphia',
                    ciudad: 'CABA',
                    fecha: fechaLegible,
                    idioma: idiomaCompleto,
                    horarios: [horario],
                    seccion: 'cartelera',
                    poster: posterFinal,
                    sinopsis: sinopsis,
                    linkTrailer: linkTrailer
                });
            }
            console.log(`   ✅ ${showtimes.length} funciones agregadas.`);
            await new Promise(r => setTimeout(r, 300));
        }

        await fs.writeFile(OUTPUT_FILE, JSON.stringify(todasLasFunciones, null, 2));
        console.log(`✅ Cacodelphia: ${todasLasFunciones.length} funciones guardadas en ${OUTPUT_FILE}`);
        return todasLasFunciones;
    } catch (error) {
        console.error('❌ Error en scraper de Cacodelphia:', error);
        return [];
    }
}

if (require.main === module) scrapeCacodelphia();
module.exports = { scrapeCacodelphia };