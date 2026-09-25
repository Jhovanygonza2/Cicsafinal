/**
 * api.js — Cliente de API para CICSA Capacita
 * ---------------------------------------------------------------
 * Centraliza toda comunicación con el backend (Node/Express/MySQL).
 * Cambia MOCK_MODE a false cuando el backend esté corriendo, y
 * ajusta API_BASE a la URL real (ej. http://localhost:4000/api).
 *
 * Cobertura de requerimientos (trazabilidad):
 *  RF-001..005  auth.* / users.*
 *  RF-006..008  sesion.rol() controla qué botones/rutas se muestran
 *  RF-009..016  cursos.*
 *  RF-017..022  contenidos.*
 *  RF-023..029  progreso.*
 *  RF-030..036  evaluaciones.*
 *  RF-039..044  reportes.*
 *  RS-001..011  token en localStorage, expiración, roles en cada llamada
 * ---------------------------------------------------------------
 */
const API_BASE = "http://localhost:4000/api";
const MOCK_MODE = true; // TODO: poner en false al conectar el backend real

function obtenerRutaLogin() {
  const rutaActual = window.location.pathname || "/";
  return rutaActual.includes("/admin/") || rutaActual.includes("/trabajador/") ? "../index.html" : "index.html";
}

function navegarALogin() {
  window.location.replace(obtenerRutaLogin());
}

// ---------------------------------------------------------------
// Sesión (RS-001, RS-005, RS-006, RS-007)
// ---------------------------------------------------------------
const sesion = {
  guardar(token, usuario) {
    localStorage.setItem("cicsa_token", token);
    localStorage.setItem("cicsa_usuario", JSON.stringify(usuario));
    localStorage.setItem("cicsa_ultima_actividad", Date.now().toString());
  },
  usuario() {
    const raw = localStorage.getItem("cicsa_usuario");
    if (!raw) return null;
    try {
      const usuario = JSON.parse(raw);
      return usuario && typeof usuario === "object" ? usuario : null;
    } catch (error) {
      console.warn("La sesión almacenada no es válida.", error);
      return null;
    }
  },
  token() {
    return localStorage.getItem("cicsa_token");
  },
  rol() {
    const u = sesion.usuario();
    return u ? u.rol : null;
  },
  activa() {
    const usuario = sesion.usuario();
    return !!sesion.token() && !!usuario?.id && ["superadmin", "admin", "instructor", "trabajador"].includes(usuario.rol);
  },
  marcarActividad() {
    localStorage.setItem("cicsa_ultima_actividad", Date.now().toString());
  },
  cerrar(motivo = "cierre_manual") {
    enviarPulsoUso("cerrar", motivo);
    localStorage.removeItem("cicsa_token");
    localStorage.removeItem("cicsa_usuario");
    localStorage.removeItem("cicsa_ultima_actividad");
    navegarALogin();
  },
  /** RS-006: cierre por inactividad configurable (minutos) */
  vigilarInactividad(minutos = 20) {
    const limite = minutos * 60 * 1000;
    const identidadUso = sesion.token();
    enviarPulsoUso();
    let registroUso = localStorage.getItem("cicsa_sesion_uso");
    const mismaSesion = () => sesion.token() === identidadUso && localStorage.getItem("cicsa_sesion_uso") === registroUso;
    let ultimaActividadPorScroll = 0;
    const registrarActividadPorScroll = () => {
      if (!mismaSesion()) return;
      const ahora = Date.now();
      if (ahora - ultimaActividadPorScroll < 1000) return;
      ultimaActividadPorScroll = ahora;
      sesion.marcarActividad();
    };
    setInterval(() => {
      if (!mismaSesion()) return;
      const ultima = Number(localStorage.getItem("cicsa_ultima_actividad") || 0);
      if (sesion.activa() && Date.now() - ultima > limite) {
        sesion.cerrar("inactividad");
        alert("Tu sesión se cerró por inactividad.");
      } else {
        enviarPulsoUso();
        registroUso = localStorage.getItem("cicsa_sesion_uso");
      }
    }, 30000);
    ["click", "keydown"].forEach((ev) => window.addEventListener(ev, () => { if (mismaSesion()) sesion.marcarActividad(); }));
    window.addEventListener("scroll", registrarActividadPorScroll, { passive: true });
  },
  /** RF-003 / RS-007: protege una página según los roles permitidos */
  requerir(rolesPermitidos) {
    if (!sesion.activa()) {
      navegarALogin();
      return false;
    }
    if (rolesPermitidos && sesion.rol() !== "superadmin" && !rolesPermitidos.includes(sesion.rol())) {
      navegarALogin();
      return false;
    }
    return true;
  },
};

