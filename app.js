// app.js - con ordenamiento de filtros por fecha y hora

let peliculas = [];
let peliculaActualTitulo = "";

document.addEventListener("DOMContentLoaded", () => {
    cargarDatos();
    configurarNavegacionGlobal();
});

function cargarDatos() {
    fetch('backend/peliculas.json')
        .then(response => response.json())
        .then(data => {
            peliculas = data;
            inicializarHome();
        })
        .catch(error => console.error("Error cargando el JSON:", error));
}

// ================================ HOME ================================
function inicializarHome() {
    const funcionesCartelera = peliculas.filter(p => p.seccion === "cartelera");
    actualizarOpcionesFiltrosHome(funcionesCartelera);
    mostrarPeliculasHome(peliculas);

    const filtrosIds = ['home-filter-ciudad', 'home-filter-cine', 'home-filter-dia', 'home-filter-horario'];
    filtrosIds.forEach(id => {
        document.getElementById(id).addEventListener('change', () => aplicarFiltrosHome());
    });
}

function aplicarFiltrosHome() {
    let funcionesFiltradas = peliculas.filter(p => p.seccion === "cartelera");

    const valCiudad = document.getElementById('home-filter-ciudad').value;
    const valCine = document.getElementById('home-filter-cine').value;
    const valDia = document.getElementById('home-filter-dia').value;
    const valHorario = document.getElementById('home-filter-horario').value;

    if (valCiudad) funcionesFiltradas = funcionesFiltradas.filter(p => p.ciudad === valCiudad);
    if (valCine) funcionesFiltradas = funcionesFiltradas.filter(p => p.cine === valCine);
    if (valDia) funcionesFiltradas = funcionesFiltradas.filter(p => p.fecha === valDia);
    if (valHorario) funcionesFiltradas = funcionesFiltradas.filter(p => p.horarios && p.horarios.includes(valHorario));

    actualizarOpcionesFiltrosHome(funcionesFiltradas);

    const titulosValidos = new Set(funcionesFiltradas.map(f => f.titulo));
    const pelisCarteleraUnicas = [];
    const agregados = new Set();
    for (const p of peliculas) {
        if (p.seccion === "cartelera" && titulosValidos.has(p.titulo) && !agregados.has(p.titulo)) {
            agregados.add(p.titulo);
            pelisCarteleraUnicas.push(p);
        }
    }
    const pelisProximosUnicas = [];
    const agregadosProx = new Set();
    for (const p of peliculas) {
        if (p.seccion === "proximos" && !agregadosProx.has(p.titulo)) {
            agregadosProx.add(p.titulo);
            pelisProximosUnicas.push(p);
        }
    }
    mostrarPeliculasHome([...pelisCarteleraUnicas, ...pelisProximosUnicas]);
}

// Función auxiliar para convertir string de fecha (ej. "Jueves 29/Mayo/2026") a Date
function convertirStringAFecha(fechaStr) {
    // Extrae día, mes y año
    const partes = fechaStr.split(' ');
    if (partes.length < 2) return null;
    const fechaParte = partes[1]; // "29/Mayo/2026"
    const [dia, mes, anio] = fechaParte.split('/');
    if (!dia || !mes || !anio) return null;
    // Mapeo de meses en español (con mayúscula inicial)
    const meses = {
        'Enero': 0, 'Febrero': 1, 'Marzo': 2, 'Abril': 3, 'Mayo': 4, 'Junio': 5,
        'Julio': 6, 'Agosto': 7, 'Septiembre': 8, 'Octubre': 9, 'Noviembre': 10, 'Diciembre': 11
    };
    const mesNum = meses[mes];
    if (mesNum === undefined) return null;
    return new Date(parseInt(anio), mesNum, parseInt(dia));
}

