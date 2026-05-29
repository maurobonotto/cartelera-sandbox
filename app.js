// app.js - Agrupación de cines: individuales al principio, cadenas con divisores
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

// ================================ NORMALIZACIÓN DE FECHAS ================================
function parsearFechaLegible(texto) {
    if (!texto) return null;

    let match = texto.match(/^[A-Za-záéíóúñ]+ (\d{1,2})\/([A-Za-záéíóú]+)\/(\d{4})$/i);
    if (match) {
        const dia = parseInt(match[1]);
        let mesStr = match[2].toLowerCase();
        const mesesCompletos = {
            'enero':0,'febrero':1,'marzo':2,'abril':3,'mayo':4,'junio':5,'julio':6,'agosto':7,'septiembre':8,'octubre':9,'noviembre':10,'diciembre':11
        };
        let mes = mesesCompletos[mesStr];
        if (mes === undefined) {
            const mesesAbr = { 'ene':0,'feb':1,'mar':2,'abr':3,'may':4,'jun':5,'jul':6,'ago':7,'sep':8,'oct':9,'nov':10,'dic':11 };
            const abr = mesStr.substring(0,3);
            mes = mesesAbr[abr];
        }
        const anio = parseInt(match[3]);
        if (!isNaN(dia) && mes !== undefined && !isNaN(anio)) {
            return new Date(anio, mes, dia);
        }
    }

    match = texto.match(/^[A-Za-z]{3} (\d{1,2})\/([A-Za-z]{3})\/(\d{4})$/i);
    if (match) {
        const dia = parseInt(match[1]);
        const mesAbr = match[2].toUpperCase();
        const mesesAbr = { 'ENE':0,'FEB':1,'MAR':2,'ABR':3,'MAY':4,'JUN':5,'JUL':6,'AGO':7,'SEP':8,'OCT':9,'NOV':10,'DIC':11 };
        const mes = mesesAbr[mesAbr];
        const anio = parseInt(match[3]);
        if (!isNaN(dia) && mes !== undefined && !isNaN(anio)) {
            return new Date(anio, mes, dia);
        }
    }

    match = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
        return new Date(parseInt(match[1]), parseInt(match[2])-1, parseInt(match[3]));
    }

    match = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (match) {
        return new Date(parseInt(match[3]), parseInt(match[2])-1, parseInt(match[1]));
    }

    console.warn(`⚠️ No se pudo parsear la fecha: ${texto}`);
    return null;
}

function esFechaPosteriorOHoy(fechaStr) {
    const fechaObj = parsearFechaLegible(fechaStr);
    if (!fechaObj) return false;
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    return fechaObj >= hoy;
}

// ================================ HOME ================================
function inicializarHome() {
    const funcionesCartelera = peliculas.filter(p => p.seccion === "cartelera");
    llenarFiltrosHome(funcionesCartelera);
    mostrarPeliculasHome(peliculas);

    const filtrosIds = ['home-filter-ciudad', 'home-filter-cine', 'home-filter-dia', 'home-filter-horario'];
    filtrosIds.forEach(id => {
        document.getElementById(id).addEventListener('change', () => aplicarFiltrosHome());
    });
}

// Clasifica cines en: individuales (sin agrupar) y grupos de cadena
function clasificarCines(cinesArray) {
    const individuales = [];   // cines que no pertenecen a ninguna cadena (Gaumont, Cosmos, Cacodelphia)
    const grupos = {
        "Atlas": [],
        "Cinemark/Hoyts": []
    };
    for (const cine of cinesArray) {
        if (cine.includes("Gaumont") || cine.includes("Cosmos") || cine.includes("Cacodelphia")) {
            individuales.push(cine);
        } else if (cine.includes("Atlas")) {
            grupos["Atlas"].push(cine);
        } else if (cine.includes("Cinemark") || cine.includes("Hoyts")) {
            grupos["Cinemark/Hoyts"].push(cine);
        } else {
            individuales.push(cine); // cualquier otro (no debería haber)
        }
    }
    // Ordenar alfabéticamente cada lista
    individuales.sort();
    grupos["Atlas"].sort();
    grupos["Cinemark/Hoyts"].sort();
    return { individuales, grupos };
}

