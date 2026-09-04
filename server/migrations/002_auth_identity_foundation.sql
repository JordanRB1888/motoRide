-- +58Express AUTH-FINAL-1
-- Identidad canonica: USER != AUTH IDENTITY != VERIFIED CONTACT, y desafios OTP.
--
-- Las tablas ya las crea el backend al arrancar (una por cada nombre de
-- PERSISTED_TABLES), asi que aqui son idempotentes. Lo que esta migracion
-- aporta son las RESTRICCIONES: la unicidad no puede depender solo de que el
-- codigo compruebe antes de insertar, porque dos peticiones simultaneas ven el
-- mismo «no existe». SQLite admite indices sobre expresiones json_extract, y
-- con ellos el motor es la ultima autoridad.

CREATE TABLE IF NOT EXISTS authIdentities (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS verifiedContacts (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS authChallenges (id TEXT PRIMARY KEY, payload TEXT NOT NULL);

-- Una cuenta de Google o de Apple pertenece a UN solo User. Para PASSWORD el
-- subject es el id del User, asi que tambien garantiza una sola identidad de
-- contrasena por persona.
CREATE UNIQUE INDEX IF NOT EXISTS authIdentities_provider_subject_unique
  ON authIdentities (json_extract(payload, '$.provider'), json_extract(payload, '$.providerSubject'));
CREATE INDEX IF NOT EXISTS authIdentities_user_idx
  ON authIdentities (json_extract(payload, '$.userId'));

-- Un User no repite el mismo contacto; y un contacto VERIFICADO tiene un
-- solo dueno en todo el sistema. Sin verificar puede aparecer en varias
-- cuentas: aparecer en un registro no demuestra posesion.
CREATE UNIQUE INDEX IF NOT EXISTS verifiedContacts_user_type_value_unique
  ON verifiedContacts (json_extract(payload, '$.userId'), json_extract(payload, '$.type'), json_extract(payload, '$.valueNormalized'));
CREATE UNIQUE INDEX IF NOT EXISTS verifiedContacts_verified_owner_unique
  ON verifiedContacts (json_extract(payload, '$.type'), json_extract(payload, '$.valueNormalized'))
  WHERE json_extract(payload, '$.verifiedAt') IS NOT NULL;

-- Los desafios se buscan por destino y proposito, y se barren por vencimiento.
CREATE INDEX IF NOT EXISTS authChallenges_destination_purpose_idx
  ON authChallenges (json_extract(payload, '$.destination'), json_extract(payload, '$.purpose'));
CREATE INDEX IF NOT EXISTS authChallenges_expires_idx
  ON authChallenges (json_extract(payload, '$.expiresAt'));
