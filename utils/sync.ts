import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Project } from '../types';

// Supabase 配置
// 这些值需要从 Supabase 项目设置中获取
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// 创建 Supabase 客户端
let supabase: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.warn('Supabase 配置未设置，云端同步功能不可用');
    return null;
  }
  
  if (!supabase) {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  
  return supabase;
}

// 获取设备 ID（用于标识不同设备）
function getDeviceId(): string {
  let deviceId = localStorage.getItem('mapp-device-id');
  if (!deviceId) {
    deviceId = `device-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('mapp-device-id', deviceId);
  }
  return deviceId;
}

// 同步状态类型
export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';

// 同步所有项目到云端
export async function syncProjectsToCloud(projects: Project[]): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, error: 'Supabase 未配置' };
  }

  const deviceId = getDeviceId();

  try {
    // 将项目数据转换为 JSON
    const projectsData = JSON.stringify(projects);
    const lastSyncTime = Date.now();

    // 使用 upsert 操作（如果存在则更新，不存在则插入）
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

    // 保存最后同步时间
    localStorage.setItem('mapp-last-sync-time', lastSyncTime.toString());

    return { success: true };
  } catch (err) {
    let errorMessage = '未知错误';
    if (err instanceof Error) {
      errorMessage = err.message;
      // 检查是否是网络错误
      if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
        errorMessage = '网络连接失败，请检查网络或 Supabase 配置';
      } else if (errorMessage.includes('CORS')) {
        errorMessage = 'CORS 错误，请检查 Supabase 配置';
      }
    }
    console.error('同步异常:', err);
    return { success: false, error: errorMessage };
  }
}

// 从云端加载项目
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
      // 如果是未找到记录，返回空数组（新设备）
      if (error.code === 'PGRST116') {
        return { success: true, projects: [], isNewDevice: true };
      }
      console.error('加载失败:', error);
      return { success: false, error: error.message };
    }

    if (!data || !data.projects_data) {
      return { success: true, projects: [], isNewDevice: true };
    }

    const projects = JSON.parse(data.projects_data) as Project[];
    const lastSyncTime = data.last_sync_time;

    // 保存最后同步时间
    if (lastSyncTime) {
      localStorage.setItem('mapp-last-sync-time', lastSyncTime.toString());
    }

    return { success: true, projects };
  } catch (err) {
    let errorMessage = '未知错误';
    if (err instanceof Error) {
      errorMessage = err.message;
      // 检查是否是网络错误
      if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
        errorMessage = '网络连接失败，请检查网络或 Supabase 配置';
      } else if (errorMessage.includes('CORS')) {
        errorMessage = 'CORS 错误，请检查 Supabase 配置';
      }
    }
    console.error('加载异常:', err);
    return { success: false, error: errorMessage };
  }
}

// 合并本地和云端数据（解决冲突）
export function mergeProjects(localProjects: Project[], cloudProjects: Project[]): Project[] {
  // 创建项目 ID 映射
  const localMap = new Map(localProjects.map(p => [p.id, p]));
  const cloudMap = new Map(cloudProjects.map(p => [p.id, p]));

  const merged: Project[] = [];
  const allIds = new Set([...localMap.keys(), ...cloudMap.keys()]);

  for (const id of allIds) {
    const local = localMap.get(id);
    const cloud = cloudMap.get(id);

    if (local && cloud) {
      // 两个都存在，比较更新时间（使用 createdAt 或最后修改时间）
      // 这里简单使用本地版本（因为本地是用户当前正在使用的）
      // 你可以根据实际需求调整合并策略
      merged.push(local);
    } else if (local) {
      merged.push(local);
    } else if (cloud) {
      merged.push(cloud);
    }
  }

  return merged;
}

// 检查是否需要同步（基于时间间隔）
export function shouldSync(): boolean {
  const lastSyncTime = localStorage.getItem('mapp-last-sync-time');
  if (!lastSyncTime) return true;

  const timeSinceLastSync = Date.now() - parseInt(lastSyncTime, 10);
  // 如果距离上次同步超过 5 分钟，则同步
  return timeSinceLastSync > 5 * 60 * 1000;
}

// 获取最后同步时间
export function getLastSyncTime(): number | null {
  const lastSyncTime = localStorage.getItem('mapp-last-sync-time');
  return lastSyncTime ? parseInt(lastSyncTime, 10) : null;
}

