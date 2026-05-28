let peliculas = [];       // array de películas (formato nuevo)
let peliculaActual = null; // objeto película actual

document.addEventListener("DOMContentLoaded", () => {
    cargarDatos();
    configurarNavegacionGlobal();
});

// Cargar el JSON generado por el scraper
function cargarDatos() {
    fetch('backend/peliculas.json')
        .then(response => response.json())
        .then(data => {
            peliculas = data;
            inicializarHome();
        })
        .catch(error => console.error("Error cargando peliculas.json:", error));
}

// ---------- VISTA HOME ----------
function inicializarHome() {
    actualizarFiltrosHome();
    mostrarPeliculasHome(peliculas);
    const filtrosIds = ['home-filter-ciudad', 'home-filter-cine', 'home-filter-dia', 'home-filter-horario'];
    filtrosIds.forEach(id => {
        document.getElementById(id).addEventListener('change', aplicarFiltrosHome);
    });
}

// Extraer todas las ciudades, cines, días y horarios disponibles (desde todas las funciones de todas las películas)
function obtenerOpcionesGlobales() {
    const ciudades = new Set();
    const cines = new Set();
    const dias = new Set();
    const horarios = new Set();

    for (const peli of peliculas) {
        for (const func of peli.funciones) {
            // La ciudad la podemos extraer del nombre del cine (asumiendo que está entre paréntesis)
            let ciudad = '';
            const match = func.cine.match(/\(([^)]+)\)/);
            if (match) ciudad = match[1];
            if (ciudad) ciudades.add(ciudad);
            cines.add(func.cine);
            // Para días: no tenemos día en este formato, pero podemos simular "Hoy" o dejarlo vacío
            dias.add('Hoy');
            func.horarios.forEach(h => horarios.add(h));
        }
    }
    return { ciudades, cines, dias, horarios };
}

function actualizarFiltrosHome() {
    const { ciudades, cines, dias, horarios } = obtenerOpcionesGlobales();
    llenarSelector('home-filter-ciudad', ciudades);
    llenarSelector('home-filter-cine', cines);
    llenarSelector('home-filter-dia', dias);
    llenarSelector('home-filter-horario', Array.from(horarios).sort());
}

function aplicarFiltrosHome() {
    const valCiudad = document.getElementById('home-filter-ciudad').value;
    const valCine = document.getElementById('home-filter-cine').value;
    const valDia = document.getElementById('home-filter-dia').value;
    const valHorario = document.getElementById('home-filter-horario').value;

    const peliculasFiltradas = peliculas.filter(peli => {
        // Filtrar por funciones que cumplan
        const funcionesValidas = peli.funciones.filter(func => {
            if (valCine && func.cine !== valCine) return false;
            if (valCiudad) {
                const ciudad = func.cine.match(/\(([^)]+)\)/)?.[1] || '';
                if (ciudad !== valCiudad) return false;
            }
            // Día no lo usamos realmente, lo ignoramos
            if (valHorario && !func.horarios.includes(valHorario)) return false;
            return true;
        });
        return funcionesValidas.length > 0;
    });
    mostrarPeliculasHome(peliculasFiltradas);
}

function mostrarPeliculasHome(listaPeliculas) {
    const carteleraGrid = document.getElementById('cartelera-grid');
    const proximosGrid = document.getElementById('proximos-grid');
    carteleraGrid.innerHTML = '';
    proximosGrid.innerHTML = '';

    // Nota: En este nuevo formato no tenemos "próximos estrenos". Si quieres mantener esa sección,
    // necesitarías una fuente aparte. Por ahora, todo va a cartelera.
    for (const peli of listaPeliculas) {
        const tarjeta = crearTarjetaPelicula(peli);
        carteleraGrid.appendChild(tarjeta);
    }
}

function crearTarjetaPelicula(peli) {
    const tarjeta = document.createElement('div');
    tarjeta.className = 'movie-card';
    tarjeta.innerHTML = `
        <img src="${peli.poster}" alt="Póster de ${peli.titulo}">
        <div class="movie-card-info">
            <h3>${peli.titulo}</h3>
            <p class="director">Director: ${peli.director}</p>
            <p class="duration">Duración: ${peli.duracion}</p>
        </div>
    `;
    tarjeta.addEventListener('click', () => abrirDetallePelicula(peli));
    return tarjeta;
}