// ---------------------------------------------------------------
// Fetch envoltorio con token automático
// ---------------------------------------------------------------
async function solicitar(metodo, ruta, cuerpo) {
  if (MOCK_MODE) {
    const respuesta = await simularSolicitud(metodo, ruta, cuerpo);
    // Cada respuesta es independiente, igual que el JSON del backend real.
    return respuesta == null ? respuesta : JSON.parse(JSON.stringify(respuesta, (clave, valor) => clave === "password" && sesion.rol() !== "superadmin" ? undefined : valor));
  }

  const res = await fetch(`${API_BASE}${ruta}`, {
    method: metodo,
    headers: {
      "Content-Type": "application/json",
      ...(sesion.token() ? { Authorization: `Bearer ${sesion.token()}` } : {}),
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  if (res.status === 401 && !ruta.startsWith("/auth/")) {
    sesion.cerrar();
    throw new Error("Sesión expirada");
  }
  if (res.status === 403) {
    throw new Error("No tienes permisos para realizar esta acción.");
  }
  if (!res.ok) {
    let mensaje = "No se pudo completar la solicitud.";
    try {
      const err = await res.json();
      mensaje = err.mensaje || err.message || mensaje;
    } catch (error) {
      if (res.status >= 500) mensaje = "El servidor no está disponible. Intenta más tarde.";
    }
    throw new Error(mensaje);
  }
  return res.status === 204 ? null : res.json();
}

// ---------------------------------------------------------------
function construirModulosSeguridad() {
  const nombres = [
    ["Introducción al curso", "Introducción al curso", "Objetivos de seguridad", "Cómo usar este curso"],
    ["Módulo 1: Identificación de riesgos", "Introducción", "Tipos de riesgo laboral", "Detección de peligros"],
    ["Módulo 2: Equipo de protección personal", "Introducción", "Selección del EPP", "Uso y cuidado del EPP"],
    ["Módulo 3: Comunicación de seguridad", "Introducción", "Reporte de incidentes", "Comunicación efectiva"],
    ["Módulo 4: Señalización y áreas seguras", "Introducción", "Señales de seguridad", "Delimitación de áreas"],
    ["Módulo 5: Procedimientos de emergencia", "Introducción", "Plan de evacuación", "Punto de reunión"],
    ["Módulo 6: Trabajo en alturas", "Introducción", "Inspección del equipo", "Prevención de caídas"],
    ["Módulo 7: Manejo de herramientas", "Introducción", "Herramientas manuales", "Herramientas eléctricas"],
    ["Módulo 8: Sustancias y materiales", "Introducción", "Etiquetado de sustancias", "Almacenamiento seguro"],
    ["Módulo 9: Ergonomía y bienestar", "Introducción", "Posturas de trabajo", "Pausas y autocuidado"],
    ["Módulo 10: Repaso final", "Introducción", "Lista de verificación", "Preparación para el examen"],
  ];

  let idLeccion = 1001;
  return nombres.map(([nombre, ...lecciones]) => ({
    id: idLeccion,
    nombre,
    lecciones: lecciones.map((nombreLeccion, indice) => ({
      id: idLeccion++,
      nombre: nombreLeccion,
      tipo: indice === 1 && nombre !== "Introducción al curso" ? "video" : "texto",
    })),
  }));
}

// Datos simulados (usados mientras MOCK_MODE = true)
// ---------------------------------------------------------------
const DB = {
  usuarios: [],
  solicitudesRestablecimiento: [
  ],
  notificacionesAdmin: [],
  puestos: [],
  cursos: [
    {
      id: 1, nombre: "Seguridad e Higiene Industrial", categoria: "Seguridad",
      descripcion: "Protocolos de seguridad para operación en planta.", duracion: "3 h", horas: 3, asignadoA: "Todos",
      estado: "publicado", academia: "Academia técnica", tipo: "Obligatorio",
      modulos: construirModulosSeguridad(),
      evaluacion: { minimaAprobatoria: 80 },
    },
    {
      id: 2, nombre: "Atención al Cliente", categoria: "Habilidades blandas",
      descripcion: "Fundamentos de comunicación efectiva con clientes.", duracion: "2 h", horas: 2, asignadoA: "Todos",
      estado: "publicado", academia: "Academia de liderazgo", tipo: "Electivo",
      modulos: [
        { id: 3, nombre: "Comunicación efectiva", lecciones: [
          { id: 5, nombre: "Escucha activa", tipo: "texto" },
          { id: 6, nombre: "Manejo de quejas", tipo: "video" },
        ]},
      ],
      evaluacion: { minimaAprobatoria: 70 },
    },
    {
      id: 3, nombre: "Uso de Sistemas Internos", categoria: "Tecnología",
      descripcion: "Guía práctica de las plataformas internas de CICSA.", duracion: "1.5 h", horas: 1.5, asignadoA: "Todos",
      estado: "borrador", academia: "Academia técnica", tipo: "Obligatorio",
      modulos: [],
      evaluacion: { minimaAprobatoria: 70 },
    },
    {
      id: 4, nombre: "Soldador Industrial", thumbnail: "../assets/soldador.avif", categoria: "Operación industrial",
      descripcion: "Prácticas esenciales de seguridad, preparación y técnicas de soldadura.",
      duracion: "4 h", horas: 4, asignadoA: "Todos",
      estado: "publicado", academia: "Academia técnica", tipo: "Obligatorio",
      modulos: [
        { id: 4, nombre: "Fundamentos de soldadura", lecciones: [
          { id: 7, nombre: "Equipo y herramientas del soldador", tipo: "texto" },
          { id: 8, nombre: "Uso seguro del equipo de protección", tipo: "video" },
          { id: 9, nombre: "Preparación de materiales", tipo: "texto" },
        ]},
      ],
      evaluacion: { minimaAprobatoria: 80 },
    },
    {
      "id": 5,
      "nombre": "Prevención y control de incendios",
      "thumbnail": "../assets/incendios.jpg",
      "categoria": "Seguridad",
      "descripcion": "Programa integral para reconocer riesgos, prevenir incendios, responder ante una emergencia y utilizar correctamente los equipos contra incendio.",
      "duracion": "6 h",
      "horas": 6,
      "asignadoA": "Todos",
      "asignadoAIds": [],
      "estado": "publicado",
      "academia": "Academia técnica",
      "tipo": "Obligatorio",
      "modulos": [
            {
                  "id": 5,
                  "nombre": "Fundamentos del fuego",
                  "temas": [
                        {
                              "nombre": "Fundamentos del fuego",
                              "subtemas": [
                                    {
                                          "id": 10,
                                          "nombre": "El triángulo y el tetraedro del fuego",
                                          "tipo": "texto",
                                          "informacion": "Para que exista fuego se necesitan combustible, oxígeno y calor. La reacción en cadena mantiene la combustión; por eso el tetraedro del fuego agrega este cuarto elemento. Eliminar cualquiera de ellos ayuda a controlar el incendio.",
                                          "url": ""
                                    },
                                    {
                                          "id": 11,
                                          "nombre": "Clases de fuego",
                                          "tipo": "texto",
                                          "informacion": "Clase A: sólidos como madera, papel y cartón. Clase B: líquidos inflamables como gasolina, diésel y solventes. Clase C: equipos eléctricos energizados. Clase D: metales combustibles. Identificar la clase determina el agente extintor adecuado.",
                                          "url": ""
                                    },
                                    {
                                          "id": 12,
                                          "nombre": "Transferencia y propagación del calor",
                                          "tipo": "texto",
                                          "informacion": "El fuego se propaga por conducción a través de materiales, por radiación hacia objetos cercanos y por convección cuando los gases calientes ascienden. Reconocer estas rutas permite anticipar puntos de propagación.",
                                          "url": ""
                                    },
                                    {
                                          "id": 13,
                                          "nombre": "Productos de la combustión",
                                          "tipo": "texto",
                                          "informacion": "El humo, los gases tóxicos y la reducción de oxígeno pueden ser más peligrosos que las llamas. Nunca ingreses a una zona con humo sin autorización, equipo y procedimiento de emergencia.",
                                          "url": ""
                                    }
                              ]
                        }
                  ]
            },
            {
                  "id": 6,
                  "nombre": "Prevención de incendios",
                  "temas": [
                        {
                              "nombre": "Prevención de incendios",
                              "subtemas": [
                                    {
                                          "id": 14,
                                          "nombre": "Orden, limpieza y control de fuentes de ignición",
                                          "tipo": "texto",
                                          "informacion": "Mantén las áreas limpias, retira residuos combustibles, controla trabajos en caliente y evita fumar fuera de las zonas autorizadas. Reporta de inmediato chispas, fugas, calentamientos anormales u olores a quemado.",
                                          "url": ""
                                    },
                                    {
                                          "id": 15,
                                          "nombre": "Seguridad eléctrica",
                                          "tipo": "texto",
                                          "informacion": "No sobrecargues contactos, no uses cables dañados y desconecta equipos cuando el procedimiento lo indique. Las reparaciones y tableros eléctricos deben ser atendidos por personal autorizado.",
                                          "url": ""
                                    },
                                    {
                                          "id": 16,
                                          "nombre": "Almacenamiento de sustancias inflamables",
                                          "tipo": "texto",
                                          "informacion": "Conserva químicos y combustibles en recipientes autorizados, etiquetados y cerrados. Mantén separación de fuentes de calor y revisa que exista ventilación adecuada.",
                                          "url": ""
                                    },
                                    {
                                          "id": 17,
                                          "nombre": "Inspección de equipos y rutas",
                                          "tipo": "texto",
                                          "informacion": "Verifica que extintores, gabinetes, alarmas, salidas y rutas de evacuación estén visibles, señalizados, accesibles y sin obstrucciones.",
                                          "url": ""
                                    }
                              ]
                        }
                  ]
            },
            {
                  "id": 7,
                  "nombre": "Respuesta y evacuación",
                  "temas": [
                        {
                              "nombre": "Respuesta y evacuación",
                              "subtemas": [
                                    {
                                          "id": 18,
                                          "nombre": "Activación de la emergencia",
                                          "tipo": "texto",
                                          "informacion": "Al descubrir humo o fuego, conserva la calma, activa la alarma y avisa al supervisor indicando el lugar exacto. No pongas en riesgo tu integridad para recuperar objetos.",
                                          "url": ""
                                    },
                                    {
                                          "id": 19,
                                          "nombre": "Evacuación segura",
                                          "tipo": "texto",
                                          "informacion": "Dirígete por la ruta señalada al punto de reunión, camina sin correr, no uses elevadores y ayuda a las personas que lo necesiten sin separarte del grupo.",
                                          "url": ""
                                    },
                                    {
                                          "id": 20,
                                          "nombre": "Comunicación y reporte",
                                          "tipo": "texto",
                                          "informacion": "Proporciona información clara: ubicación, tamaño aproximado, materiales involucrados y personas expuestas. No regreses al área hasta recibir autorización oficial.",
                                          "url": ""
                                    },
                                    {
                                          "id": 21,
                                          "nombre": "Punto de reunión y conteo",
                                          "tipo": "texto",
                                          "informacion": "Permanece en el punto de reunión para el conteo de personal y reporta si alguien falta. Sigue las instrucciones de la brigada y de los servicios de emergencia.",
                                          "url": ""
                                    }
                              ]
                        }
                  ]
            },
            {
                  "id": 8,
                  "nombre": "Extintores y control inicial",
                  "temas": [
                        {
                              "nombre": "Extintores y control inicial",
                              "subtemas": [
                                    {
                                          "id": 22,
                                          "nombre": "Selección del extintor",
                                          "tipo": "texto",
                                          "informacion": "Elige el extintor según la clase de fuego y las instrucciones de la etiqueta. Nunca uses agua en un incendio eléctrico energizado o de líquidos inflamables.",
                                          "url": ""
                                    },
                                    {
                                          "id": 23,
                                          "nombre": "Técnica PASS",
                                          "tipo": "texto",
                                          "informacion": "P: Pull, retira el pasador. A: Aim, apunta a la base. S: Squeeze, presiona la palanca. S: Sweep, barre de lado a lado. Mantén una salida segura a tu espalda.",
                                          "url": ""
                                    },
                                    {
                                          "id": 24,
                                          "nombre": "Condiciones para intervenir",
                                          "tipo": "texto",
                                          "informacion": "Solo intenta controlar un fuego pequeño y en etapa inicial, si tienes capacitación, visibilidad, el equipo correcto y una ruta de escape libre. Si crece o genera mucho humo, evacúa.",
                                          "url": ""
                                    },
                                    {
                                          "id": 25,
                                          "nombre": "Después de usar un extintor",
                                          "tipo": "texto",
                                          "informacion": "Aléjate con precaución, informa al responsable y solicita la recarga o reemplazo del equipo. Un extintor parcialmente utilizado debe retirarse de servicio.",
                                          "url": ""
                                    }
                              ]
                        }
                  ]
            }
      ],
      "evaluacion": {
            "minimaAprobatoria": 70,
            "preguntas": [
                  {
                        "id": 1,
                        "enunciado": "¿Qué tres elementos forman el triángulo del fuego?",
                        "opciones": [
                              {
                                    "id": "a",
                                    "texto": "Combustible, oxígeno y calor"
                              },
                              {
                                    "id": "b",
                                    "texto": "Humo, agua y aire"
                              },
                              {
                                    "id": "c",
                                    "texto": "Gasolina, madera y viento"
                              }
                        ],
                        "correcta": "a"
                  },
                  {
                        "id": 2,
                        "enunciado": "Un fuego originado en líquidos inflamables (gasolina, solventes) es de clase:",
                        "opciones": [
                              {
                                    "id": "a",
                                    "texto": "Clase A"
                              },
                              {
                                    "id": "b",
                                    "texto": "Clase B"
                              },
                              {
                                    "id": "c",
                                    "texto": "Clase C"
                              }
                        ],
                        "correcta": "b"
                  },
                  {
                        "id": 3,
                        "enunciado": "Al usar un extintor con la técnica PASS, debes apuntar hacia:",
                        "opciones": [
                              {
                                    "id": "a",
                                    "texto": "La parte alta de las llamas"
                              },
                              {
                                    "id": "b",
                                    "texto": "El humo"
                              },
                              {
                                    "id": "c",
                                    "texto": "La base del fuego"
                              }
                        ],
                        "correcta": "c"
                  },
                  {
                        "id": 4,
                        "enunciado": "Si descubres un incendio, lo primero que debes hacer es:",
                        "opciones": [
                              {
                                    "id": "a",
                                    "texto": "Intentar apagarlo siempre"
                              },
                              {
                                    "id": "b",
                                    "texto": "Activar la alarma o avisar, y evacuar"
                              },
                              {
                                    "id": "c",
                                    "texto": "Abrir puertas y ventanas"
                              }
                        ],
                        "correcta": "b"
                  },
                  {
                        "id": 5,
                        "enunciado": "¿Qué debes hacer si el fuego crece o hay demasiado humo?",
                        "opciones": [
                              {
                                    "id": "a",
                                    "texto": "Continuar hasta terminar el extintor"
                              },
                              {
                                    "id": "b",
                                    "texto": "Evacuar y esperar a la brigada"
                              },
                              {
                                    "id": "c",
                                    "texto": "Abrir todas las puertas"
                              }
                        ],
                        "correcta": "b"
                  },
                  {
                        "id": 6,
                        "enunciado": "¿Cuál es una condición indispensable antes de usar un extintor?",
                        "opciones": [
                              {
                                    "id": "a",
                                    "texto": "Tener una salida segura a la espalda"
                              },
                              {
                                    "id": "b",
                                    "texto": "Estar solo en el área"
                              },
                              {
                                    "id": "c",
                                    "texto": "Acercarse sin revisar el equipo"
                              }
                        ],
                        "correcta": "a"
                  },
                  {
                        "id": 7,
                        "enunciado": "¿Dónde debe permanecer el personal durante el conteo?",
                        "opciones": [
                              {
                                    "id": "a",
                                    "texto": "En el punto de reunión"
                              },
                              {
                                    "id": "b",
                                    "texto": "Dentro del edificio"
                              },
                              {
                                    "id": "c",
                                    "texto": "En el estacionamiento sin avisar"
                              }
                        ],
                        "correcta": "a"
                  },
                  {
                        "id": 8,
                        "enunciado": "Después de descargar parcialmente un extintor se debe:",
                        "opciones": [
                              {
                                    "id": "a",
                                    "texto": "Devolverlo sin reportarlo"
                              },
                              {
                                    "id": "b",
                                    "texto": "Solicitar su recarga o reemplazo"
                              },
                              {
                                    "id": "c",
                                    "texto": "Guardarlo en cualquier lugar"
                              }
                        ],
                        "correcta": "b"
                  }
            ]
      }
},
  ],
  progreso: {},
  evaluacionesResultado: [],
  contenidoLecciones: {
    1: { tipo: "texto", cuerpo: "Un riesgo laboral es toda condición del trabajo que puede causar un accidente o una enfermedad relacionada con la actividad. En CICSA clasificamos los riesgos en físicos, químicos, biológicos, ergonómicos y psicosociales. Reconocerlos a tiempo es la primera línea de defensa antes de cualquier protocolo de seguridad." },
    2: { tipo: "video", cuerpo: "Video: cómo colocar correctamente tu equipo de protección personal (EPP) antes de ingresar a planta." },
    3: { tipo: "texto", cuerpo: "Cada área de trabajo cuenta con al menos dos rutas de evacuación señalizadas. Ubica la más cercana a tu puesto desde tu primer día y verifica que el punto de reunión esté libre de obstáculos." },
    4: { tipo: "documento", cuerpo: "Documento: procedimiento de actuación durante un simulacro de emergencia, incluyendo roles del personal de brigada." },
    5: { tipo: "texto", cuerpo: "Escuchar activamente significa prestar atención completa al cliente antes de responder: repite lo que entendiste, evita interrumpir y confirma que comprendiste su necesidad real antes de ofrecer una solución." },
    6: { tipo: "video", cuerpo: "Video: ejemplos de manejo de quejas frecuentes y cómo convertir una experiencia negativa en una oportunidad." },
    7: { tipo: "texto", cuerpo: "Conoce la máquina de soldar, cables, pinzas, electrodos y herramientas auxiliares antes de iniciar cualquier trabajo." },
    8: { tipo: "video", cuerpo: "Revisa el uso correcto del casco, careta, guantes, mandil y protección respiratoria para soldadura." },
    9: { tipo: "texto", cuerpo: "Limpia, fija y revisa los materiales antes de soldar. Una preparación correcta mejora la calidad y reduce riesgos." },
  },
  evaluaciones: {
    1: {
      minimaAprobatoria: 80,
      preguntas: [
        {
          id: 1,
          enunciado: "¿Cuál de los siguientes es un riesgo ergonómico?",
          opciones: [
            { id: "a", texto: "Ruido excesivo en planta" },
            { id: "b", texto: "Postura inadecuada al levantar carga" },
            { id: "c", texto: "Exposición a solventes" },
          ],
          correcta: "b",
        },
        {
          id: 2,
          enunciado: "Antes de usar el EPP debes:",
          opciones: [
            { id: "a", texto: "Verificar que esté en buen estado" },
            { id: "b", texto: "Usarlo solo si un supervisor lo pide" },
            { id: "c", texto: "Compartirlo con un compañero" },
          ],
          correcta: "a",
        },
      ],
    },
    2: {
      minimaAprobatoria: 70,
      preguntas: [
        {
          id: 1,
          enunciado: "La escucha activa implica principalmente:",
          opciones: [
            { id: "a", texto: "Responder lo más rápido posible" },
            { id: "b", texto: "Confirmar que entendiste antes de responder" },
            { id: "c", texto: "Repetir el guion de la empresa" },
          ],
          correcta: "b",
        },
      ],
    },
  },
};

// Configuración del curso único de demostración: evaluación diagnóstica antes
// de iniciar y examen final al terminar. Se conserva el contenido existente.
const CURSO_UNICO_ID = 5;
const EVALUACION_INICIAL_COURSE_5 = {
  minimaAprobatoria: 70,
  preguntas: [
    { id: 101, enunciado: "¿Qué debes hacer al detectar humo o fuego?", opciones: [
      { id: "a", texto: "Ignorarlo si parece pequeño" },
      { id: "b", texto: "Activar la alarma, avisar y seguir el procedimiento" },
      { id: "c", texto: "Regresar por objetos personales" }
    ], correcta: "b" },
    { id: 102, enunciado: "¿Qué elemento NO debe obstruirse en una instalación?", opciones: [
      { id: "a", texto: "Las rutas de evacuación" },
      { id: "b", texto: "Los almacenes cerrados" },
      { id: "c", texto: "Los escritorios" }
    ], correcta: "a" },
    { id: 103, enunciado: "¿Qué debes hacer antes de intentar controlar un fuego pequeño?", opciones: [
      { id: "a", texto: "Verificar capacitación, equipo y ruta de escape" },
      { id: "b", texto: "Entrar aunque haya mucho humo" },
      { id: "c", texto: "Usar cualquier extintor" }
    ], correcta: "a" }
  ]
};

function prepararCursoUnico(cursos) {
  const base = DB.cursos.find((c) => Number(c.id) === CURSO_UNICO_ID);
  let elegido = cursos.find((c) => Number(c.id) === CURSO_UNICO_ID) || base || cursos[0];
  if (!elegido) return [];

  // Si el navegador conserva una versión anterior sin módulos o sin lecciones,
  // recuperamos el contenido base del curso en lugar de mostrar únicamente las evaluaciones.
  const tieneLecciones = (elegido.modulos || []).some((modulo) =>
    (modulo.temas || []).some((tema) => (tema.subtemas || []).length > 0) ||
    (modulo.lecciones || []).length > 0
  );
  if (!tieneLecciones && base && base !== elegido) {
    elegido = { ...base, ...elegido, modulos: base.modulos, evaluacion: elegido.evaluacion || base.evaluacion };
  }

  // Fechas de demostración: el curso ya está abierto y cierra en 30 días.
  if (!elegido.fechaInicio) elegido.fechaInicio = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  if (!elegido.fechaFin) elegido.fechaFin = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  elegido.estado = "publicado";
  elegido.asignadoA = "Todos";
  elegido.tipo = elegido.tipo || "Obligatorio";
  return [elegido];
}

function cargarDatosPersistidos(clave, valorInicial) {
  const guardado = localStorage.getItem(clave);
  if (!guardado) return valorInicial;
  try {
    const datos = JSON.parse(guardado);
    return Array.isArray(datos) ? datos : valorInicial;
  } catch (error) {
    console.warn(`No se pudieron cargar los datos persistidos: ${clave}`, error);
    return valorInicial;
  }
}

function guardarDatosPersistidos(clave, datos) {
  try {
    localStorage.setItem(clave, JSON.stringify(datos));
  } catch (error) {
    // El almacenamiento local (localStorage) tiene un límite de unos 5 MB por
    // sitio. Las imágenes y videos ya no se guardan aquí en base64 (van a
    // IndexedDB), pero este límite se conserva como red de seguridad por si
    // el resto de los datos guardados crece demasiado.
    if (error && (error.name === "QuotaExceededError" || error.code === 22 || error.code === 1014)) {
      throw new Error(
        "No se pudo guardar: se alcanzó el límite de almacenamiento del navegador. " +
        "Elimina datos que ya no necesites e inténtalo de nuevo."
      );
    }
    throw error;
  }
}

function cargarObjetoPersistido(clave, valorInicial) {
  const guardado = localStorage.getItem(clave);
  if (!guardado) return valorInicial;
  try {
    const datos = JSON.parse(guardado);
    return datos && typeof datos === "object" && !Array.isArray(datos) ? datos : valorInicial;
  } catch (error) {
    console.warn(`No se pudieron cargar los datos persistidos: ${clave}`, error);
    return valorInicial;
  }
}

// ---- Almacenamiento de imágenes/videos en IndexedDB ----
// localStorage tiene un límite de unos 5 MB por sitio, así que las imágenes y
// videos (guardados como base64) se guardan aparte en IndexedDB, que admite
// archivos mucho más pesados. En localStorage solo queda una referencia corta
// (por ejemplo "idb:media:curso-3-video") en vez del archivo completo.
const PREFIJO_MEDIA_IDB = "idb:media:";
let promesaBaseMedia = null;

function abrirBaseMedia() {
  if (promesaBaseMedia) return promesaBaseMedia;
  promesaBaseMedia = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB no está disponible en este navegador."));
      return;
    }
    const solicitud = indexedDB.open("cicsa_media", 1);
    solicitud.onupgradeneeded = () => {
      if (!solicitud.result.objectStoreNames.contains("archivos")) {
        solicitud.result.createObjectStore("archivos", { keyPath: "id" });
      }
    };
    solicitud.onsuccess = () => resolve(solicitud.result);
    solicitud.onerror = () => reject(solicitud.error || new Error("No se pudo abrir el almacenamiento de archivos."));
  });
  return promesaBaseMedia;
}

