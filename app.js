// Ejemplo de la estructura de datos que toma tu sistema automatizado
const baseDeDatosPeliculas = [
    {
        id: 1,
        titulo: "El Joker 2",
        director: "Todd Phillips",
        duracion: "138 min",
        genero: "Drama / Suspenso",
        poster: "https://via.placeholder.com/260x462", // Reemplazar por URL real del póster
        sinopsis: "Arthur Fleck se encuentra institucionalizado en Arkham esperando juicio por sus crímenes como Joker. Mientras lucha con su doble identidad, Arthur no solo tropieza con el amor verdadero, sino que también encuentra la música que siempre ha estado dentro de él.",
        linkTrailer: "https://www.youtube.com/watch?v=xyz123", // Tu casillero de link al tráiler
        funciones: [
            { cine: "Cinépolis Recoleta", horarios: ["15:30", "18:00", "20:45"] },
            { cine: "Hoyts Abasto", horarios: ["14:00", "16:45", "19:30", "22:15"] }
        ]
    }
];

// Al cargar la página, se muestra el catálogo
document.addEventListener("DOMContentLoaded", () => {
    cargarCatalogo(baseDeDatosPeliculas);
});

// Función para renderizar el mosaico principal
function cargarCatalogo(peliculas) {
    const contenedor = document.getElementById("contenedor-peliculas");
    contenedor.innerHTML = "";

    peliculas.forEach(pelicula => {
        const tarjeta = document.createElement("div");
        tarjeta.className = "movie-card";
        tarjeta.onclick = () => verDetallePelicula(pelicula.id);

        tarjeta.innerHTML = `
            <img src="${pelicula.poster}" alt="Póster de ${pelicula.titulo}">
            <div class="movie-card-info">
                <h3>${pelicula.titulo}</h3>
                <p class="director">${pelicula.director}</p>
                <p class="duration">${pelicula.duracion}</p>
            </div>
        `;
        contenedor.appendChild(tarjeta);
    });
}

// Función para abrir la vista de detalle de una película seleccionada
function verDetallePelicula(idPelicula) {
    const pelicula = baseDeDatosPeliculas.find(p => p.id === idPelicula);
    if (!pelicula) return;

    // Ocultar catálogo y mostrar detalle
    document.getElementById("vista-catalogo").classList.add("hidden");
    document.getElementById("vista-detalle").classList.remove("hidden");

    // 1. Inyectar póster e información técnica (incluyendo sinopsis y tráiler)
    const contenedorInfo = document.getElementById("contenedor-info-pelicula");
    contenedorInfo.innerHTML = `
        <div class="poster-column">
            <img src="${pelicula.poster}" alt="Póster de ${pelicula.titulo}">
        </div>
        <div class="info-column">
            <h2>${pelicula.titulo}</h2>
            <p><strong>Director:</strong> ${pelicula.director}</p>
            <p><strong>Duración:</strong> ${pelicula.duracion}</p>
            <p><strong>Género:</strong> ${pelicula.genero}</p>
            
            <p class="sinopsis-text">${pelicula.sinopsis}</p>
            
            <a href="${pelicula.linkTrailer}" class="trailer-btn" target="_blank">Ver Tráiler</a>
        </div>
    `;

    // 2. Inyectar los horarios de las funciones de forma prolija por cada cine
    const contenedorHorarios = document.getElementById("showtimes-container");
    contenedorHorarios.innerHTML = "";

    pelicula.funciones.forEach(funcion => {
        const bloqueCine = document.createElement("div");
        bloqueCine.className = "cine-block";

        // Creamos la cabecera del cine y la lista ordenada de horas
        let estructuraHoras = `<h4>${funcion.cine}</h4>`;
        
        funcion.horarios.forEach(hora => {
            estructuraHoras += `<span>${hora}</span>`;
        });

        bloqueCine.innerHTML = estructuraHoras;
        contenedorHorarios.appendChild(bloqueCine);
    });
    
    // Desplazar la página automáticamente hacia arriba al abrir el detalle
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Función para regresar a la pantalla principal
function volverInicio() {
    document.getElementById("vista-detalle").classList.add("hidden");
    document.getElementById("vista-catalogo").classList.remove("hidden");
}

// Marcador de posición para tus futuros filtros lógicos automáticos
function filtrarPeliculas() {
    // Aquí irá la lógica para filtrar el array cuando configures el scraper
}