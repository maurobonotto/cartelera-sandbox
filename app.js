// app.js - Filtros en cascada en HOME y DETALLE

let peliculas = [];
let peliculaActualTitulo = "";

document.addEventListener("DOMContentLoaded", () => {
    cargarDatos();
    configurarNavegacionGlobal();
});

function cargarDatos() {
    fetch('cartelera_prueba.json')
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

    // Películas únicas de cartelera que tienen al menos una función filtrada
    const idsFunciones = new Set(funcionesFiltradas.map(f => f.id_funcion));
    const pelisCartelera = peliculas.filter(p => p.seccion === "cartelera" && idsFunciones.has(p.id_funcion));
    const pelisUnicasCartelera = [];
    const titulosVistos = new Set();
    for (const p of pelisCartelera) {
        if (!titulosVistos.has(p.titulo)) {
            titulosVistos.add(p.titulo);
            pelisUnicasCartelera.push(p);
        }
    }
    const pelisProximos = peliculas.filter(p => p.seccion === "proximos");
    mostrarPeliculasHome([...pelisUnicasCartelera, ...pelisProximos]);
}

function actualizarOpcionesFiltrosHome(funcionesValidas) {
    const ciudades = new Set();
    const cines = new Set();
    const dias = new Set();
    const horarios = new Set();

    funcionesValidas.forEach(f => {
        if (f.ciudad) ciudades.add(f.ciudad);
        if (f.cine) cines.add(f.cine);
        if (f.fecha) dias.add(f.fecha);
        if (f.horarios) f.horarios.forEach(h => horarios.add(h));
    });

    const selectCiudad = document.getElementById('home-filter-ciudad');
    const selectCine = document.getElementById('home-filter-cine');
    const selectDia = document.getElementById('home-filter-dia');
    const selectHorario = document.getElementById('home-filter-horario');

    const currentCiudad = selectCiudad.value;
    const currentCine = selectCine.value;
    const currentDia = selectDia.value;
    const currentHorario = selectHorario.value;

    function rellenar(select, valoresSet, currentValue) {
        const nuevoValor = currentValue && valoresSet.has(currentValue) ? currentValue : "";
        select.innerHTML = `<option value="">Todos</option>`;
        Array.from(valoresSet).sort().forEach(v => {
            const opt = document.createElement('option');
            opt.value = v;
            opt.textContent = v;
            if (v === nuevoValor) opt.selected = true;
            select.appendChild(opt);
        });
    }

    rellenar(selectCiudad, ciudades, currentCiudad);
    rellenar(selectCine, cines, currentCine);
    rellenar(selectDia, dias, currentDia);
    rellenar(selectHorario, horarios, currentHorario);
}

function mostrarPeliculasHome(listaPeliculas) {
    const carteleraGrid = document.getElementById('cartelera-grid');
    const proximosGrid = document.getElementById('proximos-grid');
    carteleraGrid.innerHTML = '';
    proximosGrid.innerHTML = '';

    listaPeliculas.forEach(peli => {
        const tarjeta = crearTarjetaPelicula(peli);
        if (peli.seccion === "cartelera") carteleraGrid.appendChild(tarjeta);
        else if (peli.seccion === "proximos") proximosGrid.appendChild(tarjeta);
    });
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

// ================================ DETALLE (con cascada) ================================
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
    // Obtener todas las funciones de la película actual
    const funcionesPeli = peliculas.filter(p => p.titulo === peliculaActualTitulo && p.seccion === "cartelera");
    actualizarOpcionesDetalle(funcionesPeli);

    const filtrosIds = ['detail-filter-ciudad', 'detail-filter-cine', 'detail-filter-dia', 'detail-filter-horario', 'detail-filter-idioma'];
    filtrosIds.forEach(id => {
        const elemento = document.getElementById(id);
        // Remover listeners anteriores clonando
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

    // Actualizar opciones de los selectores según las funciones filtradas actualmente
    actualizarOpcionesDetalle(funciones);

    // Volver a leer valores después de actualizar (por si algún selector perdió su valor)
    const nuevoValCiudad = document.getElementById('detail-filter-ciudad').value;
    const nuevoValCine = document.getElementById('detail-filter-cine').value;
    const nuevoValDia = document.getElementById('detail-filter-dia').value;
    const nuevoValIdioma = document.getElementById('detail-filter-idioma').value;
    const nuevoValHorario = document.getElementById('detail-filter-horario').value;

    // Re-aplicar filtros con los valores (que ya son coherentes)
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
    const dias = new Set();
    const idiomas = new Set();
    const horarios = new Set();

    funcionesValidas.forEach(f => {
        if (f.ciudad) ciudades.add(f.ciudad);
        if (f.cine) cines.add(f.cine);
        if (f.fecha) dias.add(f.fecha);
        if (f.idioma) idiomas.add(f.idioma);
        if (f.horarios) f.horarios.forEach(h => horarios.add(h));
    });

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

    function rellenar(select, valoresSet, currentValue) {
        const nuevoValor = currentValue && valoresSet.has(currentValue) ? currentValue : "";
        select.innerHTML = `<option value="">Todos</option>`;
        Array.from(valoresSet).sort().forEach(v => {
            const opt = document.createElement('option');
            opt.value = v;
            opt.textContent = v;
            if (v === nuevoValor) opt.selected = true;
            select.appendChild(opt);
        });
    }

    rellenar(selectCiudad, ciudades, currentCiudad);
    rellenar(selectCine, cines, currentCine);
    rellenar(selectDia, dias, currentDia);
    rellenar(selectIdioma, idiomas, currentIdioma);
    rellenar(selectHorario, horarios, currentHorario);
}

function renderizarFuncionesDetalle(funciones, filtroHorario) {
    const contenedor = document.getElementById('showtimes-container');
    contenedor.innerHTML = '';

    if (funciones.length === 0) {
        contenedor.innerHTML = '<p style="color: var(--text-muted);">No hay funciones disponibles para los filtros seleccionados.</p>';
        return;
    }

    // Agrupar por cine
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
        // Resetear filtros home
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

// Helper (por si se necesita en otros lados)
function llenarSelector(id, valoresSet) {
    const selector = document.getElementById(id);
    selector.innerHTML = `<option value="">Todos</option>`;
    Array.from(valoresSet).sort().forEach(v => {
        const opt = document.createElement('option');
        opt.value = v;
        opt.textContent = v;
        selector.appendChild(opt);
    });
}