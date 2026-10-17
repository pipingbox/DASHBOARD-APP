-- ══════════════════════════════════════════════════════════════════════════════
-- PB-CERT-AUTO-PROFILE-001 (corrección PO, revisión PR #83) —
-- APLICACIÓN ATÓMICA TRANSACCIONAL + PROTECCIÓN DE CERTIFICACIONES VERIFICADAS
--
-- MOTIVO (revisión PO del PR #83):
--   1. CONCURRENCIA: la versión anterior de cert-apply-draft leía el draft,
--      comprobaba estado y escribía en sentencias separadas. Dos
--      confirmaciones simultáneas del mismo draft podían pasar ambas el
--      chequeo pending_review y crear DOS certificaciones (o escribir en
--      parcial). Corrección: toda la lógica de aplicación se mueve a UNA
--      función PostgreSQL transaccional con SELECT ... FOR UPDATE sobre el
--      draft (y sobre la certificación destino). Las confirmaciones
--      concurrentes se serializan; la primera confirma, la segunda recibe
--      already_confirmed (idempotencia real en base de datos).
--   2. CERTIFICACIONES VERIFICADAS: los cinco campos extraíbles
--      (certification_name, issuing_organization, credential_id,
--      issue_date, expiry_date) forman parte de la ACREDITACIÓN. Un registro
--      con is_verified=true NO puede modificarlos por esta vía — ni
--      rellenando huecos ni con overwrite explícito — conservando la
--      verificación anterior: eso acreditaría datos que el circuito canónico
--      nunca verificó. Solo se admite el no-op (valor idéntico). Los cambios
--      sobre una certificación verificada requieren el circuito canónico
--      (renovación / re-verificación). El vínculo del documento
--      (storage_bucket/storage_path) sí puede completarse si falta: es un
--      metadato, no un dato de acreditación.
--
-- INVARIANTES CONSERVADAS:
--   * DRAFT FIRST: sin confirmación explícita no hay escritura.
--   * DECLARED/UNVERIFIED: INSERT nuevo → is_verified=false, verified_at=null.
--     UPDATE → is_verified/verified_at JAMÁS aparecen en el SET (el circuito
--     canónico de verificación es el único escritor de esos campos).
--   * Conflicto → respuesta con la lista de conflictos y CERO escrituras
--     (el patch se calcula completo antes de escribir nada).
--   * Cross-user: draft ajeno = draft_not_found (sin fuga de existencia);
--     target ajeno = target_not_owned.
--
-- SEGURIDAD:
--   * SECURITY INVOKER + search_path fijado.
--   * Solo la llama la Edge Function cert-apply-draft con la service key;
--     el p_user_id se deriva SIEMPRE del JWT verificado por la función, no
--     de la petición del cliente.
--   * EXECUTE revocado a PUBLIC/anon/authenticated; concedido a service_role.
--   * La función hace sus propios chequeos de ownership (service_role no
--     está sujeto a RLS).
--
-- IMPACTO EN ENTORNO COMPARTIDO (QA+prod comparten proyecto):
--   Aditivo: solo CREATE FUNCTION. Ninguna tabla, política o dato existente
--   se modifica. Nada invoca pb_cert_apply_draft hasta que se despliegue la
--   versión 2 de cert-apply-draft (frontend aún no desplegado en producción).
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.pb_cert_apply_draft(uuid, uuid, jsonb, uuid, boolean);
--   y redeploy del bundle anterior de cert-apply-draft. Los datos escritos
--   por esta función usan el mismo esquema que la versión anterior (no hay
--   cambio de formato); el rollback es seguro y sin pérdida.
--
-- APLICACIÓN: conforme al protocolo SQL. Idempotente (CREATE OR REPLACE).
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.pb_cert_apply_draft(
  p_draft_id uuid,
  p_user_id uuid,
  p_fields jsonb,
  p_target_certification_id uuid,
  p_reject_linked boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_draft app_cert_extraction_drafts%ROWTYPE;
  v_cert app_worker_certifications%ROWTYPE;
  v_has_target boolean := false;
  v_cert_id uuid;
  v_item jsonb;
  v_field_name text;
  v_column text;
  v_value text;
  v_current text;
  v_patch jsonb := '{}'::jsonb;
  v_conflicts jsonb := '[]'::jsonb;
  v_protected jsonb := '[]'::jsonb;
  v_confirmed_count int := 0;
  v_key text;
BEGIN
  -- ── Serialización e idempotencia ─────────────────────────────────────────
  -- SELECT ... FOR UPDATE: dos confirmaciones simultáneas del mismo draft se
  -- serializan aquí. La primera confirma; la segunda, tras adquirir el lock,
  -- ve review_confirmed y devuelve already_confirmed SIN reescribir nada.
  SELECT * INTO v_draft
    FROM app_cert_extraction_drafts
   WHERE id = p_draft_id
     AND user_id = p_user_id  -- cross-user = no encontrado (sin fuga de existencia)
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'draft_not_found';
  END IF;

  IF v_draft.extraction_status = 'review_confirmed' THEN
    RETURN jsonb_build_object(
      'status', 'already_confirmed',
      'certification_id', v_draft.linked_certification_id
    );
  END IF;

  IF v_draft.extraction_status <> 'pending_review' THEN
    RAISE EXCEPTION 'invalid_draft_state: %', v_draft.extraction_status;
  END IF;

  -- ── Destino: UPDATE de existente o INSERT nuevo ──────────────────────────
  IF p_target_certification_id IS NOT NULL THEN
    v_cert_id := p_target_certification_id;
  ELSIF NOT COALESCE(p_reject_linked, false)
        AND v_draft.linked_certification_id IS NOT NULL THEN
    v_cert_id := v_draft.linked_certification_id;
  END IF;

  IF v_cert_id IS NOT NULL THEN
    -- FOR UPDATE sobre el destino: updates concurrentes al MISMO registro
    -- (p. ej. dos drafts distintos vinculados a la misma certificación) se
    -- serializan; nunca hay escritura parcial entrelazada.
    SELECT * INTO v_cert
      FROM app_worker_certifications
     WHERE id = v_cert_id
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'target_not_found';
    END IF;
    IF v_cert.user_id IS DISTINCT FROM p_user_id THEN
      RAISE EXCEPTION 'target_not_owned';
    END IF;
    v_has_target := true;
    v_cert_id := v_cert.id;
  END IF;

  -- ── Resolución campo a campo (sin escrituras todavía) ────────────────────
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_fields, '[]'::jsonb)) LOOP
    v_field_name := v_item->>'field';
    v_column := CASE v_field_name
                  WHEN 'certification_name'   THEN 'certification_name'
                  WHEN 'issuing_organization' THEN 'issuing_organization'
                  WHEN 'credential_id'        THEN 'credential_id'
                  WHEN 'issue_date'           THEN 'issue_date'
                  WHEN 'expiry_date'          THEN 'expiry_date'
                END;
    IF v_column IS NULL THEN
      CONTINUE;  -- campo desconocido: se ignora
    END IF;

    IF v_item->>'action' = 'edit' THEN
      v_value := NULLIF(btrim(v_item->>'value'), '');
    ELSE
      -- accept: el valor viene del draft (dato extraído), no del cliente.
      v_value := NULLIF(btrim(
        (SELECT ef->>'value'
           FROM jsonb_array_elements(v_draft.extracted_fields) ef
          WHERE ef->>'field' = v_field_name)
      ), '');
    END IF;

    -- Fechas: SOLO ISO completo YYYY-MM-DD. Jamás se inventa el día.
    IF v_value IS NOT NULL AND v_column IN ('issue_date', 'expiry_date')
       AND v_value !~ '^\d{4}-\d{2}-\d{2}$' THEN
      v_value := NULL;
    END IF;
    IF v_value IS NULL THEN
      CONTINUE;
    END IF;
    v_value := left(v_value, 160);

    IF v_has_target THEN
      v_current := CASE v_column
                     WHEN 'certification_name'   THEN v_cert.certification_name
                     WHEN 'issuing_organization' THEN v_cert.issuing_organization
                     WHEN 'credential_id'        THEN v_cert.credential_id
                     WHEN 'issue_date'           THEN v_cert.issue_date::text
                     WHEN 'expiry_date'          THEN v_cert.expiry_date::text
                   END;

      -- PROTECCIÓN DE CERTIFICACIONES VERIFICADAS: los 5 campos forman parte
      -- de la acreditación. is_verified=true ⇒ no modificables por esta vía
      -- (ni rellenando huecos ni con overwrite). Solo no-op (valor idéntico).
      -- Los cambios requieren el circuito canónico de revisión.
      IF v_cert.is_verified AND v_current IS DISTINCT FROM v_value THEN
        v_protected := v_protected || jsonb_build_array(v_field_name);
        CONTINUE;
      END IF;

      IF v_current IS NULL OR btrim(v_current) = '' THEN
        v_patch := v_patch || jsonb_build_object(v_column, v_value);
        v_confirmed_count := v_confirmed_count + 1;
      ELSIF v_current = v_value THEN
        NULL;  -- ya presente: no-op
      ELSIF COALESCE((v_item->>'overwrite')::boolean, false) THEN
        v_patch := v_patch || jsonb_build_object(v_column, v_value);
        v_confirmed_count := v_confirmed_count + 1;
      ELSE
        v_conflicts := v_conflicts || jsonb_build_object(
          'field', v_field_name,
          'existing_value', v_current,
          'proposed_value', v_value
        );
      END IF;
    ELSE
      v_patch := v_patch || jsonb_build_object(v_column, v_value);
      v_confirmed_count := v_confirmed_count + 1;
    END IF;
  END LOOP;

  -- Certificación verificada con intento de cambio: SIN escrituras.
  IF jsonb_array_length(v_protected) > 0 THEN
    RETURN jsonb_build_object(
      'status', 'verified_cert_protected',
      'certification_id', v_cert.id,
      'protected_fields', v_protected
    );
  END IF;

  -- Conflicto sin overwrite: SIN escrituras (patch completo descartado).
  IF jsonb_array_length(v_conflicts) > 0 THEN
    RETURN jsonb_build_object('status', 'conflict', 'conflicts', v_conflicts);
  END IF;

  -- INSERT nuevo exige nombre (coherente con el alta manual).
  IF NOT v_has_target AND COALESCE(v_patch->>'certification_name', '') = '' THEN
    RETURN jsonb_build_object('status', 'error', 'reason', 'certification_name_required');
  END IF;

  -- ── Escrituras (todas en ESTA transacción) ───────────────────────────────
  IF v_has_target THEN
    FOR v_key IN SELECT jsonb_object_keys(v_patch) LOOP
      EXECUTE format(
        'UPDATE app_worker_certifications SET %I = %L, updated_at = now() WHERE id = %L AND user_id = %L',
        v_key, v_patch->>v_key, v_cert.id, p_user_id
      );
    END LOOP;
    -- Vínculo del documento si falta (metadato; no dato de acreditación).
    IF COALESCE(btrim(v_cert.storage_path), '') = '' THEN
      UPDATE app_worker_certifications
         SET storage_bucket = v_draft.storage_bucket,
             storage_path   = v_draft.storage_path,
             updated_at     = now()
       WHERE id = v_cert.id AND user_id = p_user_id;
    END IF;
    -- Nótese: is_verified / verified_at JAMÁS aparecen en ningún SET.
    v_cert_id := v_cert.id;
  ELSE
    -- INSERT nuevo: DECLARED / UNVERIFIED siempre.
    INSERT INTO app_worker_certifications
      (user_id, certification_name, issuing_organization, credential_id,
       issue_date, expiry_date, expiration_date,
       storage_bucket, storage_path,
       is_verified, verified_at, is_visible, visible_to_companies)
    VALUES
      (p_user_id,
       v_patch->>'certification_name',
       v_patch->>'issuing_organization',
       v_patch->>'credential_id',
       CASE WHEN v_patch->>'issue_date' IS NULL THEN NULL ELSE (v_patch->>'issue_date')::date END,
       CASE WHEN v_patch->>'expiry_date' IS NULL THEN NULL ELSE (v_patch->>'expiry_date')::date END,
       CASE WHEN v_patch->>'expiry_date' IS NULL THEN NULL ELSE (v_patch->>'expiry_date')::date END,
       v_draft.storage_bucket,
       v_draft.storage_path,
       false, NULL, true, true)
    RETURNING id INTO v_cert_id;
  END IF;

  -- Cierre del draft + métrica en la MISMA transacción (sin PII).
  UPDATE app_cert_extraction_drafts
     SET extraction_status = 'review_confirmed',
         reviewed_at = now(),
         updated_at  = now(),
         linked_certification_id = v_cert_id
   WHERE id = v_draft.id AND user_id = p_user_id;

  INSERT INTO app_cert_extraction_events
    (user_id, draft_id, event_type, fields_confirmed_count, linked_existing)
  VALUES
    (p_user_id, v_draft.id, 'cert_review_confirmed', v_confirmed_count, v_has_target);

  RETURN jsonb_build_object(
    'status', 'confirmed',
    'certification_id', v_cert_id,
    'linked_existing', v_has_target,
    'fields_confirmed_count', v_confirmed_count
  );
END $$;

COMMENT ON FUNCTION public.pb_cert_apply_draft(uuid, uuid, jsonb, uuid, boolean) IS
  'PB-CERT-AUTO-PROFILE-001: aplicación atómica transaccional del draft de certificado. Serializa confirmaciones concurrentes (FOR UPDATE), protege certificaciones verificadas (campos de acreditación inmutables por esta vía) y jamás toca is_verified/verified_at. Solo service_role (Edge Function cert-apply-draft).';

-- ─── Permisos: SOLO service_role ─────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.pb_cert_apply_draft(uuid, uuid, jsonb, uuid, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pb_cert_apply_draft(uuid, uuid, jsonb, uuid, boolean)
  TO service_role;

-- ─── Verificación post-aplicación ───────────────────────────────────────────
--  1) SELECT proname, prosecdef, proconfig FROM pg_proc
--     WHERE proname = 'pb_cert_apply_draft';
--     -> prosecdef = false (INVOKER); proconfig = {search_path=public}
--
--  2) SELECT count(*) FROM information_schema.routine_privileges
--     WHERE routine_name = 'pb_cert_apply_draft'
--       AND grantee IN ('anon','authenticated','PUBLIC');
--     -> 0 (solo service_role puede ejecutarla)
--
--  3) Con JWT de usuario autenticado:
--     POST /rest/v1/rpc/pb_cert_apply_draft {...}
--     -> 42501 permission denied (EXECUTE revocado).
--
--  4) QA funcional de concurrencia/verificación: ver runbook del PR #83
--     (script de pruebas reales con solicitudes paralelas).
