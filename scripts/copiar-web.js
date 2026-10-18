// Copia los archivos de la página web a la carpeta www/, que es la que Capacitor mete dentro de la app.
const fs = require("fs");
const path = require("path");

const raiz = path.join(__dirname, "..");
const destino = path.join(raiz, "www");
const incluir = ["index.html", "login.html", "manifest.webmanifest", "sw.js", "css", "js", "img"];

fs.rmSync(destino, { recursive: true, force: true });
fs.mkdirSync(destino);
for (const nombre of incluir) {
    fs.cpSync(path.join(raiz, nombre), path.join(destino, nombre), { recursive: true });
}
console.log("Archivos copiados a www/");
