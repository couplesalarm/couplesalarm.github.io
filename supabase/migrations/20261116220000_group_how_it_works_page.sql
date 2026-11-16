-- Keep the deployed report function intact and add only this approved page.
DO $migration$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef('public.couples_alarm_growth_metrics()'::regprocedure) INTO definition;
  IF position('case when path in (''/'', ''/compatibility/''' in definition) > 0 THEN
    definition := replace(definition,
      'case when path in (''/'', ''/compatibility/''',
      'case when path in (''/'', ''/how-it-works/'', ''/compatibility/''');
    EXECUTE definition;
  ELSIF position('couples_alarm_report_pages' in definition) = 0
    AND position('''/how-it-works/''' in definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected reporting definition; compare live before changing it';
  END IF;
END $migration$;