// Llenar un select con opciones planas (para ciudad, día, horario, idioma)
function llenarSelect(id, valores) {
    const select = document.getElementById(id);
    if (!select) return;
    select.innerHTML = '<option value="">Todos</option>';
    valores.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v;
        opt.textContent = v;
        select.appendChild(opt);
    });
}

// Llenar select de cines: individuales al principio, luego grupos con optgroup
function llenarSelectCines(id, individuales, grupos) {
    const select = document.getElementById(id);
    if (!select) return;
    select.innerHTML = '<option value="">Todos</option>';
    
    // 1. Cines individuales (sin encabezado)
    for (const cine of individuales) {
        const opt = document.createElement('option');
        opt.value = cine;
        opt.textContent = cine;
        select.appendChild(opt);
    }
    
    // 2. Grupos de cadena (con optgroup)
    for (const [nombreGrupo, cinesLista] of Object.entries(grupos)) {
        if (cinesLista.length === 0) continue;
        const optgroup = document.createElement('optgroup');
        optgroup.label = nombreGrupo;
        for (const cine of cinesLista) {
            const opt = document.createElement('option');
            opt.value = cine;
            opt.textContent = cine;
            optgroup.appendChild(opt);
        }
        select.appendChild(optgroup);
    }
}

function llenarFiltrosHome(funcionesCartelera) {
    const ciudades = new Set();
    const cines = new Set();
    const fechasMap = new Map();
    const horarios = new Set();

    funcionesCartelera.forEach(f => {
        if (f.ciudad) ciudades.add(f.ciudad);
        if (f.cine) cines.add(f.cine);
        if (f.fecha && esFechaPosteriorOHoy(f.fecha)) {
            const fechaObj = parsearFechaLegible(f.fecha);
            if (fechaObj) fechasMap.set(f.fecha, fechaObj);
        }
        if (f.horarios) f.horarios.forEach(h => horarios.add(h));
    });

    const diasOrdenados = Array.from(fechasMap.entries())
        .sort((a, b) => a[1] - b[1])
        .map(([fechaStr]) => fechaStr);
    const horariosOrdenados = Array.from(horarios).sort();

    llenarSelect('home-filter-ciudad', Array.from(ciudades).sort());
    const { individuales, grupos } = clasificarCines(Array.from(cines));
    llenarSelectCines('home-filter-cine', individuales, grupos);
    llenarSelect('home-filter-dia', diasOrdenados);
    llenarSelect('home-filter-horario', horariosOrdenados);
}

