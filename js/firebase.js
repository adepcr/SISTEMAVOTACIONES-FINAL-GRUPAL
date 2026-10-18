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
    apiKey: "AIzaSyB9SnrUx1hsPT5VmjNWw18xusFlu6l3hjY",
    authDomain: "proyectoabi-563e6.firebaseapp.com",
    projectId: "proyectoabi-563e6",
    storageBucket: "proyectoabi-563e6.firebasestorage.app",
    messagingSenderId: "227799043670",
    appId: "1:227799043670:web:0b41ab946a878d56af75f7",
    measurementId: "G-1HC75JCXD4"
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
