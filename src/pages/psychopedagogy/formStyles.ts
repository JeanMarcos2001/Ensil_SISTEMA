/**
 * Estilos de formulario de las ventanas emergentes de Psicopedagogía.
 * Mismo estándar que Operación → Matrículas (asistente) y Pagos:
 *  - etiqueta: text-sm font-medium text-text-secondary
 *  - campo: alto 40 px (h-10), bordes redondeados rounded-xl, texto text-sm
 *  - título de sección: text-base font-semibold
 * Los modificadores `!` se usan porque Input/Select (componentes compartidos) traen sus propios estilos base.
 */

export const labelCls = 'block text-sm font-medium text-text-secondary mb-1.5';

/** Para el componente <Input>. */
export const inputCls = 'h-10 py-0! rounded-xl! text-sm focus:ring-0! focus:border-primary-accent!';

/** Para el componente <Select> (deja espacio a la flecha). */
export const selectCls = 'h-10 py-0! pr-9! rounded-xl! text-sm focus:ring-0! focus:border-primary-accent!';

/** Para <textarea> nativos. */
export const textareaCls =
  'w-full bg-surface border border-border-soft rounded-xl p-3 text-sm focus:outline-none focus:border-primary-accent resize-none';

/** Para <select> / <input> nativos. */
export const nativeFieldCls =
  'w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:outline-none focus:border-primary-accent';
