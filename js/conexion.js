/* conexion.js · ADEP Vota · conexión con Supabase (proyecto de ADEP «inventario-archivo»)
   Se carga después de js/lib/supabase.js y deja el cliente en window.SB para db.js.
   La clave es la PÚBLICA («publishable»): puede estar en la página. La seguridad la ponen
   las funciones y reglas de supabase/votaciones.sql. NUNCA ponga aquí la clave secreta. */
(function () {
    const SUPABASE_URL = "https://ctjnhnltewnixnswtqcl.supabase.co";
    const SUPABASE_KEY = "sb_publishable_vVy8vkDlGjxUNDX7iN9n2g_CRf1xEaY";
    window.SB = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "adep-vota-admin" }
    });
})();
