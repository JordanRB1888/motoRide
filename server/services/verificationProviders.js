/**
 * Los adaptadores de envio de codigos: WhatsApp, SMS y correo.
 *
 * EL DOMINIO NO CONOCE MARCAS
 *
 * Arriba se habla de WHATSAPP, SMS y EMAIL. Meta, Twilio, Resend y SendGrid
 * viven aqui dentro y en ningun otro sitio. Cambiar de proveedor es cambiar
 * un adaptador, no tocar el desafio ni las rutas.
 *
 * CONTRATO DE UN ADAPTADOR
 *
 *   describe()     -- proveedor, variables que necesita, configuracion manual
 *   configurado()  -- si tiene todo lo que necesita
 *   faltan()       -- QUE variables faltan (nombres; jamas valores)
 *   enviar(...)    -- manda el codigo y devuelve un resultado TRI-VALUADO
 *   healthCheck()  -- si el proveedor responde, sin mandar ningun mensaje
 *
 * EL TRANSPORTE SE INYECTA
 *
 * Por omision no hay ninguno, y `enviar` responde
 * `PROVIDER_TRANSPORT_NOT_WIRED`: montar esto sin transporte es un error de
 * programacion, no un estado de produccion. `index.js` cablea el transporte
 * HTTP real; las pruebas inyectan uno que captura.
 *
 * LO QUE VIAJA EN EL MENSAJE
 *
 * El nombre del servicio, seis cifras y el aviso de no compartirlo. Nada mas:
 * ni nombre de la persona, ni documentos, ni enlaces, ni contrasenas.
 *
 * NUNCA SE REGISTRA NADA: ni el codigo, ni el destino, ni el token del
 * proveedor. `faltan()` dice que variable falta, no que valor tiene.
 */
import { RESULTADO_DE_ENVIO } from './verificationTransport.js';

/** El texto del codigo, comun a los tres canales. Corto, sin enlaces. */
export function textoDelCodigo(codigo) {
  return `Tu codigo de verificacion de +58Express es ${codigo}. Vence en 5 minutos. No lo compartas con nadie.`;
}

export const ASUNTO_DEL_CORREO = 'Tu codigo de verificacion de +58Express';

/**
 * El correo en texto plano. Sin imagenes, sin pixel de seguimiento, sin
 * enlaces: un correo de codigo que pide un clic ensena justo lo contrario de
 * lo que hay que ensenar sobre el phishing.
 */
export function cuerpoDelCorreo(codigo) {
  return [
    'Tu codigo de verificacion de +58Express es:',
    '',
    codigo,
    '',
    'Vence en 5 minutos y solo puede usarse una vez.',
    'No lo compartas con nadie. El personal de +58Express nunca te lo pedira.',
    '',
    'Si no pediste este codigo, ignora este mensaje.'
  ].join('\n');
}

/**
 * Los proveedores de correo admitidos. Se elige con `EMAIL_PROVIDER`; los dos
 * hacen lo mismo por HTTP y se configuran igual de rapido.
 */
