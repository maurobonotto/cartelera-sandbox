// Variable global para guardar las películas una vez que las carguemos
let peliculas = [];

// 1. FUNCIÓN PRINCIPAL: Se ejecuta apenas se carga la página
document.addEventListener("DOMContentLoaded", () => {
    cargarDatos();
});

// 2. CARGAR DATOS: Lee el archivo JSON
function cargarDatos() {
    fetch('cartelera_prueba.json')
        .then(response => response.json())
        .then(data => {
            peliculas = data;
            // Una vez que tenemos los datos, armamos el Home
            inicializarHome();
        })
        .catch(error => console.error("Error cargando el JSON:", error));
}

// 3. INICIALIZAR HOME: Llena los filtros y dibuja los mosaicos
function inicializarHome() {
    configurarFiltrosHome();
    mostrarPeliculasHome(peliculas);
}

// 4. CONFIGURAR FILTROS: Llena los selectores dinámicamente con datos del JSON
function configurarFiltrosHome() {
    const ciudades = new Set();
    const cines = new Set();
    const dias = new Set();
    const horarios = new Set();

    // Recorremos solo las funciones de 'cartelera' para extraer las opciones reales
    peliculas.forEach(peli => {
        if (peli.seccion === "cartelera") {
            if (peli.ciudad) ciudades.add(peli.ciudad);
            if (peli.cine) cines.add(peli.cine);
            if (peli.fecha) dias.add(peli.fecha);
            if (peli.horarios) peli.horarios.forEach(h => horarios.add(h));
        }
    });

    // Llenamos los elementos select del HTML
    llenarSelector('home-filter-ciudad', ciudades);
    llenarSelector('home-filter-cine', cines);
    llenarSelector('home-filter-dia', dias);
    llenarSelector('home-filter-horario', Array.from(horarios).sort());
}

// Función auxiliar para meter las opciones adentro de cada <select>
function llenarSelector(idElemento, conjuntoOpciones) {
    const selector = document.getElementById(idElemento);
    conjuntoOpciones.forEach(opcion => {
        const opt = document.createElement('option');
        opt.value = opcion;
        opt.textContent = opcion;
        selector.appendChild(opt);
    });
}

// 5. MOSTRAR PELÍCULAS: Agrupa funciones por título para no repetir pósters en el Home
function mostrarPeliculasHome(listaPeliculas) {
    const carteleraGrid = document.getElementById('cartelera-grid');
    const proximosGrid = document.getElementById('proximos-grid');

    // Limpiamos los mosaicos por si tenían algo antes
    carteleraGrid.innerHTML = '';
    proximosGrid.innerHTML = '';

    // Usamos un registro para asegurarnos de dibujar UNA sola tarjeta por película en el Home
    const titulosDibujados = new Set();

    listaPeliculas.forEach(peli => {
        if (titulosDibujados.has(peli.titulo)) return; // Si ya la dibujamos, pasamos a la siguiente

        // Creamos la estructura de la tarjeta (Mosaico)
        const tarjeta = document.createElement('div');
        tarjeta.className = 'movie-card';
        // Le dejamos guardado el título para saber cuál clickea el usuario más adelante
        tarjeta.dataset.titulo = peli.titulo; 

        tarjeta.innerHTML = `
            <img src="${peli.poster}" alt="Póster de ${peli.titulo}">
            <div class="movie-card-info">
                <h3>${peli.titulo}</h3>
                <p class="director">Director: ${peli.director}</p>
                <p class="duration">Duración: ${peli.duracion} min</p>
            </div>
        `;

        // Clasificamos en su sección correspondiente
        if (peli.seccion === "cartelera") {
            carteleraGrid.appendChild(tarjeta);
            titulosDibujados.add(peli.titulo);
        } else if (peli.seccion === "proximos") {
            proximosGrid.appendChild(tarjeta);
            titulosDibujados.add(peli.titulo);
        }
    });
}