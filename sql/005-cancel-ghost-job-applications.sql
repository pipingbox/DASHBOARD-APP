-- 005-cancel-ghost-job-applications.sql
-- PB-DRIFT-001 seccion A7.1
-- Aplicado en produccion el 2026-08-09 (migracion job_applications_add_cancellation_audit_columns
-- + UPDATE posterior). Este fichero deja el cambio reproducible desde el repositorio.
--
-- Contexto: la aplicacion desplegada en app.pipingbox.com inyectaba 16 ofertas de empleo
-- fabricadas, atribuidas a empresas reales, con id sintetico `static-N`. Eran postulables.
-- Al postularse, la fila se insertaba sin job_id y sin company_user_id, y el usuario recibia
-- un mensaje de envio correcto. 27 candidaturas de 10 cuentas quedaron asi.
--
-- Ninguna fila se borra: son la prueba del incidente y la base para notificar a los afectados.

-- 1. Columnas de auditoria de anulacion.
--    previous_status es imprescindible: sin ella, marcar `cancelled` destruiria la evidencia
--    de que se habian asignado estados `rejected` y `hired` sobre ofertas inexistentes.

alter table public.app_14da0f1941_job_applications
  add column if not exists previous_status      text,
  add column if not exists cancelled_at         timestamptz,
  add column if not exists cancellation_reason  text;

comment on column public.app_14da0f1941_job_applications.previous_status is
  'Estado que tenia la candidatura antes de una anulacion de oficio. Preserva la evidencia: sin esta columna, marcar cancelled borraria el rastro de los estados rejected/hired asignados sobre ofertas inexistentes (PB-DRIFT-001 A7.1).';

comment on column public.app_14da0f1941_job_applications.cancelled_at is
  'Momento de la anulacion de oficio.';

comment on column public.app_14da0f1941_job_applications.cancellation_reason is
  'Motivo de la anulacion de oficio, redactado para ser legible sin contexto anos despues.';

-- 2. Anulacion de oficio.
--    El criterio es `job_id is null`: toda candidatura legitima lleva job_id porque el codigo
--    solo lo omitia en la rama de los ids sinteticos. Verificado antes de ejecutar: 27 filas
--    con job_id nulo, 1 fila legitima con job_id.

update public.app_14da0f1941_job_applications
set previous_status = status,
    status = 'cancelled',
    cancelled_at = now(),
    cancellation_reason =
      'Oferta inexistente. Esta candidatura se envio a una oferta de empleo fabricada que la aplicacion desplegada en app.pipingbox.com inyectaba en el listado con un id sintetico (static-N) y una fecha de publicacion simulada. La empresa nombrada nunca se dio de alta en la plataforma y nunca recibio la candidatura: la fila se guardo sin job_id y sin company_user_id, y aun asi se mostro al usuario un mensaje de envio correcto. '
      'El estado anterior queda en previous_status. Ninguno de esos estados refleja una decision de la empresa nombrada: los valores rejected, hired, shortlisted, reviewed e interview los asigno una cuenta administradora recorriendo el panel de candidatos sobre ofertas que no existian. '
      'La tabla no tiene disparadores y la aplicacion en produccion solo muestra al trabajador el numero de candidaturas, no su estado, de modo que en ningun momento se comunico a ninguna persona un rechazo ni una contratacion. '
      'Anulada de oficio el 2026-08-09 en aplicacion de PB-DRIFT-001 seccion A7.1. No se borra ninguna fila: son la prueba del incidente y la base para notificar a los afectados.'
where job_id is null
  and status <> 'cancelled';

-- 3. Verificacion.
--    Esperado: 27 filas cancelled con motivo y fecha; previous_status reparte
--    applied 15, rejected 7, shortlisted 2, hired 1, interview 1, reviewed 1.
--    Y 1 fila intacta con job_id no nulo.

-- select status, previous_status, count(*)
-- from public.app_14da0f1941_job_applications
-- group by status, previous_status
-- order by status, previous_status;
