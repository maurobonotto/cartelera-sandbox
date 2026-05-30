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

// Convierte día de semana + número de día a la fecha real más próxima (en un rango de -7 a +60 días)
function convertirDiaSemanaYNumeroAFecha(diaSemanaTexto, diaNumero) {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const diasMap = {
        'domingo': 0, 'lunes': 1, 'martes': 2, 'miércoles': 3, 'miercoles': 3,
        'jueves': 4, 'viernes': 5, 'sábado': 6, 'sabado': 6
    };
    const targetWeekday = diasMap[diaSemanaTexto.toLowerCase()];
    if (targetWeekday === undefined) return null;
    
    // Buscar la fecha más cercana en el rango -7..+60 días
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
    console.log('🎬 Scraping Sala Leopoldo Lugones (definitivo, 68 funciones esperadas)');
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    page.on('console', msg => console.log(`   ${msg.text()}`));

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

                const datos = await page.evaluate(() => {
                    const container = document.querySelector('.details');
                    const h1 = document.querySelector('h1')?.innerText.trim() || '';
                    return { html: container ? container.innerHTML : '', h1 };
                });

                if (!datos.html) {
                    console.log('      No se encontró .details');
                    continue;
                }

                const funcionesEvento = await page.evaluate((nombreEvento, h1Titulo) => {
                    const container = document.querySelector('.details');
                    if (!container) return [];

                    const paragraphs = Array.from(container.querySelectorAll('p'));
                    
                    // Extrae todos los días del texto (maneja "y" y comas)
                    function extraerDias(texto) {
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
                        // Ciclo múltiple: estado secuencial con persistencia de horario
                        let currentDias = [];      // lista de días del último párrafo (pueden ser varios)
                        let currentHorarios = [];   // lista de horarios del último párrafo
                        const funciones = [];

                        for (const p of paragraphs) {
                            const texto = p.innerText.trim();
                            if (!texto) continue;
                            
                            // Extraer días y horarios del párrafo actual
                            const dias = extraerDias(texto);
                            const horarios = extraerHorarios(texto);
                            
                            // Actualizar estado: si hay días, reemplazar los días actuales
                            if (dias.length > 0) {
                                currentDias = dias;
                                // Si el mismo párrafo tiene horarios, actualizar también
                                if (horarios.length > 0) {
                                    currentHorarios = horarios;
                                } else {
                                    // Si solo hay días, mantener los horarios anteriores (por si el horario viene en el siguiente párrafo)
                                    // pero en la práctica, en ciclos el horario suele venir en el mismo párrafo o en el siguiente.
                                }
                            } else if (horarios.length > 0) {
                                // Si solo hay horarios, actualizarlos
                                currentHorarios = horarios;
                            }
                            
                            // Verificar si este párrafo contiene un título (span con color)
                            const tituloSpan = p.querySelector('span[style*="color"] strong');
                            if (tituloSpan && currentDias.length > 0 && currentHorarios.length > 0) {
                                const titulo = tituloSpan.innerText.trim();
                                // Generar función para cada combinación día × horario
                                for (const dia of currentDias) {
                                    for (const hor of currentHorarios) {
                                        funciones.push({
                                            tituloRaw: titulo,
                                            diaSemana: dia.diaSemana,
                                            diaNumero: dia.numero,
                                            horario: hor
                                        });
                                    }
                                }
                                // NO limpiar currentHorarios para permitir títulos consecutivos con mismo horario (ej. Gardel)
                            }
                        }
                        resultados = funciones;
                    } 
                    else {
                        // Evento único: extraer todas las combinaciones día+horario
                        let tituloUnico = h1Titulo || nombreEvento;
                        // Buscar un h2 no técnico como posible título (ej. "Taxi Driver (1976)")
                        const posiblesH2 = Array.from(container.querySelectorAll('h2')).filter(h2 => {
                            const txt = h2.innerText.trim();
                            const excluir = /SINOPSIS|FICHA TÉCNICA|PALABRAS|REPARTO|DIRECCIÓN|PRODUCCIÓN|MONTAJE|FOTOGRAFÍA|SONIDO|VESTUARIO|MÚSICA|IMPORTANTE|DESCUENTOS|ENTRADAS|INFO/i;
                            return !excluir.test(txt) && txt.length < 100;
                        });
                        if (posiblesH2.length > 0) tituloUnico = posiblesH2[0].innerText.trim();
                        
                        const funciones = [];
                        let lastDias = [];  // almacena los últimos días vistos (para cuando el horario viene después)
                        
                        for (const p of paragraphs) {
                            const texto = p.innerText.trim();
                            const dias = extraerDias(texto);
                            const horarios = extraerHorarios(texto);
                            
                            if (dias.length > 0 && horarios.length > 0) {
                                // Días y horarios en el mismo párrafo
                                for (const dia of dias) {
                                    for (const hor of horarios) {
                                        funciones.push({
                                            tituloRaw: tituloUnico,
                                            diaSemana: dia.diaSemana,
                                            diaNumero: dia.numero,
                                            horario: hor
                                        });
                                    }
                                }
                                lastDias = []; // ya procesados
                            } 
                            else if (dias.length > 0) {
                                // Solo días, guardarlos para cuando aparezca el horario
                                lastDias = dias;
                            } 
                            else if (horarios.length > 0 && lastDias.length > 0) {
                                // Horarios después de días
                                for (const dia of lastDias) {
                                    for (const hor of horarios) {
                                        funciones.push({
                                            tituloRaw: tituloUnico,
                                            diaSemana: dia.diaSemana,
                                            diaNumero: dia.numero,
                                            horario: hor
                                        });
                                    }
                                }
                                lastDias = []; // limpiar
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
                }, evento.tituloEvento, datos.h1);

                // Convertir y guardar
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
                        director: 'No especificado',
                        duracion: 'N/A',
                        cine: 'Sala Leopoldo Lugones',
                        ciudad: 'CABA',
                        fecha: fechaLegible,
                        idioma: 'Sin especificar',
                        horarios: [raw.horario],
                        seccion: 'cartelera',
                        poster: null,
                        sinopsis: '',
                        linkTrailer: ''
                    });
                    console.log(`   🎬 ${tituloLimpio} — ${fechaLegible} ${raw.horario}`);
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
        
        // Verificación final
        const colos = todasLasFunciones.filter(f => f.titulo === 'Colo');
        console.log(`\n🔍 Verificación: ${colos.length} función(es) de "Colo" encontradas:`);
        colos.forEach(c => console.log(`   - ${c.fecha} ${c.horarios[0]}`));
        
        // Verificar JUSTA completa (deberían ser 7)
        const justa = todasLasFunciones.filter(f => f.titulo === 'JUSTA');
        console.log(`\n🔍 JUSTA: ${justa.length} funciones (esperadas 7)`);
        
        return todasLasFunciones;
    } catch (error) {
        console.error('❌ Error general:', error);
        return [];
    } finally {
        await browser.close();
    }
}

scrapeLugones();