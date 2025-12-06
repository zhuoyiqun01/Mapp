import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Project } from '../types';

// Supabase configuration
// These values need to be obtained from Supabase project settings
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// 创建 Supabase 客户端
let supabase: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.warn('Supabase configuration not set, cloud sync unavailable');
    return null;
  }
  
  if (!supabase) {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  
  return supabase;
}

// Get device ID (for identifying different devices)
function getDeviceId(): string {
  let deviceId = localStorage.getItem('mapp-device-id');
  if (!deviceId) {
    deviceId = `device-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('mapp-device-id', deviceId);
  }
  return deviceId;
}

// Sync status type
export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';

// Sync all projects to cloud
export async function syncProjectsToCloud(projects: Project[]): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, error: 'Supabase 未配置' };
  }

  const deviceId = getDeviceId();

  try {
    // Convert project data to JSON
    const projectsData = JSON.stringify(projects);
    const lastSyncTime = Date.now();

    // Use upsert operation (update if exists, insert if not)
    const { error } = await client
      .from('user_projects')
      .upsert({
        device_id: deviceId,
        projects_data: projectsData,
        last_sync_time: lastSyncTime,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'device_id'
      });

    if (error) {
      console.error('同步失败:', error);
      return { success: false, error: error.message };
    }

    // Save last sync time
    localStorage.setItem('mapp-last-sync-time', lastSyncTime.toString());

    return { success: true };
  } catch (err) {
    let errorMessage = 'Unknown error';
    if (err instanceof Error) {
      errorMessage = err.message;
      // Check if it's a network error
      if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
        errorMessage = 'Network connection failed, please check network or Supabase configuration';
      } else if (errorMessage.includes('CORS')) {
        errorMessage = 'CORS error, please check Supabase configuration';
      }
    }
    console.error('Sync exception:', err);
    return { success: false, error: errorMessage };
  }
}

// Load projects from cloud
export async function loadProjectsFromCloud(): Promise<{ 
  success: boolean; 
  projects?: Project[]; 
  error?: string;
  isNewDevice?: boolean;
}> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, error: 'Supabase 未配置' };
  }

  const deviceId = getDeviceId();

  try {
    const { data, error } = await client
      .from('user_projects')
      .select('*')
      .eq('device_id', deviceId)
      .single();

    if (error) {
      // If record not found, return empty array (new device)
      if (error.code === 'PGRST116') {
        return { success: true, projects: [], isNewDevice: true };
      }
      console.error('Load failed:', error);
      return { success: false, error: error.message };
    }

    if (!data || !data.projects_data) {
      return { success: true, projects: [], isNewDevice: true };
    }

    const projects = JSON.parse(data.projects_data) as Project[];
    const lastSyncTime = data.last_sync_time;

    // Save last sync time
    if (lastSyncTime) {
      localStorage.setItem('mapp-last-sync-time', lastSyncTime.toString());
    }

    return { success: true, projects };
  } catch (err) {
    let errorMessage = 'Unknown error';
    if (err instanceof Error) {
      errorMessage = err.message;
      // Check if it's a network error
      if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
        errorMessage = 'Network connection failed, please check network or Supabase configuration';
      } else if (errorMessage.includes('CORS')) {
        errorMessage = 'CORS error, please check Supabase configuration';
      }
    }
    console.error('Load exception:', err);
    return { success: false, error: errorMessage };
  }
}

// Merge local and cloud data (resolve conflicts)
export function mergeProjects(localProjects: Project[], cloudProjects: Project[]): Project[] {
  // Create project ID mapping
  const localMap = new Map(localProjects.map(p => [p.id, p]));
  const cloudMap = new Map(cloudProjects.map(p => [p.id, p]));

  const merged: Project[] = [];
  const allIds = new Set([...localMap.keys(), ...cloudMap.keys()]);

  for (const id of allIds) {
    const local = localMap.get(id);
    const cloud = cloudMap.get(id);

    if (local && cloud) {
      // Both exist, compare update time (using createdAt or last modified time)
      // Here we simply use local version (because local is what user is currently using)
      // You can adjust merge strategy based on actual needs
      merged.push(local);
    } else if (local) {
      merged.push(local);
    } else if (cloud) {
      merged.push(cloud);
    }
  }

  return merged;
}

// Check if sync is needed (based on time interval)
export function shouldSync(): boolean {
  const lastSyncTime = localStorage.getItem('mapp-last-sync-time');
  if (!lastSyncTime) return true;

  const timeSinceLastSync = Date.now() - parseInt(lastSyncTime, 10);
  // If more than 5 minutes since last sync, sync
  return timeSinceLastSync > 5 * 60 * 1000;
}

// Get last sync time
export function getLastSyncTime(): number | null {
  const lastSyncTime = localStorage.getItem('mapp-last-sync-time');
  return lastSyncTime ? parseInt(lastSyncTime, 10) : null;
}