function aplicarFiltrosHome() {
    const valCiudad = document.getElementById('home-filter-ciudad').value;
    const valCine = document.getElementById('home-filter-cine').value;
    const valDia = document.getElementById('home-filter-dia').value;
    const valHorario = document.getElementById('home-filter-horario').value;

    let funcionesFiltradas = peliculas.filter(p => p.seccion === "cartelera" && esFechaPosteriorOHoy(p.fecha));
    if (valCiudad) funcionesFiltradas = funcionesFiltradas.filter(p => p.ciudad === valCiudad);
    if (valCine) funcionesFiltradas = funcionesFiltradas.filter(p => p.cine === valCine);
    if (valDia) funcionesFiltradas = funcionesFiltradas.filter(p => p.fecha === valDia);
    if (valHorario) funcionesFiltradas = funcionesFiltradas.filter(p => p.horarios && p.horarios.includes(valHorario));

    const titulosCartelera = new Set(funcionesFiltradas.map(f => f.titulo));
    const pelisCarteleraUnicas = [];
    const agregados = new Set();
    for (const p of peliculas) {
        if (p.seccion === "cartelera" && titulosCartelera.has(p.titulo) && !agregados.has(p.titulo)) {
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

function inicializarFiltrosDetalle() {
    const todasFunciones = peliculas.filter(p => p.titulo === peliculaActualTitulo);
    llenarFiltrosDetalle(todasFunciones);
    
    const selectsIds = ['detail-filter-ciudad', 'detail-filter-cine', 'detail-filter-dia', 'detail-filter-idioma', 'detail-filter-horario'];
    selectsIds.forEach(id => {
        const select = document.getElementById(id);
        if (select) select.value = "";
    });
    
    selectsIds.forEach(id => {
        const select = document.getElementById(id);
        if (select) {
            select.removeEventListener('change', aplicarFiltrosDetalle);
            select.addEventListener('change', aplicarFiltrosDetalle);
        }
    });
}

function llenarFiltrosDetalle(funciones) {
    const ciudades = new Set();
    const cines = new Set();
    const fechasMap = new Map();
    const idiomas = new Set();
    const horarios = new Set();

    funciones.forEach(f => {
        if (f.ciudad) ciudades.add(f.ciudad);
        if (f.cine) cines.add(f.cine);
        if (f.fecha && esFechaPosteriorOHoy(f.fecha)) {
            const fechaObj = parsearFechaLegible(f.fecha);
            if (fechaObj) fechasMap.set(f.fecha, fechaObj);
        }
        if (f.idioma) idiomas.add(f.idioma);
        if (f.horarios) f.horarios.forEach(h => horarios.add(h));
    });

    const diasOrdenados = Array.from(fechasMap.entries())
        .sort((a, b) => a[1] - b[1])
        .map(([fechaStr]) => fechaStr);
    const horariosOrdenados = Array.from(horarios).sort();

    llenarSelect('detail-filter-ciudad', Array.from(ciudades).sort());
    const { individuales, grupos } = clasificarCines(Array.from(cines));
    llenarSelectCines('detail-filter-cine', individuales, grupos);
    llenarSelect('detail-filter-dia', diasOrdenados);
    llenarSelect('detail-filter-idioma', Array.from(idiomas).sort());
    llenarSelect('detail-filter-horario', horariosOrdenados);
}

function aplicarFiltrosDetalle() {
    const ciudad = document.getElementById('detail-filter-ciudad').value;
    const cine = document.getElementById('detail-filter-cine').value;
    const dia = document.getElementById('detail-filter-dia').value;
    const idioma = document.getElementById('detail-filter-idioma').value;
    const horario = document.getElementById('detail-filter-horario').value;

    let funcionesFiltradas = peliculas.filter(p => p.titulo === peliculaActualTitulo && esFechaPosteriorOHoy(p.fecha));
    if (ciudad) funcionesFiltradas = funcionesFiltradas.filter(p => p.ciudad === ciudad);
    if (cine) funcionesFiltradas = funcionesFiltradas.filter(p => p.cine === cine);
    if (dia) funcionesFiltradas = funcionesFiltradas.filter(p => p.fecha === dia);
    if (idioma) funcionesFiltradas = funcionesFiltradas.filter(p => p.idioma === idioma);

    renderizarFuncionesDetalle(funcionesFiltradas, horario);
}

function renderizarFuncionesDetalle(funciones, filtroHorario) {
    const contenedor = document.getElementById('showtimes-container');
    contenedor.innerHTML = '';

    const funcionesFuturas = funciones.filter(f => esFechaPosteriorOHoy(f.fecha));
    if (funcionesFuturas.length === 0) {
        contenedor.innerHTML = '<p style="color: var(--text-muted);">No hay funciones disponibles para los filtros seleccionados.</p>';
        return;
    }

    const porCine = {};
    funcionesFuturas.forEach(f => {
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
        document.getElementById('home-filter-ciudad').value = "";
        document.getElementById('home-filter-cine').value = "";
        document.getElementById('home-filter-dia').value = "";
        document.getElementById('home-filter-horario').value = "";
        aplicarFiltrosHome();
        document.getElementById('detail-view').classList.add('hidden');
        document.getElementById('home-view').classList.remove('hidden');
    });
}

// ================================ MENÚ HAMBURGUESA ================================
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