const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, 'peliculas_lugones.json');
const BASE_URL = 'https://complejoteatral.gob.ar/cine';

function limpiarTitulo(texto) {
    let limpio = texto.trim();
    limpio = limpio.replace(/^\s*\(\d{4}\)\s*/, '');
    limpio = limpio.replace(/\s*\(\d{4}\)\s*$/, '');
    limpio = limpio.replace(/\s*\([^;]*;\s*[^;]*;\s*\d{4}\)/, '');
    limpio = limpio.replace(/[;:]\s*EE?:?U+\.?\s*/g, '');
    limpio = limpio.replace(/<[^>]+>/g, '');
    return limpio.trim() || texto;
}

function formatearFechaUniforme(date) {
    if (!date || isNaN(date.getTime())) return 'Fecha no disponible';
    const dias = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
    const meses = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
    return `${dias[date.getDay()]} ${date.getDate()}/${meses[date.getMonth()]}/${date.getFullYear()}`;
}

function convertirDiaSemanaYNumeroAFecha(diaSemanaTexto, diaNumero) {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const diasMap = {
        'domingo': 0, 'lunes': 1, 'martes': 2, 'miércoles': 3, 'miercoles': 3,
        'jueves': 4, 'viernes': 5, 'sábado': 6, 'sabado': 6
    };
    const targetWeekday = diasMap[diaSemanaTexto.toLowerCase()];
    if (targetWeekday === undefined) return null;
    let mejorFecha = null;
    let mejorDistancia = Infinity;
    for (let i = -7; i <= 60; i++) {
        let fecha = new Date(hoy);
        fecha.setDate(hoy.getDate() + i);
        if (fecha.getDay() === targetWeekday && fecha.getDate() === diaNumero) {
            const distancia = Math.abs(i);
            if (distancia < mejorDistancia) {
                mejorDistancia = distancia;
                mejorFecha = fecha;
            }
        }
    }
    return mejorFecha;
}

