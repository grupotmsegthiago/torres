-- Bomba e tela do vigilante informam litros e R$/L com 3 casas.
-- numeric(10,2) arredondava o terceiro dígito na gravação.
ALTER TABLE vehicle_fueling
  ALTER COLUMN liters TYPE numeric(10,3),
  ALTER COLUMN cost_per_liter TYPE numeric(10,3);
