const fs = require('fs').promises;
const path = require('path');

const GAUMONT_FILE = path.join(__dirname, 'peliculas_gaumont.json');
const COSMOS_FILE = path.join(__dirname, 'peliculas_cosmos.json');
const CACODELPHIA_FILE = path.join(__dirname, 'peliculas_cacodelphia.json');
const ATLAS_FILE = path.join(__dirname, 'peliculas_atlas.json');
const CINEMARK_FILE = path.join(__dirname, 'peliculas_cinemark.json');
const OUTPUT_FILE = path.join(__dirname, 'peliculas.json');

const IGNORAR_SUFIJOS = [
    'sin salida', 'la pelicula', 'la película', 'el regreso', 
    '2d', '3d', 'doblada', 'subtitulada', 'sub', 'cast'
];

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

function fechaLegibleToDate(fechaLegible) {
    const partes = fechaLegible.split(' ');
    if (partes.length < 2) return null;
    const fechaParte = partes[1];
    const [dia, mesStr, anio] = fechaParte.split('/');
    if (!dia || !mesStr || !anio) return null;
    const meses = {
        'Enero': 0, 'Febrero': 1, 'Marzo': 2, 'Abril': 3, 'Mayo': 4, 'Junio': 5,
        'Julio': 6, 'Agosto': 7, 'Septiembre': 8, 'Octubre': 9, 'Noviembre': 10, 'Diciembre': 11
    };
    const mesNum = meses[mesStr];
    if (mesNum === undefined) return null;
    const fecha = new Date(parseInt(anio), mesNum, parseInt(dia));
    fecha.setHours(0, 0, 0, 0);
    return fecha;
}

function obtenerInicioSemana(fechaActual) {
    const fecha = new Date(fechaActual);
    fecha.setHours(0, 0, 0, 0);
    const diaSemana = fecha.getDay();
    let diasAtras = (diaSemana - 4 + 7) % 7;
    const inicio = new Date(fecha);
    inicio.setDate(fecha.getDate() - diasAtras);
    return inicio;
}

function obtenerFinSemana(inicio) {
    const fin = new Date(inicio);
    fin.setDate(inicio.getDate() + 6);
    return fin;
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

async function main() {
    console.log('🔄 Unificando carteleras: funciones de la semana actual (jueves a miércoles) en Cartelera, y funciones futuras en Próximos estrenos (con horarios)');
    
    const gaumont = await cargarFuente(GAUMONT_FILE, 'Gaumont');
    const cosmos = await cargarFuente(COSMOS_FILE, 'Cosmos');
    const cacodelphia = await cargarFuente(CACODELPHIA_FILE, 'Cacodelphia');
    const atlas = await cargarFuente(ATLAS_FILE, 'Atlas');
    const cinemark = await cargarFuente(CINEMARK_FILE, 'Cinemark');
    
    const todasFunciones = [...gaumont, ...cosmos, ...cacodelphia, ...atlas, ...cinemark];
    
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const inicioSemana = obtenerInicioSemana(hoy);
    const finSemana = obtenerFinSemana(inicioSemana);
    
    console.log(`📅 Ventana actual: ${inicioSemana.toLocaleDateString('es-AR')} (jueves) hasta ${finSemana.toLocaleDateString('es-AR')} (miércoles)`);
    
    // Agrupar todas las funciones por película (normalizando título)
    const todasPorPeli = new Map(); // clave normalizada -> { funciones: [] }
    for (const func of todasFunciones) {
        const clave = normalizarTitulo(func.titulo);
        if (!todasPorPeli.has(clave)) {
            todasPorPeli.set(clave, { funciones: [] });
        }
        todasPorPeli.get(clave).funciones.push(func);
    }
    
    // Clasificar funciones por película
    const funcionesCartelera = [];   // funciones que están dentro de la semana actual
    const funcionesProximos = [];    // funciones futuras (después del miércoles) para películas que no tienen funciones en la semana actual
    
    for (const [clave, grupo] of todasPorPeli.entries()) {
        let tieneFuncionEnSemana = false;
        const funcionesEnSemana = [];
        const funcionesFuturas = [];
        
        for (const func of grupo.funciones) {
            const fechaFunc = fechaLegibleToDate(func.fecha);
            if (!fechaFunc) {
                // Sin fecha válida, la metemos en cartelera por las dudas
                funcionesEnSemana.push(func);
                tieneFuncionEnSemana = true;
                continue;
            }
            if (fechaFunc >= inicioSemana && fechaFunc <= finSemana) {
                funcionesEnSemana.push(func);
                tieneFuncionEnSemana = true;
            } else if (fechaFunc > finSemana) {
                funcionesFuturas.push(func);
            }
            // Las funciones anteriores a inicioSemana se ignoran
        }
        
        if (tieneFuncionEnSemana) {
            // La película está en cartelera esta semana -> solo van las funciones de la semana
            funcionesCartelera.push(...funcionesEnSemana);
        } else if (funcionesFuturas.length > 0) {
            // No tiene funciones esta semana, pero sí futuras -> va a próximos estrenos con todas sus funciones futuras
            funcionesProximos.push(...funcionesFuturas);
        }
    }
    
    // Asignar sección a cada función
    for (const f of funcionesCartelera) f.seccion = 'cartelera';
    for (const f of funcionesProximos) f.seccion = 'proximos';
    
    // Ahora fusionar títulos duplicados (por ej. "BACKROOMS" y "BACKROOMS SIN SALIDA") en cada grupo por separado
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
            const funcionesCombinadas = grupo.funciones.map(f => ({
                ...f,
                titulo: tituloFinal,
                poster: mejorPoster || f.poster
            }));
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
    console.log(`   Funciones en próximos estrenos (todas futuras): ${resultadoProximos.length}`);
    console.log(`   Total registros en peliculas.json: ${resultadoFinal.length}`);
}

main();