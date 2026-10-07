import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

// Generic hook template for fetching data from Supabase
export function useSupabaseQuery<T>(table: string) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const { data: result, error: fetchError } = await supabase
          .from(table)
          .select('*');
          
        if (fetchError) throw fetchError;
        setData(result as T[]);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Unknown error'));
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [table]);

  return { data, loading, error };
}