async function scrapeLugones() {
    console.log('🎬 Scraping Sala Leopoldo Lugones (metadatos sin detención)');
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();

    try {
        await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 30000 });
        await page.waitForSelector('.list-item', { timeout: 10000 });

        const eventos = await page.evaluate(() => {
            const items = document.querySelectorAll('.list-item');
            return Array.from(items).map(item => {
                const tituloEvento = item.querySelector('h2')?.innerText.trim() || '';
                const link = item.querySelector('.buttons a.button[href*="/ver/"]')?.getAttribute('href');
                if (!link) return null;
                let url = link.startsWith('http') ? link : `https://complejoteatral.gob.ar${link}`;
                return { tituloEvento, url };
            }).filter(e => e !== null);
        });
        console.log(`   ${eventos.length} eventos encontrados.`);

        let todasLasFunciones = [];

        for (const evento of eventos) {
            console.log(`\n📌 Procesando evento: ${evento.tituloEvento}`);
            try {
                await page.goto(evento.url, { waitUntil: 'networkidle2', timeout: 30000 });
                await page.waitForSelector('.details', { timeout: 10000 });

                const funcionesEvento = await page.evaluate(() => {
                    const container = document.querySelector('.details');
                    if (!container) return [];
                    
                    const h1 = document.querySelector('h1')?.innerText.trim() || '';
                    const paragraphs = Array.from(container.querySelectorAll('p'));
                    
                    // Funciones de extracción mejoradas
                    function extraerAño(texto) {
                        if (!texto) return '';
                        // Busca cualquier año de 4 dígitos entre paréntesis (incluyendo texto alrededor)
                        const match = texto.match(/\([^)]*(\d{4})[^)]*\)/);
                        if (match) return match[1];
                        // Si no, busca año de 4 dígitos suelto (pero evita horas)
                        const match2 = texto.match(/\b(19|20)\d{2}\b/);
                        if (match2 && !texto.match(/horas?/i)) return match2[0];
                        return '';
                    }
                    
                    function extraerDirector(texto) {
                        if (!texto) return '';
                        const match = texto.match(/Dirección(?: y guion)?:\s*([^.\n]+)/i);
                        return match ? match[1].trim() : '';
                    }
                    
                    function extraerDuracion(texto) {
                        if (!texto) return '';
                        const match = texto.match(/(\d+)\s*['minutos]/i);
                        return match ? match[1] : '';
                    }
                    
                    function extraerSinopsis(texto) {
                        if (!texto) return '';
                        const match = texto.match(/SINOPSIS\s*([\s\S]*?)(?=\n\n|\n[A-ZÁÉÍÓÚ]+\s*\n|$)/i);
                        return match ? match[1].trim() : '';
                    }
                    
                    function extraerDias(texto) {
                        if (!texto) return [];
                        const dias = [];
                        let trabajo = texto.replace(/\s+y\s+/gi, ', ');
                        const partes = trabajo.split(/\s*,\s*/);
                        for (const parte of partes) {
                            const match = parte.match(/(lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo)\s+(\d{1,2})/i);
                            if (match) {
                                dias.push({ diaSemana: match[1], numero: parseInt(match[2]) });
                            }
                        }
                        return dias;
                    }
                    
                    function extraerHorarios(texto) {
                        if (!texto) return [];
                        const horarios = [];
                        const regex = /(\d{1,2})(?:[.:](\d{2}))?\s*horas?/gi;
                        let match;
                        while ((match = regex.exec(texto)) !== null) {
                            let hora = match[1].padStart(2, '0');
                            let min = match[2] ? match[2] : '00';
                            horarios.push(`${hora}:${min}`);
                        }
                        return horarios;
                    }

                    const haySpansColor = container.querySelector('span[style*="color"] strong') !== null;
                    let resultados = [];

                    if (haySpansColor) {
                        // Ciclo múltiple: recorrer párrafos y acumular funciones con metadatos
                        let currentDias = [];
                        let currentHorarios = [];
                        const funcionesConMeta = [];
                        
                        for (let idx = 0; idx < paragraphs.length; idx++) {
                            const p = paragraphs[idx];
                            const texto = p.innerText.trim();
                            if (!texto) continue;
                            
                            const dias = extraerDias(texto);
                            const horarios = extraerHorarios(texto);
                            
                            if (dias.length > 0) {
                                currentDias = dias;
                                if (horarios.length > 0) currentHorarios = horarios;
                            } else if (horarios.length > 0) {
                                currentHorarios = horarios;
                            }
                            
                            const tituloSpan = p.querySelector('span[style*="color"] strong');
                            if (tituloSpan && currentDias.length > 0 && currentHorarios.length > 0) {
                                const titulo = tituloSpan.innerText.trim();
                                
                                // --- Recopilar metadatos desde los siguientes párrafos (hasta 12, sin detenerse) ---
                                let bloqueMetadatos = '';
                                // Añadir el párrafo actual
                                bloqueMetadatos += texto + '\n';
                                // Añadir hasta 12 párrafos siguientes (suficiente para llegar al año)
                                for (let i = idx + 1; i < Math.min(idx + 13, paragraphs.length); i++) {
                                    const nextP = paragraphs[i];
                                    const nextTexto = nextP.innerText.trim();
                                    if (nextTexto) bloqueMetadatos += nextTexto + '\n';
                                }
                                // También mirar algunos párrafos anteriores (por si el año está antes, aunque es raro)
                                for (let i = Math.max(0, idx - 5); i < idx; i++) {
                                    const prevP = paragraphs[i];
                                    const prevTexto = prevP.innerText.trim();
                                    if (prevTexto && !extraerDias(prevTexto).length && !prevP.querySelector('span[style*="color"] strong')) {
                                        bloqueMetadatos += prevTexto + '\n';
                                    }
                                }
                                
                                const año = extraerAño(bloqueMetadatos);
                                const director = extraerDirector(bloqueMetadatos);
                                const duracion = extraerDuracion(bloqueMetadatos);
                                const sinopsis = extraerSinopsis(bloqueMetadatos);
                                
                                for (const dia of currentDias) {
                                    for (const hor of currentHorarios) {
                                        funcionesConMeta.push({
                                            tituloRaw: titulo,
                                            diaSemana: dia.diaSemana,
                                            diaNumero: dia.numero,
                                            horario: hor,
                                            año, director, duracion, sinopsis
                                        });
                                    }
                                }
                            }
                        }
                        resultados = funcionesConMeta;
                    } 
                    else {
                        // Evento único (sin cambios)
                        let tituloUnico = h1 || '';
                        const posiblesH2 = Array.from(container.querySelectorAll('h2')).filter(h2 => {
                            const txt = h2.innerText.trim();
                            const excluir = /SINOPSIS|FICHA TÉCNICA|PALABRAS|REPARTO|DIRECCIÓN|PRODUCCIÓN|MONTAJE|FOTOGRAFÍA|SONIDO|VESTUARIO|MÚSICA|IMPORTANTE|DESCUENTOS|ENTRADAS|INFO/i;
                            return !excluir.test(txt) && txt.length < 100;
                        });
                        if (posiblesH2.length > 0) tituloUnico = posiblesH2[0].innerText.trim();
                        
                        const textoCompleto = container.innerText;
                        const añoGlobal = extraerAño(textoCompleto);
                        const directorGlobal = extraerDirector(textoCompleto);
                        const duracionGlobal = extraerDuracion(textoCompleto);
                        const sinopsisGlobal = extraerSinopsis(textoCompleto);
                        
                        const funciones = [];
                        let lastDias = [];
                        for (const p of paragraphs) {
                            const texto = p.innerText.trim();
                            const dias = extraerDias(texto);
                            const horarios = extraerHorarios(texto);
                            if (dias.length > 0 && horarios.length > 0) {
                                for (const dia of dias) {
                                    for (const hor of horarios) {
                                        funciones.push({
                                            tituloRaw: tituloUnico,
                                            diaSemana: dia.diaSemana,
                                            diaNumero: dia.numero,
                                            horario: hor,
                                            año: añoGlobal,
                                            director: directorGlobal,
                                            duracion: duracionGlobal,
                                            sinopsis: sinopsisGlobal
                                        });
                                    }
                                }
                                lastDias = [];
                            } else if (dias.length > 0) {
                                lastDias = dias;
                            } else if (horarios.length > 0 && lastDias.length > 0) {
                                for (const dia of lastDias) {
                                    for (const hor of horarios) {
                                        funciones.push({
                                            tituloRaw: tituloUnico,
                                            diaSemana: dia.diaSemana,
                                            diaNumero: dia.numero,
                                            horario: hor,
                                            año: añoGlobal,
                                            director: directorGlobal,
                                            duracion: duracionGlobal,
                                            sinopsis: sinopsisGlobal
                                        });
                                    }
                                }
                                lastDias = [];
                            }
                        }
                        resultados = funciones;
                    }
                    
                    // Eliminar duplicados exactos
                    const unicos = [];
                    const seen = new Set();
                    for (const r of resultados) {
                        const key = `${r.tituloRaw}|${r.diaSemana}|${r.diaNumero}|${r.horario}`;
                        if (!seen.has(key)) {
                            seen.add(key);
                            unicos.push(r);
                        }
                    }
                    return unicos;
                });

                let contador = 0;
                for (const raw of funcionesEvento) {
                    const fechaObj = convertirDiaSemanaYNumeroAFecha(raw.diaSemana, raw.diaNumero);
                    if (!fechaObj) {
                        console.log(`   [ERROR] No se pudo convertir fecha: ${raw.diaSemana} ${raw.diaNumero} para ${raw.tituloRaw}`);
                        continue;
                    }
                    const tituloLimpio = limpiarTitulo(raw.tituloRaw);
                    const fechaLegible = formatearFechaUniforme(fechaObj);
                    const idFuncion = `lugones_${evento.tituloEvento.replace(/\s/g, '_')}_${tituloLimpio.replace(/\s/g, '_')}_${fechaLegible.replace(/\//g, '-')}_${raw.horario.replace(':', '')}`;
                    todasLasFunciones.push({
                        id_funcion: idFuncion,
                        titulo: tituloLimpio,
                        director: raw.director || 'No especificado',
                        duracion: raw.duracion || 'N/A',
                        cine: 'Sala Leopoldo Lugones',
                        ciudad: 'CABA',
                        fecha: fechaLegible,
                        idioma: 'Sin especificar',
                        horarios: [raw.horario],
                        seccion: 'cartelera',
                        poster: null,
                        sinopsis: raw.sinopsis || '',
                        linkTrailer: '',
                        anio: raw.año || ''
                    });
                    console.log(`   🎬 ${tituloLimpio} — ${fechaLegible} ${raw.horario} (${raw.año || 's/a'})`);
                    contador++;
                }
                console.log(`      ✅ Total funciones extraídas: ${contador}`);
            } catch (err) {
                console.error(`      Error en evento ${evento.tituloEvento}: ${err.message}`);
            }
            await new Promise(r => setTimeout(r, 500));
        }

        await fs.writeFile(OUTPUT_FILE, JSON.stringify(todasLasFunciones, null, 2));
        console.log(`\n✅ Scraping completado. Se guardaron ${todasLasFunciones.length} funciones en ${OUTPUT_FILE}`);
        
        const colos = todasLasFunciones.filter(f => f.titulo === 'Colo');
        if (colos.length) {
            console.log(`\n🔍 ${colos.length} función(es) de "Colo" encontradas:`);
            colos.forEach(c => console.log(`   - ${c.fecha} ${c.horarios[0]} (${c.anio})`));
        }
        return todasLasFunciones;
    } catch (error) {
        console.error('❌ Error general:', error);
        return [];
    } finally {
        await browser.close();
    }
}

scrapeLugones();