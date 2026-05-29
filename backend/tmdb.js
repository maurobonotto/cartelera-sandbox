require('dotenv').config()
// backend/tmdb.js
const API_KEY = process.env.TMDB_API_KEY;
const BASE_URL = 'https://api.themoviedb.org/3';

if (!API_KEY) {
    console.error('❌ Error: Falta la variable de entorno TMDB_API_KEY');
}

async function getPosterFromTMDB(titulo, anio, director) {
    if (!API_KEY) return null;
    const searchUrl = `${BASE_URL}/search/movie?api_key=${API_KEY}&query=${encodeURIComponent(titulo)}&language=es`;
    try {
        const response = await fetch(searchUrl);
        const data = await response.json();
        if (data.results && data.results.length > 0) {
            let results = data.results;
            if (anio) {
                results = results.filter(m => m.release_date && m.release_date.startsWith(anio));
            }
            if (results.length > 0) {
                const movie = results[0];
                return movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null;
            }
        }
        return null;
    } catch (error) {
        return null;
    }
}

// NUEVA FUNCIÓN (devuelve objeto con poster y tmdb_id)
async function getTMDBInfo(titulo, anio, director) {
    if (!API_KEY) return { poster: null, tmdb_id: null };
    const searchUrl = `${BASE_URL}/search/movie?api_key=${API_KEY}&query=${encodeURIComponent(titulo)}&language=es`;
    try {
        const response = await fetch(searchUrl);
        const data = await response.json();
        if (data.results && data.results.length > 0) {
            let results = data.results;
            if (anio) {
                results = results.filter(m => m.release_date && m.release_date.startsWith(anio));
            }
            if (results.length > 0) {
                const movie = results[0];
                return {
                    poster: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null,
                    tmdb_id: movie.id
                };
            }
        }
        return { poster: null, tmdb_id: null };
    } catch (error) {
        return { poster: null, tmdb_id: null };
    }
}

module.exports = { getPosterFromTMDB, getTMDBInfo };