async function guardarArchivoMedia(id, dataUrl) {
  const baseDatos = await abrirBaseMedia();
  return new Promise((resolve, reject) => {
    const transaccion = baseDatos.transaction("archivos", "readwrite");
    transaccion.objectStore("archivos").put({ id, dataUrl });
    transaccion.oncomplete = () => resolve();
    transaccion.onerror = () => reject(transaccion.error || new Error("No se pudo guardar el archivo."));
  });
}

async function obtenerArchivoMedia(id) {
  const baseDatos = await abrirBaseMedia();
  return new Promise((resolve, reject) => {
    const transaccion = baseDatos.transaction("archivos", "readonly");
    const solicitud = transaccion.objectStore("archivos").get(id);
    solicitud.onsuccess = () => resolve(solicitud.result ? solicitud.result.dataUrl : "");
    solicitud.onerror = () => reject(solicitud.error || new Error("No se pudo leer el archivo."));
  });
}

function esDataUrl(valor) {
  return typeof valor === "string" && valor.startsWith("data:");
}

function esReferenciaMediaIdb(valor) {
  return typeof valor === "string" && valor.startsWith(PREFIJO_MEDIA_IDB);
}

// Recorre un curso clonado y, por cada campo con una imagen/video en base64,
// lo guarda en IndexedDB y deja en su lugar una referencia corta. El objeto
// `curso` original (en memoria) nunca se toca, así que la app sigue viendo
// las URLs reales sin ningún cambio en el código que las pinta en pantalla.
async function extraerMediaParaGuardar(cursoOriginal) {
  const curso = JSON.parse(JSON.stringify(cursoOriginal));
  const tareas = [];
  const extraerCampo = (objeto, campo, id) => {
    if (!objeto || !esDataUrl(objeto[campo])) return;
    const valor = objeto[campo];
    tareas.push(
      guardarArchivoMedia(id, valor).then(() => {
        objeto[campo] = PREFIJO_MEDIA_IDB + id;
      })
    );
  };
  extraerCampo(curso, "thumbnail", `curso-${curso.id}-portada`);
  extraerCampo(curso, "video", `curso-${curso.id}-video`);
  (curso.modulos || []).forEach((modulo, indiceModulo) => {
    extraerCampo(modulo, "imagen", `curso-${curso.id}-m${indiceModulo}-imagen`);
    extraerCampo(modulo, "image", `curso-${curso.id}-m${indiceModulo}-image`);
    extraerCampo(modulo, "video", `curso-${curso.id}-m${indiceModulo}-video`);
    const gruposSubtemas = modulo.temas
      ? modulo.temas.map((tema, indiceTema) => ({ tema, subtemas: tema.subtemas || [], indiceTema }))
      : [{ tema: null, subtemas: modulo.lecciones || [], indiceTema: 0 }];
    gruposSubtemas.forEach(({ tema, subtemas, indiceTema }) => {
      if (tema) {
        extraerCampo(tema, "imagen", `curso-${curso.id}-m${indiceModulo}-t${indiceTema}-imagen`);
        extraerCampo(tema, "image", `curso-${curso.id}-m${indiceModulo}-t${indiceTema}-image`);
        extraerCampo(tema, "video", `curso-${curso.id}-m${indiceModulo}-t${indiceTema}-video`);
      }
      subtemas.forEach((subtema, indiceSubtema) => {
        extraerCampo(
          subtema,
          "url",
          `curso-${curso.id}-m${indiceModulo}-t${indiceTema}-s${indiceSubtema}`
        );
      });
    });
  });
  await Promise.all(tareas);
  return curso;
}

// Operación inversa: reemplaza cada referencia "idb:media:<id>" por el
// archivo real guardado en IndexedDB, para que el curso en memoria siempre
// tenga URLs directamente utilizables (data URLs, http o rutas relativas).
async function resolverMediaAlCargar(cursoOriginal) {
  const curso = cursoOriginal;
  const tareas = [];
  const resolverCampo = (objeto, campo) => {
    if (!objeto || !esReferenciaMediaIdb(objeto[campo])) return;
    const id = objeto[campo].slice(PREFIJO_MEDIA_IDB.length);
    tareas.push(
      obtenerArchivoMedia(id).then((dataUrl) => {
        objeto[campo] = dataUrl || "";
      })
    );
  };
  resolverCampo(curso, "thumbnail");
  resolverCampo(curso, "video");
  (curso.modulos || []).forEach((modulo) => {
    resolverCampo(modulo, "imagen");
    resolverCampo(modulo, "image");
    resolverCampo(modulo, "video");
    const gruposSubtemas = modulo.temas
      ? modulo.temas.map((tema) => ({ tema, subtemas: tema.subtemas || [] }))
      : [{ tema: null, subtemas: modulo.lecciones || [] }];
    gruposSubtemas.forEach(({ tema, subtemas }) => {
      if (tema) {
        resolverCampo(tema, "imagen");
        resolverCampo(tema, "image");
        resolverCampo(tema, "video");
      }
      subtemas.forEach((subtema) => resolverCampo(subtema, "url"));
    });
  });
  await Promise.all(tareas);
  return curso;
}

async function guardarCursosPersistidos(cursos) {
  const cursosParaGuardar = await Promise.all(cursos.map((curso) => extraerMediaParaGuardar(curso)));
  guardarDatosPersistidos("cicsa_cursos", cursosParaGuardar);
}

async function cargarCursosPersistidos(valorInicial) {
  const cursos = cargarDatosPersistidos("cicsa_cursos", valorInicial);
  await Promise.all(cursos.map((curso) => resolverMediaAlCargar(curso)));
  return cursos;
}

DB.usuarios = cargarDatosPersistidos("cicsa_usuarios", DB.usuarios);
DB.progreso = cargarObjetoPersistido("cicsa_progreso", DB.progreso);

