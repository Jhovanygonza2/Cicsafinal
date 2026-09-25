function ocultarPorPermiso(selector, permitido) {
  if (!permitido) document.querySelectorAll(selector).forEach(el => { el.hidden = true; el.style.setProperty("display", "none", "important"); });
}
document.querySelectorAll(".badge-rol-admin").forEach(el => el.textContent = permisos.etiqueta(sesion.rol()));
ocultarPorPermiso('#usuarios-admin, a[href="#usuarios-admin"]', permisos.tiene("usuarios"));
ocultarPorPermiso('#solicitudes-admin, a[href="#solicitudes-admin"]', permisos.tiene("password"));
ocultarPorPermiso('#seguimiento-admin, a[href="#seguimiento-admin"], .abrir-excelencia', permisos.tiene("reportes"));
ocultarPorPermiso('#actividad-admin, a[href="#actividad-admin"], #notificaciones-admin, a[href="#notificaciones-admin"], .admin-campana-wrap', permisos.tiene("usuarios"));
ocultarPorPermiso('#tutorial-admin, a[href="#tutorial-admin"]', permisos.tiene("tutorial"));
ocultarPorPermiso('#alta-curso, [data-abrir-form="alta-curso"], .cursos-admin-guia', permisos.tiene("crearCursos"));
ocultarPorPermiso('.curso-editor-asignacion', false);
if (sesion.rol() === "instructor") ocultarPorPermiso('#resumen-admin, a[href="#resumen-admin"]', false);
const explicacionRol = document.createElement("p");
explicacionRol.className = "muted";
explicacionRol.textContent = {
  superadmin: "Acceso completo: usuarios, administradores, contraseñas, contenidos, aprobación y asignación de cursos.",
  admin: "Aprueba cursos, registra o desactiva trabajadores e instructores y asigna quién tomará cada curso.",
  instructor: "Crea y edita cursos. Los cursos nuevos y los cambios de contenido requieren aprobación del administrador."
}[sesion.rol()] || "";
document.querySelector(".contenedor-admin")?.prepend(explicacionRol);
document.querySelector("#usuarios-admin h2")?.replaceChildren(document.createTextNode("Usuarios y roles"));
document.querySelector("#solicitudes-admin h2")?.replaceChildren(document.createTextNode("Contraseñas de usuarios"));

function abrirAsignacionCurso(id) {
  permisos.exigir("asignarCursos");
  const curso = listaCursos.find(c => c.id === id);
  if (!curso) return;
  const modal = document.createElement("dialog");
  modal.className = "tarjeta";
  modal.style.cssText = "max-width:600px;width:90%;max-height:80vh;overflow:auto";
  const activos = listaUsuarios.filter(u => u.rol === "trabajador" && u.activo);
  modal.innerHTML = '<form><h2>Asignar trabajadores</h2><p></p><label><input type="checkbox" name="todos"> Todos los trabajadores</label><div class="asignacion-opciones"></div><p><button class="btn btn-primario" type="submit">Guardar asignación</button> <button class="btn btn-secundario" type="button" data-cerrar>Cancelar</button></p><div role="alert"></div></form>';
  modal.querySelector("p").textContent = curso.nombre;
  const todos = modal.querySelector('[name="todos"]');
  todos.checked = curso.asignadoA === "Todos";
  const opciones = modal.querySelector(".asignacion-opciones");
  opciones.innerHTML = activos.map(u => '<label style="display:block;padding:8px"><input type="checkbox" value="' + u.id + '"' + ((curso.asignadoAIds || []).includes(u.id) ? " checked" : "") + '> ' + escaparHtml(u.nombre) + '</label>').join("") || "<p>No hay trabajadores activos.</p>";
  const actualizar = () => opciones.querySelectorAll("input").forEach(el => el.disabled = todos.checked);
  todos.addEventListener("change", actualizar);
  actualizar();
  modal.querySelector("[data-cerrar]").onclick = () => modal.close();
  modal.addEventListener("close", () => modal.remove());
  modal.querySelector("form").onsubmit = async e => {
    e.preventDefault();
    const boton = modal.querySelector('[type="submit"]');
    boton.disabled = true;
    try {
      await cursos.asignar(id, { asignadoA: todos.checked ? "Todos" : "", asignadoAIds: [...opciones.querySelectorAll("input:checked")].map(el => Number(el.value)) });
      modal.close();
      await cargarTodo();
    } catch (error) { modal.querySelector('[role="alert"]').textContent = error.message; }
    finally { boton.disabled = false; }
  };
  document.body.append(modal);
  modal.showModal();
}
