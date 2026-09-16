/**
 * MANTEC Satélites — sat-sync.js
 * Conector mínimo y compartido entre los 6 módulos (motor_pro,
 * tablero_pro, vibra_pro, thermovision, lubricacion, alineacion)
 * y el hub de escritorio.
 */
(function (global) {
  const CFG_KEY = 'mantec_sat_hub_cfg';
  let client = null;

  const CFG_DEFAULT = {
    url: 'https://wngzljsfqeocumrbgyoy.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InduZ3psanNmcWVvY3VtcmJneW95Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0NDU2NjksImV4cCI6MjEwNTAyMTY2OX0.ArrBbd95DYDio7ttZGAYBoYwXy3D58gORfIxxjpwpxg'
  };

  function leerConfig() {
    try { return JSON.parse(localStorage.getItem(CFG_KEY) || 'null'); }
    catch { return null; }
  }

  function guardarConfig(url, anonKey) {
    localStorage.setItem(CFG_KEY, JSON.stringify({ url, anonKey }));
  }

  function init(url, anonKey) {
    const cfg = (url && anonKey) ? { url, anonKey } : (leerConfig() || CFG_DEFAULT);
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

  function estaConfigurado() { return !!client; }

  async function listarEquipos({ incluirArchivados = false } = {}) {
    if (!client) throw new Error('[SatSync] no inicializado — llamá a SatSync.init() primero');
    let q = client.from('equipos').select('*').order('tag');
    if (!incluirArchivados) q = q.eq('activo', true);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  }

  async function actualizarEquipo(id, { nombre, tipo, ubicacion } = {}) {
    if (!client) throw new Error('[SatSync] no inicializado — llamá a SatSync.init() primero');
    const cambios = {};
    if (nombre !== undefined) cambios.nombre = nombre;
    if (tipo !== undefined) cambios.tipo = tipo;
    if (ubicacion !== undefined) cambios.ubicacion = ubicacion;
    const { data, error } = await client.from('equipos').update(cambios).eq('id', id).select().single();
    if (error) throw error;
    return data;
  }

  async function archivarEquipo(id, estabaActivo) {
    if (!client) throw new Error('[SatSync] no inicializado — llamá a SatSync.init() primero');
    const { data, error } = await client.from('equipos').update({ activo: !estabaActivo }).eq('id', id).select().single();
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
      equipo_id: equipo.id, modulo, severidad: severidad || null, resumen: resumen || null,
      datos: datos || {}, autor: autor || null
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

  async function guardarCaptura({ modulo, equipo_tag, datos, autor }) {
    if (!client) throw new Error('[SatSync] no inicializado — llamá a SatSync.init() primero');
    const equipo = await buscarOCrearEquipo(equipo_tag);
    const { data, error } = await client.from('capturas_campo').insert({
      equipo_id: equipo.id, modulo, datos: datos || {}, autor: autor || 'técnico_campo', estado: 'pendiente'
    }).select().single();
    if (error) throw error;
    return data;
  }

  async function listarCapturasPendientes({ modulo, limite = 100 } = {}) {
    if (!client) throw new Error('[SatSync] no inicializado — llamá a SatSync.init() primero');
    let q = client.from('capturas_campo')
      .select('*, equipos(tag, nombre, ubicacion)')
      .eq('estado', 'pendiente')
      .order('fecha', { ascending: false })
      .limit(limite);
    if (modulo) q = q.eq('modulo', modulo);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  }

  async function marcarCapturaProcesada(capturaId, analisisId) {
    if (!client) throw new Error('[SatSync] no inicializado — llamá a SatSync.init() primero');
    const { data, error } = await client.from('capturas_campo')
      .update({ estado: 'procesado', analisis_id: analisisId || null })
      .eq('id', capturaId)
      .select().single();
    if (error) throw error;
    return data;
  }

  global.SatSync = {
    init, estaConfigurado, guardarConfig, leerConfig,
    listarEquipos, buscarOCrearEquipo, actualizarEquipo, archivarEquipo,
    guardarAnalisis, listarAnalisis, subirImagen,
    guardarCaptura, listarCapturasPendientes, marcarCapturaProcesada
  };
})(window);
