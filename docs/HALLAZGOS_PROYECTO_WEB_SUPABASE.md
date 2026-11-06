# Hallazgos del proyecto de Supabase de la web y el panel (ensilperu.com / Dashboard-EnsilWeb)

Revisión del 2026-11-04. **No son del sistema**: el sistema irá en un proyecto de Supabase aparte (ver `PLANTILLA_SUPABASE.md`).
Se guardan aquí para que se corrijan en el proyecto de la web y el panel. Proyecto: `jtrugvxgztnxbhwjtiou`.

## Riesgos de seguridad (por prioridad)

1. 🚨 **Función `execute_sql` llamada con la clave pública** desde un script del panel (`fix_carrusel02.cjs`). Si existe y `anon` puede ejecutarla, cualquiera podría ejecutar SQL arbitrario. Se comprueba con la consulta *c* de abajo (columna `anon_puede_ejecutar`). Si da `true`: quitarle el permiso a `anon` o eliminarla.
2. 🚨 **`filiales`:** las políticas `Acceso total anon filiales` y `Permitir todo filiales` dan `ALL` a `anon`. Cualquiera con la clave pública (visible en la web) puede crear, modificar y borrar sedes; el borrado arrastra `citas` y `entrevistas` por `ON DELETE CASCADE`.
   - Ni la web (solo lee, con `activo = true`) ni el panel (escribe con sesión de administrador, cubierta por `filiales_admin_total`) las necesitan.
   - Orden seguro: (1) crear una política `SELECT` para `anon` con `activo = true`, porque hoy la lectura de la web depende de las abiertas; (2) comprobar que `mensajes_wsp` también se lee con `anon` (la web hace un *join*); (3) quitar las dos políticas `ALL`; (4) probar en el panel como administrador (crear, editar y borrar una sede de prueba); tener el script para volver atrás.
3. 🚨 **`carrusel_02_imagenes`:** política `FOR ALL TO anon USING (true)`: cualquiera puede editar o borrar las imágenes del carrusel.
4. ⚠️ **`alumnos` y `apoderados` legibles por `anon`:** la web los lee para detectar teléfonos duplicados al agendar. Son datos personales (incluidos menores). Mejor validar duplicados con una función `SECURITY DEFINER` que solo devuelva «existe / no existe».
5. ⚠️ **RLS posiblemente apagado** en `filiales`, `mensajes_wsp`, `historias_transformacion`, `colores_corporativos` y `carrusel_02_imagenes` (no hay SQL que lo active). Se comprueba con la consulta *a*.

## Consultas de verificación (solo lectura, SQL Editor)

```sql
-- a) ¿Qué tablas tienen RLS activo?
select c.relname as tabla, c.relrowsecurity as rls_activo
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' order by 1;

-- b) Políticas de todas las tablas y de la carpeta de archivos
select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_policies where schemaname in ('public', 'storage') order by 1, 2, 3;

-- c) Funciones de public y si `anon` puede ejecutarlas (busca execute_sql)
select p.proname as funcion, pg_get_function_identity_arguments(p.oid) as argumentos,
       p.prosecdef as security_definer,
       has_function_privilege('anon', p.oid, 'execute') as anon_puede_ejecutar
from pg_proc p where p.pronamespace = 'public'::regnamespace order by 1;

-- d) Cuentas y tabla profiles
select rol, activo, count(*) as cuentas from public.perfiles_usuario group by rol, activo;
select count(*) as usuarios_auth from auth.users;
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'profiles' order by ordinal_position;

-- e) Disparadores
select tgname, tgrelid::regclass as tabla from pg_trigger where not tgisinternal order by 2, 1;

-- f) Carpetas de archivos
select id, public from storage.buckets order by 1;
```

## Cómo está armado hoy (referencia)

- **Tablas de `public`:** `alumnos`, `apoderados`, `carrusel_02_imagenes`, `categoriaFAQ`, `categoriafaq`, `citas`, `colores_corporativos`, `entrevistas`, `faq`, `filiales`, `historias_transformacion`, `mensajes_wsp`, `perfiles_usuario`, `profiles`.
- **`filiales`:** `id` bigint con secuencia propia; solo `nombre` y `direccion` obligatorios. Dependen de ella `citas`, `entrevistas` (con una clave duplicada), `profiles` y `perfiles_usuario`. Sin disparadores ni vistas. 17 sedes activas (ids 1 a 16 y 19).
- **Web pública:** solo lee `filiales` (`'*, mensajes_wsp (contenido)'` y `'id, provincia, nombre, distrito, direccion'`, con `activo = true`); no usa Auth; agenda sin sesión insertando en `alumnos`, `apoderados` y `entrevistas`. Funciones SQL: `registrar_reserva` y `registrar_familia` (`SECURITY DEFINER`, ejecutables por `anon`). Archivos en el bucket público `Filiales`.
- **Panel:** Supabase Auth con correo y contraseña; tabla `perfiles_usuario` (`id` = `auth.users.id`, `rol` ∈ {`administrador`, `sede`}, `id_filial`, `nombre_display`, `activo`). `es_administrador()` existe en la base (no en el repositorio). Escribe con sesión de administrador; la `service_role` solo se usa para crear y borrar usuarios.
- `profiles` existe en la base y tiene `id_filial`, pero el código del panel no la usa: falta saber qué es.
