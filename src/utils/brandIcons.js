/**
 * Logotipos de los proveedores de acceso.
 *
 * Van aparte de `icons.js` porque son de otra naturaleza: aquel dibuja trazos
 * con `currentColor` y estos son marcas con sus propios rellenos, que no deben
 * heredar el color del texto ni el grosor de línea. Mezclarlos obligaría a
 * llenar el helper compartido de excepciones.
 *
 * Los tres son SVG en línea: no hay peticiones a servidores de terceros, ni
 * fuentes de iconos externas, ni nada que cargar desde fuera. Una imagen remota
 * en la pantalla de entrada delataría a cada visitante ante el proveedor antes
 * incluso de que decida usarlo.
 */

const MARCAS = {
  // La «G» en sus cuatro colores oficiales.
  google: `
    <path fill="#4285F4" d="M23.06 12.25c0-.85-.08-1.67-.22-2.45H12v4.63h6.2a5.3 5.3 0 0 1-2.3 3.48v2.89h3.72c2.18-2 3.44-4.96 3.44-8.55z"/>
    <path fill="#34A853" d="M12 23.5c3.11 0 5.72-1.03 7.62-2.79l-3.72-2.89c-1.03.69-2.35 1.1-3.9 1.1-3 0-5.54-2.03-6.45-4.75H1.7v2.98A11.5 11.5 0 0 0 12 23.5z"/>
    <path fill="#FBBC05" d="M5.55 14.17a6.9 6.9 0 0 1 0-4.34V6.85H1.7a11.5 11.5 0 0 0 0 10.3l3.85-2.98z"/>
    <path fill="#EA4335" d="M12 5.08c1.69 0 3.21.58 4.4 1.72l3.3-3.3C17.72 1.63 15.11.5 12 .5A11.5 11.5 0 0 0 1.7 6.85l3.85 2.98C6.46 7.11 9 5.08 12 5.08z"/>
  `,
  // La «f» sobre su azul de marca.
  facebook: `
    <path fill="#1877F2" d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.96h-1.51c-1.49 0-1.96.93-1.96 1.89v2.26h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z"/>
    <path fill="#fff" d="M16.67 15.56l.53-3.49h-3.33V9.81c0-.96.47-1.89 1.96-1.89h1.51V4.96s-1.37-.24-2.68-.24c-2.74 0-4.53 1.67-4.53 4.69v2.66H7.08v3.49h3.05V24a12.1 12.1 0 0 0 3.74 0v-8.44h2.8z"/>
  `,
  // La manzana, monocroma: hereda el color del texto para que funcione igual
  // en claro y en oscuro, que es como la propia Apple lo especifica.
  apple: `
    <path fill="currentColor" d="M17.05 12.79c-.03-2.9 2.37-4.3 2.48-4.37-1.35-1.98-3.46-2.25-4.21-2.28-1.79-.18-3.5 1.06-4.41 1.06-.91 0-2.31-1.03-3.8-1-1.96.03-3.76 1.14-4.77 2.89-2.03 3.53-.52 8.76 1.46 11.62.97 1.4 2.12 2.97 3.63 2.91 1.46-.06 2.01-.94 3.77-.94 1.76 0 2.26.94 3.8.91 1.57-.03 2.56-1.42 3.52-2.83 1.11-1.62 1.57-3.19 1.6-3.27-.04-.02-3.07-1.18-3.1-4.7zM14.2 4.15c.8-.98 1.35-2.33 1.2-3.68-1.16.05-2.57.78-3.4 1.75-.74.86-1.39 2.24-1.22 3.56 1.3.1 2.62-.66 3.42-1.63z"/>
  `
};

/** Nombres admitidos, para que una errata no pinte un botón vacío. */
export const BRANDS = Object.freeze(Object.keys(MARCAS));

/**
 * SVG de la marca. `aria-hidden` porque el nombre del proveedor ya va escrito
 * al lado: quien use un lector de pantalla no necesita oírlo dos veces.
 */
export function brandIcon(name, size = 18) {
  const marca = MARCAS[name];
  if (!marca) return '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" focusable="false" class="brand-icon brand-icon-${name}">${marca}</svg>`;
}
