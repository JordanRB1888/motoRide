/**
 * Los adaptadores de envio de codigos: WhatsApp, SMS y correo.
 *
 * NINGUNO ENVIA NADA TODAVIA
 *
 * Esta fase deja el contrato de cada proveedor --que variables necesita, que
 * forma tiene la peticion, que devuelve-- sin fingir que funciona. Un
 * adaptador sabe decir si esta configurado y sabe construir la peticion que
 * mandaria; el transporte que la manda de verdad se inyecta, y hoy no se
 * inyecta ninguno. Asi el servicio de desafios se prueba entero con un
 * transporte falso y, cuando se decida activar un proveedor, lo unico que
 * cambia es la configuracion y el transporte.
 *
 * LA REGLA DE ORO
 *
 * El codigo en claro entra a `enviar()` y sale por el transporte. Ningun
 * adaptador lo registra, lo devuelve ni lo guarda. Los secretos de la
 * configuracion tampoco se devuelven: `faltan()` dice QUE variable falta, no
 * que valor tiene la que esta.
 */

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
    /** Lo que hay que hacer fuera del repo antes de que esto funcione. */
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
    nombre: 'SMTP transaccional',
    variables: Object.freeze(['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'EMAIL_FROM']),
    secretas: Object.freeze(['SMTP_PASSWORD']),
    configuracionManual: Object.freeze([
      'Dominio remitente con SPF, DKIM y DMARC publicados en DNS',
      'Cuenta SMTP transaccional (o API equivalente) con el remitente autorizado'
    ])
  })
});

/** El texto del codigo, comun a los tres canales. Corto, sin enlaces. */
export function textoDelCodigo(codigo) {
  return `Tu codigo de +58express es ${codigo}. Vence en 5 minutos. No lo compartas.`;
}

function variablesQueFaltan(contrato, env) {
  return contrato.variables.filter(nombre => String(env[nombre] ?? '').trim() === '');
}

/**
 * La peticion que cada proveedor recibiria. Es una funcion pura por canal:
 * se prueba mirando que el codigo va donde tiene que ir y a ningun otro sitio.
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
      body: { To: destination, From: env.TWILIO_SMS_FROM, Body: textoDelCodigo(codigo) }
    };
  }
  if (canal === 'EMAIL') {
    return {
      transport: { host: env.SMTP_HOST, port: Number(env.SMTP_PORT), user: env.SMTP_USER },
      message: {
        from: env.EMAIL_FROM,
        to: destination,
        subject: 'Tu codigo de +58express',
        text: textoDelCodigo(codigo)
      }
    };
  }
  throw new Error(`Canal desconocido: ${canal}`);
}

/**
 * Un adaptador por canal.
 *
 * `transporte(canal, peticion)` es quien mandaria la peticion de verdad.
 * Sin el, `enviar()` responde `PROVIDER_TRANSPORT_NOT_WIRED`: configurado
 * pero no cableado, que es exactamente el estado de esta fase.
 */
export function crearProveedores({ env = process.env, transporte = null } = {}) {
  const proveedores = {};
  for (const canal of Object.keys(CONTRATOS_DE_PROVEEDOR)) {
    const contrato = CONTRATOS_DE_PROVEEDOR[canal];
    proveedores[canal] = {
      canal,
      faltan: () => variablesQueFaltan(contrato, env),
      configurado: () => variablesQueFaltan(contrato, env).length === 0,
      async enviar({ destination, codigo }) {
        if (variablesQueFaltan(contrato, env).length > 0) {
          return { delivered: false, reason: 'PROVIDER_NOT_CONFIGURED' };
        }
        if (typeof transporte !== 'function') {
          return { delivered: false, reason: 'PROVIDER_TRANSPORT_NOT_WIRED' };
        }
        const peticion = construirPeticion(canal, { env, destination, codigo });
        try {
          const respuesta = await transporte(canal, peticion);
          return respuesta?.delivered === true
            ? { delivered: true, reason: null }
            : { delivered: false, reason: respuesta?.reason ?? 'PROVIDER_REJECTED' };
        } catch {
          // El error del transporte podria arrastrar la peticion entera --y
          // con ella el codigo y el token--, asi que no se propaga ni se
          // registra: solo el motivo.
          return { delivered: false, reason: 'PROVIDER_TRANSPORT_ERROR' };
        }
      }
    };
  }
  return proveedores;
}

/**
 * El estado de configuracion de los tres canales, para el informe y para el
 * arranque. Solo nombres de variables: nunca valores.
 */
export function describirConfiguracion(env = process.env) {
  return Object.fromEntries(
    Object.entries(CONTRATOS_DE_PROVEEDOR).map(([canal, contrato]) => [
      canal,
      {
        nombre: contrato.nombre,
        configurado: variablesQueFaltan(contrato, env).length === 0,
        faltan: variablesQueFaltan(contrato, env),
        configuracionManual: contrato.configuracionManual
      }
    ])
  );
}
