const fs = require('fs').promises;
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, 'peliculas_cinemark.json');

// 1. Obtener lista de películas
// Usando la URL que encontraste
const MOVIES_API = 'https://bff.cinemark.com.ar/api/movies'; // O la que devuelve el listado completo

// 2. Obtener horarios por película
const SHOWTIMES_API = 'https://bff.cinemark.com.ar/api/cinema/showtimes';

// 3. Mapa de IDs de cines a nombres (opcional, puedes obtenerlo dinámicamente)
const THEATER_NAMES = {
    '734': 'Patio Bullrich',
    '103': 'Caballito',
    '733': 'Flores',
    '730': 'Alcorta',
    // Agrega más según veas en las respuestas
};

async function fetchJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} - ${url}`);
    return res.json();
}

async function fetchMovies() {
    // Ajusta según la estructura real de la respuesta
    const data = await fetchJSON(MOVIES_API);
    return data.data; // Asumiendo que viene en data
}

async function fetchShowtimes(movieCorporateId, theaterIds = []) {
    const params = new URLSearchParams();
    params.append('movieCorporateId', movieCorporateId);
    if (theaterIds.length) {
        params.append('theater', theaterIds.join(','));
    }
    const url = `${SHOWTIMES_API}?${params.toString()}`;
    const data = await fetchJSON(url);
    return data.data; // Asumiendo que viene en data
}

function extractHourFromISO(isoString) {
    const date = new Date(isoString);
    return date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatDate(isoString) {
    const date = new Date(isoString);
    const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    return `${capitalize(dias[date.getDay()])} ${date.getDate()}/${capitalize(meses[date.getMonth()])}/${date.getFullYear()}`;
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

async function scrapeCinemark() {
    console.log('🎬 Scraping Cinemark con API de horarios');
    const movies = await fetchMovies();
    console.log(`✅ ${movies.length} películas`);

    const todasFunciones = [];
    let idCounter = 1;

    for (const movie of movies) {
        console.log(`\n🎬 Procesando: ${movie.title}`);
        const showtimes = await fetchShowtimes(movie.corporateId);
        if (!showtimes || showtimes.length === 0) {
            console.log('   Sin horarios');
            continue;
        }

        // Agrupar por cine, fecha, idioma y formato
        const grupos = new Map();
        for (const session of showtimes) {
            const cineNombre = THEATER_NAMES[session.theaterId] || `Sala ${session.theaterId}`;
            const fechaISO = session.sessionDateTime.split('T')[0];
            const fechaLegible = formatDate(session.sessionDateTime);
            const idioma = session.language.shortName === 'CAST' ? 'Doblada' : (session.language.shortName === 'SUB' ? 'Subtitulada' : session.language.name);
            const formato = session.formats.map(f => f.shortName).join(' · ');
            const hora = extractHourFromISO(session.sessionDateTime);
            const key = `${cineNombre}|${fechaLegible}|${idioma}|${formato}`;
            if (!grupos.has(key)) {
                grupos.set(key, {
                    cine: cineNombre,
                    fecha: fechaLegible,
                    idioma: idioma,
                    formato: formato,
                    horarios: []
                });
            }
            grupos.get(key).horarios.push(hora);
        }

        for (const grupo of grupos.values()) {
            grupo.horarios.sort();
            todasFunciones.push({
                id_funcion: `cinemark_${movie.slug}_${idCounter++}`,
                titulo: movie.title,
                director: 'No especificado',
                duracion: movie.runTime,
                cine: grupo.cine,
                ciudad: 'CABA',
                fecha: grupo.fecha,
                idioma: grupo.idioma,
                horarios: grupo.horarios,
                seccion: movie.status === 'PRESALE' ? 'proximos' : 'cartelera',
                poster: movie.posterUrl,
                sinopsis: 'Sin sinopsis disponible',
                linkTrailer: ''
            });
        }
        console.log(`   ✅ ${grupos.size} grupos de horarios`);
    }

    await fs.writeFile(OUTPUT_FILE, JSON.stringify(todasFunciones, null, 2));
    console.log(`✅ ${todasFunciones.length} funciones guardadas`);
}

scrapeCinemark();