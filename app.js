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
    // Limpiar opciones previas dejando solo la primera (Todas/Todos)
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
            // Próximos estrenos no se filtran, se muestran siempre todos
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

    // Evento para abrir el detalle al hacer clic en la tarjeta
    tarjeta.addEventListener('click', () => {
        abrirDetallePelicula(peli.titulo);
    });

    return tarjeta;
}

// 4. SISTEMA DE FILTRADO DEL HOME
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

    // Filtramos las funciones que cumplan con los criterios seleccionados
    const funcionesFiltradas = peliculas.filter(peli => {
        if (peli.seccion !== "cartelera") return false;

        if (valCiudad && peli.ciudad !== valCiudad) return false;
        if (valCine && peli.cine !== valCine) return false;
        if (valDia && peli.fecha !== valDia) return false;
        if (valHorario && !peli.horarios.includes(valHorario)) return false;

        return true;
    });

    // Construimos una lista que contenga todas las películas originales pero combinando las aprobadas
    // Próximos estrenos pasan directo, Cartelera pasa si su función fue aprobada
    const peliculasAMostrar = peliculas.filter(peli => {
        if (peli.seccion === "proximos") return true;
        return funcionesFiltradas.some(f => f.id_funcion === peli.id_funcion);
    });

    mostrarPeliculasHome(peliculasAMostrar);
}

// 5. LÓGICA DE LA VENTANA DE DETALLE
function abrirDetallePelicula(titulo) {
    peliculaActualTitulo = titulo;

    // Buscamos una función cualquiera de esta película para sacar los datos fijos (póster, sinopsis, etc.)
    const datosFijos = peliculas.find(p => p.titulo === titulo);

    if (!datosFijos) return;

    // Llenamos la presentación de la película
    document.getElementById('detail-poster').src = datosFijos.poster;
    document.getElementById('detail-titulo').textContent = datosFijos.titulo;
    document.getElementById('detail-director').textContent = datosFijos.director;
    document.getElementById('detail-duracion').textContent = datosFijos.duracion;
    document.getElementById('detail-sinopsis').textContent = datosFijos.sinopsis;

    // Configurar y limpiar los filtros internos específicos de esta película
    configurarFiltrosDetalle(titulo);

    // Mostrar las funciones por primera vez (sin filtros aplicados)
    aplicarFiltrosDetalle();

    // Intercambiamos de pantalla de manera visual
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

    // Recolectamos datos solo de las funciones que pertenezcan a ESTA película
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

    // Escuchamos cambios en estos filtros internos
    const filtrosInternos = ['detail-filter-ciudad', 'detail-filter-cine', 'detail-filter-dia', 'detail-filter-horario', 'detail-filter-idioma'];
    // Removemos eventos viejos para que no se acumulen al cambiar de película
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

    // Filtramos las funciones de esta película específica
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
        contenedor.innerHTML = '<p style="color: var(--text-sec);">No hay funciones disponibles para los filtros seleccionados.</p>';
        return;
    }

    // Agrupamos los resultados por Cine para armar el listado prolijo
    const funcionesPorCine = {};
    funciones.forEach(f => {
        if (!funcionesPorCine[f.cine]) {
            funcionesPorCine[f.cine] = [];
        }
        funcionesPorCine[f.cine].push(f);
    });

    // Dibujamos los bloques en el HTML
    for (const cine in funcionesPorCine) {
        const cineBlock = document.createElement('div');
        cineBlock.className = 'cine-block';
        cineBlock.style.marginBottom = '20px';
        cineBlock.style.padding = '15px';
        cineBlock.style.backgroundColor = 'var(--bg-card)';
        cineBlock.style.borderRadius = '4px';

        let htmlContenido = `<h4 style="margin-top:0; color:var(--accent);">${cine} (${funcionesPorCine[cine][0].ciudad})</h4>`;

        funcionesPorCine[cine].forEach(f => {
            // Si el usuario filtró por un horario específico, solo mostramos ese sub-horario
            const horariosAMostrar = filtroHorario ? f.horarios.filter(h => h === filtroHorario) : f.horarios;
            
            if (horariosAMostrar.length > 0) {
                htmlContenido += `
                    <div style="margin-bottom: 10px; font-size: 0.95rem;">
                        <strong>${f.fecha}</strong> - <span style="color: var(--text-sec);">${f.idioma}</span>
                        <div style="margin-top: 5px; display: flex; gap: 10px;">
                            ${horariosAMostrar.map(h => `<span style="background:#007acc; padding: 3px 8px; border-radius:3px; font-size:0.85rem;">${h}</span>`).join('')}
                        </div>
                    </div>
                `;
            }
        });

        cineBlock.innerHTML = htmlContenido;
        contenedor.appendChild(cineBlock);
    }
}

// 6. NAVEGACIÓN GLOBAL (Volver al Home)
function configurarNavegacionGlobal() {
    document.getElementById('site-title').addEventListener('click', () => {
        // Reseteamos los filtros del Home al volver
        document.getElementById('home-filter-ciudad').value = "";
        document.getElementById('home-filter-cine').value = "";
        document.getElementById('home-filter-dia').value = "";
        document.getElementById('home-filter-horario').value = "";
        
        mostrarPeliculasHome(peliculas);

        // Cambiamos de pantalla de manera visual
        document.getElementById('detail-view').classList.add('hidden');
        document.getElementById('home-view').classList.remove('hidden');
    });
}