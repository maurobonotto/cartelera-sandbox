// Base de datos de prueba
const baseDeDatosPeliculas = [
    {
        id: 1,
        titulo: "Batman: El Caballero de la Noche",
        director: "Christopher Nolan",
        duracion: "152 min",
        genero: "Acción / Drama",
        poster: "https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0?q=80&w=500",
        sinopsis: "Batman se enfrenta al Joker, un genio criminal que desata el caos en Gotham City y pone a prueba la delgada línea entre el héroe y el vigilante.",
        linkTrailer: "https://www.youtube.com/watch?v=EXeTwQWrcwY",
        funciones: [
            { cine: "Cine A (CABA)", horarios: ["18:00", "21:00"] },
            { cine: "Cine B (Quilmes)", horarios: ["16:00", "19:00"] }
        ]
    },
    {
        id: 2,
        titulo: "Inception",
        director: "Christopher Nolan",
        duracion: "148 min",
        genero: "Ciencia Ficción",
        poster: "https://images.unsplash.com/photo-1536440136628-849c177e76a1?q=80&w=500",
        sinopsis: "Un ladrón prófugo, experto en el arte de apropiarse de los secretos del subconsciente ajeno durante el sueño, busca limpiar su historial implantando una idea en la mente de un poderoso CEO.",
        linkTrailer: "https://www.youtube.com/watch?v=YoHD9XEInc0",
        funciones: [
            { cine: "Cine A (CABA)", horarios: ["17:00", "22:00"] },
            { cine: "Cine C (Lanús)", horarios: ["15:30", "20:00"] }
        ]
    }
];

// Cargar catálogo al iniciar
document.addEventListener("DOMContentLoaded", () => {
    cargarCatalogo(baseDeDatosPeliculas);
});

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

function verDetallePelicula(idPelicula) {
    const pelicula = baseDeDatosPeliculas.find(p => p.id === idPelicula);
    if (!pelicula) return;

    document.getElementById("vista-catalogo").classList.add("hidden");
    document.getElementById("vista-detalle").classList.remove("hidden");

    // Inyectar ficha técnica, sinopsis y botón de tráiler
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

    // Inyectar bloques de cines y horarios (diseño limpio sin rectángulos celestes gigantes)
    const contenedorHorarios = document.getElementById("showtimes-container");
    contenedorHorarios.innerHTML = "";

    pelicula.funciones.forEach(funcion => {
        const bloqueCine = document.createElement("div");
        bloqueCine.className = "cine-block";

        let estructuraHoras = `<h4>${funcion.cine}</h4>`;
        funcion.horarios.forEach(hora => {
            estructuraHoras += `<span>${hora}</span>`;
        });

        bloqueCine.innerHTML = estructuraHoras;
        contenedorHorarios.appendChild(bloqueCine);
    });
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function volverInicio() {
    document.getElementById("vista-detalle").classList.add("hidden");
    document.getElementById("vista-catalogo").classList.remove("hidden");
}