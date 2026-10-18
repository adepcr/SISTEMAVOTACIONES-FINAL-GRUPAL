/* firebase.js · ADEP Vota · conexión con Firebase (Authentication + Firestore)
   Se carga como módulo desde index.html y login.html y deja todo en window.FB para db.js. */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
    getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
    signOut, updatePassword, sendPasswordResetEmail, deleteUser, connectAuthEmulator
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
    getFirestore, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, collection, query, where,
    orderBy, limit, onSnapshot, writeBatch, increment, serverTimestamp, connectFirestoreEmulator
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyB0hIqG66W63u9hQztK7D5KxvLrVkkeDgw",
    authDomain: "adep-vota.firebaseapp.com",
    projectId: "adep-vota",
    storageBucket: "adep-vota.firebasestorage.app",
    messagingSenderId: "513410994049",
    appId: "1:513410994049:web:ce987ca65f04f8dbf82280"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Solo para pruebas locales con el emulador de Firebase (nunca en el sitio publicado)
const emulador = !!window.ADEP_EMULADOR;
if (emulador) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
}

// Segunda conexión para crear cuentas de administradores sin cerrar la sesión de quien las crea
let auth2 = null;
function authSecundaria() {
    if (!auth2) {
        auth2 = getAuth(initializeApp(firebaseConfig, "secundaria"));
        if (emulador) connectAuthEmulator(auth2, "http://127.0.0.1:9099", { disableWarnings: true });
    }
    return auth2;
}

window.FB = {
    auth, db, authSecundaria,
    onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut,
    updatePassword, sendPasswordResetEmail, deleteUser,
    doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, collection, query, where,
    orderBy, limit, onSnapshot, writeBatch, increment, serverTimestamp
};
