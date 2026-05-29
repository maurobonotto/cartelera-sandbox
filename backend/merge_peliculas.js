const fs = require('fs').promises;
const path = require('path');

const GAUMONT_FILE = path.join(__dirname, 'peliculas_gaumont.json');
const COSMOS_FILE = path.join(__dirname, 'peliculas_cosmos.json');
const CACODELPHIA_FILE = path.join(__dirname, 'peliculas_cacodelphia.json');
const ATLAS_FILE = path.join(__dirname, 'peliculas_atlas.json');
const CINEMARK_FILE = path.join(__dirname, 'peliculas_cinemark.json');
const LORCA_FILE = path.join(__dirname, 'peliculas_lorca.json');    // ← NUEVO
const OUTPUT_FILE = path.join(__dirname, 'peliculas.json');

const IGNORAR_SUFIJOS = [
    'sin salida', 'la pelicula', 'la película', 'el regreso', 
    '2d', '3d', 'doblada', 'subtitulada', 'sub', 'cast'
];

// ---------- NORMALIZACIÓN DE TÍTULOS ----------
function normalizarBase(titulo) {
    if (!titulo) return '';
    let t = titulo;
    t = t.replace(/[\(\[].*?[\)\]]/g, '');
    t = t.replace(/\s*[-–—:].*$/, '');
    t = t.replace(/^(the|a|an|la|el|los|las|le|un|una|unos|unas)\s+/i, '');
    t = t.toLowerCase();
    t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    t = t.replace(/[^a-z0-9\s]/g, '');
    t = t.trim().replace(/\s+/g, ' ');
    return t;
}

function eliminarSufijos(tituloBase) {
    let t = tituloBase;
    for (const sufijo of IGNORAR_SUFIJOS) {
        if (t.endsWith(sufijo)) {
            t = t.slice(0, -sufijo.length).trim();
        }
    }
    return t;
}

function normalizarTitulo(titulo) {
    let base = normalizarBase(titulo);
    base = eliminarSufijos(base);
    return base;
}

function similitudJaccard(a, b) {
    const palabrasA = new Set(a.split(' '));
    const palabrasB = new Set(b.split(' '));
    const interseccion = new Set([...palabrasA].filter(x => palabrasB.has(x)));
    const union = new Set([...palabrasA, ...palabrasB]);
    return interseccion.size / union.size;
}

function mismaPelicula(tituloA, tituloB) {
    const a = normalizarTitulo(tituloA);
    const b = normalizarTitulo(tituloB);
    if (a === b) return true;
    if (a.includes(b) || b.includes(a)) return true;
    const minLen = Math.min(a.length, b.length);
    let prefijoLen = 0;
    for (let i = 0; i < minLen; i++) {
        if (a[i] === b[i]) prefijoLen++;
        else break;
    }
    if (prefijoLen >= 8) return true;
    const jaccard = similitudJaccard(a, b);
    if (jaccard >= 0.7) return true;
    return false;
}

// ---------- NORMALIZACIÓN DE FECHAS ----------
const mesesAbr = { 'ENE':0, 'FEB':1, 'MAR':2, 'ABR':3, 'MAY':4, 'JUN':5, 'JUL':6, 'AGO':7, 'SEP':8, 'OCT':9, 'NOV':10, 'DIC':11 };
const mesesCompletos = {
    'enero':0,'febrero':1,'marzo':2,'abril':3,'mayo':4,'junio':5,'julio':6,'agosto':7,'septiembre':8,'octubre':9,'noviembre':10,'diciembre':11
};