DB.solicitudesRestablecimiento = cargarDatosPersistidos(
  "cicsa_solicitudes_restablecimiento",
  DB.solicitudesRestablecimiento
);
DB.notificacionesAdmin = cargarDatosPersistidos("cicsa_notificaciones_admin", DB.notificacionesAdmin);
DB.evaluacionesResultado = cargarDatosPersistidos("cicsa_evaluaciones_resultado", DB.evaluacionesResultado).map((resultado) => ({
  ...resultado,
  // Los registros antiguos no guardaban el tipo; se consideran examen final
  // para no mostrarlos incorrectamente como evaluación inicial.
  tipo: String(resultado.tipo || "examen").toLowerCase() === "evaluacion" ? "evaluacion" : "examen",
}));
// Limpieza única de cuentas demo y sus datos asociados.
const versionLimpiezaUsuarios = "cuentas-demo-v1";
if (MOCK_MODE && localStorage.getItem("cicsa_limpieza_usuarios") !== versionLimpiezaUsuarios) {
  const demo = [
    { id: 1, correo: "ana.torres@cicsa.mx", nombre: "Ana Torres" },
    { id: 2, correo: "jhovany@cicsa.mx", nombre: "Jhovany Gonzales" },
    { id: 3, correo: "maria.lopez@cicsa.mx", nombre: "Maria Fernanda Lopez" },
    { id: 4, correo: "carlos.ramirez@cicsa.mx", nombre: "Carlos Ramirez" },
    { id: 5, correo: "daniela.cruz@cicsa.mx", nombre: "Daniela Cruz" },
    { id: 6, correo: "roberto.mendez@cicsa.mx", nombre: "Roberto Mendez" },
  ];
  const esDemo = (u) => demo.some(d => String(d.id) === String(u.id) && d.correo === String(u.correo || "").toLowerCase());
  const ids = new Set(demo.filter(d => !DB.usuarios.some(u => String(u.id) === String(d.id) && !esDemo(u))).map(d => String(d.id)));
  const nombres = new Set(demo.filter(d => !DB.usuarios.some(u => u.nombre === d.nombre && !esDemo(u))).map(d => d.nombre));
  const conservarRegistro = (r) => r.usuarioId != null ? !ids.has(String(r.usuarioId)) : !nombres.has(r.usuario);
  DB.usuarios = DB.usuarios.filter(u => !esDemo(u));
  for (const id of ids) delete DB.progreso[id];
  DB.evaluacionesResultado = DB.evaluacionesResultado.filter(conservarRegistro);
  DB.solicitudesRestablecimiento = DB.solicitudesRestablecimiento.filter(conservarRegistro);
  DB.notificacionesAdmin = DB.notificacionesAdmin.filter(conservarRegistro);
  guardarDatosPersistidos("cicsa_usuarios", DB.usuarios);
  guardarDatosPersistidos("cicsa_progreso", DB.progreso);
  guardarDatosPersistidos("cicsa_evaluaciones_resultado", DB.evaluacionesResultado);
  guardarDatosPersistidos("cicsa_solicitudes_restablecimiento", DB.solicitudesRestablecimiento);
  guardarDatosPersistidos("cicsa_notificaciones_admin", DB.notificacionesAdmin);
  for (const clave of Object.keys(localStorage)) {
    if ([...ids].some(id => clave.startsWith("cicsa_temporizador_" + id + "_"))) localStorage.removeItem(clave);
  }
  if (sesion.usuario() && esDemo(sesion.usuario())) {
    ["cicsa_token", "cicsa_usuario", "cicsa_ultima_actividad"].forEach(clave => localStorage.removeItem(clave));
  }
  localStorage.setItem("cicsa_limpieza_usuarios", versionLimpiezaUsuarios);
}

// Cuentas de acceso solicitadas; se configuran una sola vez por navegador.
if (MOCK_MODE && localStorage.getItem("cicsa_cuentas_acceso") !== "v1") {
  const cuentas = [
    { nombre: "Jhovany", usuarioLogin: "jhovany", correo: "jhovany@cicsa.mx", password: "Cicsa2026", rol: "trabajador" },
    { nombre: "ana", usuarioLogin: "ana", correo: "ana@cicsa.mx", password: "Admin2026", rol: "admin" },
  ];
  for (const cuenta of cuentas) {
    const existente = DB.usuarios.find(u => String(u.correo || "").toLowerCase() === cuenta.correo);
    if (existente) Object.assign(existente, cuenta, { activo: true });
    else DB.usuarios.push({ id: Math.max(6, ...DB.usuarios.map(u => Number(u.id) || 0)) + 1, area: "Sin asignar", ultimoAcceso: null, activo: true, ...cuenta });
  }
  guardarDatosPersistidos("cicsa_usuarios", DB.usuarios);
  localStorage.setItem("cicsa_cuentas_acceso", "v1");
}

// Cuentas adicionales: migración independiente para no restablecer las existentes.
if (MOCK_MODE && localStorage.getItem("cicsa_cuentas_roles_demo") !== "v1") {
  const cuentas = [
    { nombre: "Administrador demo", usuarioLogin: "administrador", correo: "administrador@cicsa.mx", password: "AdminDemo2026", rol: "admin" },
    { nombre: "Instructor demo", usuarioLogin: "instructor", correo: "instructor@cicsa.mx", password: "Instructor2026", rol: "instructor" },
  ];
  for (const cuenta of cuentas) {
    const existente = DB.usuarios.some(u =>
      [u.correo, u.usuarioLogin].some(valor =>
        [cuenta.correo, cuenta.usuarioLogin].includes(String(valor || "").toLowerCase())
      )
    );
    if (!existente) DB.usuarios.push({
      id: Math.max(6, ...DB.usuarios.map(u => Number(u.id) || 0)) + 1,
      area: "Capacitación", ultimoAcceso: null, activo: true, ...cuenta
    });
  }
  guardarDatosPersistidos("cicsa_usuarios", DB.usuarios);
  localStorage.setItem("cicsa_cuentas_roles_demo", "v1");
}

if (MOCK_MODE && localStorage.getItem("cicsa_roles_v2") !== "1") {
  const propietaria = DB.usuarios.find(u => u.correo === "ana@cicsa.mx");
  if (propietaria && !DB.usuarios.some(u => u.rol === "superadmin" && u.activo)) {
    propietaria.rol = "superadmin";
    guardarDatosPersistidos("cicsa_usuarios", DB.usuarios);
    if (sesion.usuario()?.id === propietaria.id) sesion.guardar(sesion.token(), { id: propietaria.id, nombre: propietaria.nombre, correo: propietaria.correo, rol: propietaria.rol });
  }
  localStorage.setItem("cicsa_roles_v2", "1");
}
DB.evaluaciones = cargarObjetoPersistido("cicsa_evaluaciones", DB.evaluaciones);
const dbListaPromise = (async () => {
  const versionCatalogo = "curso-unico-cicsa-v2-contenido";
  const cursosGuardados = await cargarCursosPersistidos(DB.cursos);
  DB.cursos = localStorage.getItem("cicsa_catalogo_version") === versionCatalogo ? cursosGuardados : prepararCursoUnico(cursosGuardados);
  // La migración se ejecuta una vez para eliminar los cursos anteriores del
  // catálogo local sin tocar el resto de las funcionalidades del sistema.
  if (localStorage.getItem("cicsa_catalogo_version") !== versionCatalogo) {
    await guardarCursosPersistidos(DB.cursos);
    localStorage.setItem("cicsa_catalogo_version", versionCatalogo);
  }
  if (localStorage.getItem("cicsa_horario_global") !== "v1") {
    DB.cursos = DB.cursos.map(c => {
      if (!(Number(c.horas) > 0)) return c;
      const fechaInicio = c.fechaInicio || (c.estado === "publicado" ? new Date().toISOString() : "");
      const fin = fechaCierreCurso({ ...c, fechaInicio });
      return { ...c, duracion: Number(c.horas) + " h", fechaInicio, fechaFin: fin ? new Date(fin).toISOString() : "" };
    });
    await guardarCursosPersistidos(DB.cursos);
    localStorage.setItem("cicsa_horario_global", "v1");
  }
  const cursoUnico = DB.cursos.find(c => Number(c.id) === CURSO_UNICO_ID);
  if (cursoUnico) {
    DB.evaluaciones[cursoUnico.id] = {
      evaluacion: EVALUACION_INICIAL_COURSE_5,
      examen: cursoUnico.evaluacion || { minimaAprobatoria: 70, preguntas: [] },
      ...(DB.evaluaciones[cursoUnico.id] || {})
    };
    // Garantiza que exista la evaluación inicial aun si había datos antiguos.
    DB.evaluaciones[cursoUnico.id].evaluacion ||= EVALUACION_INICIAL_COURSE_5;
    if (!DB.evaluaciones[cursoUnico.id].examen?.preguntas?.length && cursoUnico.evaluacion?.preguntas?.length) {
      DB.evaluaciones[cursoUnico.id].examen = cursoUnico.evaluacion;
    }
    guardarDatosPersistidos("cicsa_evaluaciones", DB.evaluaciones);
  }
})();

function pausa(ms) { return new Promise((r) => setTimeout(r, ms)); }

function requerirAdministrador() {
  if (!sesion.activa() || !["admin", "superadmin"].includes(sesion.rol())) {
    throw new Error("No tienes permisos de administración.");
  }
}


const permisos = {
  tiene(permiso) {
    const matriz = {
      superadmin: ["usuarios", "password", "crearCursos", "aprobarCursos", "asignarCursos", "reportes", "tutorial"],
      admin: ["usuarios", "aprobarCursos", "asignarCursos", "reportes", "tutorial"],
      instructor: ["crearCursos"], trabajador: []
    };
    return (matriz[sesion.rol()] || []).includes(permiso);
  },
  exigir(permiso) {
    if (!sesion.activa() || !this.tiene(permiso)) throw new Error("No tienes permisos para realizar esta acción.");
  },
  gestionarUsuario(u) {
    return this.tiene("usuarios") && (sesion.rol() === "superadmin" || ["trabajador", "instructor"].includes(u?.rol));
  },
  etiqueta(rol) {
    return { superadmin: "Súper administrador", admin: "Administrador", instructor: "Instructor", trabajador: "Trabajador" }[rol] || rol;
  }
};
function autorizarSolicitud(metodo, ruta, cuerpo = {}) {
  DB.usuarios = cargarDatosPersistidos("cicsa_usuarios", DB.usuarios);
  if (ruta.startsWith("/auth/") && ruta !== "/auth/restablecer-password") return;
  const cuenta = DB.usuarios.find(u => Number(u.id) === Number(sesion.usuario()?.id));
  if (!cuenta?.activo || sesion.token() !== "token-demo." + cuenta.id) throw new Error("La sesión ya no está activa.");
  if (cuenta.rol !== sesion.rol()) {
    sesion.guardar(sesion.token(), { id: cuenta.id, nombre: cuenta.nombre, correo: cuenta.correo, rol: cuenta.rol });
    throw new Error("Tu rol cambió. Recarga la página.");
  }
  if (ruta === "/auth/restablecer-password") permisos.exigir("password");
  if (ruta.startsWith("/usuarios")) {
    permisos.exigir("usuarios");
    const destino = DB.usuarios.find(u => u.id === Number(ruta.split("/")[2]));
    if (metodo !== "GET" && destino && !permisos.gestionarUsuario(destino)) throw new Error("Solo el súper administrador puede gestionar administradores.");
    if (ruta.endsWith("/password")) permisos.exigir("password");
    if (cuerpo.rol && !permisos.gestionarUsuario({ rol: cuerpo.rol })) throw new Error("No puedes asignar ese rol.");
    if (destino?.id === cuenta.id && (cuerpo.activo === false || (cuerpo.rol && cuerpo.rol !== cuenta.rol))) throw new Error("No puedes desactivar tu cuenta ni cambiar tu propio rol.");
  }
  if (ruta.startsWith("/progreso/reabrir/")) permisos.exigir("asignarCursos");
  if (ruta.startsWith("/solicitudes-restablecimiento")) permisos.exigir("password");
  if (ruta.startsWith("/notificaciones-admin")) permisos.exigir("usuarios");
  if (ruta.startsWith("/reportes/") && ruta !== "/reportes/mis-resultados") permisos.exigir("reportes");
  if (ruta.startsWith("/cursos") && metodo !== "GET") {
    if (ruta.endsWith("/estado")) {
      permisos.exigir("aprobarCursos");
      if (!["publicado", "inactivo"].includes(cuerpo.estado)) throw new Error("Estado no válido.");
    } else if (ruta.endsWith("/asignacion")) permisos.exigir("asignarCursos");
    else {
      permisos.exigir("crearCursos");
      if (metodo === "DELETE" && sesion.rol() !== "superadmin") throw new Error("Solo el súper administrador puede eliminar cursos.");
      if (metodo === "PATCH" && ("estado" in cuerpo || "id" in cuerpo)) throw new Error("Usa la acción de aprobación para cambiar el estado.");
      if (sesion.rol() === "instructor" && ("asignadoA" in cuerpo || "asignadoAIds" in cuerpo)) throw new Error("La asignación corresponde al administrador.");
    }
  }
  if (ruta.startsWith("/evaluaciones/") && metodo === "PATCH") permisos.exigir("crearCursos");
}
// Fecha de apertura del curso compartida por reportes y perfiles.
function formatearFechaInicioCurso(inicio) {
  if (!inicio) return "Sin fecha definida";
  if (/^\d{4}-\d{2}-\d{2}$/.test(inicio)) return inicio;
  const fecha = new Date(inicio);
  if (Number.isNaN(fecha.getTime())) return "—";
  return [fecha.getFullYear(), String(fecha.getMonth() + 1).padStart(2, "0"), String(fecha.getDate()).padStart(2, "0")].join("-");
}

