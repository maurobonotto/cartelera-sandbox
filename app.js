// Variable global para guardar las películas cargadas del JSON
let peliculas = [];
// Variable para saber qué película se está mirando en la ventana de detalle
let peliculaActualTitulo = "";

// 1. INICIALIZACIÓN
document.addEventListener("DOMContentLoaded", () => {
    cargarDatos();
    configurarNavegacionGlobal();
});

// 2. CARGA DE DATOS
function cargarDatos() {
    fetch('cartelera_prueba.json')
        .then(response => response.json())
        .then(data => {
            peliculas = data;
            inicializarHome();
        })
        .catch(error => console.error("Error cargando el JSON:", error));
}

// 3. LOGICA DEL HOME
function inicializarHome() {
    configurarFiltrosHome();
    mostrarPeliculasHome(peliculas);
    escucharFiltrosHome();
}

function configurarFiltrosHome() {
    const ciudades = new Set();
    const cines = new Set();
    const dias = new Set();
    const horarios = new Set();

    peliculas.forEach(peli => {
        if (peli.seccion === "cartelera") {
            if (peli.ciudad) ciudades.add(peli.ciudad);
            if (peli.cine) cines.add(peli.cine);
            if (peli.fecha) dias.add(peli.fecha);
            if (peli.horarios) peli.horarios.forEach(h => horarios.add(h));
        }
    });

    llenarSelector('home-filter-ciudad', ciudades);
    llenarSelector('home-filter-cine', cines);
    llenarSelector('home-filter-dia', dias);
    llenarSelector('home-filter-horario', Array.from(horarios).sort());
}

function llenarSelector(idElemento, conjuntoOpciones) {
    const selector = document.getElementById(idElemento);
    selector.innerHTML = selector.options[0].outerHTML;
    
    conjuntoOpciones.forEach(opcion => {
        const opt = document.createElement('option');
        opt.value = opcion;
        opt.textContent = opcion;
        selector.appendChild(opt);
    });
}

