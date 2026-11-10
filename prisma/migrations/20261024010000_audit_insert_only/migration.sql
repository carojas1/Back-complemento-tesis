-- Spec 109 FR-003: la auditoría solo admite INSERT. El trigger rechaza UPDATE y DELETE para cualquier usuario;
-- si existe el rol de la aplicación (app_user), además pierde esos permisos.
CREATE OR REPLACE FUNCTION audit_log_insert_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog es de solo inserción (spec 109)';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_insert_only
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_log_insert_only();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    REVOKE UPDATE, DELETE ON "AuditLog" FROM app_user;
  END IF;
END $$;
