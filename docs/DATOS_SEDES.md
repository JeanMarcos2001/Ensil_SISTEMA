# Datos reales de empresas y sedes

> **Generado** con `npx tsx scripts/doc-sedes-reales.ts` — no se edita a mano: se cambian los datos en `src/data/realOrg.ts` y se vuelve a generar.
> Carga en la base: `supabase/seed/empresas_y_sedes_reales.sql` (ejecutada el 2026-11-07).
> Los datos de ejemplo del sistema usan estos mismos códigos (`FIL-NNN`): ver `seedBranches()` en `src/data/seedCatalog.ts`.

**Origen.** Las direcciones, referencias y teléfonos salen de la tabla `filiales` del proyecto de la web (`jtrugvxgztnxbhwjtiou`), que el usuario exportó el 2026-11-07. La empresa de cada sede y los RUC los informó el usuario el mismo día.
Este archivo existe para **no volver a pedir estos datos**: es la referencia de lo que va (y de lo que ya está) en Organización → Empresas / Filiales.

## Empresas (6)

El almacén central pertenece a **SILEE**, igual que Los Olivos.

| Código | RUC | Razón social | Sedes |
|---|---|---|---|
| `EMP-001` | 20610010289 | SILEE E.I.R.L. | Los Olivos, Trujillo |
| `EMP-002` | 20611694092 | COLEGIO ENSIL DE LAS AMERICAS E.I.R.L. | — (ninguna por ahora) |
| `EMP-003` | 20533093133 | EDITORIAL ENSIL DE LAS AMERICAS TACNA | Cusco Marcavalle, Tacna |
| `EMP-004` | 20612421243 | ENSIL INT EIRL | Huancayo, Puno, Huaraz, Ica, Ayacucho |
| `EMP-005` | 20612459313 | ENSIL EVOLUTION S.R.L. | Piura, Chiclayo, Cajamarca, San Isidro, Juliaca, Arequipa |
| `EMP-006` | 20614185229 | ENSIL REVOLUTION S.A.C. | Cusco Magisterio |

> La razón social de las cuatro empresas nuevas se cargó **como la escribió el usuario**; falta confirmarla con la ficha RUC de SUNAT (por ejemplo, si SUNAT la escribe «ENSIL INT E.I.R.L.»). Se corrige en Organización → Empresas. Cada una lleva esa nota en «Observaciones».

## Sedes cargadas (16)

El código `FIL-NNN` lo asigna el sistema a continuación del mayor que exista (Los Olivos y Piura ya existían).

| Código | Sede | Empresa | Departamento | Provincia | Distrito | Dirección | Referencia | Teléfono fijo | Teléfono móvil |
|---|---|---|---|---|---|---|---|---|---|
| `FIL-001` | **Los Olivos** | SILEE E.I.R.L. | Lima | Lima | Los Olivos | Carlos Monge Jr. #233 | Espalda cdra. 4 Av. Izaguirre | 01-7504687 | 960508686 |
| `FIL-002` | **Piura** | ENSIL EVOLUTION S.R.L. | Piura | Piura | Piura | Av. Los Cocos Mz. N Lt. 1 Urbanización Club Grau | Costado de la Biblioteca Municipal de Piura | 073-554090 | 933732053 |
| `FIL-003` | **Chiclayo** | ENSIL EVOLUTION S.R.L. | Lambayeque | Chiclayo | Chiclayo | Calle Andalucía #150 Urb. san juan | Altura del Hotel Tumbas Reales | 074-525632 | 905464734 |
| `FIL-004` | **Cajamarca** | ENSIL EVOLUTION S.R.L. | Cajamarca | Cajamarca | Cajamarca | Jr. Guadalupe #466 | Huánuco y Silva Santiesteban | 076-772573 | 933722476 |
| `FIL-005` | **Trujillo** | SILEE E.I.R.L. | La Libertad | Trujillo | Trujillo | San Martín #150 | Frente al Club Libertad | — | 928140527 |
| `FIL-006` | **San Isidro** | ENSIL EVOLUTION S.R.L. | Lima | Lima | San Isidro | Calle Francisco de Zela #2575 | 1/2 cdra. del Touring | — | 960508686 |
| `FIL-007` | **Huancayo** | ENSIL INT EIRL | Junín | Huancayo | El Tambo | Jr. Arequipa #218 | Complejo Salesiano Sta. Rosa | 064-419923 | 992195898 |
| `FIL-008` | **Puno** | ENSIL INT EIRL | Puno | Puno | Puno | Jr. Moquegua #422 (2° piso) | Frente al Restaurante Tamis | 051-352969 | 961274101 |
| `FIL-009` | **Juliaca** | ENSIL EVOLUTION S.R.L. | Puno | San Román | Juliaca | Jr. Bolívar #329 | Costado del Mía Market | — | 913632393 |
| `FIL-010` | **Arequipa** | ENSIL EVOLUTION S.R.L. | Arequipa | Arequipa | Cayma | Urbanización León XIII M 60 - A, CAYMA | A media cuadra de la Clínica García Braganini | 054-325886 | 980756620 |
| `FIL-011` | **Cusco Magisterio** | ENSIL REVOLUTION S.A.C. | Cusco | Cusco | Cusco | Parque Amauta #210 Urb. Magisterio | A 2 casas de Caprichos | 084-782957 | 953802527 |
| `FIL-012` | **Cusco Marcavalle** | EDITORIAL ENSIL DE LAS AMERICAS TACNA | Cusco | Cusco | Wanchaq | Emilio Balcay #27 Urb. Cerveceros | Paradero Marcavalle | — | 922477489 |
| `FIL-013` | **Tacna** | EDITORIAL ENSIL DE LAS AMERICAS TACNA | Tacna | Tacna | Tacna | Av. Venezuela # 144 | Frente al Parque Villa Hermosa | 052-638072 | 933746179 |
| `FIL-014` | **Huaraz** | ENSIL INT EIRL | Áncash | Huaraz | Huaraz | Jr. Larrea y Laredo #796 | Frente al Parque El Encuentro | — | 933741997 |
| `FIL-015` | **Ica** | ENSIL INT EIRL | Ica | Ica | Ica | Av. San Martín #507 | Al costado de Serpost | — | 936770444 |
| `FIL-016` | **Ayacucho** | ENSIL INT EIRL | Ayacucho | Huamanga | Ayacucho | Jr. Las Gardenias Mz K Teniente 14 | Urb. Mariscal Cáceres | — | 925846402 |

