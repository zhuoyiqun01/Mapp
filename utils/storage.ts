import { get, set, del, keys } from 'idb-keyval';
import { Project, Note } from '../types';

// Storage keys
const PROJECT_LIST_KEY = 'mapp-project-list';
const PROJECT_PREFIX = 'mapp-project-';
const IMAGE_PREFIX = 'mapp-image-';
const SKETCH_PREFIX = 'mapp-sketch-';
const BACKGROUND_IMAGE_PREFIX = 'mapp-bg-';
const STORAGE_VERSION_KEY = 'mapp-storage-version';
const CURRENT_STORAGE_VERSION = 2; // 版本号，用于数据迁移

// View position cache (sessionStorage, cleared on page close or project switch)
const getViewPositionCacheKey = (projectId: string, viewType: 'map' | 'board'): string => {
  return `mapp-view-pos-${projectId}-${viewType}`;
};

export function getViewPositionCache(projectId: string, viewType: 'map' | 'board'): { center?: [number, number], zoom?: number, x?: number, y?: number, scale?: number } | null {
  try {
    const key = getViewPositionCacheKey(projectId, viewType);
    const cached = sessionStorage.getItem(key);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (err) {
    console.warn('Failed to load view position cache', err);
  }
  return null;
}

export function setViewPositionCache(projectId: string, viewType: 'map' | 'board', position: { center?: [number, number], zoom?: number, x?: number, y?: number, scale?: number }): void {
  try {
    const key = getViewPositionCacheKey(projectId, viewType);
    sessionStorage.setItem(key, JSON.stringify(position));
  } catch (err) {
    console.warn('Failed to save view position cache', err);
  }
}

export function clearViewPositionCache(projectId: string): void {
  try {
    sessionStorage.removeItem(getViewPositionCacheKey(projectId, 'map'));
    sessionStorage.removeItem(getViewPositionCacheKey(projectId, 'board'));
  } catch (err) {
    console.warn('Failed to clear view position cache', err);
  }
}

// 生成图片 ID
function generateImageId(): string {
  return `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// 检查 IndexedDB 存储使用情况
export async function checkStorageUsage(): Promise<{ used: number, available: number, percentage: number } | null> {
  try {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      const used = estimate.usage || 0;
      const quota = estimate.quota || 0;
      const available = quota - used;
      const percentage = quota > 0 ? (used / quota) * 100 : 0;

      return {
        used: used / (1024 * 1024), // MB
        available: available / (1024 * 1024), // MB
        percentage
      };
    }
  } catch (error) {
    console.warn('Cannot check storage usage:', error);
  }
  return null;
}

// 从 Base64 中提取图片 ID（如果是旧格式的 Base64，返回 null）
function extractImageId(imageData: string): string | null {
  if (imageData.startsWith('img-')) {
    return imageData; // 已经是图片 ID
  }
  return null; // 是 Base64 数据，需要转换
}

// 保存图片到 IndexedDB，返回图片 ID
export async function saveImage(base64Data: string): Promise<string> {
  const imageId = generateImageId();

  // 检查 Base64 数据是否有效
  if (!base64Data || !base64Data.startsWith('data:image/')) {
    throw new Error('Invalid image data: not a valid Base64 image');
  }

  // 检查数据大小（IndexedDB 通常有 ~50MB 限制）
  const dataSizeMB = (base64Data.length * 3) / 4 / (1024 * 1024); // 估算解码后大小
  if (dataSizeMB > 10) {
    console.warn(`Large image detected: ${dataSizeMB.toFixed(2)}MB, may cause storage issues`);
  }

  try {
    await set(`${IMAGE_PREFIX}${imageId}`, base64Data);
    // 验证保存是否成功
    const verifyData = await get<string>(`${IMAGE_PREFIX}${imageId}`);
    if (!verifyData) {
      throw new Error('Image save verification failed');
    }
    return imageId;
  } catch (error) {
    console.error('Failed to save image:', error);
    throw error;
  }
}

// 从 IndexedDB 加载图片
export async function loadImage(imageId: string): Promise<string | null> {
  try {
    const data = await get<string>(`${IMAGE_PREFIX}${imageId}`);
    if (!data) {
      console.warn(`Image not found in IndexedDB: ${imageId}`);
      return null;
    }

    // 验证加载的数据是否有效
    if (!data.startsWith('data:image/')) {
      console.error(`Invalid image data loaded for ${imageId}:`, data.substring(0, 100) + '...');
      return null;
    }

    return data;
  } catch (error) {
    console.error(`Failed to load image ${imageId}:`, error);
    return null;
  }
}

// 保存 sketch 到 IndexedDB，返回 sketch ID
export async function saveSketch(base64Data: string): Promise<string> {
  const sketchId = generateImageId();
  await set(`${SKETCH_PREFIX}${sketchId}`, base64Data);
  return sketchId;
}

// 从 IndexedDB 加载 sketch
export async function loadSketch(sketchId: string): Promise<string | null> {
  try {
    const data = await get<string>(`${SKETCH_PREFIX}${sketchId}`);
    if (!data) {
      console.warn(`Sketch not found in IndexedDB: ${sketchId}`);
      return null;
    }

    // 验证加载的数据是否有效
    if (!data.startsWith('data:image/')) {
      console.error(`Invalid sketch data loaded for ${sketchId}:`, data.substring(0, 100) + '...');
      return null;
    }

    return data;
  } catch (error) {
    console.error(`Failed to load sketch ${sketchId}:`, error);
    return null;
  }
}

// 保存背景图片
export async function saveBackgroundImage(projectId: string, base64Data: string): Promise<string> {
  const imageId = generateImageId();
  await set(`${BACKGROUND_IMAGE_PREFIX}${projectId}`, base64Data);
  return imageId;
}

// 加载背景图片
export async function loadBackgroundImage(projectId: string): Promise<string | null> {
  return await get<string>(`${BACKGROUND_IMAGE_PREFIX}${projectId}`);
}

// 删除图片
export async function deleteImage(imageId: string): Promise<void> {
  await del(`${IMAGE_PREFIX}${imageId}`);
}

// 尝试恢复丢失的图片（从note数据中重新保存）
export async function attemptImageRecovery(): Promise<{ imagesRecovered: number, sketchesRecovered: number }> {
  let imagesRecovered = 0;
  let sketchesRecovered = 0;

  try {
    // 获取所有项目
    const projectIds = await loadProjectList();
    const projects = await Promise.all(
      projectIds.map(id => loadProject(id, true)) // 加载图片
    );

    const validProjects = projects.filter(p => p !== null);

    for (const project of validProjects) {
      if (!project) continue;

      for (const note of project.notes) {
        // 检查图片
        if (note.images && note.images.length > 0) {
          for (let i = 0; i < note.images.length; i++) {
            const imageData = note.images[i];
            const existingId = extractImageId(imageData);

            if (!existingId && imageData.startsWith('data:image/')) {
              // 这是一个Base64图片但没有对应的ID，尝试重新保存
              try {
                const imageId = await saveImage(imageData);
                // 更新note中的图片引用
                note.images[i] = imageId;
                imagesRecovered++;
                console.log(`Recovered image for note ${note.id}: ${imageId}`);
              } catch (error) {
                console.error(`Failed to recover image for note ${note.id}:`, error);
              }
            }
          }
        }

        // 检查sketch
        if (note.sketch && !extractImageId(note.sketch) && note.sketch.startsWith('data:image/')) {
          try {
            const sketchId = await saveSketch(note.sketch);
            note.sketch = sketchId;
            sketchesRecovered++;
            console.log(`Recovered sketch for note ${note.id}: ${sketchId}`);
          } catch (error) {
            console.error(`Failed to recover sketch for note ${note.id}:`, error);
          }
        }
      }

      // 保存恢复后的项目
      await saveProject(project);
    }

    console.log(`Recovery attempt complete: ${imagesRecovered} images, ${sketchesRecovered} sketches recovered`);
  } catch (error) {
    console.error('Failed to attempt image recovery:', error);
  }

  return { imagesRecovered, sketchesRecovered };
}

// 清理明显损坏的图片和sketch（只删除无法访问或明显无效的数据）
export async function cleanupCorruptedImages(): Promise<{ imagesCleaned: number, sketchesCleaned: number }> {
  let imagesCleaned = 0;
  let sketchesCleaned = 0;

  try {
    const allKeys = await keys();
    const imageKeys = allKeys.filter(key => typeof key === 'string' && (key as string).startsWith(IMAGE_PREFIX));
    const sketchKeys = allKeys.filter(key => typeof key === 'string' && (key as string).startsWith(SKETCH_PREFIX));

    // 检查图片 - 只删除无法访问的数据，不删除格式不匹配的数据
    for (const key of imageKeys) {
      try {
        const data = await get<string>(key as string);
        // 只删除明显无效的数据：null、undefined、空字符串或异常短的数据
        if (data === null || data === undefined || data === '' || (typeof data === 'string' && data.length < 20)) {
          await del(key as string);
          imagesCleaned++;
          console.log(`Cleaned invalid image data: ${key}`);
        }
      } catch (error) {
        // 只有在无法访问数据时才删除
        await del(key as string);
        imagesCleaned++;
        console.log(`Cleaned inaccessible image: ${key}`);
      }
    }

    // 检查sketch - 同样的保守策略
    for (const key of sketchKeys) {
      try {
        const data = await get<string>(key as string);
        // 只删除明显无效的数据
        if (data === null || data === undefined || data === '' || (typeof data === 'string' && data.length < 20)) {
          await del(key as string);
          sketchesCleaned++;
          console.log(`Cleaned invalid sketch data: ${key}`);
        }
      } catch (error) {
        // 只有在无法访问数据时才删除
        await del(key as string);
        sketchesCleaned++;
        console.log(`Cleaned inaccessible sketch: ${key}`);
      }
    }

    console.log(`Conservative cleanup complete: ${imagesCleaned} images, ${sketchesCleaned} sketches cleaned`);
  } catch (error) {
    console.error('Failed to cleanup corrupted images:', error);
  }

  return { imagesCleaned, sketchesCleaned };
}

// 删除 sketch
export async function deleteSketch(sketchId: string): Promise<void> {
  await del(`${SKETCH_PREFIX}${sketchId}`);
}

// 确保Note有variant字段，并修复旧数据的兼容性问题
function ensureNoteVariant(note: Note): Note {
  // 如果 variant 缺失，默认为 standard
  if (!note.variant) {
    return { ...note, variant: 'standard' };
  }
  
  // 对于旧数据，如果 variant 不在有效值列表中，修复为 standard
  const validVariants: ('standard' | 'compact' | 'image')[] = ['standard', 'compact', 'image'];
  if (!validVariants.includes(note.variant)) {
    return { ...note, variant: 'standard' };
  }
  
  // 确保必要的字段存在
  const fixedNote = { ...note };
  
  // 确保 coords 存在且有效（对于地图项目很重要）
  if (!fixedNote.coords || 
      typeof fixedNote.coords.lat !== 'number' || 
      isNaN(fixedNote.coords.lat) ||
      typeof fixedNote.coords.lng !== 'number' || 
      isNaN(fixedNote.coords.lng)) {
    // 如果 coords 无效，设置默认坐标
    // 注意：这只是一个安全措施，理想情况下不应该发生
    fixedNote.coords = { 
      lat: (fixedNote.coords && typeof fixedNote.coords.lat === 'number' && !isNaN(fixedNote.coords.lat)) 
        ? fixedNote.coords.lat : 0, 
      lng: (fixedNote.coords && typeof fixedNote.coords.lng === 'number' && !isNaN(fixedNote.coords.lng)) 
        ? fixedNote.coords.lng : 0 
    };
  }
  
  // 确保其他必要字段存在
  if (!fixedNote.images) {
    fixedNote.images = [];
  }
  if (!fixedNote.tags) {
    fixedNote.tags = [];
  }
  if (typeof fixedNote.fontSize !== 'number') {
    fixedNote.fontSize = 3;
  }
  if (typeof fixedNote.boardX !== 'number') {
    fixedNote.boardX = 0;
  }
  if (typeof fixedNote.boardY !== 'number') {
    fixedNote.boardY = 0;
  }
  
  return fixedNote;
}

// 转换 Note 的图片从 Base64 到图片 ID（用于迁移）
async function migrateNoteImages(note: Note): Promise<Note> {
  const migratedNote = ensureNoteVariant({ ...note });

  // 迁移 images 数组
  if (note.images && note.images.length > 0) {
    const imageIds: string[] = [];
    for (const imageData of note.images) {
      try {
        const existingId = extractImageId(imageData);
        if (existingId) {
          imageIds.push(existingId);
        } else {
          // 是 Base64，需要保存并获取 ID
          const imageId = await saveImage(imageData);
          imageIds.push(imageId);
        }
      } catch (error) {
        console.error(`Failed to migrate image for note ${note.id}:`, error);
        // 跳过损坏的图片，继续处理其他图片
        continue;
      }
    }
    migratedNote.images = imageIds;
  }

  // 迁移 sketch
  if (note.sketch) {
    try {
      const existingId = extractImageId(note.sketch);
      if (existingId) {
        migratedNote.sketch = existingId;
      } else {
        // 是 Base64，需要保存并获取 ID
        const sketchId = await saveSketch(note.sketch);
        migratedNote.sketch = sketchId;
      }
    } catch (error) {
      console.error(`Failed to migrate sketch for note ${note.id}:`, error);
      // 移除损坏的sketch
      migratedNote.sketch = undefined;
    }
  }

  return migratedNote;
}

// 加载 Note 的图片（将图片 ID 转换为 Base64）
export async function loadNoteImages(note: Note): Promise<Note> {
  const loadedNote = { ...note };

  // 加载 images 数组 - 保持原始的图片ID数组不变，只返回成功加载的图片数据
  if (note.images && note.images.length > 0) {
    const loadedImages: string[] = [];

    for (const imageId of note.images) {
      const existingId = extractImageId(imageId);
      if (existingId) {
        // 是图片 ID，需要加载
        const imageData = await loadImage(existingId);
        if (imageData) {
          loadedImages.push(imageData);
        } else {
          // 无法加载，但保留ID引用，等待可能的恢复
          console.warn(`Failed to load image ${imageId} for note ${note.id}`);
        }
      } else {
        // 是 Base64（旧格式），直接使用
        loadedImages.push(imageId);
      }
    }

    loadedNote.images = loadedImages;
  }

  // 加载 sketch - 保持原始的sketch ID不变
  if (note.sketch) {
    const existingId = extractImageId(note.sketch);
    if (existingId) {
      const sketchData = await loadSketch(existingId);
      if (sketchData) {
        loadedNote.sketch = sketchData;
      } else {
        // 无法加载，但保留ID引用，等待可能的恢复
        console.warn(`Failed to load sketch ${existingId} for note ${note.id}`);
      }
    }
    // 如果已经是 Base64，保持不变
  }

  return loadedNote;
}

// 确保项目数据的完整性和兼容性
function ensureProjectCompatibility(project: Project): Project {
  const fixedProject = { ...project };
  
  // 确保项目类型有效
  if (!fixedProject.type || (fixedProject.type !== 'map' && fixedProject.type !== 'image')) {
    // 默认根据是否有 notes 和 coords 来判断类型
    if (fixedProject.notes && fixedProject.notes.some(note => note.coords)) {
      fixedProject.type = 'map';
    } else {
      fixedProject.type = 'image';
    }
  }
  
  // 确保 notes 数组存在
  if (!fixedProject.notes) {
    fixedProject.notes = [];
  }
  
  // 修复所有 notes 的兼容性问题
  fixedProject.notes = fixedProject.notes.map(ensureNoteVariant);
  
  return fixedProject;
}

// 保存项目（分片存储，图片分离）
export async function saveProject(project: Project): Promise<void> {
  // 0. 确保项目数据兼容性
  const compatibleProject = ensureProjectCompatibility(project);
  
  // 1. 迁移项目中的图片
  const migratedProject = { ...compatibleProject };
  
  // 迁移所有 notes 的图片
  migratedProject.notes = await Promise.all(
    compatibleProject.notes.map(note => migrateNoteImages(note))
  );
  
  // 迁移背景图片
  if (compatibleProject.backgroundImage) {
    const existingId = extractImageId(compatibleProject.backgroundImage);
    if (!existingId) {
      // 是 Base64，需要保存
      await saveBackgroundImage(compatibleProject.id, compatibleProject.backgroundImage);
      // 项目数据中不存储 Base64，只标记有背景图片
      migratedProject.backgroundImage = 'stored'; // 标记为已存储
    }
  }
  
  // 2. 添加版本号
  const projectWithVersion = {
    ...migratedProject,
    version: Date.now(), // 使用时间戳作为版本号
    storageVersion: CURRENT_STORAGE_VERSION
  };
  
  // 3. 保存项目数据（不包含 Base64 图片）
  await set(`${PROJECT_PREFIX}${project.id}`, projectWithVersion);
  
  // 4. 更新项目列表
  const projectList = await get<string[]>(PROJECT_LIST_KEY) || [];
  if (!projectList.includes(project.id)) {
    projectList.push(project.id);
    await set(PROJECT_LIST_KEY, projectList);
  }
}

// 加载项目（按需加载，图片懒加载）
export async function loadProject(projectId: string, loadImages: boolean = false): Promise<Project | null> {
  const project = await get<Project>(`${PROJECT_PREFIX}${projectId}`);
  if (!project) {
    return null;
  }
  
  // 确保项目数据的完整性和兼容性
  const compatibleProject = ensureProjectCompatibility(project);
  
  // 如果需要加载图片，则加载所有图片
  if (loadImages) {
    // 加载背景图片
    if (compatibleProject.backgroundImage === 'stored') {
      const bgImage = await loadBackgroundImage(projectId);
      if (bgImage) {
        compatibleProject.backgroundImage = bgImage;
      }
    }
    
    // 加载所有 notes 的图片
    compatibleProject.notes = await Promise.all(
      compatibleProject.notes.map(note => loadNoteImages(note))
    );
  }
  
  return compatibleProject;
}

// 加载所有项目 ID 列表
export async function loadProjectList(): Promise<string[]> {
  return await get<string[]>(PROJECT_LIST_KEY) || [];
}

// 加载项目摘要（只包含基本信息，不包含图片，用于项目列表显示）
export interface ProjectSummary {
  id: string;
  name: string;
  type: 'map' | 'image';
  createdAt: number;
  notesCount: number;
  hasImages: boolean;
  hasSketches: boolean;
}

export async function loadProjectSummaries(): Promise<ProjectSummary[]> {
  const projectIds = await loadProjectList();
  const summaries: ProjectSummary[] = [];

  for (const projectId of projectIds) {
    try {
      const project = await loadProject(projectId, false);
      if (project) {
        // 计算项目统计信息
        let hasImages = false;
        let hasSketches = false;

        for (const note of project.notes) {
          if (note.images && note.images.length > 0) {
            hasImages = true;
          }
          if (note.sketch) {
            hasSketches = true;
          }
          // 如果都找到了就可以提前退出
          if (hasImages && hasSketches) break;
        }

        summaries.push({
          id: project.id,
          name: project.name,
          type: project.type,
          createdAt: project.createdAt,
          notesCount: project.notes.length,
          hasImages,
          hasSketches
        });
      }
    } catch (error) {
      console.error(`Failed to load project summary for ${projectId}:`, error);
    }
  }

  return summaries;
}

// 加载所有项目（不加载图片，用于列表显示）
export async function loadAllProjects(loadImages: boolean = false): Promise<Project[]> {
  const projectList = await loadProjectList();
  const projects = await Promise.all(
    projectList.map(id => loadProject(id, loadImages))
  );
  return projects.filter((p): p is Project => p !== null);
}

// 删除项目
export async function deleteProject(projectId: string): Promise<void> {
  // 首先删除项目数据和更新列表（快速操作）
  await del(`${PROJECT_PREFIX}${projectId}`);

  const projectList = await loadProjectList();
  const updatedList = projectList.filter(id => id !== projectId);
  await set(PROJECT_LIST_KEY, updatedList);

  // 异步删除相关的图片文件（不阻塞UI）
  // 加载项目数据并删除图片
  setTimeout(async () => {
    try {
      const project = await loadProject(projectId, false);
      if (project) {
        // 收集所有需要删除的图片ID
        const imageIdsToDelete: string[] = [];
        const sketchIdsToDelete: string[] = [];

        for (const note of project.notes) {
          // 收集图片ID
          if (note.images) {
            for (const imageId of note.images) {
              const existingId = extractImageId(imageId);
              if (existingId) {
                imageIdsToDelete.push(existingId);
              }
            }
          }
          // 收集涂鸦ID
          if (note.sketch) {
            const existingId = extractImageId(note.sketch);
            if (existingId) {
              sketchIdsToDelete.push(existingId);
            }
          }
        }

        // 并发删除所有图片和涂鸦
        const deletePromises: Promise<void>[] = [];

        // 删除图片
        imageIdsToDelete.forEach(imageId => {
          deletePromises.push(deleteImage(imageId).catch(err =>
            console.warn(`Failed to delete image ${imageId}:`, err)
          ));
        });

        // 删除涂鸦
        sketchIdsToDelete.forEach(sketchId => {
          deletePromises.push(deleteSketch(sketchId).catch(err =>
            console.warn(`Failed to delete sketch ${sketchId}:`, err)
          ));
        });

        // 删除背景图片
        deletePromises.push(del(`${BACKGROUND_IMAGE_PREFIX}${projectId}`).catch(err =>
          console.warn(`Failed to delete background image for project ${projectId}:`, err)
        ));

        // 等待所有删除操作完成（异步，不会阻塞UI）
        await Promise.allSettled(deletePromises);
        console.log(`Cleaned up ${imageIdsToDelete.length} images and ${sketchIdsToDelete.length} sketches for deleted project ${projectId}`);
      }
    } catch (error) {
      console.warn(`Failed to cleanup files for deleted project ${projectId}:`, error);
    }
  }, 100);
}

// 数据迁移：从旧格式迁移到新格式
export async function migrateFromOldFormat(): Promise<void> {
  const currentVersion = await get<number>(STORAGE_VERSION_KEY) || 1;
  
  if (currentVersion >= CURRENT_STORAGE_VERSION) {
    return; // 已经是最新版本
  }
  
  console.log('开始数据迁移...');
  
  // 尝试从旧格式加载
  const oldProjects = await get<Project[]>('mapp-projects');
  
  if (oldProjects && oldProjects.length > 0) {
    console.log(`发现 ${oldProjects.length} 个旧格式项目，开始迁移...`);
    
    // 迁移每个项目
    for (const project of oldProjects) {
      await saveProject(project);
    }
    
    // 删除旧数据
    await del('mapp-projects');
    console.log('旧数据已删除');
  }
  
  // 更新版本号
  await set(STORAGE_VERSION_KEY, CURRENT_STORAGE_VERSION);
  console.log('数据迁移完成');
}

// 获取项目的版本号（用于增量同步）
export async function getProjectVersion(projectId: string): Promise<number> {
  const project = await loadProject(projectId, false);
  return project?.version || 0;
}