function parsearFechaLegible(texto) {
    if (!texto) return null;
    
    let match = texto.match(/^[A-Za-záéíóúñ]+ (\d{1,2})\/([A-Za-záéíóú]+)\/(\d{4})$/i);
    if (match) {
        const dia = parseInt(match[1]);
        let mesStr = match[2].toLowerCase();
        let mes = mesesCompletos[mesStr];
        if (mes === undefined) {
            const abr = mesStr.substring(0,3);
            mes = mesesAbr[abr.toUpperCase()];
        }
        const anio = parseInt(match[3]);
        if (!isNaN(dia) && mes !== undefined && !isNaN(anio)) return new Date(anio, mes, dia);
    }
    
    match = texto.match(/^[A-Za-z]{3} (\d{1,2})\/([A-Za-z]{3})\/(\d{4})$/i);
    if (match) {
        const dia = parseInt(match[1]);
        const mesAbr = match[2].toUpperCase();
        const mes = mesesAbr[mesAbr];
        const anio = parseInt(match[3]);
        if (!isNaN(dia) && mes !== undefined && !isNaN(anio)) return new Date(anio, mes, dia);
    }
    
    match = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) return new Date(parseInt(match[1]), parseInt(match[2])-1, parseInt(match[3]));
    
    match = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (match) return new Date(parseInt(match[3]), parseInt(match[2])-1, parseInt(match[1]));
    
    console.warn(`⚠️ No se pudo parsear la fecha: ${texto}`);
    return null;
}

function formatearFechaUniforme(date) {
    if (!date || isNaN(date.getTime())) return 'Fecha no disponible';
    const dias = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
    const meses = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
    const diaSemana = dias[date.getDay()];
    const diaNum = date.getDate();
    const mes = meses[date.getMonth()];
    const anio = date.getFullYear();
    return `${diaSemana} ${diaNum}/${mes}/${anio}`;
}

// ---------- VENTANA DE SEMANA (JUEVES A MIÉRCOLES) ----------
function obtenerInicioSemana(fechaActual) {
    const fecha = new Date(fechaActual);
    fecha.setHours(0, 0, 0, 0);
    const diaSemana = fecha.getDay();
    const diasHastaJueves = (diaSemana - 4 + 7) % 7;
    const inicio = new Date(fecha);
    inicio.setDate(fecha.getDate() - diasHastaJueves);
    return inicio;
}

function obtenerFinSemana(inicio) {
    const fin = new Date(inicio);
    fin.setDate(inicio.getDate() + 6);
    return fin;
}

// ---------- CARGA DE FUENTES ----------
async function cargarFuente(archivo, nombre) {
    try {
        const data = await fs.readFile(archivo, 'utf8');
        const funciones = JSON.parse(data);
        console.log(`   ${nombre}: ${funciones.length} funciones.`);
        return funciones;
    } catch (err) {
        console.error(`   ⚠️ No se encontró ${archivo}.`);
        return [];
    }
}

