/**
 * La CA raíz de Supabase — `Supabase Root 2021 CA`.
 *
 * POR QUÉ ESTÁ AQUÍ Y NO UN `rejectUnauthorized: false`
 *
 * El pooler de Supabase no usa un certificado de una autoridad pública: usa la
 * suya, que no está en el almacén de confianza de Node. Ante eso, lo que se copia
 * de los tutoriales es apagar la verificación — y eso convierte el cifrado en
 * decoración: se sigue cifrando, pero contra cualquiera que se ponga en medio,
 * porque ya no se comprueba con quién se habla. En una conexión que lleva
 * direcciones de correo de personas, eso no vale.
 *
 * Anclando esta raíz se verifica de verdad: la cadena entera Y el nombre del
 * servidor. Comprobado contra el pooler real: sin ella, `SELF_SIGNED_CERT_IN_CHAIN`;
 * con ella, `authorized: true` frente a `*.pooler.supabase.com`.
 *
 * ES UN CERTIFICADO PÚBLICO, NO UN SECRETO. Sólo sirve para comprobar la
 * identidad del servidor: no abre nada, no autentica a nadie y no da acceso.
 *
 * PROCEDENCIA — y su límite, que conviene conocer
 *
 * Se extrajo de la cadena que presenta el propio servidor, porque Supabase sólo
 * publica el fichero desde el panel autenticado (su antigua descarga pública
 * responde 404). Eso significa que su autenticidad descansa en que aquella
 * primera conexión fuese legítima. Cerrar el círculo cuesta una comprobación,
 * que se hace UNA vez y ya nunca más:
 *
 *   Panel de Supabase → Project Settings → Database → SSL Configuration →
 *   «Download certificate», y comparar la huella del fichero con ésta:
 *
 *     SHA-256  80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:
 *              82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA
 *     SHA-1    A4:51:8A:09:33:AF:69:49:48:2C:CA:30:14:C0:07:C3:69:DF:9F:6F
 *
 * Caduca el 26 de abril de 2031. Ese día habrá que sustituirla, y el síntoma será
 * inconfundible: todas las consultas fallarán con un error de certificado.
 *
 * Va en un módulo de TypeScript y no en un `.crt` suelto a propósito: así el
 * empaquetador se lo lleva dentro de la función sin servidor. Un `readFileSync`
 * de un fichero de `lib/` funciona en local y falla en producción.
 */
export const CA_SUPABASE = `-----BEGIN CERTIFICATE-----
MIIDxDCCAqygAwIBAgIUbLxMod62P2ktCiAkxnKJwtE9VPYwDQYJKoZIhvcNAQEL
BQAwazELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5l
dyBDYXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJh
c2UgUm9vdCAyMDIxIENBMB4XDTIxMDQyODEwNTY1M1oXDTMxMDQyNjEwNTY1M1ow
azELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5ldyBD
YXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJhc2Ug
Um9vdCAyMDIxIENBMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqQXW
QyHOB+qR2GJobCq/CBmQ40G0oDmCC3mzVnn8sv4XNeWtE5XcEL0uVih7Jo4Dkx1Q
DmGHBH1zDfgs2qXiLb6xpw/CKQPypZW1JssOTMIfQppNQ87K75Ya0p25Y3ePS2t2
GtvHxNjUV6kjOZjEn2yWEcBdpOVCUYBVFBNMB4YBHkNRDa/+S4uywAoaTWnCJLUi
cvTlHmMw6xSQQn1UfRQHk50DMCEJ7Cy1RxrZJrkXXRP3LqQL2ijJ6F4yMfh+Gyb4
O4XajoVj/+R4GwywKYrrS8PrSNtwxr5StlQO8zIQUSMiq26wM8mgELFlS/32Uclt
NaQ1xBRizkzpZct9DwIDAQABo2AwXjALBgNVHQ8EBAMCAQYwHQYDVR0OBBYEFKjX
uXY32CztkhImng4yJNUtaUYsMB8GA1UdIwQYMBaAFKjXuXY32CztkhImng4yJNUt
aUYsMA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBAB8spzNn+4VU
tVxbdMaX+39Z50sc7uATmus16jmmHjhIHz+l/9GlJ5KqAMOx26mPZgfzG7oneL2b
VW+WgYUkTT3XEPFWnTp2RJwQao8/tYPXWEJDc0WVQHrpmnWOFKU/d3MqBgBm5y+6
jB81TU/RG2rVerPDWP+1MMcNNy0491CTL5XQZ7JfDJJ9CCmXSdtTl4uUQnSuv/Qx
Cea13BX2ZgJc7Au30vihLhub52De4P/4gonKsNHYdbWjg7OWKwNv/zitGDVDB9Y2
CMTyZKG3XEu5Ghl1LEnI3QmEKsqaCLv12BnVjbkSeZsMnevJPs1Ye6TjjJwdik5P
o/bKiIz+Fq8=
-----END CERTIFICATE-----
`;