function actualizarOpcionesFiltrosHome(funcionesValidas) {
    const ciudades = new Set();
    const cines = new Set();
    // Para días, usaremos un mapa para ordenar
    const diasMap = new Map(); // clave: fechaISO, valor: string legible
    const horarios = new Set();

    funcionesValidas.forEach(f => {
        if (f.ciudad) ciudades.add(f.ciudad);
        if (f.cine) cines.add(f.cine);
        if (f.fecha) {
            const fechaDate = convertirStringAFecha(f.fecha);
            if (fechaDate) {
                const iso = fechaDate.toISOString().split('T')[0];
                diasMap.set(iso, f.fecha);
            } else {
                // fallback: usar el string como clave
                diasMap.set(f.fecha, f.fecha);
            }
        }
        if (f.horarios) f.horarios.forEach(h => horarios.add(h));
    });

    // Ordenar los días cronológicamente
    const diasOrdenados = Array.from(diasMap.keys()).sort().map(iso => diasMap.get(iso));

    const selectCiudad = document.getElementById('home-filter-ciudad');
    const selectCine = document.getElementById('home-filter-cine');
    const selectDia = document.getElementById('home-filter-dia');
    const selectHorario = document.getElementById('home-filter-horario');

    const currentCiudad = selectCiudad.value;
    const currentCine = selectCine.value;
    const currentDia = selectDia.value;
    const currentHorario = selectHorario.value;

    function rellenar(select, valoresArray, currentValue) {
        const nuevoValor = valoresArray.includes(currentValue) ? currentValue : "";
        select.innerHTML = `<option value="">Todos</option>`;
        valoresArray.forEach(v => {
            const opt = document.createElement('option');
            opt.value = v;
            opt.textContent = v;
            if (v === nuevoValor) opt.selected = true;
            select.appendChild(opt);
        });
    }

    rellenar(selectCiudad, Array.from(ciudades).sort(), currentCiudad);
    rellenar(selectCine, Array.from(cines).sort(), currentCine);
    rellenar(selectDia, diasOrdenados, currentDia);
    rellenar(selectHorario, Array.from(horarios).sort(), currentHorario);
}

function mostrarPeliculasHome(listaPeliculas) {
    const carteleraMap = new Map();
    const proximosMap = new Map();
    for (const peli of listaPeliculas) {
        if (peli.seccion === "cartelera" && !carteleraMap.has(peli.titulo)) {
            carteleraMap.set(peli.titulo, peli);
        } else if (peli.seccion === "proximos" && !proximosMap.has(peli.titulo)) {
            proximosMap.set(peli.titulo, peli);
        }
    }
    const carteleraGrid = document.getElementById('cartelera-grid');
    const proximosGrid = document.getElementById('proximos-grid');
    carteleraGrid.innerHTML = '';
    proximosGrid.innerHTML = '';
    for (const peli of carteleraMap.values()) {
        carteleraGrid.appendChild(crearTarjetaPelicula(peli));
    }
    for (const peli of proximosMap.values()) {
        proximosGrid.appendChild(crearTarjetaPelicula(peli));
    }
}

function crearTarjetaPelicula(peli) {
    const tarjeta = document.createElement('div');
    tarjeta.className = 'movie-card';
    tarjeta.dataset.titulo = peli.titulo;
    tarjeta.innerHTML = `
        <img src="${peli.poster}" alt="Póster de ${peli.titulo}">
        <div class="movie-card-info">
            <h3>${peli.titulo}</h3>
            <p class="director">Director: ${peli.director}</p>
            <p class="duration">Duración: ${peli.duracion} min</p>
        </div>
    `;
    tarjeta.addEventListener('click', () => abrirDetallePelicula(peli.titulo));
    return tarjeta;
}

