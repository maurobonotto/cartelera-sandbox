const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

const BASE_URL = 'https://www.lanacion.com.ar/cartelera-de-cine/';
const OUTPUT_FILE = path.join(__dirname, 'peliculas.json');
const wait = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
    console.log('🚀 SCRAPER PARA LA NACIÓN (con análisis de HTML)');
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();

    try {
        console.log('Cargando página...');
        await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 60000 });
        
        // Esperar un poco más para que cargue el JavaScript
        await wait(5000);
        
        // Guardar el HTML completo para depuración
        const html = await page.content();
        await fs.writeFile('debug_la_nacion.html', html);
        console.log('HTML guardado en debug_la_nacion.html');
        
        // Buscar cualquier elemento que pueda contener las películas
        const peliculasData = await page.evaluate(() => {
            // Intentar múltiples selectores posibles
            const posiblesSelectores = [
                '.listaPrincipal__item',
                '.movie-item',
                '.card-pelicula',
                '[data-pelicula]',  // elementos con atributo data-pelicula
                'article'
            ];
            
            let elementos = [];
            for (const sel of posiblesSelectores) {
                const encontrados = document.querySelectorAll(sel);
                if (encontrados.length > 0) {
                    console.log(`Selector ${sel} encontró ${encontrados.length} elementos`);
                    elementos = encontrados;
                    break;
                }
            }
            
            if (elementos.length === 0) {
                return [];
            }
            
            const resultados = [];
            for (const el of elementos) {
                // Buscar el botón de ver horarios o el atributo data-pelicula
                const button = el.querySelector('.verHorarios, [data-pelicula]');
                const peliculaId = button?.getAttribute('data-pelicula');
                const salaId = button?.getAttribute('data-sala');
                
                if (!peliculaId) continue;
                
                const link = el.querySelector('a');
                const title = link?.querySelector('h3')?.innerText?.trim() || 
                              el.querySelector('h3, .title, .movie-title')?.innerText?.trim() || 
                              'Sin título';
                const genre = el.querySelector('p, .genre')?.innerText?.trim() || 'N/A';
                const poster = el.querySelector('img')?.src || '';
                
                resultados.push({
                    titulo: title,
                    genero: genre,
                    poster: poster,
                    peliculaId: peliculaId,
                    salaId: salaId || '107'  // si no viene, asumimos sala 107 (Gaumont)
                });
            }
            return resultados;
        });
        
        console.log(`Encontradas ${peliculasData.length} películas con IDs.`);
        
        if (peliculasData.length === 0) {
            console.log('No se encontraron películas. Revisá debug_la_nacion.html');
            return;
        }
        
        // Aquí iría la lógica para obtener horarios (similar a antes)
        // Por ahora solo generamos un JSON básico para probar
        const funciones = peliculasData.map((p, idx) => ({
            id_funcion: `ln_${idx+1}`,
            titulo: p.titulo,
            director: 'No especificado',
            duracion: 'N/A',
            cine: 'Cine Gaumont (CABA)',
            ciudad: 'CABA',
            fecha: 'Fecha por confirmar',
            idioma: 'Sin especificar',
            horarios: [],
            seccion: 'cartelera',
            poster: p.poster,
            sinopsis: 'Sin sinopsis disponible',
            linkTrailer: ''
        }));
        
        await fs.writeFile(OUTPUT_FILE, JSON.stringify(funciones, null, 2));
        console.log(`\n🎉 Se guardaron ${funciones.length} funciones (sin horarios reales aún).`);
        console.log(`   Ahora revisá debug_la_nacion.html para ver la estructura real.`);
        
    } catch (error) {
        console.error('💥 Error:', error);
    } finally {
        await browser.close();
    }
}

main();