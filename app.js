// app.js - Filtros independientes (no se borran opciones), menú hamburguesa, detalle completo
let peliculas = [];
let peliculaActualTitulo = "";

document.addEventListener("DOMContentLoaded", () => {
    cargarDatos();
    configurarNavegacionGlobal();
    inicializarMenuHamburguesa();
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
    // Cargar opciones de filtros una sola vez (con todas las opciones posibles)
    cargarOpcionesFiltrosHome();
    // Mostrar todas las películas (cartelera + próximos)
    mostrarPeliculasHome(peliculas);
    // Event listeners de filtros
    const filtrosIds = ['home-filter-ciudad', 'home-filter-cine', 'home-filter-dia', 'home-filter-horario'];
    filtrosIds.forEach(id => {
        document.getElementById(id).addEventListener('change', () => aplicarFiltrosHome());
    });
}

// Carga los selectores con todos los valores posibles (sin filtrar)
function cargarOpcionesFiltrosHome() {
    const funcionesCartelera = peliculas.filter(p => p.seccion === "cartelera");
    
    const ciudades = new Set();
    const cines = new Set();
    const diasMap = new Map();
    const horarios = new Set();
    
    funcionesCartelera.forEach(f => {
        if (f.ciudad) ciudades.add(f.ciudad);
        if (f.cine) cines.add(f.cine);
        if (f.fecha) {
            const fechaDate = convertirFechaLegible(f.fecha);
            if (fechaDate) {
                const iso = fechaDate.toISOString().split('T')[0];
                diasMap.set(iso, f.fecha);
            } else {
                diasMap.set(f.fecha, f.fecha);
            }
        }
        if (f.horarios) f.horarios.forEach(h => horarios.add(h));
    });
    
    const diasOrdenados = Array.from(diasMap.keys()).sort().map(iso => diasMap.get(iso));
    
    const selectCiudad = document.getElementById('home-filter-ciudad');
    const selectCine = document.getElementById('home-filter-cine');
    const selectDia = document.getElementById('home-filter-dia');
    const selectHorario = document.getElementById('home-filter-horario');
    
    function rellenar(select, valoresArray) {
        select.innerHTML = `<option value="">Todos</option>`;
        valoresArray.forEach(v => {
            const opt = document.createElement('option');
            opt.value = v;
            opt.textContent = v;
            select.appendChild(opt);
        });
    }
    
    rellenar(selectCiudad, Array.from(ciudades).sort());
    rellenar(selectCine, Array.from(cines).sort());
    rellenar(selectDia, diasOrdenados);
    rellenar(selectHorario, Array.from(horarios).sort());
}

// Aplicar filtros SIN modificar los selectores (solo filtrar las películas mostradas)
function aplicarFiltrosHome() {
    const valCiudad = document.getElementById('home-filter-ciudad').value;
    const valCine = document.getElementById('home-filter-cine').value;
    const valDia = document.getElementById('home-filter-dia').value;
    const valHorario = document.getElementById('home-filter-horario').value;
    
    // Filtrar funciones de cartelera
    let funcionesFiltradas = peliculas.filter(p => p.seccion === "cartelera");
    
    if (valCiudad) funcionesFiltradas = funcionesFiltradas.filter(p => p.ciudad === valCiudad);
    if (valCine) funcionesFiltradas = funcionesFiltradas.filter(p => p.cine === valCine);
    if (valDia) funcionesFiltradas = funcionesFiltradas.filter(p => p.fecha === valDia);
    if (valHorario) funcionesFiltradas = funcionesFiltradas.filter(p => p.horarios && p.horarios.includes(valHorario));
    
    // Obtener títulos únicos de cartelera filtrados
    const titulosValidos = new Set(funcionesFiltradas.map(f => f.titulo));
    const pelisCarteleraUnicas = [];
    const agregadosCartelera = new Set();
    for (const p of peliculas) {
        if (p.seccion === "cartelera" && titulosValidos.has(p.titulo) && !agregadosCartelera.has(p.titulo)) {
            agregadosCartelera.add(p.titulo);
            pelisCarteleraUnicas.push(p);
        }
    }
    
    // Todas las películas de próximos estrenos (siempre se muestran todas, sin filtros)
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
    
    const carteleraOrdenada = Array.from(carteleraMap.values()).sort((a, b) => a.titulo.localeCompare(b.titulo));
    const proximosOrdenada = Array.from(proximosMap.values()).sort((a, b) => a.titulo.localeCompare(b.titulo));
    
    const carteleraGrid = document.getElementById('cartelera-grid');
    const proximosGrid = document.getElementById('proximos-grid');
    carteleraGrid.innerHTML = '';
    proximosGrid.innerHTML = '';
    
    for (const peli of carteleraOrdenada) {
        carteleraGrid.appendChild(crearTarjetaPelicula(peli));
    }
    for (const peli of proximosOrdenada) {
        proximosGrid.appendChild(crearTarjetaPelicula(peli));
    }
    
    const carteleraCount = document.getElementById('cartelera-counter');
    const proximosCount = document.getElementById('proximos-counter');
    if (carteleraCount) carteleraCount.textContent = `(${carteleraOrdenada.length})`;
    if (proximosCount) proximosCount.textContent = `(${proximosOrdenada.length})`;
}

// Placeholder "ツ" en negrita
function crearTarjetaPelicula(peli) {
    const tarjeta = document.createElement('div');
    tarjeta.className = 'movie-card';
    tarjeta.dataset.titulo = peli.titulo;
    const posterPlaceholder = 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20200%20300%22%3E%3Crect%20width%3D%22200%22%20height%3D%22300%22%20fill%3D%22%23333%22%2F%3E%3Ctext%20x%3D%22100%22%20y%3D%22150%22%20fill%3D%22%23999%22%20text-anchor%3D%22middle%22%20font-size%3D%2232%22%20font-weight%3D%22bold%22%20font-family%3D%22Arial%2C%20sans-serif%22%3E%E3%83%84%3C%2Ftext%3E%3C%2Fsvg%3E';
    tarjeta.innerHTML = `
        <img src="${peli.poster || posterPlaceholder}" alt="Póster de ${peli.titulo}"
             onerror="this.onerror=null; this.src='${posterPlaceholder}';">
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

    const posterPlaceholder = 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20260%20462%22%3E%3Crect%20width%3D%22260%22%20height%3D%22462%22%20fill%3D%22%23333%22%2F%3E%3Ctext%20x%3D%22130%22%20y%3D%22231%22%20fill%3D%22%23999%22%20text-anchor%3D%22middle%22%20font-size%3D%2250%22%20font-weight%3D%22bold%22%20font-family%3D%22Arial%2C%20sans-serif%22%3E%E3%83%84%3C%2Ftext%3E%3C%2Fsvg%3E';
    const detailPoster = document.getElementById('detail-poster');
    detailPoster.src = datosFijos.poster || posterPlaceholder;
    detailPoster.onerror = function() {
        this.onerror = null;
        this.src = posterPlaceholder;
    };

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

// ========== CORRECCIÓN: eliminar filtro de sección "cartelera" en detalle ==========
function inicializarFiltrosDetalle() {
    const funcionesPeli = peliculas.filter(p => p.titulo === peliculaActualTitulo);
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
    let funciones = peliculas.filter(p => p.titulo === peliculaActualTitulo);

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

    let finalFunciones = peliculas.filter(p => p.titulo === peliculaActualTitulo);
    if (nuevoValCiudad) finalFunciones = finalFunciones.filter(p => p.ciudad === nuevoValCiudad);
    if (nuevoValCine) finalFunciones = finalFunciones.filter(p => p.cine === nuevoValCine);
    if (nuevoValDia) finalFunciones = finalFunciones.filter(p => p.fecha === nuevoValDia);
    if (nuevoValIdioma) finalFunciones = finalFunciones.filter(p => p.idioma === nuevoValIdioma);

    renderizarFuncionesDetalle(finalFunciones, nuevoValHorario);
}
// ========== FIN CORRECCIÓN ==========

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
            const fechaDate = convertirFechaLegible(f.fecha);
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

// Función auxiliar para convertir fecha legible a Date
function convertirFechaLegible(fechaStr) {
    const partes = fechaStr.split(' ');
    if (partes.length < 2) return null;
    const fechaParte = partes[1];
    const [dia, mes, anio] = fechaParte.split('/');
    if (!dia || !mes || !anio) return null;
    const meses = {
        'Enero': 0, 'Febrero': 1, 'Marzo': 2, 'Abril': 3, 'Mayo': 4, 'Junio': 5,
        'Julio': 6, 'Agosto': 7, 'Septiembre': 8, 'Octubre': 9, 'Noviembre': 10, 'Diciembre': 11
    };
    const mesNum = meses[mes];
    if (mesNum === undefined) return null;
    return new Date(parseInt(anio), mesNum, parseInt(dia));
}

// Versión con cines en horizontal y orden alfabético de cines
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

    const cinesOrdenados = Object.keys(porCine).sort();

    for (const cine of cinesOrdenados) {
        const funcionesCine = porCine[cine];
        const bloque = document.createElement('div');
        bloque.className = 'cine-block';
        
        const grupos = new Map();
        funcionesCine.forEach(f => {
            const key = `${f.fecha}|${f.idioma}`;
            if (!grupos.has(key)) {
                grupos.set(key, { fecha: f.fecha, idioma: f.idioma, horarios: [] });
            }
            grupos.get(key).horarios.push(...f.horarios);
        });
        
        let html = `<h4>${cine} (${funcionesCine[0].ciudad})</h4>`;
        for (const grupo of grupos.values()) {
            let horariosMostrar = grupo.horarios;
            if (filtroHorario) {
                horariosMostrar = horariosMostrar.filter(h => h === filtroHorario);
            }
            if (horariosMostrar.length === 0) continue;
            horariosMostrar.sort();
            html += `
                <div class="funcion-item">
                    <div class="funcion-fecha-idioma"><strong>${grupo.fecha}</strong> · ${grupo.idioma}</div>
                    <div class="horarios-lista">
                        ${horariosMostrar.map(h => `<span class="horario-tag">${h}</span>`).join('')}
                    </div>
                </div>
            `;
        }
        bloque.innerHTML = html;
        contenedor.appendChild(bloque);
    }
}

// ================================ NAVEGACIÓN GLOBAL ================================
function configurarNavegacionGlobal() {
    document.getElementById('site-title').addEventListener('click', () => {
        // Resetear filtros a valores vacíos
        document.getElementById('home-filter-ciudad').value = "";
        document.getElementById('home-filter-cine').value = "";
        document.getElementById('home-filter-dia').value = "";
        document.getElementById('home-filter-horario').value = "";
        // Volver a mostrar todas las películas
        mostrarPeliculasHome(peliculas);
        // Volver al home
        document.getElementById('detail-view').classList.add('hidden');
        document.getElementById('home-view').classList.remove('hidden');
    });
}

// ================================ MENÚ HAMBURGUESA (con scroll offset) ================================
function inicializarMenuHamburguesa() {
    const toggleBtn = document.getElementById('menu-toggle');
    const menuNav = document.getElementById('menu-nav');

    if (!toggleBtn || !menuNav) return;

    toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        menuNav.classList.toggle('hidden');
    });

    const links = document.querySelectorAll('.menu-link');
    links.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('href');
            
            const detailView = document.getElementById('detail-view');
            const homeView = document.getElementById('home-view');
            
            const scrollToTarget = () => {
                if (targetId) {
                    const targetElement = document.querySelector(targetId);
                    if (targetElement) {
                        const headerHeight = document.querySelector('.main-header').offsetHeight;
                        const elementPosition = targetElement.getBoundingClientRect().top + window.pageYOffset;
                        const offsetPosition = elementPosition - headerHeight - 60;
                        window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
                    }
                }
            };
            
            if (!detailView.classList.contains('hidden')) {
                homeView.classList.remove('hidden');
                detailView.classList.add('hidden');
                setTimeout(scrollToTarget, 50);
            } else {
                scrollToTarget();
            }
            menuNav.classList.add('hidden');
        });
    });

    document.addEventListener('click', (e) => {
        if (!menuNav.contains(e.target) && !toggleBtn.contains(e.target)) {
            menuNav.classList.add('hidden');
        }
    });
}