// ---------- MAIN ----------
async function main() {
    console.log('🔄 Unificando carteleras: normalizando fechas y títulos');
    
    const gaumont = await cargarFuente(GAUMONT_FILE, 'Gaumont');
    const cosmos = await cargarFuente(COSMOS_FILE, 'Cosmos');
    const cacodelphia = await cargarFuente(CACODELPHIA_FILE, 'Cacodelphia');
    const atlas = await cargarFuente(ATLAS_FILE, 'Atlas');
    const cinemark = await cargarFuente(CINEMARK_FILE, 'Cinemark');
    const lorca = await cargarFuente(LORCA_FILE, 'Lorca');   // ← NUEVO
    
    let todasFunciones = [...gaumont, ...cosmos, ...cacodelphia, ...atlas, ...cinemark, ...lorca];
    
    // Normalizar fechas
    for (const func of todasFunciones) {
        const fechaObj = parsearFechaLegible(func.fecha);
        if (fechaObj) {
            func.fecha_obj = fechaObj;
            func.fecha = formatearFechaUniforme(fechaObj);
        } else {
            func.fecha_obj = null;
        }
    }
    
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const inicioSemana = obtenerInicioSemana(hoy);
    const finSemana = obtenerFinSemana(inicioSemana);
    
    console.log(`📅 Ventana actual (jueves a miércoles): ${formatearFechaUniforme(inicioSemana)} - ${formatearFechaUniforme(finSemana)}`);
    
    // Agrupar por película
    const todasPorPeli = new Map();
    for (const func of todasFunciones) {
        const clave = normalizarTitulo(func.titulo);
        if (!todasPorPeli.has(clave)) {
            todasPorPeli.set(clave, { funciones: [] });
        }
        todasPorPeli.get(clave).funciones.push(func);
    }
    
    const funcionesCartelera = [];
    const funcionesProximos = [];
    
    for (const [clave, grupo] of todasPorPeli.entries()) {
        let tieneFuncionEnSemana = false;
        const funcionesEnSemana = [];
        const funcionesFuturas = [];
        
        for (const func of grupo.funciones) {
            const fechaObj = func.fecha_obj;
            if (!fechaObj) {
                funcionesEnSemana.push(func);
                tieneFuncionEnSemana = true;
                continue;
            }
            if (fechaObj >= inicioSemana && fechaObj <= finSemana) {
                funcionesEnSemana.push(func);
                tieneFuncionEnSemana = true;
            } else if (fechaObj > finSemana) {
                funcionesFuturas.push(func);
            }
        }
        
        if (tieneFuncionEnSemana) {
            funcionesCartelera.push(...funcionesEnSemana);
        } else if (funcionesFuturas.length > 0) {
            funcionesProximos.push(...funcionesFuturas);
        }
    }
    
    for (const f of funcionesCartelera) f.seccion = 'cartelera';
    for (const f of funcionesProximos) f.seccion = 'proximos';
    
    // Fusionar títulos duplicados (aquí se aplica el puntaje de similitud)
    function fusionarPorGrupo(funciones) {
        const grupos = [];
        for (const func of funciones) {
            let encontrado = false;
            for (const grupo of grupos) {
                if (mismaPelicula(grupo.tituloReferencia, func.titulo)) {
                    grupo.funciones.push(func);
                    if (func.titulo.length > grupo.tituloReferencia.length) {
                        grupo.tituloReferencia = func.titulo;
                    }
                    encontrado = true;
                    break;
                }
            }
            if (!encontrado) {
                grupos.push({
                    tituloReferencia: func.titulo,
                    funciones: [func]
                });
            }
        }
        
        const resultado = [];
        for (const grupo of grupos) {
            const frecuencias = new Map();
            let mejorPoster = '';
            for (const f of grupo.funciones) {
                frecuencias.set(f.titulo, (frecuencias.get(f.titulo) || 0) + 1);
                if (f.poster && f.poster.startsWith('http') && !mejorPoster) {
                    mejorPoster = f.poster;
                }
            }
            let tituloFinal = grupo.tituloReferencia;
            let maxFreq = 0;
            for (const [titulo, freq] of frecuencias) {
                if (freq > maxFreq) {
                    maxFreq = freq;
                    tituloFinal = titulo;
                }
            }
            const funcionesCombinadas = grupo.funciones.map(f => {
                const { fecha_obj, ...resto } = f;
                return {
                    ...resto,
                    titulo: tituloFinal,
                    poster: mejorPoster || f.poster
                };
            });
            resultado.push(...funcionesCombinadas);
        }
        return resultado;
    }
    
    const resultadoCartelera = fusionarPorGrupo(funcionesCartelera);
    const resultadoProximos = fusionarPorGrupo(funcionesProximos);
    const resultadoFinal = [...resultadoCartelera, ...resultadoProximos];
    
    await fs.writeFile(OUTPUT_FILE, JSON.stringify(resultadoFinal, null, 2));
    console.log(`✅ Unificación completada.`);
    console.log(`   Funciones en cartelera (semana actual): ${resultadoCartelera.length}`);
    console.log(`   Funciones en próximos estrenos: ${resultadoProximos.length}`);
    console.log(`   Total registros en peliculas.json: ${resultadoFinal.length}`);
}

main();