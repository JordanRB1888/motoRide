/**
 * Fragmento REAL de la portada de https://www.bcv.org.ve/, capturado el
 * 2026-08-30 con la cadena TLS completa verificada.
 *
 * Se guarda un fragmento y no los 151 KB de la página entera porque lo que hay
 * que fijar es la FORMA de la que depende el parser: el bloque `id="dolar"`,
 * el valor en formato venezolano y la fecha valor legible por máquina. Incluye
 * a propósito las monedas vecinas (euro, yuan, lira, rublo), porque parte de lo
 * que se comprueba es que el parser no las confunda con el dólar.
 *
 * Si el BCV cambia su maquetación, las pruebas que usan este fixture seguirán
 * pasando y las que salen a la red fallarán. Eso es lo correcto: este fixture
 * documenta el contrato contra el que se escribió el parser, y su desajuste con
 * la realidad es justo lo que hay que detectar y revisar a mano.
 */

export const PORTADA_BCV_REAL = '</div>\n</div>    \n          <div id="lira" class="col-sm-12 col-xs-12">        \n\t<div class="field-content">\n  \t\t<div class="row recuadrotsmc">\n\t\t\t<div class="col-sm-6 col-xs-6">\n  \t\t\t<img src="/sites/default/files/default_images/lirat-04_0.png" class="icono_bss_blanco1">\n  \t\t        <span> TRY</span>\t </div>\n<div class="col-sm-6 col-xs-6 centrado textp"><strong class="strong-tb">16,47982495</strong> </div>\n\t        </div>  \n        </div>\n</div>    \n          <div id="rublo" class="col-sm-12 col-xs-12 ">             \n\t<div class="field-content">\n  \t\t<div class="row recuadrotsmc">\n\t\t\t<div class="col-sm-6 col-xs-6">\n  \t\t\t<img src="/sites/default/files/rublo-04_2.png" class="icono_bss_blanco1">\n  \t\t        <span> RUB</span>\t </div>\n<div class="col-sm-6 col-xs-6 centrado textp"><strong class="strong-tb"> 9,22739438</strong></div>\n\t        </div>  \n        </div>\n</div>    \n          <div id="dolar" class="col-sm-12 col-xs-12 ">        \n\t<div class="field-content">\n  \t\t<div class="row recuadrotsmc">\n\t\t\t<div class="col-sm-6 col-xs-6">\n  \t\t\t<img src="/sites/default/files/dollar-04_2.png" class="icono_bss_blanco1"> \t\t\n  \t\t        <span> USD</span>\t </div>\n                         <div class="col-sm-6 col-xs-6 centrado textp"> <strong class="strong-tb">794,99170000</strong>  </div>\n\t        </div>  \n        </div>\n</div>    \n          <div class="pull-right dinpro center">\nFecha Valor: <span class="date-display-single" property="dc:date" datatype="xsd:dateTime" content="2026-08-31T00:00:00-04:00">Lunes, 31 Agosto  2026</span>\n<hr>\n</div>';

/** La tasa que contiene el fragmento anterior, para las aserciones. */
export const TASA_ESPERADA = '794.99170000';
export const FECHA_VALOR_ESPERADA = '2026-08-31';