## Sede pendiente: NO cargar todavía

| Sede | Empresa | Departamento | Provincia | Distrito | Dirección | Referencia | Teléfono móvil |
|---|---|---|---|---|---|---|---|
| **Ilo** | — (sin definir) | Moquegua | Ilo | Ilo | Calle Chile N°146 | A pocos minutos del malecón costero y zonas comerciales de Ilo | 981 116 176 (en la web, con espacios; al cargarla se escribe junto: 981116176) |

Cuando se defina su empresa: agregarla al final de la lista de sedes de `src/data/realOrg.ts`, regenerar y cargar.

## Lo que la web guarda y el sistema (todavía) no

Mapa de Google, foto y número de la sede en la web (para cuando se pasen los archivos y los mapas al sistema).

| Sede | Id en la web | Mapa | Foto |
|---|---|---|---|
| Los Olivos | 5 | [mapa](https://maps.app.goo.gl/V6BU6hs1KHxLb3yeA) | [foto](https://jtrugvxgztnxbhwjtiou.supabase.co/storage/v1/object/public/Filiales/los_olivos_1778176758423.png) |
| Piura | 1 | [mapa](https://maps.app.goo.gl/q1YKzNRmgxZ7JDD58) | [foto](https://jtrugvxgztnxbhwjtiou.supabase.co/storage/v1/object/public/Filiales/piura_1778176811322.webp) |
| Chiclayo | 2 | [mapa](https://maps.app.goo.gl/jDMpqd8e6nTFPYAK6) | [foto](https://jtrugvxgztnxbhwjtiou.supabase.co/storage/v1/object/public/Filiales/chiclayo_1778176353071.webp) |
| Cajamarca | 3 | [mapa](https://maps.app.goo.gl/KSk86c7ucQcdmTTM7) | [foto](https://jtrugvxgztnxbhwjtiou.supabase.co/storage/v1/object/public/Filiales/cajamarca_1778176331132.jpeg) |
| Trujillo | 4 | [mapa](https://maps.app.goo.gl/pVePrPXkWWpyyvxdA) | [foto](https://jtrugvxgztnxbhwjtiou.supabase.co/storage/v1/object/public/Filiales/trujillo_1778177242819.png) |
| San Isidro | 6 | [mapa](https://maps.app.goo.gl/YewKJvyKrUFiUa5V6) | [foto](https://jtrugvxgztnxbhwjtiou.supabase.co/storage/v1/object/public/Filiales/san_isidro_1778176913932.png) |
| Huancayo | 7 | [mapa](https://maps.app.goo.gl/LtPAWUmtBaF8q6ot8) | [foto](https://jtrugvxgztnxbhwjtiou.supabase.co/storage/v1/object/public/Filiales/huancayo_1778176596042.webp) |
| Puno | 8 | [mapa](https://maps.app.goo.gl/YDWVAPVmq8yy99sn6) | [foto](https://jtrugvxgztnxbhwjtiou.supabase.co/storage/v1/object/public/Filiales/puno_1778176886640.webp) |
| Juliaca | 9 | [mapa](https://maps.app.goo.gl/RsMy7vTGKt1FFYr29) | [foto](https://jtrugvxgztnxbhwjtiou.supabase.co/storage/v1/object/public/Filiales/juliaca_1778176720849.png) |
| Arequipa | 10 | [mapa](https://maps.app.goo.gl/TkU657R3jqvUA84D8?g_st=ac) | [foto](https://jtrugvxgztnxbhwjtiou.supabase.co/storage/v1/object/public/Filiales/arequipa_1778176242815.webp) |
| Cusco Magisterio | 11 | [mapa](https://maps.app.goo.gl/aUpFLwEPvcgfzEcz8) | [foto](https://jtrugvxgztnxbhwjtiou.supabase.co/storage/v1/object/public/Filiales/cusco_magisterio_1778176415663.jpeg) |
| Cusco Marcavalle | 12 | [mapa](https://maps.app.goo.gl/4fLD7QmMcLmjpF44A) | [foto](https://jtrugvxgztnxbhwjtiou.supabase.co/storage/v1/object/public/Filiales/cusco_marcavalle_1778176508264.webp) |
| Tacna | 13 | [mapa](https://maps.app.goo.gl/QsM1r7N7YJJfqbvc8) | [foto](https://jtrugvxgztnxbhwjtiou.supabase.co/storage/v1/object/public/Filiales/tacna_1778177208868.jpeg) |
| Huaraz | 14 | [mapa](https://maps.app.goo.gl/kmChH4DBozHcWyYL8) | [foto](https://jtrugvxgztnxbhwjtiou.supabase.co/storage/v1/object/public/Filiales/huaraz_1778176635989.png) |
| Ica | 15 | [mapa](https://maps.app.goo.gl/zfvzJ9DpZN8r1W2d9) | [foto](https://jtrugvxgztnxbhwjtiou.supabase.co/storage/v1/object/public/Filiales/ica_1778176668860.png) |
| Ayacucho | 16 | [mapa](https://maps.app.goo.gl/sXsuE3qKsjC1U6jp6) | [foto](https://jtrugvxgztnxbhwjtiou.supabase.co/storage/v1/object/public/Filiales/ayacucho_1778176309907.png) |
| Ilo | 19 | [mapa](https://maps.app.goo.gl/8mXYqLaT4jyY3sor9) | [foto](https://jtrugvxgztnxbhwjtiou.supabase.co/storage/v1/object/public/Filiales/ilo_1793060047451.png) |

## Decisiones y notas

- **Piura** figuraba dos veces en la tabla de empresas (Colegio Ensil y Ensil Evolution). El usuario aclaró que **la de Colegio Ensil no cuenta**: Piura es de **ENSIL EVOLUTION S.R.L.** Como la sede ya existía con Colegio Ensil, el script le corrige la empresa. Por eso **Colegio Ensil de las Américas queda sin sedes** por ahora (el usuario lo confirmó).
- **San Isidro** es de Ensil Evolution. **Ilo** se carga después (ver arriba): el usuario confirmó que **de momento no será registrada**.
- **Nombres:** se usan los de la web (`Cajamarca`, `Cusco Magisterio`, `Cusco Marcavalle`). Los 9 nombres que usan los datos de ejemplo del sistema (Piura, Chiclayo, Cajamarca, Los Olivos, San Isidro, Huancayo, Puno, Juliaca y Tacna) existen todos en la base. El nombre de una sede no se puede repetir.
- **Limpieza al cargar:** el enlace de mapa de Cajamarca traía un salto de línea escrito en el texto (`\r\n`) y se quitó; la dirección de Arequipa traía un espacio doble y quedó con uno.
- **Los datos no se tocaron** salvo lo anterior: «Urb. san juan» (Chiclayo) y «Mz K Teniente 14» (Ayacucho) quedan como están en la web; se corrigen en Organización → Filiales si hace falta.
- **La pantalla no cambia la empresa de una sede ya creada**: un cambio así se hace por SQL (así se corrigió Piura).
