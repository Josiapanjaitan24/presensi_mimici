-- 004_single_admin_constraint.sql
-- Memastikan secara ketat bahwa hanya ada maksimal 1 akun administrator di seluruh sistem
-- untuk mencegah pembuatan akun admin liar / backdoor dan mengurangi risiko peretasan.

CREATE UNIQUE INDEX IF NOT EXISTS uq_pengguna_single_admin 
  ON pengguna (peran) 
  WHERE peran = 'admin';