function normalizarDuracionCurso(datos) {
  if (datos.horas === undefined) return datos;
  const horas = Number(datos.horas);
  if (!Number.isFinite(horas) || horas < 0.5 || horas % 0.5 !== 0) {
    throw new Error("La duración debe ser de al menos media hora, en intervalos de media hora.");
  }
  return { ...datos, horas, duracion: horas + " h" };
}

function cursoParaTrabajador(curso, usuarioId) {
  const permiso = DB.progreso[usuarioId]?.[curso.id]?.reapertura;
  if (!permiso) return curso;
  return { ...curso, fechaInicio: permiso.inicio, fechaFin: permiso.fin,
    horas: permiso.horas, duracion: permiso.horas + " h", accesoReautorizado: true };
}

function fechaCierreCurso(curso) {
  const inicio = new Date(curso?.fechaInicio || "").getTime();
  const horas = Number(curso?.horas);
  if (Number.isFinite(inicio) && Number.isFinite(horas) && horas > 0) return inicio + horas * 3600000;
  const fin = new Date(curso?.fechaFin || "").getTime();
  return Number.isFinite(fin) ? fin : 0;
}

function normalizarHorarioCurso(datos) {
  const curso = normalizarDuracionCurso(datos);
  if (curso.fechaInicio && !Number.isFinite(new Date(curso.fechaInicio).getTime())) throw new Error("La fecha de apertura no es válida.");
  const inicio = curso.fechaInicio ? new Date(curso.fechaInicio).toISOString() : "";
  const fin = inicio && Number(curso.horas) > 0 ? new Date(new Date(inicio).getTime() + curso.horas * 3600000).toISOString() : "";
  return { ...curso, fechaInicio: inicio, fechaFin: fin };
}

function estadoTemporalCurso(curso, ahora = new Date()) {
  const inicio = curso?.fechaInicio ? new Date(curso.fechaInicio) : null;
  const fin = fechaCierreCurso(curso);
  if (inicio && ahora < inicio) return "programado";
  if (fin && ahora >= fin) return "cerrado";
  return "abierto";
}

function obtenerLeccionesCurso(curso) {
  return (curso.modulos || []).flatMap((modulo) =>
    modulo.temas
      ? modulo.temas.flatMap((tema) => tema.subtemas || [])
      : modulo.lecciones || []
  );
}

