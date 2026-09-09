-- Add area_cerrada column to ocupacion_habitaciones table
ALTER TABLE public.ocupacion_habitaciones 
ADD COLUMN area_cerrada BOOLEAN NULL DEFAULT false;
