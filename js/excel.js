/* excel.js · ADEP Vota · descarga archivos de Excel (.xlsx) reales: cada dato en su propia columna.
   Usa la librería SheetJS (xlsx.full.min.js), que se carga en index.html.
   filas: [[encabezados...], [fila 1...], ...]
   opciones.porcentaje: índices de columnas cuyos números son fracciones (0.5) y se muestran como 50 % */
function bajarExcel(nombre, hoja, filas, opciones = {}) {
    if (typeof XLSX === "undefined") { showToast("No se pudo preparar el archivo de Excel. Revise su internet e intente de nuevo."); return false; }
    const ws = XLSX.utils.aoa_to_sheet(filas);
    // Ancho de cada columna según el texto más largo (entre 10 y 60 caracteres)
    ws["!cols"] = filas[0].map((_, c) => ({ wch: Math.min(60, Math.max(10, ...filas.map(f => String(f[c] == null ? "" : f[c]).length + 2))) }));
    // Filtros en la fila de encabezados
    ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: filas.length - 1, c: filas[0].length - 1 } }) };
    (opciones.porcentaje || []).forEach(c => {
        for (let r = 1; r < filas.length; r++) {
            const celda = ws[XLSX.utils.encode_cell({ r, c })];
            if (celda && celda.t === "n") celda.z = "0%";
        }
    });
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, ws, hoja.slice(0, 31));
    const datos = XLSX.write(libro, { bookType: "xlsx", type: "array" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([datos], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
    return true;
}
