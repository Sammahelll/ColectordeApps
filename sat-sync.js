/**
 * MANTEC Satélites — sat-sync.js
 * Conector mínimo y compartido entre los 6 módulos (motor_pro,
 * tablero_pro, vibra_pro, thermovision, lubricacion, alineacion)
 * y el hub de escritorio.
 *
 * Cómo integrarlo en un módulo existente:
 *   1. <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
 *      <script src="./sat-sync.js"></script>
 *   2. SatSync.init();                 // lee config guardada por el hub
 *   3. await SatSync.guardarAnalisis({
 *        modulo: 'vibra_pro',
 *        equipo_tag: 'MOT-204',
 *        severidad: 'atencion',        // 'ok' | 'atencion' | 'critico'
 *        resumen: 'Vibración elevada en rodamiento LA',
 *        datos: {...}                  // el objeto que el módulo ya arma internamente
 *      });
 *
 * No cambia la lógica de análisis de cada módulo — solo agrega un
 * paso opcional de "guardar en la nube" además de lo que cada uno
 * ya hace localmente.
 */
(function (global) {
  const CFG_KEY = 'mantec_sat_hub_cfg';
  let client = null;

  function leerConfig() {
    try {
      return JSON.parse(localStorage.getItem(CFG_KEY) || 'null');
    } catch {
      return null;
    }
  }

  function guardarConfig(url, anonKey) {
    localStorage.setItem(CFG_KEY, JSON.stringify({ url, anonKey }));
  }

  function init(url, anonKey) {
    const cfg = (url && anonKey) ? { url, anonKey } : leerConfig();
    if (!cfg || !cfg.url || !cfg.anonKey) {
      console.warn('[SatSync] Sin configuración de Supabase. Llamá a SatSync.init(url, anonKey) o configurá desde el hub.');
      return false;
    }
    if (url && anonKey) guardarConfig(url, anonKey);
    if (typeof global.supabase === 'undefined') {
      console.error('[SatSync] Falta cargar @supabase/supabase-js antes de sat-sync.js');
      return false;
    }
    client = global.supabase.createClient(cfg.url, cfg.anonKey);
    return true;
  }

  function estaConfigurado() {
    return !!client;
  }

  async function listarEquipos() {
    if (!client) throw new Error('[SatSync] no inicializado — llamá a SatSync.init() primero');
    const { data, error } = await client.from('equipos').select('*').eq('activo', true).order('tag');
    if (error) throw error;
    return data;
  }

  async function buscarOCrearEquipo(tag, extra = {}) {
    if (!client) throw new Error('[SatSync] no inicializado');
    const { data: existente, error: e1 } = await client.from('equipos').select('*').eq('tag', tag).maybeSingle();
    if (e1) throw e1;
    if (existente) return existente;
    const { data, error } = await client.from('equipos')
      .insert({ tag, nombre: extra.nombre || tag, tipo: extra.tipo || null, ubicacion: extra.ubicacion || null })
      .select().single();
    if (error) throw error;
    return data;
  }

  async function guardarAnalisis({ modulo, equipo_tag, severidad, resumen, datos, autor }) {
    if (!client) throw new Error('[SatSync] no inicializado — llamá a SatSync.init() primero');
    const equipo = await buscarOCrearEquipo(equipo_tag);
    const { data, error } = await client.from('analisis').insert({
      equipo_id: equipo.id,
      modulo,
      severidad: severidad || null,
      resumen: resumen || null,
      datos: datos || {},
      autor: autor || null
    }).select().single();
    if (error) throw error;
    return data;
  }

  async function listarAnalisis({ equipo_id, modulo, limite = 50 } = {}) {
    if (!client) throw new Error('[SatSync] no inicializado');
    let q = client.from('analisis').select('*, equipos(tag, nombre)').order('fecha', { ascending: false }).limit(limite);
    if (equipo_id) q = q.eq('equipo_id', equipo_id);
    if (modulo) q = q.eq('modulo', modulo);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  }

  async function subirImagen(archivo, carpeta = 'general') {
    if (!client) throw new Error('[SatSync] no inicializado');
    const nombre = `${carpeta}/${Date.now()}-${archivo.name}`;
    const { error } = await client.storage.from('analisis-media').upload(nombre, archivo);
    if (error) throw error;
    const { data } = client.storage.from('analisis-media').getPublicUrl(nombre);
    return data.publicUrl;
  }

  global.SatSync = {
    init, estaConfigurado, guardarConfig, leerConfig,
    listarEquipos, buscarOCrearEquipo,
    guardarAnalisis, listarAnalisis, subirImagen
  };
})(window);