function mostrarPeliculasHome(listaPeliculas) {
    const carteleraGrid = document.getElementById('cartelera-grid');
    const proximosGrid = document.getElementById('proximos-grid');

    carteleraGrid.innerHTML = '';
    proximosGrid.innerHTML = '';

    const titulosDibujados = new Set();

    listaPeliculas.forEach(peli => {
        if (peli.seccion === "cartelera") {
            if (titulosDibujados.has(peli.titulo)) return;
            const tarjeta = crearTarjetaPelicula(peli);
            carteleraGrid.appendChild(tarjeta);
            titulosDibujados.add(peli.titulo);
        } else if (peli.seccion === "proximos") {
            if (titulosDibujados.has(peli.titulo)) return;
            const tarjeta = crearTarjetaPelicula(peli);
            proximosGrid.appendChild(tarjeta);
            titulosDibujados.add(peli.titulo);
        }
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

    tarjeta.addEventListener('click', () => {
        abrirDetallePelicula(peli.titulo);
    });

    return tarjeta;
}

function escucharFiltrosHome() {
    const filtros = ['home-filter-ciudad', 'home-filter-cine', 'home-filter-dia', 'home-filter-horario'];
    filtros.forEach(id => {
        document.getElementById(id).addEventListener('change', aplicarFiltrosHome);
    });
}

function aplicarFiltrosHome() {
    const valCiudad = document.getElementById('home-filter-ciudad').value;
    const valCine = document.getElementById('home-filter-cine').value;
    const valDia = document.getElementById('home-filter-dia').value;
    const valHorario = document.getElementById('home-filter-horario').value;

    const funcionesFiltradas = peliculas.filter(peli => {
        if (peli.seccion !== "cartelera") return false;
        if (valCiudad && peli.ciudad !== valCiudad) return false;
        if (valCine && peli.cine !== valCine) return false;
        if (valDia && peli.fecha !== valDia) return false;
        if (valHorario && !peli.horarios.includes(valHorario)) return false;
        return true;
    });

    const peliculasAMostrar = peliculas.filter(peli => {
        if (peli.seccion === "proximos") return true;
        return funcionesFiltradas.some(f => f.id_funcion === peli.id_funcion);
    });

    mostrarPeliculasHome(peliculasAMostrar);
}

// 4. LÓGICA DE DETALLE
function abrirDetallePelicula(titulo) {
    peliculaActualTitulo = titulo;

    const datosFijos = peliculas.find(p => p.titulo === titulo);
    if (!datosFijos) return;

    // Llenar datos generales
    document.getElementById('detail-poster').src = datosFijos.poster;
    document.getElementById('detail-titulo').textContent = datosFijos.titulo;
    document.getElementById('detail-director').textContent = datosFijos.director;
    document.getElementById('detail-duracion').textContent = datosFijos.duracion;
    document.getElementById('detail-sinopsis').textContent = datosFijos.sinopsis;

    // Manejo del tráiler
    const trailerContainer = document.getElementById('trailer-container');
    const trailerLink = document.getElementById('trailer-link');
    if (datosFijos.linkTrailer && datosFijos.linkTrailer !== "") {
        trailerLink.href = datosFijos.linkTrailer;
        trailerContainer.classList.remove('hidden');
    } else {
        trailerContainer.classList.add('hidden');
    }

    configurarFiltrosDetalle(titulo);
    aplicarFiltrosDetalle();

    document.getElementById('home-view').classList.add('hidden');
    document.getElementById('detail-view').classList.remove('hidden');
    window.scrollTo(0, 0);
}

function configurarFiltrosDetalle(titulo) {
    const ciudades = new Set();
    const cines = new Set();
    const dias = new Set();
    const horarios = new Set();
    const idiomas = new Set();

    peliculas.forEach(p => {
        if (p.titulo === titulo && p.seccion === "cartelera") {
            if (p.ciudad) ciudades.add(p.ciudad);
            if (p.cine) cines.add(p.cine);
            if (p.fecha) dias.add(p.fecha);
            if (p.idioma) idiomas.add(p.idioma);
            if (p.horarios) p.horarios.forEach(h => horarios.add(h));
        }
    });

    llenarSelector('detail-filter-ciudad', ciudades);
    llenarSelector('detail-filter-cine', cines);
    llenarSelector('detail-filter-dia', dias);
    llenarSelector('detail-filter-idioma', idiomas);
    llenarSelector('detail-filter-horario', Array.from(horarios).sort());

    const filtrosInternos = ['detail-filter-ciudad', 'detail-filter-cine', 'detail-filter-dia', 'detail-filter-horario', 'detail-filter-idioma'];
    filtrosInternos.forEach(id => {
        const elemento = document.getElementById(id);
        const elementoClon = elemento.cloneNode(true);
        elemento.parentNode.replaceChild(elementoClon, elemento);
        elementoClon.addEventListener('change', aplicarFiltrosDetalle);
    });
}

function aplicarFiltrosDetalle() {
    const valCiudad = document.getElementById('detail-filter-ciudad').value;
    const valCine = document.getElementById('detail-filter-cine').value;
    const valDia = document.getElementById('detail-filter-dia').value;
    const valHorario = document.getElementById('detail-filter-horario').value;
    const valIdioma = document.getElementById('detail-filter-idioma').value;

    const funcionesFiltradas = peliculas.filter(p => {
        if (p.titulo !== peliculaActualTitulo || p.seccion !== "cartelera") return false;
        if (valCiudad && p.ciudad !== valCiudad) return false;
        if (valCine && p.cine !== valCine) return false;
        if (valDia && p.fecha !== valDia) return false;
        if (valIdioma && p.idioma !== valIdioma) return false;
        return true;
    });

    renderizarFuncionesDetalle(funcionesFiltradas, valHorario);
}

function renderizarFuncionesDetalle(funciones, filtroHorario) {
    const contenedor = document.getElementById('showtimes-container');
    contenedor.innerHTML = '';

    if (funciones.length === 0) {
        contenedor.innerHTML = '<p style="color: var(--text-muted);">No hay funciones disponibles para los filtros seleccionados.</p>';
        return;
    }

    const funcionesPorCine = {};
    funciones.forEach(f => {
        if (!funcionesPorCine[f.cine]) funcionesPorCine[f.cine] = [];
        funcionesPorCine[f.cine].push(f);
    });

    for (const cine in funcionesPorCine) {
        const cineBlock = document.createElement('div');
        cineBlock.className = 'cine-block';

        let htmlContenido = `<h4>${cine} (${funcionesPorCine[cine][0].ciudad})</h4>`;

        funcionesPorCine[cine].forEach(f => {
            const horariosAMostrar = filtroHorario ? f.horarios.filter(h => h === filtroHorario) : f.horarios;
            if (horariosAMostrar.length === 0) return;

            htmlContenido += `
                <div class="funcion-item">
                    <div class="funcion-fecha-idioma">
                        <strong>${f.fecha}</strong> · ${f.idioma}
                    </div>
                    <div class="horarios-lista">
                        ${horariosAMostrar.map(h => `<span class="horario-tag">${h}</span>`).join('')}
                    </div>
                </div>
            `;
        });

        cineBlock.innerHTML = htmlContenido;
        contenedor.appendChild(cineBlock);
    }
}

// 5. NAVEGACIÓN GLOBAL
function configurarNavegacionGlobal() {
    document.getElementById('site-title').addEventListener('click', () => {
        document.getElementById('home-filter-ciudad').value = "";
        document.getElementById('home-filter-cine').value = "";
        document.getElementById('home-filter-dia').value = "";
        document.getElementById('home-filter-horario').value = "";
        
        mostrarPeliculasHome(peliculas);
        document.getElementById('detail-view').classList.add('hidden');
        document.getElementById('home-view').classList.remove('hidden');
    });
}