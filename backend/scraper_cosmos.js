// backend/scraper_cosmos.js
const fs = require('fs').promises;
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, 'peliculas_cosmos.json');

async function scrapeCosmos() {
    console.log('🎬 Scraping Cine Cosmos UBA...');
    try {
        const response = await fetch('https://www.cinecosmos.uba.ar/index.php');
        const html = await response.text();

        // Buscar todas las tarjetas usando el patrón completo
        const cardRegex = /<div class="card">(.*?)<\/div>\s*<\/div>\s*<\/div>/gs;
        let match;
        const peliculas = [];

        while ((match = cardRegex.exec(html)) !== null) {
            const card = match[1];

            // Título
            const titulo = (card.match(/<h4 class="card-title">([^<]+)<\/h4>/) || [])[1]?.trim();
            if (!titulo) continue;

            // Director
            const director = (card.match(/<p class="direccion">Dirección: ([^<]+)<\/p>/) || [])[1]?.trim() || 'No especificado';

            // Duración
            const duracionMatch = card.match(/<p class="lightText">.*?\/\s*(\d+)\s*min/);
            const duracion = duracionMatch ? duracionMatch[1] : 'N/A';

            // Horarios: buscar el contenido después del span hasta el cierre de p
            const horariosMatch = card.match(/<div class="card-footer">.*?<p class="textoPeliFooter">.*?<span[^>]*>.*?<\/span>\s*([^<]+)<\/p>/s);
            let horarios = [];
            if (horariosMatch) {
                const horariosStr = horariosMatch[1].trim();
                horarios = horariosStr.split(' - ').map(h => h.trim()).filter(h => /\d{1,2}:\d{2}/.test(h));
            }

            // Poster
            let poster = (card.match(/<img class="card-img-top" src="([^"]+)"/) || [])[1] || '';
            if (poster && poster.startsWith('/')) poster = 'https://www.cinecosmos.uba.ar' + poster;

            if (horarios.length === 0) {
                console.log(`   ⚠️ "${titulo}" sin horarios, omitida.`);
                continue;
            }

            peliculas.push({ titulo, director, duracion, horarios, poster });
        }

        console.log(`   Encontradas ${peliculas.length} películas con horarios.`);

        const hoy = new Date();
        const fechaFormateada = `${hoy.toLocaleDateString('es-AR', { weekday: 'long' })} ${hoy.getDate()}/${hoy.toLocaleDateString('es-AR', { month: 'long' })}/${hoy.getFullYear()}`;

        const funciones = peliculas.map((p, idx) => ({
            id_funcion: `cosmos_${Date.now()}_${idx}`,
            titulo: p.titulo,
            director: p.director,
            duracion: p.duracion,
            cine: 'Cine Cosmos UBA',
            ciudad: 'CABA',
            fecha: fechaFormateada,
            idioma: 'Idioma original con subtítulos',
            horarios: p.horarios,
            seccion: 'cartelera',
            poster: p.poster,
            sinopsis: 'Sin sinopsis disponible',
            linkTrailer: ''
        }));

        await fs.writeFile(OUTPUT_FILE, JSON.stringify(funciones, null, 2));
        console.log(`✅ Cosmos: ${funciones.length} funciones guardadas en ${OUTPUT_FILE}`);
        return funciones;
    } catch (error) {
        console.error('❌ Error en Cosmos:', error);
        return [];
    }
}

if (require.main === module) scrapeCosmos();
module.exports = { scrapeCosmos };