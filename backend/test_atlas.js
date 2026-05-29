// test_atlas.js - Prueba para un complejo y una película (corregido)
const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({ headless: false, args: ['--no-sandbox'] }); // headless false para ver
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    const codPelicula = '481';  // Prueba con "Amarga Navidad"
    const codComplejo = '191';  // Caballito

    const url = `https://atlascines.com/Peliculas?codPelicula=${codPelicula}`;
    console.log(`Navegando a ${url}`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    // 1. Seleccionar complejo
    await page.waitForSelector('#complejoSelect', { timeout: 10000 });
    await page.select('#complejoSelect', codComplejo);
    // Forzar evento change
    await page.evaluate(() => {
        const select = document.querySelector('#complejoSelect');
        if (select) select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    console.log('Complejo seleccionado');

    // 2. Esperar a que aparezcan las fechas
    await page.waitForSelector('.date-item', { timeout: 15000 });
    const fechas = await page.$$eval('.date-item', items => 
        items.map(item => ({
            day: item.querySelector('.day')?.innerText,
            date: item.querySelector('.date')?.innerText,
            disabled: item.classList.contains('disabled')
        }))
    );
    console.log('Fechas encontradas:', fechas);

    // 3. Hacer clic en la primera fecha activa
    const fechaActiva = fechas.find(f => !f.disabled);
    if (fechaActiva) {
        await page.click('.date-item:not(.disabled)');
        console.log('Click en fecha:', fechaActiva.date);
        // Espera manual (3 segundos) para que carguen los horarios
        await new Promise(r => setTimeout(r, 3000));
    }

    // 4. Extraer horarios (esperando que haya al menos un .tecnologia-container)
    try {
        await page.waitForSelector('.tecnologia-container', { timeout: 10000 });
    } catch(e) {
        console.log('No se encontraron contenedores de horarios');
        await browser.close();
        return;
    }

    const horarios = await page.evaluate(() => {
        const result = [];
        const containers = document.querySelectorAll('.tecnologia-container');
        for (const container of containers) {
            const chips = Array.from(container.querySelectorAll('.opciones .chip'));
            const tecnologia = chips[0]?.innerText || '';
            const esSubtitulada = chips.some(c => c.innerText.includes('SUBTITULADA'));
            const idioma = esSubtitulada ? 'Subtitulada' : 'Doblada';
            const botones = container.querySelectorAll('.horarios .horario');
            const horas = Array.from(botones).map(btn => {
                let hora = btn.innerText.trim();
                // Eliminar posibles textos como "AGOTADA"
                hora = hora.replace(/AGOTADA|agotada|Agotada/g, '').trim();
                return hora;
            }).filter(h => h && /^\d{1,2}:\d{2}/.test(h));
            if (horas.length > 0) {
                result.push({ tecnologia, idioma, horarios: horas });
            }
        }
        return result;
    });
    
    console.log('Horarios extraídos:', JSON.stringify(horarios, null, 2));

    await browser.close();
})();