async function simularSolicitud(metodo, ruta, cuerpo) {
  await dbListaPromise;
  await pausa(280);
  DB.cursos = await cargarCursosPersistidos(DB.cursos);
  DB.progreso = cargarObjetoPersistido("cicsa_progreso", DB.progreso);

  if (!ruta.startsWith("/auth/") && !sesion.activa()) {
    throw new Error("Inicia sesión para continuar.");
  }

  autorizarSolicitud(metodo, ruta, cuerpo);

  if (ruta === "/reportes/sesiones" && metodo === "GET") return cerrarSesionesVencidas();
  if (ruta === "/sesiones/pulso" && metodo === "POST") return registrarUsoDemo("pulso");
  if (ruta === "/sesiones/cerrar" && metodo === "POST") return registrarUsoDemo("cerrar", cuerpo?.motivo);

  // ---- Auth ----
  if (ruta === "/auth/login" && metodo === "POST") {
    const u = DB.usuarios.find(
      (x) => [x.correo, x.usuarioLogin].some(valor => valor && String(valor).toLowerCase() === String(cuerpo.correo || "").trim().toLowerCase())
    );
    if (!u || u.password !== cuerpo.password) throw new Error("Usuario o contraseña incorrectos.");
    if (!u.activo) throw new Error("Esta cuenta está desactivada. Contacta a un administrador.");
    registrarUsoDemo("cerrar", "cambio_cuenta");
    if (u.rol === "trabajador") iniciarUsoDemo(u);
    u.ultimoAcceso = new Date().toISOString();
    guardarDatosPersistidos("cicsa_usuarios", DB.usuarios);
    return { token: "token-demo." + u.id, usuario: { id: u.id, nombre: u.nombre, correo: u.correo, rol: u.rol } };
  }
  if (ruta === "/auth/olvide-password" && metodo === "POST") {
    const usuario = DB.usuarios.find((u) => u.correo.toLowerCase() === String(cuerpo.correo).toLowerCase());
    const administrador = DB.usuarios.find((u) => u.rol === "superadmin" && u.activo);
    if (usuario && !DB.solicitudesRestablecimiento.some((s) => s.usuarioId === usuario.id && s.estado === "pendiente")) {
      DB.solicitudesRestablecimiento.push({
        id: DB.solicitudesRestablecimiento.length ? Math.max(...DB.solicitudesRestablecimiento.map((s) => s.id)) + 1 : 1,
        usuarioId: usuario.id,
        fecha: new Date().toISOString(),
        estado: "pendiente",
      });
      guardarDatosPersistidos("cicsa_solicitudes_restablecimiento", DB.solicitudesRestablecimiento);
      guardarDatosPersistidos("cicsa_usuarios", DB.usuarios);
      DB.notificacionesAdmin.unshift({
        id: `password-${usuario.id}-${Date.now()}`,
        tipo: "password",
        fecha: new Date().toISOString(),
        usuarioId: usuario.id,
        destinatario: administrador?.correo || null,
        leida: false,
      });
      guardarDatosPersistidos("cicsa_notificaciones_admin", DB.notificacionesAdmin);
    }
    return { mensaje: "Si el correo existe, se notificó al administrador." };
  }
  if (ruta === "/auth/restablecer-password" && metodo === "POST") {
    requerirAdministrador();
    return { mensaje: "Contraseña actualizada correctamente." };
  }

  // ---- Soporte: solicitudes propias y atención según el rol ----
  if (ruta === "/soporte" || /^\/soporte\/\d+$/.test(ruta)) {
    const actor = DB.usuarios.find(u => u.id === Number(sesion.usuario().id));
    const tickets = cargarDatosPersistidos("cicsa_soporte", []);
    const puedeAtender = t => actor.rol === "superadmin" || (
      actor.rol === "admin" && !t.soloSuperadmin &&
      !["admin", "superadmin"].includes(DB.usuarios.find(u => u.id === t.usuarioId)?.rol)
    );
    const presentar = t => ({ ...t, puedeAtender: puedeAtender(t) });
    if (metodo === "GET" && ruta === "/soporte") {
      return tickets.filter(t => t.usuarioId === actor.id || puedeAtender(t)).map(presentar).reverse();
    }
    if (metodo === "POST" && ruta === "/soporte") {
      const categorias = ["acceso", "password", "curso", "evaluacion", "certificado", "repetir", "otro"];
      const tipo = String(cuerpo?.tipo || "");
      const descripcion = String(cuerpo?.descripcion || "").trim();
      if (!categorias.includes(tipo)) throw new Error("Selecciona un tipo de solicitud.");
      if (descripcion.length < 10 || descripcion.length > 3000) throw new Error("Describe el problema con entre 10 y 3000 caracteres.");
      const cursoId = cuerpo.cursoId ? Number(cuerpo.cursoId) : null;
      const curso = cursoId ? DB.cursos.find(c => c.id === cursoId) : null;
      if (cursoId && (!curso || (actor.rol === "trabajador" && (curso.estado !== "publicado" || (curso.asignadoA !== "Todos" && !(curso.asignadoAIds || []).includes(actor.id)))))) throw new Error("Selecciona uno de tus cursos asignados.");
      if (tipo === "repetir" && !curso) throw new Error("Selecciona el curso que deseas repetir.");
      const captura = cuerpo.captura || "";
      if (typeof captura !== "string" || captura.length > 2800000 || (captura && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(captura))) throw new Error("La captura debe ser PNG, JPG o WEBP de hasta 2 MB.");
      const ticket = {
        id: Math.max(0, ...tickets.map(t => Number(t.id) || 0)) + 1,
        usuarioId: actor.id, nombre: actor.nombre, correo: actor.correo,
        tipo, descripcion, cursoId, curso: curso?.nombre || "", captura,
        estado: "pendiente", respuesta: "", fecha: new Date().toISOString(),
        soloSuperadmin: tipo === "password" || ["admin", "superadmin"].includes(actor.rol)
      };
      guardarDatosPersistidos("cicsa_soporte", [...tickets, ticket]);
      return presentar(ticket);
    }
    if (metodo === "PATCH") {
      const ticket = tickets.find(t => t.id === Number(ruta.split("/")[2]));
      if (!ticket || !puedeAtender(ticket)) throw new Error("No tienes permiso para atender esta solicitud.");
      const estado = String(cuerpo?.estado || "");
      const respuesta = String(cuerpo?.respuesta || "").trim();
      if (!["pendiente", "en_atencion", "resuelto"].includes(estado)) throw new Error("Estado no válido.");
      if (respuesta.length > 3000 || (estado === "resuelto" && respuesta.length < 5)) throw new Error("Indica la solución antes de marcar la solicitud como resuelta.");
      Object.assign(ticket, { estado, respuesta, atendidoPor: actor.id, actualizado: new Date().toISOString() });
      guardarDatosPersistidos("cicsa_soporte", tickets);
      return presentar(ticket);
    }
    throw new Error("Operación de soporte no disponible.");
  }

  // ---- Usuarios (admin) ----
  if (ruta === "/usuarios" && metodo === "GET") {
    requerirAdministrador();
    return DB.usuarios.map(({ password, ...u }) => sesion.rol() === "superadmin" ? { ...u, password } : u);
  }
  if (ruta === "/usuarios" && metodo === "POST") {
    requerirAdministrador();
    const nuevoId = DB.usuarios.length ? Math.max(...DB.usuarios.map((u) => u.id)) + 1 : 1;
    const rol = String(cuerpo.rol || "").trim().toLowerCase();
    if (!["superadmin", "admin", "instructor", "trabajador"].includes(rol)) {
      throw new Error("El rol seleccionado no es válido.");
    }
    const correo = String(cuerpo.correo || "").trim().toLowerCase();
    if (!String(cuerpo.nombre || "").trim() || !correo || !cuerpo.password) throw new Error("Completa nombre, correo y contraseña.");
    if (DB.usuarios.some(u => u.correo.toLowerCase() === correo)) throw new Error("El correo ya está registrado.");
    const nuevo = { nombre: String(cuerpo.nombre).trim(), correo, password: String(cuerpo.password), id: nuevoId, activo: true, ultimoAcceso: null, area: String(cuerpo.area || "Sin asignar").trim(), rol };
    DB.usuarios.push(nuevo);
    guardarDatosPersistidos("cicsa_usuarios", DB.usuarios);
    return nuevo;
  }
  if (ruta === "/usuarios/importar" && metodo === "POST") {
    requerirAdministrador();
    const registros = Array.isArray(cuerpo.registros) ? cuerpo.registros : [];
    if (!registros.length) throw new Error("No hay trabajadores para importar.");
    const existentes = new Set(DB.usuarios.map((u) => String(u.correo || "").toLowerCase()));
    let siguienteId = DB.usuarios.length ? Math.max(...DB.usuarios.map((u) => Number(u.id) || 0)) + 1 : 1;
    const creados = [], omitidos = [];
    registros.forEach((registro) => {
      const nombre = String(registro.nombre || "").trim();
      const area = String(registro.area || "").trim() || "Sin asignar";
      if (!nombre) { omitidos.push({ ...registro, motivo: "Falta el nombre" }); return; }
      const correoBase = String(registro.correo || "").trim().toLowerCase();
      const correo = correoBase || (nombre.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(" ").filter(Boolean).slice(0,2).join(".") + "@cicsa.mx");
      if (existentes.has(correo)) { omitidos.push({ ...registro, motivo: "Correo ya registrado" }); return; }
      const password = String(registro.password || "Cicsa2026").trim() || "Cicsa2026";
      const nuevo = { id: siguienteId++, nombre, correo, password, rol: "trabajador", activo: true, ultimoAcceso: null, area };
      DB.usuarios.push(nuevo); existentes.add(correo); creados.push(nuevo);
    });
    guardarDatosPersistidos("cicsa_usuarios", DB.usuarios);
    return { creados, omitidos };
  }
  const matchToggle = ruta.match(/^\/usuarios\/(\d+)\/estado$/);
  if (matchToggle && metodo === "PATCH") {
    requerirAdministrador();
    const u = DB.usuarios.find((x) => x.id == matchToggle[1]);
    if (u) u.activo = cuerpo.activo;
    guardarDatosPersistidos("cicsa_usuarios", DB.usuarios);
    return u;
  }
  const matchPassword = ruta.match(/^\/usuarios\/(\d+)\/password$/);
  if (matchPassword && metodo === "PATCH") {
    requerirAdministrador();
    const u = DB.usuarios.find((x) => x.id == matchPassword[1]);
    if (u) u.password = cuerpo.password;
    guardarDatosPersistidos("cicsa_usuarios", DB.usuarios);
    return u;
  }
  const matchRol = ruta.match(/^\/usuarios\/(\d+)\/rol$/);
  if (matchRol && metodo === "PATCH") {
    requerirAdministrador();
    const rol = String(cuerpo.rol || "").trim().toLowerCase();
    if (!["superadmin", "admin", "instructor", "trabajador"].includes(rol)) {
      throw new Error("El rol seleccionado no es válido.");
    }
    const u = DB.usuarios.find((x) => x.id == matchRol[1]);
    if (!u) throw new Error("Trabajador no encontrado.");
    u.rol = rol;
    guardarDatosPersistidos("cicsa_usuarios", DB.usuarios);
    return u;
  }

  // ---- Solicitudes de restablecimiento (admin) ----
  if (ruta === "/solicitudes-restablecimiento" && metodo === "GET") {
    requerirAdministrador();
    return DB.solicitudesRestablecimiento.map((s) => ({
      ...s,
      usuario: DB.usuarios.find((u) => u.id === s.usuarioId),
    }));
  }
  if (ruta === "/notificaciones-admin" && metodo === "GET") {
    requerirAdministrador();
    return DB.notificacionesAdmin.filter(n => permisos.tiene("password") || n.tipo !== "password").map((n) => ({
      ...n,
      usuario: DB.usuarios.find((u) => u.id === n.usuarioId),
      curso: n.cursoId ? DB.cursos.find((c) => c.id === n.cursoId) : null,
    }));
  }
  if (ruta === "/notificaciones-admin" && metodo === "DELETE") {
    requerirAdministrador();
    DB.notificacionesAdmin = [];
    guardarDatosPersistidos("cicsa_notificaciones_admin", DB.notificacionesAdmin);
    return { mensaje: "Notificaciones eliminadas." };
  }
  const matchNotificacion = ruta.match(/^\/notificaciones-admin\/([^/]+)$/);
  if (matchNotificacion && metodo === "DELETE") {
    requerirAdministrador();
    const indice = DB.notificacionesAdmin.findIndex((n) => String(n.id) === decodeURIComponent(matchNotificacion[1]));
    if (indice < 0) throw new Error("Notificación no encontrada.");
    DB.notificacionesAdmin.splice(indice, 1);
    guardarDatosPersistidos("cicsa_notificaciones_admin", DB.notificacionesAdmin);
    return { mensaje: "Notificación eliminada." };
  }
  const matchResolverSolicitud = ruta.match(/^\/solicitudes-restablecimiento\/(\d+)\/resolver$/);
  if (matchResolverSolicitud && metodo === "POST") {
    requerirAdministrador();
    const s = DB.solicitudesRestablecimiento.find((x) => x.id == matchResolverSolicitud[1]);
    if (s) {
      s.estado = "resuelto";
      const u = DB.usuarios.find((x) => x.id === s.usuarioId);
      if (u) u.password = cuerpo.password;
      guardarDatosPersistidos("cicsa_usuarios", DB.usuarios);
      guardarDatosPersistidos("cicsa_solicitudes_restablecimiento", DB.solicitudesRestablecimiento);
    }
    return s;
  }

  // ---- Cursos ----
  if (ruta === "/cursos" && metodo === "GET") return sesion.rol() === "trabajador" ? DB.cursos.filter(c => c.estado === "publicado" && (c.asignadoA === "Todos" || (c.asignadoAIds || []).includes(Number(sesion.usuario().id)))) : DB.cursos;
  const matchCurso = ruta.match(/^\/cursos\/(\d+)$/);
  if (matchCurso && metodo === "GET") {
    const base = DB.cursos.find((c) => c.id == matchCurso[1]);
    const curso = base && sesion.rol() === "trabajador" ? cursoParaTrabajador(base, sesion.usuario().id) : base;
    if (!curso) throw new Error("No se encontró el curso.");
    const usuario = sesion.usuario();
    if (usuario?.rol === "trabajador" && curso.estado !== "publicado") throw new Error("Este curso no está publicado.");
    if (usuario?.rol === "trabajador" && curso && curso.asignadoA !== "Todos"
      && !(Array.isArray(curso.asignadoAIds) && curso.asignadoAIds.includes(Number(usuario.id)))) {
      throw new Error("No tienes permiso para realizar este curso.");
    }
    if (usuario?.rol === "trabajador" && curso) {
      const temporal = estadoTemporalCurso(curso);
      if (temporal === "programado") throw new Error(`Este curso aún no está abierto. Apertura: ${new Date(curso.fechaInicio).toLocaleString("es-MX")}.`);
      if (temporal === "cerrado") throw new Error("El periodo de este curso ya terminó.");
    }
    return curso;
  }
  if (ruta === "/cursos" && metodo === "POST") {
    permisos.exigir("crearCursos");
    cuerpo = normalizarDuracionCurso(cuerpo);
    const nuevo = {
      modulos: [],
      ...normalizarHorarioCurso(cuerpo),
      id: DB.cursos.reduce((mayor, curso) => Math.max(mayor, Number(curso.id) || 0), 0) + 1,
      estado: "pendiente", asignadoA: "", asignadoAIds: [],
    };
    DB.cursos.push(nuevo);
    try {
      await guardarCursosPersistidos(DB.cursos);
    } catch (error) {
      DB.cursos.pop();
      throw error;
    }
    return nuevo;
  }

  const asignacion = ruta.match(/^\/cursos\/(\d+)\/asignacion$/);
  if (asignacion && metodo === "PATCH") {
    const curso = DB.cursos.find(c => c.id === Number(asignacion[1]));
    if (!curso) throw new Error("Curso no encontrado.");
    const ids = [...new Set((cuerpo.asignadoAIds || []).map(Number))];
    if (ids.some(id => !DB.usuarios.some(u => u.id === id && u.rol === "trabajador" && u.activo))) throw new Error("Selecciona trabajadores activos.");
    const anterior = { ...curso };
    Object.assign(curso, { asignadoA: cuerpo.asignadoA === "Todos" ? "Todos" : ids.join(","), asignadoAIds: cuerpo.asignadoA === "Todos" ? [] : ids });
    try { await guardarCursosPersistidos(DB.cursos); }
    catch (error) { Object.assign(curso, anterior); throw error; }
    return curso;
  }
  const matchEstadoCurso = ruta.match(/^\/cursos\/(\d+)\/estado$/);
  if (matchEstadoCurso && metodo === "PATCH") {
    requerirAdministrador();
    const c = DB.cursos.find((x) => x.id == matchEstadoCurso[1]);
    if (!c) throw new Error("Curso no encontrado.");
    const anterior = { ...c };
    if (cuerpo.estado === "publicado") {
      const horario = normalizarHorarioCurso({ ...c, fechaInicio: c.fechaInicio || new Date().toISOString() });
      if (estadoTemporalCurso(horario) === "cerrado") throw new Error("El horario ya terminó. Solicita al instructor o súper administrador actualizar la apertura antes de aprobar.");
      Object.assign(c, horario);
    }
    c.estado = cuerpo.estado;
    try {
      await guardarCursosPersistidos(DB.cursos);
    } catch (error) {
      Object.assign(c, anterior);
      throw error;
    }
    return c;
  }
  const matchEditarCurso = ruta.match(/^\/cursos\/(\d+)$/);
  if (matchEditarCurso && metodo === "PATCH") {
    permisos.exigir("crearCursos");
    cuerpo = normalizarDuracionCurso(cuerpo);
    const c = DB.cursos.find((x) => x.id == matchEditarCurso[1]);
    const anterior = c ? { ...c } : null;
    if (!c) throw new Error("Curso no encontrado.");
    Object.assign(c, normalizarHorarioCurso({ ...c, ...cuerpo }), { estado: "pendiente" });
    try {
      await guardarCursosPersistidos(DB.cursos);
    } catch (error) {
      if (c && anterior) Object.assign(c, anterior);
      throw error;
    }
    return c;
  }
  if (matchEditarCurso && metodo === "DELETE") {
    permisos.exigir("crearCursos");
    const anteriores = DB.cursos;
    DB.cursos = DB.cursos.filter((x) => x.id != matchEditarCurso[1]);
    try {
      await guardarCursosPersistidos(DB.cursos);
    } catch (error) {
      DB.cursos = anteriores;
      throw error;
    }
    return { ok: true };
  }

  // Nueva oportunidad individual, autorizada únicamente por administración.
  const reapertura = ruta.match(/^\/progreso\/reabrir\/(\d+)\/(\d+)$/);
  if (reapertura && metodo === "POST") {
    permisos.exigir("asignarCursos");
    const curso = DB.cursos.find(c => c.id === Number(reapertura[1]));
    const trabajador = DB.usuarios.find(u => u.id === Number(reapertura[2]) && u.rol === "trabajador" && u.activo);
    if (!curso || curso.estado !== "publicado") throw new Error("El curso debe estar aprobado y publicado.");
    if (!trabajador) throw new Error("Selecciona un trabajador activo.");
    if (curso.asignadoA !== "Todos" && !(curso.asignadoAIds || []).includes(trabajador.id)) throw new Error("Primero asigna el curso al trabajador.");
    if (!Number.isFinite(Number(curso.horas)) || Number(curso.horas) <= 0) throw new Error("Configura la duración del curso.");
    const propio = DB.progreso[trabajador.id] || {};
    const anterior = propio[curso.id];
    const historial = [...(anterior?.historialIntentos || [])];
    const inicio = new Date().toISOString();
    if (anterior) {
      const { historialIntentos, ...resumen } = anterior;
      historial.push({ ...resumen, archivadoEn: inicio });
    }
    const nuevo = {
      porcentaje: 0, estado: "no_iniciado", completadas: [],
      evaluacionInicialAprobada: false, examenAprobado: false,
      historialIntentos: historial,
      reapertura: {
        inicio, fin: new Date(Date.now() + Number(curso.horas) * 3600000).toISOString(),
        horas: Number(curso.horas), autorizadoPor: sesion.usuario().id
      }
    };
    const actualizado = { ...DB.progreso, [trabajador.id]: { ...propio, [curso.id]: nuevo } };
    guardarDatosPersistidos("cicsa_progreso", actualizado);
    DB.progreso = actualizado;
    return nuevo;
  }

  // ---- Progreso ----
  if (ruta === "/progreso/mis-cursos" && metodo === "GET") {
    const idUsuario = sesion.usuario()?.id;
    const propio = DB.progreso[idUsuario] || {};
    return DB.cursos
      .filter((c) => c.estado === "publicado" && (
        c.asignadoA === "Todos" ||
        (Array.isArray(c.asignadoAIds) && c.asignadoAIds.includes(Number(idUsuario)))
      ))
      .map((c) => {
        const avance = propio[c.id] || { porcentaje: 0, estado: "no_iniciado", completadas: [] };
        const lecciones = obtenerLeccionesCurso(c);
        const idsValidos = new Set(lecciones.map((l) => String(l.id)));
        const completadas = [...new Set((avance.completadas || []).map(String))].filter((id) => idsValidos.has(id));
        const porcentaje = lecciones.length ? Math.min(100, Math.round(completadas.length / lecciones.length * 100)) : 0;
        avance.completadas = completadas.map(Number);
        avance.porcentaje = porcentaje;
        if (avance.estado !== "completado") avance.estado = porcentaje === 100 ? "listo_examen" : porcentaje > 0 ? "en_proceso" : "no_iniciado";
        const acceso = cursoParaTrabajador(c, idUsuario);
        return { curso: acceso, estadoTemporal: estadoTemporalCurso(acceso), progreso: avance };
      });
  }
  const matchCompletar = ruta.match(/^\/progreso\/leccion\/(\d+)\/completar$/);
  if (matchCompletar && metodo === "POST") {
    const usuario = sesion.usuario();
    const curso = DB.cursos.find((c) => obtenerLeccionesCurso(c).some((l) => l.id == matchCompletar[1]));
    const autorizado = curso && curso.estado === "publicado" && estadoTemporalCurso(cursoParaTrabajador(curso, usuario.id)) === "abierto" && (curso.asignadoA === "Todos"
      || (Array.isArray(curso.asignadoAIds) && curso.asignadoAIds.includes(Number(usuario?.id))));
    if (usuario?.rol === "trabajador" && autorizado) {
      const propio = DB.progreso[usuario.id] || (DB.progreso[usuario.id] = {});
      const progreso = propio[curso.id] || (propio[curso.id] = { porcentaje: 0, estado: "no_iniciado", completadas: [] });
      const leccionId = Number(matchCompletar[1]);
      const lista = obtenerLeccionesCurso(curso);
      const leccion = lista.find(l => Number(l.id) === leccionId);
      if (!progreso.completadas.includes(leccionId)) {
        if (!progreso.evaluacionInicialAprobada) throw new Error("Aprueba primero la evaluación inicial.");
        if (lista.slice(0, lista.indexOf(leccion)).some(l => !progreso.completadas.includes(Number(l.id)))) throw new Error("Completa las unidades anteriores.");
        const contenido = DB.contenidoLecciones[leccionId] || {};
        if (!cumpleConsumoLeccion(reglaConsumoLeccion(leccion, contenido), cuerpo?.evidencia)) throw new Error("Falta ver el video, descargar el material o cumplir el tiempo mínimo de lectura.");
        progreso.evidencias = progreso.evidencias || {};
        progreso.evidencias[leccionId] = { ...cuerpo.evidencia, completadoEn: new Date().toISOString() };
      }
      if (!progreso.completadas.includes(leccionId)) progreso.completadas.push(leccionId);
      const totalLecciones = obtenerLeccionesCurso(curso).length;
      const idsValidos = new Set(obtenerLeccionesCurso(curso).map((l) => String(l.id)));
      progreso.completadas = [...new Set((progreso.completadas || []).map(String))]
        .filter((id) => idsValidos.has(id)).map(Number);
      progreso.porcentaje = totalLecciones ? Math.min(100, Math.round((progreso.completadas.length / totalLecciones) * 100)) : 0;
      progreso.estado = progreso.examenAprobado ? "completado" : progreso.porcentaje === 100 ? "listo_examen" : progreso.porcentaje > 0 ? "en_proceso" : "no_iniciado";
      guardarDatosPersistidos("cicsa_progreso", DB.progreso);
      if (progreso.estado === "listo_examen" && !DB.notificacionesAdmin.some((n) => n.tipo === "curso-listo" && n.usuarioId === usuario.id && n.cursoId === curso.id)) {
        DB.notificacionesAdmin.unshift({
          id: `curso-listo-${usuario.id}-${curso.id}`,
          tipo: "curso-listo",
          fecha: new Date().toISOString(),
          usuarioId: usuario.id,
          cursoId: curso.id,
          leida: false,
        });
        guardarDatosPersistidos("cicsa_notificaciones_admin", DB.notificacionesAdmin);
      }
    }
    if (usuario?.rol === "trabajador" && !autorizado) {
      throw new Error("No tienes permiso para realizar este curso.");
    }
    return { ok: true };
  }

  // ---- Reportes (admin) ----
  const matchPerfilTrabajador = ruta.match(/^\/reportes\/trabajador\/(\d+)\/perfil$/);
  if (matchPerfilTrabajador && metodo === "GET") {
    requerirAdministrador();
    const usuarioId = Number(matchPerfilTrabajador[1]);
    const usuario = DB.usuarios.find((u) => u.id === usuarioId && u.rol === "trabajador");
    if (!usuario) throw new Error("No se encontró el trabajador.");

    const cursosAsignados = DB.cursos.filter((c) => c.estado === "publicado" && (
      c.asignadoA === "Todos" || (Array.isArray(c.asignadoAIds) && c.asignadoAIds.includes(usuarioId))
    ));
    const propio = DB.progreso[usuarioId] || {};
    const cursos = cursosAsignados.map((curso) => {
      const avance = propio[curso.id] || { porcentaje: 0, estado: "no_iniciado" };
      const resultado = DB.evaluacionesResultado
        .filter((r) => (r.usuarioId === usuarioId || (!r.usuarioId && r.usuario === usuario.nombre)) && r.curso === curso.nombre)
        .sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || "")))[0];
      return {
        id: curso.id,
        nombre: curso.nombre,
        reapertura: avance.reapertura || null,
        fechaInicio: curso.fechaInicio || null,
        porcentaje: avance.porcentaje || 0,
        completado: avance.estado === "completado",
        calificacion: resultado?.nota ?? null,
      };
    });
    const calificaciones = DB.evaluacionesResultado
      .filter((r) => r.usuarioId === usuarioId || (!r.usuarioId && r.usuario === usuario.nombre))
      .map((r) => r.nota)
      .filter(Number.isFinite);
    const promedio = calificaciones.length ? Math.round(calificaciones.reduce((suma, nota) => suma + nota, 0) / calificaciones.length) : null;
    const cursosCompletados = cursos.filter((curso) => curso.completado).length;
    const avanceGeneral = cursos.length ? Math.round(cursos.reduce((suma, curso) => suma + curso.porcentaje, 0) / cursos.length) : 0;
    const horasHechas = cursosAsignados.reduce((suma, curso) => suma + ((propio[curso.id]?.porcentaje || 0) / 100) * (curso.horas || 0), 0);
    const insignias = [];
    if (cursosCompletados) insignias.push("Curso completado");
    if (avanceGeneral >= 50) insignias.push("Avance constante");
    if (promedio !== null && promedio >= 90) insignias.push("Alto desempeño");
    return {
      usuario: { nombre: usuario.nombre, correo: usuario.correo, area: usuario.area || "Sin asignar" }, avanceGeneral,
      horasHechas: Math.round(horasHechas * 10) / 10, cursosCompletados,
      cursosTotal: cursos.length, promedio, insignias, cursos,
    };
  }
  if (ruta.startsWith("/reportes/seguimiento-trabajadores") && metodo === "GET") {
    requerirAdministrador();
    const cursosPublicados = DB.cursos.filter((c) => c.estado === "publicado");
    return DB.usuarios
      .filter((u) => u.rol === "trabajador")
      .map((u) => {
        const cursosAsignados = cursosPublicados.filter((c) => c.asignadoA === "Todos" || c.asignadoAIds?.includes(Number(u.id)));
        const totalHoras = cursosAsignados.reduce((sum, c) => sum + (c.horas || 0), 0);
        const propio = DB.progreso[u.id] || {};
        const cursosCompletados = cursosAsignados.filter((c) => propio[c.id]?.estado === "completado").length;
        const horasHechas = cursosAsignados.reduce(
          (sum, c) => sum + ((propio[c.id]?.porcentaje || 0) / 100) * (c.horas || 0), 0
        );
        const avance = cursosAsignados.length
          ? Math.round(cursosAsignados.reduce((sum, c) => sum + (propio[c.id]?.porcentaje || 0), 0) / cursosAsignados.length)
          : 0;
        let estado = "Sin iniciar";
        if (cursosAsignados.length > 0 && cursosCompletados === cursosAsignados.length) estado = "Completado";
        else if (avance > 0) estado = "En progreso";
        return {
          usuarioId: u.id, nombre: u.nombre, area: u.area || "Sin asignar", avance,
          cursosCompletados, cursosTotal: cursosAsignados.length,
          horasHechas: Math.round(horasHechas * 10) / 10, horasTotal: totalHoras,
          estado,
        };
      });
  }
  if (ruta.startsWith("/reportes/seguimiento") && metodo === "GET") {
    requerirAdministrador();
    return DB.evaluacionesResultado;
  }
  if (ruta === "/reportes/mis-resultados" && metodo === "GET") {
    const usuario = sesion.usuario();
    return DB.evaluacionesResultado.filter((resultado) => resultado.usuarioId === usuario?.id || (!resultado.usuarioId && resultado.usuario === usuario?.nombre));
  }

  // ---- Contenido de lección ----
  const matchLeccion = ruta.match(/^\/lecciones\/(\d+)$/);
  if (matchLeccion && metodo === "GET") {
    const curso = DB.cursos.find(c => obtenerLeccionesCurso(c).some(l => Number(l.id) === Number(matchLeccion[1])));
    if (!curso) throw new Error("Lección no encontrada.");
    await simularSolicitud("GET", "/cursos/" + curso.id);
    return DB.contenidoLecciones[matchLeccion[1]];
  }

  // ---- Evaluaciones (RF-030..036) ----
  const matchEvalTipo = ruta.match(/^\/evaluaciones\/curso\/(\d+)\/(evaluacion|examen)$/);
  if (matchEvalTipo && metodo === "GET") {
    await simularSolicitud("GET", "/cursos/" + matchEvalTipo[1]);
    const id = matchEvalTipo[1];
    const tipo = matchEvalTipo[2];
    const actual = DB.evaluaciones[id];
    if (!actual) return null;
    // Compatibilidad: los datos anteriores se consideran examen final.
    if (actual.preguntas && !actual.examen && !actual.evaluacion) return tipo === "examen" ? actual : null;
    return actual[tipo] || null;
  }
  if (matchEvalTipo && metodo === "PATCH") {
    permisos.exigir("crearCursos");
    const id = matchEvalTipo[1];
    const tipo = matchEvalTipo[2];
    const previo = DB.evaluaciones[id];
    const base = previo && previo.preguntas && !previo.examen && !previo.evaluacion
      ? { evaluacion: { minimaAprobatoria: 70, preguntas: [] }, examen: previo }
      : { evaluacion: null, examen: null, ...(previo || {}) };
    base[tipo] = { ...(base[tipo] || {}), ...cuerpo };
    DB.evaluaciones[id] = base;
    const cursoEditado = DB.cursos.find(c => c.id === Number(ruta.split("/")[3]));
    if (cursoEditado) { cursoEditado.estado = "pendiente"; await guardarCursosPersistidos(DB.cursos); }
    guardarDatosPersistidos("cicsa_evaluaciones", DB.evaluaciones);
    return base[tipo];
  }
  const matchEval = ruta.match(/^\/evaluaciones\/curso\/(\d+)$/);
  if (matchEval && metodo === "GET") {
    await simularSolicitud("GET", "/cursos/" + matchEval[1]);
    const actual = DB.evaluaciones[matchEval[1]];
    if (actual && (actual.evaluacion || actual.examen)) return actual.examen || actual.evaluacion || null;
    return actual || null;
  }
  if (matchEval && metodo === "PATCH") {
    permisos.exigir("crearCursos");
    const actual = DB.evaluaciones[matchEval[1]] || { preguntas: [] };
    DB.evaluaciones[matchEval[1]] = { ...actual, ...cuerpo };
    const cursoEditado = DB.cursos.find(c => c.id === Number(ruta.split("/")[3]));
    if (cursoEditado) { cursoEditado.estado = "pendiente"; await guardarCursosPersistidos(DB.cursos); }
    guardarDatosPersistidos("cicsa_evaluaciones", DB.evaluaciones);
    return DB.evaluaciones[matchEval[1]];
  }
  const matchIntento = ruta.match(/^\/evaluaciones\/curso\/(\d+)\/(evaluacion|examen)\/intento$/);
  const matchIntentoLegacy = ruta.match(/^\/evaluaciones\/curso\/(\d+)\/intento$/);
  if ((matchIntento || matchIntentoLegacy) && metodo === "POST") {
    const idCursoIntento = matchIntento ? matchIntento[1] : matchIntentoLegacy[1];
    const tipoIntento = matchIntento ? matchIntento[2] : "examen";
    const cursoIntento = await simularSolicitud("GET", `/cursos/${idCursoIntento}`);
    const avanceIntento = DB.progreso[sesion.usuario().id]?.[idCursoIntento];
    if (tipoIntento === "examen" && !avanceIntento?.evaluacionInicialAprobada) {
      throw new Error("Aprueba la evaluación inicial antes de presentar el examen final.");
    }
    if (tipoIntento === "examen" && obtenerLeccionesCurso(cursoIntento).some((l) => !avanceIntento?.completadas?.includes(l.id))) {
      throw new Error("Completa todas las lecciones antes del examen final.");
    }
    const registro = DB.evaluaciones[idCursoIntento];
    const evalCurso = registro && (registro.evaluacion || registro.examen) ? registro[tipoIntento] : registro;
    if (!evalCurso || !evalCurso.preguntas?.length) {
      throw new Error("Este curso todavía no tiene preguntas configuradas.");
    }
    const total = evalCurso.preguntas.length;
    const correctas = evalCurso.preguntas.filter((p) => cuerpo?.respuestas?.[p.id] != null && String(cuerpo.respuestas[p.id]) === String(p.correcta)).length;
    const nota = Math.round((correctas / total) * 100);
    const aprobado = nota >= evalCurso.minimaAprobatoria;
    const usuario = sesion.usuario();
    DB.evaluacionesResultado.unshift({
      usuarioId: usuario?.id,
      usuario: usuario?.nombre || "Trabajador",
      curso: DB.cursos.find((curso) => curso.id === Number(idCursoIntento))?.nombre || "Curso",
      tipo: tipoIntento,
      nota,
      estado: aprobado ? "aprobado" : "no aprobado",
      fecha: new Date().toISOString().slice(0, 10),
    });
    guardarDatosPersistidos("cicsa_evaluaciones_resultado", DB.evaluacionesResultado);
    if (aprobado && tipoIntento === "evaluacion") {
      const propio = DB.progreso[usuario.id] || (DB.progreso[usuario.id] = {});
      const progresoInicial = propio[idCursoIntento] || (propio[idCursoIntento] = { porcentaje: 0, estado: "no_iniciado", completadas: [] });
      progresoInicial.evaluacionInicialAprobada = true;
      guardarDatosPersistidos("cicsa_progreso", DB.progreso);
    }
    if (aprobado && tipoIntento === "examen") {
      const propio = DB.progreso[usuario.id] || (DB.progreso[usuario.id] = {});
      const progresoCurso = propio[idCursoIntento] || (propio[idCursoIntento] = { porcentaje: 100, completadas: [] });
      if (progresoCurso) {
        progresoCurso.estado = "completado";
        progresoCurso.fechaFin = new Date().toISOString().slice(0, 10);
        progresoCurso.examenAprobado = true;
        guardarDatosPersistidos("cicsa_progreso", DB.progreso);
      }
      const cursoTerminado = DB.cursos.find((curso) => curso.id === Number(idCursoIntento));
      if (usuario?.id && cursoTerminado && !DB.notificacionesAdmin.some((n) => n.tipo === "curso-completado" && n.usuarioId === usuario.id && n.cursoId === cursoTerminado.id)) {
        DB.notificacionesAdmin.unshift({
          id: `curso-completado-${usuario.id}-${cursoTerminado.id}`,
          tipo: "curso-completado",
          fecha: new Date().toISOString(),
          usuarioId: usuario.id,
          cursoId: cursoTerminado.id,
          nota,
          leida: false,
        });
        guardarDatosPersistidos("cicsa_notificaciones_admin", DB.notificacionesAdmin);
      }
    }
    return { nota, aprobado, correctas, total };
  }

  throw new Error(`Endpoint simulado no implementado: ${metodo} ${ruta}`);
}

