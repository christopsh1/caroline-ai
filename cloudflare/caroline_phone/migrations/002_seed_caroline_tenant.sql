BEGIN;

INSERT INTO tenants (tenant_key, name, status)
VALUES ('caroline', 'Caroline', 'active')
ON CONFLICT (tenant_key) DO UPDATE
SET name = EXCLUDED.name,
    status = 'active',
    updated_at = now();

COMMIT;
