// backend/scraper_cosmos.js
const fs = require('fs').promises;
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, 'peliculas_cosmos.json');
const TMDB_API_KEY = process.env.TMDB_API_KEY || '62dff612c354dd50dbff40ca176b461c';
const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';
const MIN_SIMILARITY_SCORE = 70;
const POPULARITY_WEIGHT = 0.33;
const SIMILARITY_EXACT = 100;
const SIMILARITY_PARTIAL = 80;
const BONUS_YEAR = 100;
const BONUS_DIRECTOR = 200;

// Reutilizamos funciones de normalización y TMDB del scraper de Gaumont
function normalizarTexto(str) {
    if (!str) return '';
    return str.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');
}

async function getDirectorFromTMDB(movieId) {
    try {
        const url = `https://api.themoviedb.org/3/movie/${movieId}/credits?api_key=${TMDB_API_KEY}`;
        const response = await fetch(url);
        if (!response.ok) return null;
        const data = await response.json();
        const director = data.crew?.find(member => member.job === 'Director');
        return director ? normalizarTexto(director.name) : null;
    } catch (error) {
        console.error(`   Error obteniendo director para ID ${movieId}: ${error.message}`);
        return null;
    }
}

async function getPosterFromTMDB(movieTitle, year = null, directorName = null) {
    if (!TMDB_API_KEY) return '';
    try {
        let url = `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(movieTitle)}&api_key=${TMDB_API_KEY}&language=es&include_adult=false&region=AR&with_original_language=es`;
        if (year) url += `&year=${year}`;
        const response = await fetch(url);
        if (!response.ok) return '';
        const data = await response.json();
        if (!data.results || data.results.length === 0) return '';

        const tituloNormalizado = normalizarTexto(movieTitle);
        const directorNormalizado = directorName ? normalizarTexto(directorName) : null;

        const candidates = [];
        for (const movie of data.results.slice(0, 10)) {
            if (!movie.poster_path) continue;
            const tmdbTitleNorm = normalizarTexto(movie.title);
            const tmdbOriginalTitleNorm = normalizarTexto(movie.original_title || '');
            let similarity = 0;
            if (tmdbTitleNorm === tituloNormalizado || tmdbOriginalTitleNorm === tituloNormalizado) {
                similarity = SIMILARITY_EXACT;
            } else if (tmdbTitleNorm.includes(tituloNormalizado) || tituloNormalizado.includes(tmdbTitleNorm) ||
                       tmdbOriginalTitleNorm.includes(tituloNormalizado) || tituloNormalizado.includes(tmdbOriginalTitleNorm)) {
                similarity = SIMILARITY_PARTIAL;
            }

            let yearMatch = false;
            if (year && movie.release_date) {
                const releaseYear = movie.release_date.substring(0,4);
                if (releaseYear === year.toString()) yearMatch = true;
            }

            let directorMatch = false;
            if (directorNormalizado) {
                const tmdbDirector = await getDirectorFromTMDB(movie.id);
                if (tmdbDirector && tmdbDirector === directorNormalizado) directorMatch = true;
            }

            let score = (movie.popularity || 0) * POPULARITY_WEIGHT + similarity;
            if (yearMatch) score += BONUS_YEAR;
            if (directorMatch) score += BONUS_DIRECTOR;
            candidates.push({ ...movie, score });
        }
        candidates.sort((a, b) => b.score - a.score);

        if (candidates.length > 0 && candidates[0].score >= MIN_SIMILARITY_SCORE) {
            console.log(`      ✅ TMDB: "${candidates[0].title}" (${candidates[0].release_date ? candidates[0].release_date.substring(0,4) : '?'}) score=${Math.round(candidates[0].score)}`);
            return `${TMDB_IMAGE_BASE_URL}${candidates[0].poster_path}`;
        }
        console.log(`      ⚠️ No se encontró póster aceptable para "${movieTitle}"`);
        return '';
    } catch (error) {
        console.error(`   Error en TMDB: ${error.message}`);
        return '';
    }
}