// ---------------------------------------------------------------
// API pública usada por las páginas
// ---------------------------------------------------------------
const auth = {
  login: (correo, password) => solicitar("POST", "/auth/login", { correo, password }),
  olvidePassword: (correo) => solicitar("POST", "/auth/olvide-password", { correo }),
  restablecerPassword: (token, password) =>
    solicitar("POST", "/auth/restablecer-password", { token, password }),
};

const usuarios = {
  listar: () => solicitar("GET", "/usuarios"),
  crear: (datos) => solicitar("POST", "/usuarios", datos),
  cambiarEstado: (id, activo) => solicitar("PATCH", `/usuarios/${id}/estado`, { activo }),
  cambiarPassword: (id, password) => solicitar("PATCH", `/usuarios/${id}/password`, { password }),
  cambiarRol: (id, rol) => solicitar("PATCH", `/usuarios/${id}/rol`, { rol }),
  importar: (registros) => solicitar("POST", "/usuarios/importar", { registros }),
};

const solicitudesReset = {
  listar: () => solicitar("GET", "/solicitudes-restablecimiento"),
  resolver: (id, password) => solicitar("POST", `/solicitudes-restablecimiento/${id}/resolver`, { password }),
};

const notificacionesAdmin = {
  listar: () => solicitar("GET", "/notificaciones-admin"),
  eliminar: (id) => solicitar("DELETE", `/notificaciones-admin/${encodeURIComponent(id)}`),
  eliminarTodas: () => solicitar("DELETE", "/notificaciones-admin"),
};