const PROVEEDORES_DE_CORREO = Object.freeze({
  resend: Object.freeze({
    nombre: 'Resend',
    variables: Object.freeze(['EMAIL_PROVIDER', 'RESEND_API_KEY', 'EMAIL_FROM']),
    secretas: Object.freeze(['RESEND_API_KEY']),
    peticion: (env, destination, codigo) => ({
      method: 'POST',
      url: 'https://api.resend.com/emails',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: { from: env.EMAIL_FROM, to: [destination], subject: ASUNTO_DEL_CORREO, text: cuerpoDelCorreo(codigo) }
    }),
    salud: env => ({
      method: 'GET',
      url: 'https://api.resend.com/domains',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}` }
    })
  }),
  sendgrid: Object.freeze({
    nombre: 'SendGrid',
    variables: Object.freeze(['EMAIL_PROVIDER', 'SENDGRID_API_KEY', 'EMAIL_FROM']),
    secretas: Object.freeze(['SENDGRID_API_KEY']),
    peticion: (env, destination, codigo) => ({
      method: 'POST',
      url: 'https://api.sendgrid.com/v3/mail/send',
      headers: { authorization: `Bearer ${env.SENDGRID_API_KEY}`, 'content-type': 'application/json' },
      body: {
        personalizations: [{ to: [{ email: destination }] }],
        from: { email: env.EMAIL_FROM, name: '+58Express' },
        subject: ASUNTO_DEL_CORREO,
        content: [{ type: 'text/plain', value: cuerpoDelCorreo(codigo) }]
      }
    }),
    salud: env => ({
      method: 'GET',
      url: 'https://api.sendgrid.com/v3/scopes',
      headers: { authorization: `Bearer ${env.SENDGRID_API_KEY}` }
    })
  })
});

export const PROVEEDORES_DE_CORREO_ADMITIDOS = Object.freeze(Object.keys(PROVEEDORES_DE_CORREO));

/** Cual de los proveedores de correo esta elegido. `resend` por omision. */
function proveedorDeCorreo(env) {
  const elegido = String(env.EMAIL_PROVIDER ?? '').trim().toLowerCase();
  return PROVEEDORES_DE_CORREO[elegido] ?? PROVEEDORES_DE_CORREO.resend;
}

export const CONTRATOS_DE_PROVEEDOR = Object.freeze({
  WHATSAPP: Object.freeze({
    nombre: 'Meta WhatsApp Cloud API (plantilla de autenticacion)',
    variables: Object.freeze([
      'WHATSAPP_CLOUD_ACCESS_TOKEN',
      'WHATSAPP_CLOUD_PHONE_NUMBER_ID',
      'WHATSAPP_OTP_TEMPLATE_NAME',
      'WHATSAPP_OTP_TEMPLATE_LANGUAGE'
    ]),
    secretas: Object.freeze(['WHATSAPP_CLOUD_ACCESS_TOKEN']),
    configuracionManual: Object.freeze([
      'Cuenta de Meta Business verificada y una WhatsApp Business Account',
      'Numero de telefono de empresa dado de alta en la Cloud API',
      'Plantilla de tipo AUTHENTICATION aprobada por Meta, con boton de copia',
      'Token de acceso de sistema (no de usuario) con permiso whatsapp_business_messaging'
    ])
  }),
  SMS: Object.freeze({
    nombre: 'Twilio Programmable Messaging',
    variables: Object.freeze(['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_SMS_FROM']),
    secretas: Object.freeze(['TWILIO_AUTH_TOKEN']),
    configuracionManual: Object.freeze([
      'Cuenta de Twilio con saldo y un numero o Sender ID habilitado para Venezuela',
      'Registro del remitente si el operador lo exige'
    ])
  }),
  EMAIL: Object.freeze({
    // El nombre y las variables dependen del proveedor elegido: se resuelven
    // en `describir`. Aqui queda lo que no cambia.
    nombre: 'Correo transaccional por API HTTP (Resend o SendGrid)',
    variables: Object.freeze(['EMAIL_PROVIDER', 'RESEND_API_KEY', 'EMAIL_FROM']),
    secretas: Object.freeze(['RESEND_API_KEY', 'SENDGRID_API_KEY']),
    configuracionManual: Object.freeze([
      'Cuenta en Resend o en SendGrid (elegir con EMAIL_PROVIDER)',
      'Dominio remitente verificado en el proveedor, con SPF y DKIM publicados en DNS',
      'Clave de API con permiso de envio unicamente'
    ])
  })
});

/** El contrato vigente de un canal, ya resuelto contra el entorno. */
export function contratoDe(canal, env = process.env) {
  if (canal !== 'EMAIL') return CONTRATOS_DE_PROVEEDOR[canal];
  const correo = proveedorDeCorreo(env);
  return {
    ...CONTRATOS_DE_PROVEEDOR.EMAIL,
    nombre: `Correo transaccional: ${correo.nombre}`,
    variables: correo.variables,
    secretas: correo.secretas
  };
}

function variablesQueFaltan(canal, env) {
  return contratoDe(canal, env).variables.filter(nombre => {
    // `EMAIL_PROVIDER` tiene valor por omision: no falta, se elige.
    if (nombre === 'EMAIL_PROVIDER') return false;
    return String(env[nombre] ?? '').trim() === '';
  });
}

/**
 * La peticion que recibe cada proveedor. Funcion pura por canal: se prueba
 * mirando que el codigo va donde tiene que ir y a ningun otro sitio.
 * `to` en Meta va sin `+`; en Twilio, en E.164 con `+`.
 */
export function construirPeticion(canal, { env, destination, codigo }) {
  if (canal === 'WHATSAPP') {
    return {
      method: 'POST',
      url: `https://graph.facebook.com/v20.0/${env.WHATSAPP_CLOUD_PHONE_NUMBER_ID}/messages`,
      headers: { authorization: `Bearer ${env.WHATSAPP_CLOUD_ACCESS_TOKEN}`, 'content-type': 'application/json' },
      body: {
        messaging_product: 'whatsapp',
        to: destination.replace(/^\+/, ''),
        type: 'template',
        template: {
          name: env.WHATSAPP_OTP_TEMPLATE_NAME,
          language: { code: env.WHATSAPP_OTP_TEMPLATE_LANGUAGE },
          components: [
            { type: 'body', parameters: [{ type: 'text', text: codigo }] },
            { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: codigo }] }
          ]
        }
      }
    };
  }
  if (canal === 'SMS') {
    const credenciales = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64');
    return {
      method: 'POST',
      url: `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`,
      headers: { authorization: `Basic ${credenciales}`, 'content-type': 'application/x-www-form-urlencoded' },
      // Twilio quiere formulario, no JSON: el transporte lo codifica.
      form: { To: destination, From: env.TWILIO_SMS_FROM, Body: textoDelCodigo(codigo) }
    };
  }
  if (canal === 'EMAIL') return proveedorDeCorreo(env).peticion(env, destination, codigo);
  throw new Error(`Canal desconocido: ${canal}`);
}