// ================================ DETALLE ================================
function abrirDetallePelicula(titulo) {
    peliculaActualTitulo = titulo;
    const datosFijos = peliculas.find(p => p.titulo === titulo);
    if (!datosFijos) return;

    document.getElementById('detail-poster').src = datosFijos.poster;
    document.getElementById('detail-titulo').textContent = datosFijos.titulo;
    document.getElementById('detail-director').textContent = datosFijos.director;
    document.getElementById('detail-duracion').textContent = datosFijos.duracion;
    document.getElementById('detail-sinopsis').textContent = datosFijos.sinopsis;

    const trailerContainer = document.getElementById('trailer-container');
    const trailerLink = document.getElementById('trailer-link');
    if (datosFijos.linkTrailer && datosFijos.linkTrailer !== "") {
        trailerLink.href = datosFijos.linkTrailer;
        trailerContainer.classList.remove('hidden');
    } else {
        trailerContainer.classList.add('hidden');
    }

    inicializarFiltrosDetalle();
    aplicarFiltrosDetalle();

    document.getElementById('home-view').classList.add('hidden');
    document.getElementById('detail-view').classList.remove('hidden');
    window.scrollTo(0, 0);
}

function inicializarFiltrosDetalle() {
    const funcionesPeli = peliculas.filter(p => p.titulo === peliculaActualTitulo && p.seccion === "cartelera");
    actualizarOpcionesDetalle(funcionesPeli);

    const filtrosIds = ['detail-filter-ciudad', 'detail-filter-cine', 'detail-filter-dia', 'detail-filter-horario', 'detail-filter-idioma'];
    filtrosIds.forEach(id => {
        const elemento = document.getElementById(id);
        const nuevo = elemento.cloneNode(true);
        elemento.parentNode.replaceChild(nuevo, elemento);
        nuevo.addEventListener('change', () => aplicarFiltrosDetalle());
    });
}

function aplicarFiltrosDetalle() {
    let funciones = peliculas.filter(p => p.titulo === peliculaActualTitulo && p.seccion === "cartelera");

    const valCiudad = document.getElementById('detail-filter-ciudad').value;
    const valCine = document.getElementById('detail-filter-cine').value;
    const valDia = document.getElementById('detail-filter-dia').value;
    const valIdioma = document.getElementById('detail-filter-idioma').value;
    const valHorario = document.getElementById('detail-filter-horario').value;

    if (valCiudad) funciones = funciones.filter(p => p.ciudad === valCiudad);
    if (valCine) funciones = funciones.filter(p => p.cine === valCine);
    if (valDia) funciones = funciones.filter(p => p.fecha === valDia);
    if (valIdioma) funciones = funciones.filter(p => p.idioma === valIdioma);

    actualizarOpcionesDetalle(funciones);

    const nuevoValCiudad = document.getElementById('detail-filter-ciudad').value;
    const nuevoValCine = document.getElementById('detail-filter-cine').value;
    const nuevoValDia = document.getElementById('detail-filter-dia').value;
    const nuevoValIdioma = document.getElementById('detail-filter-idioma').value;
    const nuevoValHorario = document.getElementById('detail-filter-horario').value;

    let finalFunciones = peliculas.filter(p => p.titulo === peliculaActualTitulo && p.seccion === "cartelera");
    if (nuevoValCiudad) finalFunciones = finalFunciones.filter(p => p.ciudad === nuevoValCiudad);
    if (nuevoValCine) finalFunciones = finalFunciones.filter(p => p.cine === nuevoValCine);
    if (nuevoValDia) finalFunciones = finalFunciones.filter(p => p.fecha === nuevoValDia);
    if (nuevoValIdioma) finalFunciones = finalFunciones.filter(p => p.idioma === nuevoValIdioma);

    renderizarFuncionesDetalle(finalFunciones, nuevoValHorario);
}

