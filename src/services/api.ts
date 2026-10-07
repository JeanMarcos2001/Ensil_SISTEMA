import { supabase } from '../lib/supabase';

// Generic API service template for Supabase
export const api = {
  // Example generic fetch
  async get(table: string) {
    const { data, error } = await supabase.from(table).select('*');
    if (error) throw error;
    return data;
  },
  
  // Example generic insert
  async insert(table: string, payload: any) {
    const { data, error } = await supabase.from(table).insert(payload).select();
    if (error) throw error;
    return data;
  },

  // Example generic update
  async update(table: string, id: string, payload: any) {
    const { data, error } = await supabase.from(table).update(payload).eq('id', id).select();
    if (error) throw error;
    return data;
  },

  // Example generic delete
  async delete(table: string, id: string) {
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) throw error;
    return true;
  }
};