/** La peticion de comprobacion de salud. No manda ningun mensaje. */
export function construirComprobacionDeSalud(canal, env) {
  if (canal === 'WHATSAPP') {
    return {
      method: 'GET',
      url: `https://graph.facebook.com/v20.0/${env.WHATSAPP_CLOUD_PHONE_NUMBER_ID}`,
      headers: { authorization: `Bearer ${env.WHATSAPP_CLOUD_ACCESS_TOKEN}` }
    };
  }
  if (canal === 'SMS') {
    const credenciales = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64');
    return {
      method: 'GET',
      url: `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}.json`,
      headers: { authorization: `Basic ${credenciales}` }
    };
  }
  if (canal === 'EMAIL') return proveedorDeCorreo(env).salud(env);
  throw new Error(`Canal desconocido: ${canal}`);
}

/**
 * Un adaptador por canal.
 *
 * `enviar` devuelve `{ resultado, motivo, latenciaMs }` con `resultado` en
 * `delivered | rejected | ambiguous`. Quien llama decide que hacer con cada
 * uno; aqui no se reintenta nunca.
 */
export function crearProveedores({ env = process.env, transporte = null } = {}) {
  const proveedores = {};
  for (const canal of Object.keys(CONTRATOS_DE_PROVEEDOR)) {
    proveedores[canal] = {
      canal,
      describe: () => {
        const contrato = contratoDe(canal, env);
        return {
          canal,
          proveedor: contrato.nombre,
          variables: [...contrato.variables],
          configuracionManual: [...contrato.configuracionManual]
        };
      },
      faltan: () => variablesQueFaltan(canal, env),
      configurado: () => variablesQueFaltan(canal, env).length === 0,

      async enviar({ destination, codigo }) {
        if (variablesQueFaltan(canal, env).length > 0) {
          return { resultado: RESULTADO_DE_ENVIO.RECHAZADO, motivo: 'PROVIDER_NOT_CONFIGURED', latenciaMs: 0 };
        }
        if (typeof transporte !== 'function') {
          return { resultado: RESULTADO_DE_ENVIO.RECHAZADO, motivo: 'PROVIDER_TRANSPORT_NOT_WIRED', latenciaMs: 0 };
        }
        let peticion;
        try {
          peticion = construirPeticion(canal, { env, destination, codigo });
        } catch {
          return { resultado: RESULTADO_DE_ENVIO.RECHAZADO, motivo: 'PROVIDER_REQUEST_INVALID', latenciaMs: 0 };
        }
        try {
          const respuesta = await transporte(canal, peticion);
          return {
            resultado: respuesta?.resultado ?? RESULTADO_DE_ENVIO.AMBIGUO,
            motivo: respuesta?.motivo ?? null,
            latenciaMs: respuesta?.latenciaMs ?? 0
          };
        } catch {
          // Si el transporte revienta, la peticion pudo haber salido. El error
          // no se propaga ni se registra: arrastraria la peticion entera, y con
          // ella el codigo y las credenciales.
          return { resultado: RESULTADO_DE_ENVIO.AMBIGUO, motivo: 'PROVIDER_TRANSPORT_ERROR', latenciaMs: 0 };
        }
      },

      /** Si el proveedor responde. No manda mensajes, no cuesta dinero. */
      async healthCheck() {
        if (variablesQueFaltan(canal, env).length > 0) return { ok: false, motivo: 'PROVIDER_NOT_CONFIGURED' };
        if (typeof transporte !== 'function') return { ok: false, motivo: 'PROVIDER_TRANSPORT_NOT_WIRED' };
        try {
          const respuesta = await transporte(canal, construirComprobacionDeSalud(canal, env));
          return respuesta?.resultado === RESULTADO_DE_ENVIO.ENTREGADO
            ? { ok: true, motivo: null }
            : { ok: false, motivo: respuesta?.motivo ?? 'PROVIDER_UNAVAILABLE' };
        } catch {
          return { ok: false, motivo: 'PROVIDER_TRANSPORT_ERROR' };
        }
      }
    };
  }
  return proveedores;
}

/**
 * El estado de configuracion de los tres canales, para el arranque, la ruta de
 * canales y el informe. Solo nombres de variables: nunca valores.
 */
export function describirConfiguracion(env = process.env) {
  return Object.fromEntries(
    Object.keys(CONTRATOS_DE_PROVEEDOR).map(canal => {
      const contrato = contratoDe(canal, env);
      return [
        canal,
        {
          nombre: contrato.nombre,
          configurado: variablesQueFaltan(canal, env).length === 0,
          faltan: variablesQueFaltan(canal, env),
          configuracionManual: [...contrato.configuracionManual]
        }
      ];
    })
  );
}
