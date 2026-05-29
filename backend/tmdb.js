// backend/tmdb.js
const TMDB_API_KEY = process.env.TMDB_API_KEY || '62dff612c354dd50dbff40ca176b461c';
const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';
const MIN_SIMILARITY_SCORE = 70;
const POPULARITY_WEIGHT = 0.33;
const SIMILARITY_EXACT = 100;
const SIMILARITY_PARTIAL = 80;
const BONUS_YEAR = 100;
const BONUS_DIRECTOR = 200;

function normalizarTexto(str) {
    if (!str) return '';
    return str
        .toLowerCase()
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

module.exports = { getPosterFromTMDB, normalizarTexto };