function actualizarOpcionesDetalle(funcionesValidas) {
    const ciudades = new Set();
    const cines = new Set();
    const diasMap = new Map();
    const idiomas = new Set();
    const horarios = new Set();

    funcionesValidas.forEach(f => {
        if (f.ciudad) ciudades.add(f.ciudad);
        if (f.cine) cines.add(f.cine);
        if (f.fecha) {
            const fechaDate = convertirStringAFecha(f.fecha);
            if (fechaDate) {
                const iso = fechaDate.toISOString().split('T')[0];
                diasMap.set(iso, f.fecha);
            } else {
                diasMap.set(f.fecha, f.fecha);
            }
        }
        if (f.idioma) idiomas.add(f.idioma);
        if (f.horarios) f.horarios.forEach(h => horarios.add(h));
    });

    const diasOrdenados = Array.from(diasMap.keys()).sort().map(iso => diasMap.get(iso));

    const selectCiudad = document.getElementById('detail-filter-ciudad');
    const selectCine = document.getElementById('detail-filter-cine');
    const selectDia = document.getElementById('detail-filter-dia');
    const selectIdioma = document.getElementById('detail-filter-idioma');
    const selectHorario = document.getElementById('detail-filter-horario');

    const currentCiudad = selectCiudad.value;
    const currentCine = selectCine.value;
    const currentDia = selectDia.value;
    const currentIdioma = selectIdioma.value;
    const currentHorario = selectHorario.value;

    function rellenar(select, valoresArray, currentValue) {
        const nuevoValor = valoresArray.includes(currentValue) ? currentValue : "";
        select.innerHTML = `<option value="">Todos</option>`;
        valoresArray.forEach(v => {
            const opt = document.createElement('option');
            opt.value = v;
            opt.textContent = v;
            if (v === nuevoValor) opt.selected = true;
            select.appendChild(opt);
        });
    }

    rellenar(selectCiudad, Array.from(ciudades).sort(), currentCiudad);
    rellenar(selectCine, Array.from(cines).sort(), currentCine);
    rellenar(selectDia, diasOrdenados, currentDia);
    rellenar(selectIdioma, Array.from(idiomas).sort(), currentIdioma);
    rellenar(selectHorario, Array.from(horarios).sort(), currentHorario);
}

function renderizarFuncionesDetalle(funciones, filtroHorario) {
    const contenedor = document.getElementById('showtimes-container');
    contenedor.innerHTML = '';

    if (funciones.length === 0) {
        contenedor.innerHTML = '<p style="color: var(--text-muted);">No hay funciones disponibles para los filtros seleccionados.</p>';
        return;
    }

    const porCine = {};
    funciones.forEach(f => {
        if (!porCine[f.cine]) porCine[f.cine] = [];
        porCine[f.cine].push(f);
    });

    for (const cine in porCine) {
        const bloque = document.createElement('div');
        bloque.className = 'cine-block';
        let html = `<h4>${cine} (${porCine[cine][0].ciudad})</h4>`;
        porCine[cine].forEach(f => {
            const horariosMostrar = filtroHorario ? f.horarios.filter(h => h === filtroHorario) : f.horarios;
            if (horariosMostrar.length === 0) return;
            html += `
                <div class="funcion-item">
                    <div class="funcion-fecha-idioma"><strong>${f.fecha}</strong> · ${f.idioma}</div>
                    <div class="horarios-lista">
                        ${horariosMostrar.map(h => `<span class="horario-tag">${h}</span>`).join('')}
                    </div>
                </div>
            `;
        });
        bloque.innerHTML = html;
        contenedor.appendChild(bloque);
    }
}

// ================================ NAVEGACIÓN ================================
function configurarNavegacionGlobal() {
    document.getElementById('site-title').addEventListener('click', () => {
        document.getElementById('home-filter-ciudad').value = "";
        document.getElementById('home-filter-cine').value = "";
        document.getElementById('home-filter-dia').value = "";
        document.getElementById('home-filter-horario').value = "";
        const todasCartelera = peliculas.filter(p => p.seccion === "cartelera");
        actualizarOpcionesFiltrosHome(todasCartelera);
        mostrarPeliculasHome(peliculas);
        document.getElementById('detail-view').classList.add('hidden');
        document.getElementById('home-view').classList.remove('hidden');
    });
}