const cursos = {
  asignar: (id, datos) => solicitar("PATCH", "/cursos/" + id + "/asignacion", datos),
  listar: () => solicitar("GET", "/cursos"),
  obtener: (id) => solicitar("GET", `/cursos/${id}`),
  crear: (datos) => solicitar("POST", "/cursos", datos),
  actualizar: (id, datos) => solicitar("PATCH", `/cursos/${id}`, datos),
  eliminar: (id) => solicitar("DELETE", `/cursos/${id}`),
  cambiarEstado: (id, estado) => solicitar("PATCH", `/cursos/${id}/estado`, { estado }),
};

const progreso = {
  reabrir: (cursoId, usuarioId) => solicitar("POST", "/progreso/reabrir/" + cursoId + "/" + usuarioId),
  misCursos: () => solicitar("GET", "/progreso/mis-cursos"),
  completarLeccion: (idLeccion, evidencia) => solicitar("POST", `/progreso/leccion/${idLeccion}/completar`, { evidencia }),
};

const lecciones = {
  obtener: (id) => solicitar("GET", `/lecciones/${id}`),
};

const evaluaciones = {
  obtenerPorCurso: (idCurso) => solicitar("GET", `/evaluaciones/curso/${idCurso}`),
  obtenerPorCursoTipo: (idCurso, tipo = "examen") => solicitar("GET", `/evaluaciones/curso/${idCurso}/${tipo}`),
  actualizar: (idCurso, datos) => solicitar("PATCH", `/evaluaciones/curso/${idCurso}`, datos),
  actualizarTipo: (idCurso, tipo, datos) => solicitar("PATCH", `/evaluaciones/curso/${idCurso}/${tipo}`, datos),
  enviarIntento: (idCurso, respuestas, tipo = "examen") =>
    solicitar("POST", `/evaluaciones/curso/${idCurso}/${tipo}/intento`, { respuestas }),
};

const reportes = {
  sesiones: () => solicitar("GET", "/reportes/sesiones"),
  seguimiento: (filtros = {}) => {
    const qs = new URLSearchParams(filtros).toString();
    return solicitar("GET", `/reportes/seguimiento?${qs}`);
  },
  seguimientoTrabajadores: () => solicitar("GET", "/reportes/seguimiento-trabajadores"),
  perfilTrabajador: (id) => solicitar("GET", `/reportes/trabajador/${id}/perfil`),
  misResultados: () => solicitar("GET", "/reportes/mis-resultados"),
  exportarCSV(filas, nombreArchivo = "reporte-cicsa-capacita.csv") {
    const encabezados = Object.keys(filas[0] || {});
    const lineas = [
      encabezados.join(","),
      ...filas.map((f) => encabezados.map((h) => `"${f[h]}"`).join(",")),
    ];
    const blob = new Blob([lineas.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombreArchivo;
    a.click();
    URL.revokeObjectURL(url);
  },
};


// API de soporte; el backend real debe aplicar los mismos permisos.
const soporte = {
  listar: () => solicitar("GET", "/soporte"),
  crear: datos => solicitar("POST", "/soporte", datos),
  actualizar: (id, datos) => solicitar("PATCH", "/soporte/" + id, datos)
};

// En producción, el servidor mantiene las sesiones y su reloj.
function cerrarSesionesVencidas() {
  const registros = cargarDatosPersistidos("cicsa_sesiones_uso", []);
  let cambios = false;
  registros.forEach(r => {
    if (!r.salida && Date.now() - Date.parse(r.ultimaSenal) > 120000) {
      r.salida = r.ultimaSenal;
      r.motivo = "sin_senal";
      r.estimada = true;
      cambios = true;
    }
  });
  if (cambios) guardarDatosPersistidos("cicsa_sesiones_uso", registros);
  return registros;
}
function iniciarUsoDemo(usuario) {
  const registros = cerrarSesionesVencidas();
  const ahora = new Date().toISOString();
  const id = registros.reduce((max, r) => Math.max(max, r.id), 0) + 1;
  registros.push({id, usuarioId: usuario.id, nombre: usuario.nombre, entrada: ahora,
    ultimaSenal: ahora, salida: null, motivo: null, estimada: false});
  guardarDatosPersistidos("cicsa_sesiones_uso", registros);
  localStorage.setItem("cicsa_sesion_uso", String(id));
  return id;
}
function registrarUsoDemo(evento, motivo) {
  const usuario = sesion.usuario();
  if (!usuario || usuario.rol !== "trabajador") return null;
  const cuenta = cargarDatosPersistidos("cicsa_usuarios", []).find(u => u.id === usuario.id);
  if (!cuenta?.activo || cuenta.rol !== "trabajador" || sesion.token() !== "token-demo." + cuenta.id) return null;
  const registros = cerrarSesionesVencidas();
  const registro = registros.find(r => r.id === Number(localStorage.getItem("cicsa_sesion_uso")) && r.usuarioId === usuario.id);
  if (!registro || registro.salida) {
    if (evento === "pulso") iniciarUsoDemo(cuenta);
    return null;
  }
  const ahora = new Date().toISOString();
  registro.ultimaSenal = ahora;
  if (evento === "cerrar") {
    registro.salida = ahora;
    registro.motivo = ["inactividad", "cambio_cuenta"].includes(motivo) ? motivo : "cierre_manual";
  }
  guardarDatosPersistidos("cicsa_sesiones_uso", registros);
  return registro;
}
function enviarPulsoUso(evento = "pulso", motivo) {
  if (!sesion.activa() || sesion.rol() !== "trabajador") return;
  try {
    if (MOCK_MODE) return registrarUsoDemo(evento, motivo);
    return fetch(API_BASE + "/sesiones/" + evento, {
      method: "POST", keepalive: true,
      headers: {"Content-Type": "application/json", Authorization: "Bearer " + sesion.token()},
      body: JSON.stringify({motivo})
    }).then(res => { if (!res.ok) throw new Error("No se pudo registrar la sesión."); })
      .catch(error => console.warn("Registro de uso:", error.message));
  } catch (error) { console.warn("Registro de uso:", error.message); }
}


const REGLAS_CONSUMO = Object.freeze({video: 1, lectura: 120});
function reglaConsumoLeccion(leccion, contenido = {}) {
  const url = leccion.url || leccion.video || leccion.mediaUrl || contenido.url || contenido.video || "";
  const tipo = String(leccion.tipo || contenido.tipo || "").toLowerCase();
  if (tipo === "video" || /^data:video\//i.test(url) || /\.(mp4|webm|ogg|mov)([?#].*)?$/i.test(url)) return {tipo: "video", disponible: !!url};
  if (url && (["documento", "pdf"].includes(tipo) || /^data:application\/pdf/i.test(url) || /\.pdf([?#].*)?$/i.test(url))) return {tipo: "documento", disponible: true};
  return {tipo: "lectura", disponible: !!(url || leccion.informacion || contenido.cuerpo)};
}
function unirTramosVideo(tramos, duracion) {
  const validos = (Array.isArray(tramos) ? tramos : []).filter(t => Array.isArray(t) && t.length === 2 && t.every(Number.isFinite) && t[0] >= 0 && t[1] > t[0] && t[1] <= duracion).map(t => [...t]).sort((a,b) => a[0]-b[0]);
  return validos.reduce((r,t) => { const ultimo=r[r.length-1]; if(ultimo && t[0]<=ultimo[1]) ultimo[1]=Math.max(ultimo[1],t[1]); else r.push(t); return r; }, []);
}
function segundosVideoVistos(evidencia) {
  return unirTramosVideo(evidencia?.tramos, evidencia?.duracion).reduce((s,t)=>s+t[1]-t[0],0);
}
function cumpleConsumoLeccion(regla, evidencia) {
  if (!regla.disponible || !evidencia) return false;
  if (regla.tipo === "video") return Number.isFinite(evidencia.duracion) && evidencia.duracion > 0 && segundosVideoVistos(evidencia) / evidencia.duracion >= REGLAS_CONSUMO.video;
  return (regla.tipo === "documento" && evidencia.descargado === true) || (Number.isFinite(evidencia.segundos) && evidencia.segundos >= REGLAS_CONSUMO.lectura);
}
