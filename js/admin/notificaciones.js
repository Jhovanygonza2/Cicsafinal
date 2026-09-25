// Iconografía común del listado y la campana administrativa.
function iconoNotificacionAdmin(tipo) {
  const trazos = {
    password: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
    curso: '<path d="M6 3h9l4 4v14H6V3Zm8 0v5h5M9 14l2 2 4-5"/>',
    vacio: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/><path d="m9 10 2 2 4-4"/>'
  };
  return '<svg class="aviso-admin-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + (trazos[tipo] || trazos.curso) + '</svg>';
}
function avisoVacioAdmin() {
  return '<span class="aviso-admin-vacio-icono">' + iconoNotificacionAdmin("vacio") + '</span><div><strong>No tienes avisos pendientes</strong><p>Las novedades de los trabajadores aparecerán aquí.</p></div>';
}

// notificaciones.js — Notificaciones del panel administrativo

function pintarNotificaciones() {
  const lista = document.getElementById("lista-notificaciones-admin");
  const badge = document.getElementById("notificaciones-admin-badge");
  if (!lista || !badge) return;
  const pendientes = listaNotificaciones.filter((n) => !n.leida);
  badge.textContent = pendientes.length;
  badge.style.display = pendientes.length ? "inline-flex" : "none";
  lista.innerHTML = listaNotificaciones.length
    ? listaNotificaciones.map((n) => {
      const nombre = n.usuario?.nombre || "Un trabajador";
      const texto = n.tipo === "password"
        ? `${nombre} solicitó restablecer su contraseña.`
        : n.tipo === "curso-completado"
          ? `${nombre} terminó y aprobó el curso «${n.curso?.nombre || "Curso"}».`
          : `${nombre} terminó el contenido del curso «${n.curso?.nombre || "Curso"}» y ya puede presentar su evaluación.`;
      return `<li class="${n.leida ? "" : "notificacion-admin-nueva"}"><span class="aviso-admin-lista-icono">${iconoNotificacionAdmin(n.tipo)}</span><div class="notificacion-admin-contenido"><strong>${escaparHtml(texto)}</strong><small>${formatoFecha(n.fecha)}</small></div><button type="button" class="btn btn-texto btn-sm notificacion-admin-eliminar" data-eliminar-notificacion="${escaparHtml(n.id)}" aria-label="Eliminar notificación">Eliminar</button></li>`;
    }).join("")
    : '<li class="aviso-admin-vacio">' + avisoVacioAdmin() + '</li>';
  lista.querySelectorAll("[data-eliminar-notificacion]").forEach((boton) => {
    boton.addEventListener("click", async () => {
     boton.disabled = true;
     try {
       await notificacionesAdmin.eliminar(boton.dataset.eliminarNotificacion);
       listaNotificaciones = listaNotificaciones.filter((notificacion) => String(notificacion.id) !== boton.dataset.eliminarNotificacion);
       pintarNotificaciones();
       pintarCampanaAdmin();
     } catch (error) {
       boton.disabled = false;
       mostrarToastAdmin(error.message || "No se pudo eliminar la notificación.", "error");
     }
    });
  });
}

document.getElementById("btn-eliminar-notificaciones")?.addEventListener("click", async () => {
  if (!listaNotificaciones.length) return;
  const confirmar = window.confirm("¿Eliminar todas las notificaciones?");
  if (!confirmar) return;
  const boton = document.getElementById("btn-eliminar-notificaciones");
  boton.disabled = true;
  try {
    await notificacionesAdmin.eliminarTodas();
    listaNotificaciones = [];
    pintarNotificaciones();
    pintarCampanaAdmin();
  } catch (error) {
    mostrarToastAdmin(error.message || "No se pudieron eliminar las notificaciones.", "error");
  } finally {
    boton.disabled = false;
  }
});
