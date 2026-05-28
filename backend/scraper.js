const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

const BASE_URL = 'https://agendadecine.ar';
const OUTPUT_FILE = path.join(__dirname, 'peliculas.json');

// Solo cines de Atlas que están en CABA (filtro inicial por nombre)
const ATLAS_CINES_CABA = [
  'Atlas Caballito',
  'Atlas Liniers',
  'Atlas Flores',
  'Atlas Patio Bullrich',
  'Atlas Alcorta'
];

// Función para esperar un tiempo (evitar sobrecarga)
const wait = (ms) => new Promise(r => setTimeout(r, ms));

// Extraer lista de películas desde la página principal
async function getMoviesList(page) {
  console.log('📋 Obteniendo lista de películas...');
  await page.goto(`${BASE_URL}/en-cartel/`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('.uc_post_grid_style_one_item', { timeout: 10000 });

  const movies = await page.evaluate(() => {
    const items = document.querySelectorAll('.uc_post_grid_style_one_item');
    const result = [];
    for (const item of items) {
      const titleElem = item.querySelector('.ue_p_title');
      const linkElem = item.querySelector('.uc_post_grid_style_one_image');
      if (titleElem && linkElem) {
        result.push({
          titulo: titleElem.innerText.trim(),
          url: linkElem.href
        });
      }
    }
    return result;
  });
  console.log(`   → Encontradas ${movies.length} películas.`);
  return movies;
}

// Extraer datos de la página de detalle de una película
async function scrapeMovieDetails(page, movie) {
  console.log(`🎬 Procesando: ${movie.titulo}`);
  await page.goto(movie.url, { waitUntil: 'networkidle2', timeout: 30000 });

  // Esperar a que cargue el contenido principal
  await page.waitForSelector('.movie-presentation, .info-column', { timeout: 10000 }).catch(() => console.log('   ⚠️ No se encontró la ficha técnica'));

  const details = await page.evaluate(() => {
    // Póster
    const posterElem = document.querySelector('.poster-column img');
    const poster = posterElem ? posterElem.src : '';

    // Sinopsis
    const sinopsisElem = document.querySelector('.sinopsis-text, .movie-synopsis');
    const sinopsis = sinopsisElem ? sinopsisElem.innerText.trim() : 'Sin sinopsis disponible.';

    // Director
    let director = 'No especificado';
    const dirElem = document.querySelector('.info-column p strong:first-child');
    if (dirElem && dirElem.innerText.includes('Director')) {
      director = dirElem.parentElement.innerText.replace('Director:', '').trim();
    }

    // Duración
    let duracion = 'N/A';
    const durElem = document.querySelector('.info-column p strong:nth-child(1)');
    if (durElem && durElem.innerText.includes('Duración')) {
      duracion = durElem.parentElement.innerText.replace('Duración:', '').trim();
    }

    // Género (no siempre visible, intentamos)
    let genero = 'N/A';
    const genElem = document.querySelector('.movie-genre, .genero');
    if (genElem) genero = genElem.innerText.replace('Género:', '').trim();

    // Link del tráiler (si hay un iframe o enlace a YouTube)
    let linkTrailer = '';
    const trailerLink = document.querySelector('a[href*="youtube"], a[href*="youtu.be"], iframe[src*="youtube"]');
    if (trailerLink) linkTrailer = trailerLink.href || trailerLink.src;

    // Horarios por cine
    const funcionesRaw = [];
    const cineBlocks = document.querySelectorAll('.cine-block, .showtimes-container .cine-block');
    for (const block of cineBlocks) {
      const cineNombreElem = block.querySelector('h4');
      if (!cineNombreElem) continue;
      let cineNombre = cineNombreElem.innerText.trim();
      // La dirección/ciudad suele estar entre paréntesis, ej: "Atlas Caballito (CABA)"
      const ciudadMatch = cineNombre.match(/\(([^)]+)\)/);
      const ciudad = ciudadMatch ? ciudadMatch[1] : '';

      // Filtramos solo cines de Atlas en CABA
      const esAtlasCABA = cineNombre.toLowerCase().includes('atlas') && ciudad.includes('CABA');
      if (!esAtlasCABA) continue;

      // Extraer horarios (todos los días combinados)
      const horarios = [];
      const funcionItems = block.querySelectorAll('.funcion-item, .showtimes-item');
      for (const item of funcionItems) {
        const horas = item.querySelectorAll('.horario-tag, .hour, .hora');
        horas.forEach(h => {
          const txt = h.innerText.trim();
          if (txt.match(/\d{1,2}:\d{2}/)) horarios.push(txt);
        });
      }
      if (horarios.length > 0) {
        funcionesRaw.push({
          cine: cineNombre,
          horarios: [...new Set(horarios)] // eliminar duplicados
        });
      }
    }
    return { poster, sinopsis, director, duracion, genero, linkTrailer, funciones: funcionesRaw };
  });

  // Combinar datos
  return {
    id: 0, // se asignará después
    titulo: movie.titulo,
    director: details.director,
    duracion: details.duracion,
    genero: details.genero,
    poster: details.poster,
    sinopsis: details.sinopsis,
    linkTrailer: details.linkTrailer,
    funciones: details.funciones
  };
}

async function main() {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  try {
    // 1. Obtener lista de películas
    const movies = await getMoviesList(page);
    if (movies.length === 0) throw new Error('No se encontraron películas');

    let allMovies = [];
    for (const movie of movies) {
      try {
        const movieData = await scrapeMovieDetails(page, movie);
        // Solo guardar si tiene al menos una función en Atlas CABA
        if (movieData.funciones.length > 0) {
          allMovies.push(movieData);
        } else {
          console.log(`   ⚠️ Sin funciones en Atlas CABA, omitida.`);
        }
      } catch (err) {
        console.error(`   ❌ Error con ${movie.titulo}:`, err.message);
      }
      await wait(800); // pausa amigable
    }

    // Asignar IDs secuenciales
    allMovies.forEach((m, idx) => m.id = idx + 1);

    // Guardar JSON
    await fs.writeFile(OUTPUT_FILE, JSON.stringify(allMovies, null, 2));
    console.log(`\n✅ ¡Listo! ${allMovies.length} películas guardadas en ${OUTPUT_FILE}`);

  } catch (error) {
    console.error('💥 Error fatal:', error);
  } finally {
    await browser.close();
  }
}

main();