async function scrapeCosmos() {
    console.log('🎬 Iniciando scraping del Cine Cosmos UBA...');
    try {
        const response = await fetch('https://www.cinecosmos.uba.ar/index.php');
        const html = await response.text();

        // Buscar la sección de la cartelera (delimitada por "####")
        const startMarker = '####';
        const startIndex = html.indexOf(startMarker);
        if (startIndex === -1) throw new Error('No se encontró la cartelera en la página.');
        const carteleraText = html.substring(startIndex);

        // Dividir por "####" y filtrar entradas vacías
        const rawMovies = carteleraText.split('####').filter(block => block.trim().length > 0);
        console.log(`   Encontradas ${rawMovies.length} películas.`);

        const funciones = [];

        for (const raw of rawMovies) {
            // Extraer título: todo lo que está antes de "Dirección:"
            const tituloMatch = raw.match(/^([^D]+?)Dirección:/);
            let titulo = tituloMatch ? tituloMatch[1].trim() : '';
            if (!titulo) {
                // Si no hay patrón, tomar hasta el primer salto de línea
                const firstLine = raw.split('\n')[0].trim();
                if (firstLine) titulo = firstLine;
                else continue;
            }

            // Extraer director
            const directorMatch = raw.match(/Dirección:\s*([^\n]+)/);
            const director = directorMatch ? directorMatch[1].trim() : 'No especificado';

            // Extraer país y duración: patrón "País / 123m"
            const paisDuracionMatch = raw.match(/([A-Za-zÁÉÍÓÚÑ\s]+)\s*\/\s*(\d+)\s*min/);
            let pais = 'No especificado';
            let duracion = 'N/A';
            if (paisDuracionMatch) {
                pais = paisDuracionMatch[1].trim();
                duracion = paisDuracionMatch[2].trim();
            }

            // Extraer horarios (formato HH:MM)
            const horarios = [];
            const horarioRegex = /(\d{1,2}:\d{2})/g;
            let match;
            while ((match = horarioRegex.exec(raw)) !== null) {
                horarios.push(match[1]);
            }

            if (horarios.length === 0) {
                console.log(`   ⚠️ Película "${titulo}" sin horarios, omitida.`);
                continue;
            }

            // Buscar póster en TMDB (usamos título y director)
            console.log(`   Procesando: ${titulo} (Director: ${director})`);
            const poster = await getPosterFromTMDB(titulo, null, director);

            // Fecha actual para el campo "fecha" (o podríamos usar un día genérico)
            const hoy = new Date();
            const fechaFormateada = `${hoy.toLocaleDateString('es-AR', { weekday: 'long' })} ${hoy.getDate()}/${hoy.toLocaleDateString('es-AR', { month: 'long' })}/${hoy.getFullYear()}`;

            // Crear una entrada por cada función (como en el formato plano)
            funciones.push({
                id_funcion: `cosmos_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`,
                titulo: titulo,
                director: director,
                duracion: duracion,
                cine: 'Cine Cosmos UBA',
                ciudad: 'CABA',
                fecha: fechaFormateada,
                idioma: 'Idioma original con subtítulos',
                horarios: horarios,
                seccion: 'cartelera',
                poster: poster,
                sinopsis: 'Sin sinopsis disponible',
                linkTrailer: ''
            });
        }

        await fs.writeFile(OUTPUT_FILE, JSON.stringify(funciones, null, 2));
        console.log(`✅ Scraping Cosmos completado. ${funciones.length} funciones guardadas en ${OUTPUT_FILE}`);
        return funciones;
    } catch (error) {
        console.error('❌ Error en scraper de Cosmos:', error);
        return [];
    }
}

// Si se ejecuta directamente, corre el scraper
if (require.main === module) {
    scrapeCosmos();
}

module.exports = { scrapeCosmos };