-- Create a helper function to execute queries for schema inspection
CREATE OR REPLACE FUNCTION public.exec_query(p_sql TEXT)
RETURNS JSON AS $$
DECLARE
  v_result JSON;
BEGIN
  EXECUTE 'SELECT json_agg(t) FROM (' || p_sql || ') t' INTO v_result;
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