// ---------- VISTA DETALLE ----------
function abrirDetallePelicula(peli) {
    peliculaActual = peli;
    // Llenar datos fijos
    document.getElementById('detail-poster').src = peli.poster;
    document.getElementById('detail-titulo').textContent = peli.titulo;
    document.getElementById('detail-director').textContent = peli.director;
    document.getElementById('detail-duracion').textContent = peli.duracion;
    document.getElementById('detail-sinopsis').textContent = peli.sinopsis;

    // Trailer
    const trailerContainer = document.getElementById('trailer-container');
    const trailerLink = document.getElementById('trailer-link');
    if (peli.linkTrailer && peli.linkTrailer !== "") {
        trailerLink.href = peli.linkTrailer;
        trailerContainer.classList.remove('hidden');
    } else {
        trailerContainer.classList.add('hidden');
    }

    // Configurar filtros de detalle
    actualizarFiltrosDetalle();
    renderizarFuncionesDetalle();

    document.getElementById('home-view').classList.add('hidden');
    document.getElementById('detail-view').classList.remove('hidden');
    window.scrollTo(0, 0);
}

function actualizarFiltrosDetalle() {
    const ciudades = new Set();
    const cines = new Set();
    const horarios = new Set();

    for (const func of peliculaActual.funciones) {
        const ciudad = func.cine.match(/\(([^)]+)\)/)?.[1] || '';
        if (ciudad) ciudades.add(ciudad);
        cines.add(func.cine);
        func.horarios.forEach(h => horarios.add(h));
    }

    llenarSelector('detail-filter-ciudad', ciudades);
    llenarSelector('detail-filter-cine', cines);
    llenarSelector('detail-filter-horario', Array.from(horarios).sort());

    // Volver a conectar eventos después de llenar
    const filtrosInternos = ['detail-filter-ciudad', 'detail-filter-cine', 'detail-filter-horario'];
    filtrosInternos.forEach(id => {
        const elemento = document.getElementById(id);
        const nuevo = elemento.cloneNode(true);
        elemento.parentNode.replaceChild(nuevo, elemento);
        nuevo.addEventListener('change', () => renderizarFuncionesDetalle());
    });
}

function renderizarFuncionesDetalle() {
    const valCiudad = document.getElementById('detail-filter-ciudad').value;
    const valCine = document.getElementById('detail-filter-cine').value;
    const valHorario = document.getElementById('detail-filter-horario').value;

    let funcionesFiltradas = peliculaActual.funciones.filter(func => {
        if (valCine && func.cine !== valCine) return false;
        if (valCiudad) {
            const ciudad = func.cine.match(/\(([^)]+)\)/)?.[1] || '';
            if (ciudad !== valCiudad) return false;
        }
        return true;
    });

    const contenedor = document.getElementById('showtimes-container');
    contenedor.innerHTML = '';

    if (funcionesFiltradas.length === 0) {
        contenedor.innerHTML = '<p style="color: var(--text-muted);">No hay funciones con esos filtros.</p>';
        return;
    }

    for (const func of funcionesFiltradas) {
        let horariosMostrar = func.horarios;
        if (valHorario) horariosMostrar = horariosMostrar.filter(h => h === valHorario);
        if (horariosMostrar.length === 0) continue;

        const bloque = document.createElement('div');
        bloque.className = 'cine-block';
        bloque.innerHTML = `
            <h4>${func.cine}</h4>
            <div class="horarios-lista">
                ${horariosMostrar.map(h => `<span class="horario-tag">${h}</span>`).join('')}
            </div>
        `;
        contenedor.appendChild(bloque);
    }
}

// ---------- UTILS ----------
function llenarSelector(id, valoresSet) {
    const selector = document.getElementById(id);
    selector.innerHTML = `<option value="">Todos</option>`;
    Array.from(valoresSet).sort().forEach(val => {
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = val;
        selector.appendChild(opt);
    });
}

function configurarNavegacionGlobal() {
    document.getElementById('site-title').addEventListener('click', () => {
        document.getElementById('detail-view').classList.add('hidden');
        document.getElementById('home-view').classList.remove('hidden');
        // Reiniciar filtros del home (opcional)
        document.getElementById('home-filter-ciudad').value = "";
        document.getElementById('home-filter-cine').value = "";
        document.getElementById('home-filter-dia').value = "";
        document.getElementById('home-filter-horario').value = "";
        actualizarFiltrosHome();
        mostrarPeliculasHome(peliculas);
    });
}